import { CATEGORIES } from './attacks.js';

const VERDICT_LABEL = { breach: '❌ 判定：违规（攻击成功）', safe: '✅ 判定：安全（已拦截/拒答）' };

export function buildMarkdownReport(job) {
  const r = job.result;
  const after = job.after;
  const m = r.metrics;
  const lines = [];

  lines.push(`# PromptProbe 安全体检报告`);
  lines.push('');
  lines.push(`- 被测应用：**${r.profileName}**（${r.industry}）`);
  lines.push(`- 体检时间：${new Date(r.startedAt).toLocaleString('zh-CN')}`);
  lines.push(`- 运行模式：${r.mode === 'live' ? '真实大模型红队（LIVE）' : '离线模拟演示（SIMULATED）'}`);
  lines.push(`- 用例集：${m.totalAttacks} 条攻击用例 + ${m.control.total} 条正常业务对照，随机种子 ${r.seed}`);
  lines.push(`- 判定链：规则层（金丝雀 / 最长公共子串 / n-gram / 行为痕迹）${job.judge.llm.includes('已启用') ? ' + 大模型语义复核' : ''}`);
  lines.push('');
  lines.push('## 一、总体评分卡');
  lines.push('');
  lines.push(`| 指标 | 数值 |`);
  lines.push(`| --- | --- |`);
  lines.push(`| 安全评分（0-100） | **${m.riskScore}**（风险等级：${m.level}） |`);
  lines.push(`| 攻击成功率 ASR | ${pct(m.asr)}（${m.breaches}/${m.totalAttacks}） |`);
  lines.push(`| 加权 ASR | ${pct(m.weightedAsr)} |`);
  lines.push(`| 误报率（正常业务被判违规） | ${pct(m.control.fpr)} |`);
  lines.push(`| 单用例耗时 p50 / max | ${m.latency.p50} ms / ${m.latency.max} ms |`);
  if (m.detection) {
    lines.push(`| 判定器校准（模拟集） | P=${m.detection.precision} R=${m.detection.recall} F1=${m.detection.f1} Acc=${m.detection.accuracy}（n=${m.detection.n}） |`);
  }
  lines.push('');
  lines.push('## 二、分类维度成功率');
  lines.push('');
  lines.push('| 威胁类别 | OWASP | 用例 | 成功 | ASR |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const c of m.byCategory) {
    lines.push(`| ${c.label} | ${c.owasp} | ${c.total} | ${c.breaches} | ${pct(c.asr)} |`);
  }
  lines.push('');

  if (after) {
    const am = after.metrics;
    lines.push('## 三、加固前后对比');
    lines.push('');
    lines.push('| 指标 | 加固前 | 加固后 | 变化 |');
    lines.push('| --- | --- | --- | --- |');
    lines.push(`| 安全评分 | ${m.riskScore} | ${am.riskScore} | ${delta(am.riskScore - m.riskScore)} |`);
    lines.push(`| ASR | ${pct(m.asr)} | ${pct(am.asr)} | ${delta((am.asr - m.asr) * 100)} pp |`);
    for (const c of am.byCategory) {
      const before = m.byCategory.find((x) => x.category === c.category);
      if (!before) continue;
      lines.push(`| ${c.label} ASR | ${pct(before.asr)} | ${pct(c.asr)} | ${delta((c.asr - before.asr) * 100)} pp |`);
    }
    lines.push('');
  }

  const breached = r.cases.filter((c) => c.verdict === 'breach');
  lines.push(`## ${after ? '四' : '三'}、高危用例明细（共 ${breached.length} 条）`);
  lines.push('');
  for (const c of breached.slice(0, 40)) {
    lines.push(`### ${c.id} ${c.title} · ${CATEGORIES[c.category]?.label || c.category}`);
    lines.push('');
    lines.push(`- 变异算子：${c.mutationLabel}（强度 ${c.mutationStrength}）`);
    lines.push(`- 检测器：${c.detector}${c.crossChecked ? '（已语义复核）' : ''}`);
    lines.push(`- 证据：${(c.evidence || []).join('；') || '—'}`);
    lines.push('');
    lines.push('```text');
    lines.push('【攻击】' + trunc(c.attackPrompt, 260));
    lines.push('【回复】' + trunc((c.reply || '').replace(/\n/g, ' '), 260));
    lines.push('```');
    lines.push('');
  }

  if (after && job.hardened) {
    lines.push('## 五、加固方案');
    lines.push('');
    for (const ch of job.hardened.changes) {
      lines.push(`- **${ch.title}**${ch.triggeredBy ? '（本次体检命中后定向补强）' : ''}：${ch.text}`);
    }
    lines.push('');
    lines.push('加固后的系统提示词全文见工程包 `harden.js` 生成结果或网页端"加固方案"面板。');
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('> 说明：本报告由 PromptProbe 自动生成。' + (r.mode === 'sim' ? '本次运行为**离线模拟模式**，被测应用为内置模拟器，指标用于演示流程与判定器校准，不代表任何真实模型的安全水平。' : '本次运行调用了真实大模型 API。'));
  lines.push('> 本工具仅可用于对自己拥有或已获授权的应用做安全评估。');

  return lines.join('\n');
}

function pct(x) {
  return `${(x * 100).toFixed(1)}%`;
}
function delta(x) {
  const v = Math.round(x * 10) / 10;
  return `${v > 0 ? '+' : ''}${v}`;
}
function trunc(s, n) {
  const t = String(s || '');
  return t.length > n ? t.slice(0, n) + '…' : t;
}
