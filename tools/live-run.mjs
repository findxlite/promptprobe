/**
 * LIVE 模式批量实验：对 3 个内置受测应用各跑一遍「扫描 → 加固 → 复测」，落盘结果。
 * 用法：node tools/live-run.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://127.0.0.1:8787';
const OUT = 'C:\\Users\\29467\\course design\\docs\\live';
const SEED = 20251031;
const COUNT = 24;
const PROFILES = ['xinghuo-cs', 'qingteng-edu', 'codementor', 'tiaozaijie'];

fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(p, opt) {
  const res = await fetch(BASE + p, opt);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${p} -> ${res.status} ${JSON.stringify(body).slice(0, 200)}`);
  return body;
}

async function waitJob(jobId, what, timeoutMs = 600000) {
  const t0 = Date.now();
  let last = '';
  while (Date.now() - t0 < timeoutMs) {
    const j = await api(`/api/jobs/${jobId}`);
    const p = j.after ? j.after.progress : j.progress;
    const key = `${p?.done}/${p?.total}`;
    if (key !== last) {
      process.stdout.write(`  ${what} ${key}\n`);
      last = key;
    }
    if (j.after) {
      if (j.after.status === 'done') return j;
      if (j.after.status === 'error') throw new Error('rescan error: ' + j.after.error);
    } else if (j.status === 'done') return j;
    else if (j.status === 'error') throw new Error('scan error: ' + j.error);
    await sleep(1500);
  }
  throw new Error(`${what} timeout`);
}

const summary = [];
const pct = (x) => (x * 100).toFixed(1) + '%';

for (const pid of PROFILES) {
  console.log(`\n===== ${pid} =====`);
  const start = await api('/api/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profileId: pid, count: COUNT, seed: SEED }),
  });
  console.log(`  mode=${start.mode} job=${start.jobId}`);
  let job = await waitJob(start.jobId, 'scan');
  const before = job.result;

  await api(`/api/jobs/${start.jobId}/harden`, { method: 'POST' });
  await api(`/api/jobs/${start.jobId}/rescan`, { method: 'POST' });
  job = await waitJob(start.jobId, 'rescan');
  const after = job.after.result;

  const rep = await api(`/api/jobs/${start.jobId}/report`);
  fs.writeFileSync(path.join(OUT, `report-${pid}.md`), rep.markdown, 'utf8');
  fs.writeFileSync(
    path.join(OUT, `result-${pid}.json`),
    JSON.stringify({ jobId: start.jobId, before, after, hardened: job.hardened }, null, 2),
    'utf8'
  );

  const b = before.metrics;
  const a = after.metrics;
  console.log(`  加固前 评分 ${b.riskScore} ASR ${pct(b.asr)} 误报 ${pct(b.control.fpr)} 判定F1 ${b.detection ? b.detection.f1 : '-'}`);
  console.log(`  加固后 评分 ${a.riskScore} ASR ${pct(a.asr)} 误报 ${pct(a.control.fpr)}`);
  console.log(`  token 用量 calls=${(before.usage?.calls || 0) + (after.usage?.calls || 0)} prompt=${(before.usage?.promptTokens || 0) + (after.usage?.promptTokens || 0)} completion=${(before.usage?.completionTokens || 0) + (after.usage?.completionTokens || 0)}`);
  summary.push({
    profile: before.profileName,
    industry: before.industry,
    before: { score: b.riskScore, asr: b.asr, fpr: b.control.fpr, det: b.detection, cat: b.byCategory },
    after: { score: a.riskScore, asr: a.asr, fpr: a.control.fpr, cat: a.byCategory },
    usage: {
      calls: (before.usage?.calls || 0) + (after.usage?.calls || 0),
      prompt: (before.usage?.promptTokens || 0) + (after.usage?.promptTokens || 0),
      completion: (before.usage?.completionTokens || 0) + (after.usage?.completionTokens || 0),
    },
  });
}

fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');
console.log('\n===== 汇总 =====');
for (const s of summary) {
  console.log(`${s.profile}: ${s.before.score}→${s.after.score} | ASR ${pct(s.before.asr)}→${pct(s.after.asr)} | FPR ${pct(s.before.fpr)} | tokens ${s.usage.prompt + s.usage.completion}`);
}
const tot = summary.reduce((t, s) => t + s.usage.prompt + s.usage.completion, 0);
console.log(`总 tokens: ${tot}`);
