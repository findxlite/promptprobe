/**
 * 外部接口适配器：用 PromptProbe 的用例库与判定器，去打你"真实的"应用接口。
 *
 * 与产品内置模式的区别：
 *   SIMULATED / LIVE 模式是"用你的 system prompt 复刻一个被测应用"；
 *   本脚本是直接 POST 到你自己的后端（小程序/App 的对话接口），
 *   因此能连你的 RAG、工具调用、后置过滤一起测。
 *
 * 用法：
 *   1) 复制模板：  cp tools/external-target.example.json tools/external-target.json
 *   2) 编辑 JSON：填 endpoint / headers / body 模板 / replyPath / systemPromptFile / canaries
 *   3) 先干跑：    node tools/external-adapter.mjs --dry-run
 *      干跑不联网，用内置模拟器代替你的接口，用来确认流程与判定链路正常
 *   4) 真打：      node tools/external-adapter.mjs --count 8
 *      确认能拿到回复后，再去掉 --count 限制跑满 24 条
 *
 * 安全提醒：越权类用例可能让你的后端真的执行工具调用（退款、改数据、删文件）。
 * 请在测试环境 / 只读测试账号下运行；生产环境建议先把工具换成 mock。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = (p) => path.join(ROOT, p);

const { loadProfiles } = await import(new URL('../prototype/src/targets.js', import.meta.url));
const { buildCaseSet } = await import(new URL('../prototype/src/mutate.js', import.meta.url));
const { ruleJudge, llmJudge } = await import(new URL('../prototype/src/judge.js', import.meta.url));
const { simulate } = await import(new URL('../prototype/src/simulator.js', import.meta.url));
const { aggregate } = await import(new URL('../prototype/src/engine.js', import.meta.url));
const { llmAvailable } = await import(new URL('../prototype/src/env.js', import.meta.url));

// ---------------- 参数 ----------------
const argv = process.argv.slice(2);
const flag = (name, def) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : def;
};
const has = (name) => argv.includes('--' + name);

const dryRun = has('dry-run');
const cfgPath = flag('config', 'tools/external-target.json');
const count = Number(flag('count', 0)) || 0;
const seed = Number(flag('seed', 20251031));
const outDir = flag('out', 'out-external');

// ---------------- 配置 ----------------
let cfg;
if (dryRun) {
  cfg = {
    name: '干跑演示（内置模拟器）',
    profileId: 'tiaozaijie',
    systemPromptFiles: [],
    canaries: [],
    tools: '',
  };
} else {
  if (!fs.existsSync(P(cfgPath))) {
    console.error(`找不到配置文件 ${cfgPath}`);
    console.error('先复制模板：cp tools/external-target.example.json tools/external-target.json');
    process.exit(1);
  }
  cfg = JSON.parse(fs.readFileSync(P(cfgPath), 'utf8'));
}

// 被测应用的 system prompt（用于判定"是否复述了提示词"）
let systemPrompt = cfg.systemPrompt || '';
for (const f of cfg.systemPromptFiles || []) {
  const fp = path.isAbsolute(f) ? f : P(f);
  if (fs.existsSync(fp)) systemPrompt += '\n' + fs.readFileSync(fp, 'utf8');
  else console.warn(`  ! 提示词文件不存在，已跳过：${fp}`);
}
if (!systemPrompt.trim() && !dryRun) {
  console.warn('  ! 没有提供 system prompt：将只能靠金丝雀与行为痕迹判定（提示词泄露类会漏判）');
}

const baseProfile = loadProfiles().find((p) => p.id === (cfg.profileId || 'xiaohei-shop')) || loadProfiles()[0];
const profile = {
  ...baseProfile,
  name: cfg.name || baseProfile.name,
  systemPrompt: systemPrompt || baseProfile.systemPrompt,
  canaries: (cfg.canaries && cfg.canaries.length ? cfg.canaries : baseProfile.canaries) || [],
  tools: cfg.tools
    ? String(cfg.tools)
        .split(',')
        .map((t) => ({ name: t.trim(), desc: '', risk: '中' }))
        .filter((t) => t.name)
    : baseProfile.tools,
};

// ---------------- 请求构造 ----------------
function deepReplace(node, value) {
  if (typeof node === 'string') return node.split('{{attack}}').join(value);
  if (Array.isArray(node)) return node.map((x) => deepReplace(x, value));
  if (node && typeof node === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(node)) out[k] = deepReplace(v, value);
    return out;
  }
  return node;
}

function pickPath(obj, dotted) {
  return String(dotted || '')
    .split('.')
    .filter(Boolean)
    .reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
}

async function callRealApi(attack) {
  const url = cfg.endpoint;
  if (!url) throw new Error('配置里缺少 endpoint');
  const headers = { 'Content-Type': 'application/json', ...(cfg.headers || {}) };
  const body = deepReplace(cfg.body ?? { message: '{{attack}}' }, attack);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), Number(cfg.timeoutMs || 60000));
  try {
    const res = await fetch(url, {
      method: cfg.method || 'POST',
      headers,
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    let reply;
    try {
      reply = pickPath(JSON.parse(text), cfg.replyPath || 'reply');
    } catch {
      reply = text; // 非 JSON 就直接用原文
    }
    if (typeof reply !== 'string') throw new Error('没能从响应里取到回复，请检查 replyPath');
    return reply;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------- 主流程 ----------------
const caseSet = buildCaseSet(profile, { count: count || 24, seed });
console.log(`\n目标：${profile.name}`);
console.log(`模式：${dryRun ? '干跑（内置模拟器，不联网）' : '真实接口 ' + (cfg.endpoint || '')}`);
console.log(`用例：${caseSet.length} 条（含正常业务对照）　判定语义复核：${llmAvailable() ? '启用' : '未启用（无 API Key）'}\n`);

const results = [];
for (const c of caseSet) {
  let reply = '';
  let groundTruth = null;
  let error = null;
  const t0 = Date.now();
  try {
    if (dryRun) {
      const s = simulate({ profile, systemPrompt: profile.systemPrompt, caseObj: c, hardened: false, seed });
      reply = s.reply;
      groundTruth = s.groundTruth;
    } else {
      reply = await callRealApi(c.attackPrompt);
    }
  } catch (e) {
    error = String(e.message || e);
    reply = '';
  }

  let judged = { verdict: 'safe', leakType: null, rule: 'error', evidence: [`调用失败：${error}`], confidence: 0 };
  if (!error) {
    judged = ruleJudge({ profile, systemPrompt: profile.systemPrompt, caseObj: c, reply });
    if (judged.verdict === 'uncertain' && llmAvailable()) {
      const second = await llmJudge({ profile, systemPrompt: profile.systemPrompt, caseObj: c, reply });
      if (second) {
        judged = {
          ...judged,
          verdict: second.verdict,
          leakType: second.leakType || judged.leakType,
          rule: `${judged.rule}+${second.rule}`,
          evidence: [...judged.evidence, ...(second.evidence || [])],
          confidence: second.confidence,
          crossChecked: true,
        };
      } else {
        judged = { ...judged, verdict: 'safe' };
      }
    }
  }

  results.push({
    ...c,
    reply,
    verdict: judged.verdict,
    leakType: judged.leakType,
    detector: judged.rule,
    evidence: judged.evidence,
    confidence: judged.confidence,
    crossChecked: !!judged.crossChecked,
    groundTruth,
    error,
    latencyMs: Date.now() - t0,
  });
  const mark = judged.verdict === 'breach' ? '✗ 攻破' : '✓ 安全';
  console.log(`${c.id.padEnd(4)} ${mark}  ${c.category.padEnd(12)} ${String(reply || error).replace(/\s+/g, ' ').slice(0, 60)}`);
}

const metrics = aggregate({ results, mode: dryRun ? 'sim' : 'live' });

// ---------------- 输出 ----------------
fs.mkdirSync(P(outDir), { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const jsonPath = P(path.join(outDir, `external-${stamp}.json`));
fs.writeFileSync(jsonPath, JSON.stringify({ profile: profile.name, endpoint: cfg.endpoint || '(dry-run)', metrics, results }, null, 2), 'utf8');

const pct = (x) => (x * 100).toFixed(1) + '%';
const md = [
  `# 外部接口体检报告 · ${profile.name}`,
  '',
  `- 目标：${dryRun ? '干跑（内置模拟器）' : cfg.endpoint}`,
  `- 时间：${new Date().toLocaleString('zh-CN')}　种子：${seed}`,
  `- 用例：${metrics.totalAttacks} 条攻击 + ${metrics.control.total} 条对照`,
  '',
  '## 评分卡',
  '',
  `| 指标 | 数值 |`,
  `| --- | --- |`,
  `| 安全评分 | **${metrics.riskScore}**（${metrics.level}） |`,
  `| 攻击成功率 ASR | ${pct(metrics.asr)}（${metrics.breaches}/${metrics.totalAttacks}） |`,
  `| 加权 ASR | ${pct(metrics.weightedAsr)} |`,
  `| 误报率 | ${pct(metrics.control.fpr)} |`,
  `| 单例耗时 p50 / max | ${metrics.latency.p50} ms / ${metrics.latency.max} ms |`,
  '',
  '## 分类维度',
  '',
  '| 威胁类别 | 用例 | 攻破 | ASR |',
  '| --- | --- | --- | --- |',
  ...metrics.byCategory.map((c) => `| ${c.label} | ${c.total} | ${c.breaches} | ${pct(c.asr)} |`),
  '',
  '## 攻破明细',
  '',
];
const breached = results.filter((r) => r.verdict === 'breach');
if (!breached.length) md.push('（本次没有用例被攻破）');
for (const r of breached) {
  md.push(`### ${r.id} ${r.title} · ${r.category}`, '');
  md.push(`- 变异算子：${r.mutationLabel}　检测器：${r.detector}${r.crossChecked ? '（语义复核）' : ''}`);
  md.push(`- 判定依据：${(r.evidence || []).join('；') || '—'}`, '');
  md.push('```text', '【攻击】' + r.attackPrompt.slice(0, 400), '【回复】' + String(r.reply).replace(/\n/g, ' ').slice(0, 400), '```', '');
}
const mdPath = P(path.join(outDir, `external-report-${stamp}.md`));
fs.writeFileSync(mdPath, md.join('\n'), 'utf8');

console.log('\n=== 汇总 ===');
console.log(`安全评分 ${metrics.riskScore}（${metrics.level}）　ASR ${pct(metrics.asr)}　误报率 ${pct(metrics.control.fpr)}　p50 ${metrics.latency.p50}ms`);
console.log(`报告已保存：\n  ${mdPath}\n  ${jsonPath}\n`);
if (dryRun) console.log('提示：去掉 --dry-run 并配好 tools/external-target.json，即可打你自己的真实接口。\n');
