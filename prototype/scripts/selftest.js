/**
 * 端到端自测：对三个内置受测应用跑「扫描 → 加固 → 复测」，并打印评分卡。
 * 用法：node scripts/selftest.js  （或 npm run selftest）
 */
import { loadProfiles } from '../src/targets.js';
import { buildCaseSet } from '../src/mutate.js';
import { runScan } from '../src/engine.js';
import { buildHardening } from '../src/harden.js';
import { buildMarkdownReport } from '../src/report.js';
import { runtimeMode } from '../src/env.js';

const mode = runtimeMode();
const MODE = process.env.FORCE_MODE || (mode === 'live' ? 'live' : 'sim');
console.log(`\n运行模式：${MODE.toUpperCase()}${MODE === 'sim' ? '（未配置 LLM_API_KEY，使用内置模拟被测应用）' : ''}\n`);

const pct = (x) => (x * 100).toFixed(1) + '%';
let failed = 0;

for (const profile of loadProfiles()) {
  const seed = 20251031;
  const count = 24;
  const caseSet = buildCaseSet(profile, { count, seed });

  const before = await runScan({
    profile,
    systemPrompt: profile.systemPrompt,
    caseSet,
    mode: MODE,
    seed,
    hardened: false,
  });

  const hardening = buildHardening({ profile, systemPrompt: profile.systemPrompt, result: before });
  const after = await runScan({
    profile,
    systemPrompt: hardening.hardenedPrompt,
    caseSet,
    mode: MODE,
    seed,
    hardened: true,
  });

  const m = before.metrics;
  const n = after.metrics;
  console.log(`── ${profile.name}（${profile.industry}）`);
  console.log(`   用例 ${m.totalAttacks}+${m.control.total} 条 | 加固前 评分 ${m.riskScore} ASR ${pct(m.asr)} 加权ASR ${pct(m.weightedAsr)}`);
  console.log(`                            | 加固后 评分 ${n.riskScore} ASR ${pct(n.asr)} 加权ASR ${pct(n.weightedAsr)}`);
  console.log(`   分类：` + m.byCategory.map((c) => `${c.label} ${c.breaches}/${c.total}`).join(' | '));
  if (m.detection) {
    console.log(`   判定器：P=${m.detection.precision} R=${m.detection.recall} F1=${m.detection.f1} Acc=${m.detection.accuracy}`);
  }
  console.log(`   误报率：${pct(m.control.fpr)} → ${pct(n.control.fpr)}`);

  const md = buildMarkdownReport({ result: before, hardened: hardening, after: { markers: 1, metrics: n, cases: after.cases }, judge: before.judge });
  if (!md.includes('安全体检报告')) {
    console.log('   [FAIL] 报告生成异常');
    failed++;
  }
  if (n.asr >= m.asr) {
    console.log(`   [WARN] 加固后 ASR 未下降（${pct(m.asr)} → ${pct(n.asr)}）`);
    failed++;
  } else {
    console.log(`   [OK] ASR 下降 ${((m.asr - n.asr) * 100).toFixed(1)} 个百分点`);
  }
  console.log('');
}

console.log(failed ? `\n自测结束：${failed} 项需要关注\n` : '\n自测通过：扫描→加固→复测→报告 全链路正常\n');
process.exit(failed ? 1 : 0);
