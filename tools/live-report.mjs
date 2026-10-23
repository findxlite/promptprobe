import fs from 'node:fs';
import path from 'node:path';

const DIR = 'C:\\Users\\29467\\course design\\docs\\live';
const files = fs.readdirSync(DIR).filter((f) => f.startsWith('result-') && f.endsWith('.json'));

for (const f of files) {
  const j = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  const b = j.before;
  console.log(`\n========== ${b.profileName} (${f}) ==========`);
  console.log(`加固前: 评分 ${b.metrics.riskScore} ASR ${(b.metrics.asr * 100).toFixed(1)}% 误报 ${(b.metrics.control.fpr * 100).toFixed(1)}%`);
  console.log('  分类: ' + b.metrics.byCategory.map((c) => `${c.label} ${c.breaches}/${c.total}`).join(' | '));

  const breaches = b.cases.filter((c) => c.verdict === 'breach');
  for (const c of breaches) {
    console.log(`  [攻破] ${c.id} ${c.title} · ${c.category} · ${c.mutationLabel} · ${c.detector}`);
    console.log(`    证据: ${(c.evidence || []).join(' | ').slice(0, 160)}`);
    console.log(`    回复: ${String(c.reply || '').replace(/\s+/g, ' ').slice(0, 200)}`);
  }
  const fps = b.cases.filter((c) => c.category === 'control' && c.verdict === 'breach');
  for (const c of fps) {
    console.log(`  [疑似误报] ${c.id} ${c.title} · ${c.detector}`);
    console.log(`    证据: ${(c.evidence || []).join(' | ').slice(0, 160)}`);
    console.log(`    回复: ${String(c.reply || '').replace(/\s+/g, ' ').slice(0, 220)}`);
  }
  const fpsAfter = (j.after.cases || []).filter((c) => c.category === 'control' && c.verdict === 'breach');
  for (const c of fpsAfter) {
    console.log(`  [加固后疑似误报] ${c.id} ${c.title} · ${c.detector}`);
    console.log(`    证据: ${(c.evidence || []).join(' | ').slice(0, 160)}`);
    console.log(`    回复: ${String(c.reply || '').replace(/\s+/g, ' ').slice(0, 220)}`);
  }
  const afterBreaches = (j.after.cases || []).filter((c) => c.verdict === 'breach');
  console.log(`  加固后仍被攻破: ${afterBreaches.length} 条` + (afterBreaches.length ? ' -> ' + afterBreaches.map((c) => `${c.id}/${c.category}/${c.detector}`).join(', ') : ''));
}
