import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { config, ROOT, llmAvailable, runtimeMode } from './src/env.js';
import { resolveTarget, loadProfiles } from './src/targets.js';
import { buildCaseSet } from './src/mutate.js';
import { runScan } from './src/engine.js';
import { buildHardening } from './src/harden.js';
import { buildMarkdownReport } from './src/report.js';
import { CATEGORIES } from './src/attacks.js';

const PUBLIC_DIR = path.join(ROOT, 'public');
const JOBS = new Map();
const JOB_TTL_MS = 1000 * 60 * 60 * 3;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.md': 'text/markdown; charset=utf-8',
  '.ico': 'image/x-icon',
};

function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req, limit = 1 << 20) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('BODY_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('BAD_JSON'));
      }
    });
    req.on('error', reject);
  });
}

function publicJob(job) {
  return {
    id: job.id,
    status: job.status,
    error: job.error,
    progress: job.progress,
    target: job.target,
    result: job.status === 'done' ? job.result : null,
    hardened: job.hardened || null,
    after: job.after || null,
  };
}

async function handleScan(req, res) {
  const body = await readBody(req);
  const { profileId, customSystemPrompt, count, seed } = body;
  let target;
  try {
    target = resolveTarget({ profileId, customSystemPrompt });
  } catch (e) {
    return sendJSON(res, 400, { error: String(e.message || e) });
  }

  const jobId = crypto.randomUUID();
  const job = {
    id: jobId,
    status: 'running',
    createdAt: Date.now(),
    progress: { done: 0, total: 0, last: null },
    target: { profileId: target.profile.id, name: target.profile.name, industry: target.profile.industry },
    params: { count: count || 24, seed: Number.isFinite(seed) ? seed : 20251031 },
    result: null,
    hardened: null,
    after: null,
    judge: null,
    error: null,
  };
  JOBS.set(jobId, job);
  sendJSON(res, 202, { jobId, mode: runtimeMode() });

  // 后台执行
  (async () => {
    try {
      const caseSet = buildCaseSet(target.profile, { count: job.params.count, seed: job.params.seed });
      job.progress.total = caseSet.length;
      const result = await runScan({
        profile: target.profile,
        systemPrompt: target.systemPrompt,
        caseSet,
        mode: runtimeMode(),
        seed: job.params.seed,
        hardened: false,
        onProgress: (p) => {
          job.progress = p;
        },
      });
      job.result = result;
      job.judge = result.judge;
      job.caseCount = job.params.count;
      job.status = 'done';
    } catch (e) {
      job.status = 'error';
      job.error = String(e.message || e);
    }
  })();
}

async function handleHarden(req, res, jobId) {
  const job = JOBS.get(jobId);
  if (!job || job.status !== 'done') return sendJSON(res, 404, { error: 'JOB_NOT_READY' });
  const target = resolveTarget({ profileId: job.target.profileId, customSystemPrompt: null });
  const profile = { ...target.profile };
  if (job.result.systemPrompt !== target.systemPrompt && job.result.systemPrompt !== profile.systemPrompt) {
    // 自定义 system prompt 场景
    const ct = (job.result.systemPrompt || '').match(/sk-[A-Za-z0-9]{8,}|[A-Z]{2,5}-[A-Z]{2,6}-\d{3,}/g) || [];
    profile.systemPrompt = job.result.systemPrompt;
    profile.canaries = ct;
  }
  const hardening = buildHardening({ profile, systemPrompt: job.result.systemPrompt, result: job.result });
  job.hardened = hardening;
  return sendJSON(res, 200, hardening);
}

async function handleRescan(req, res, jobId) {
  const job = JOBS.get(jobId);
  if (!job || job.status !== 'done' || !job.hardened) return sendJSON(res, 404, { error: 'NEED_HARDENING_FIRST' });

  const body = await readBody(req).catch(() => ({}));
  const base = resolveTarget({ profileId: job.target.profileId, customSystemPrompt: job.result.systemPrompt });
  // 复用同一 seed / 用例数 → 用例集与加固前完全一致，保证可比性
  const caseSet = buildCaseSet(base.profile, { count: job.params.count, seed: job.params.seed });
  const profile = { ...base.profile, systemPrompt: job.result.systemPrompt };

  job.after = {
    status: 'running',
    progress: { done: 0, total: caseSet.length, last: null },
    result: null,
  };
  sendJSON(res, 202, { jobId, started: true });

  (async () => {
    try {
      const result = await runScan({
        profile,
        systemPrompt: job.hardened.hardenedPrompt,
        caseSet,
        mode: runtimeMode(),
        seed: job.params.seed,
        hardened: true,
        onProgress: (p) => {
          job.after.progress = p;
        },
      });
      job.after = { status: 'done', progress: job.after.progress, result };
    } catch (e) {
      job.after = { status: 'error', error: String(e.message || e), progress: job.after.progress, result: null };
    }
  })();
}

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const filePath = path.join(PUBLIC_DIR, path.normalize(rel).replace(/^([/\\])+/, ''));
  if (!filePath.startsWith(PUBLIC_DIR)) return sendJSON(res, 403, { error: 'FORBIDDEN' });
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA 回退
      return fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e2, html) => {
        if (e2) return sendJSON(res, 404, { error: 'NOT_FOUND' });
        res.writeHead(200, { 'Content-Type': MIME['.html'] });
        res.end(html);
      });
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;

  try {
    // ---------- 静态资源 ----------
    if (!p.startsWith('/api/')) return serveStatic(req, res, p);

    // ---------- API ----------
    if (p === '/api/status' && req.method === 'GET') {
      return sendJSON(res, 200, {
        mode: runtimeMode(),
        model: config.model,
        baseUrl: config.baseUrl,
        llmAvailable: llmAvailable(),
        categories: CATEGORIES,
      });
    }

    if (p === '/api/profiles' && req.method === 'GET') {
      return sendJSON(res, 200, {
        profiles: loadProfiles().map((x) => ({
          id: x.id,
          name: x.name,
          industry: x.industry,
          tagline: x.tagline,
          exposure: x.exposure,
          tools: x.tools,
          systemPrompt: x.systemPrompt,
          canaries: x.canaries,
        })),
      });
    }

    if (p === '/api/scan' && req.method === 'POST') return handleScan(req, res);

    const mJob = p.match(/^\/api\/jobs\/([\w-]+)$/);
    if (mJob && req.method === 'GET') {
      const job = JOBS.get(mJob[1]);
      if (!job) return sendJSON(res, 404, { error: 'JOB_NOT_FOUND' });
      return sendJSON(res, 200, publicJob(job));
    }

    const mHarden = p.match(/^\/api\/jobs\/([\w-]+)\/harden$/);
    if (mHarden && req.method === 'POST') return handleHarden(req, res, mHarden[1]);

    const mRescan = p.match(/^\/api\/jobs\/([\w-]+)\/rescan$/);
    if (mRescan && req.method === 'POST') return handleRescan(req, res, mRescan[1]);

    const mReport = p.match(/^\/api\/jobs\/([\w-]+)\/report\.md$/);
    if (mReport && req.method === 'GET') {
      const job = JOBS.get(mReport[1]);
      if (!job || job.status !== 'done') return sendJSON(res, 404, { error: 'JOB_NOT_READY' });
      const md = buildMarkdownReport({ result: job.result, hardened: job.hardened, after: job.after?.result || null, judge: job.judge });
      res.writeHead(200, {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="promptprobe-report-${job.id.slice(0, 8)}.md"`,
      });
      return res.end(md);
    }

    // 报告 JSON（供前端内嵌展示）
    const mReportJson = p.match(/^\/api\/jobs\/([\w-]+)\/report$/);
    if (mReportJson && req.method === 'GET') {
      const job = JOBS.get(mReportJson[1]);
      if (!job || job.status !== 'done') return sendJSON(res, 404, { error: 'JOB_NOT_READY' });
      return sendJSON(res, 200, {
        markdown: buildMarkdownReport({ result: job.result, hardened: job.hardened, after: job.after?.result || null, judge: job.judge }),
      });
    }

    return sendJSON(res, 404, { error: 'NOT_FOUND' });
  } catch (e) {
    return sendJSON(res, 500, { error: String(e.message || e) });
  }
});

// 清理过期任务
setInterval(() => {
  const now = Date.now();
  for (const [id, job] of JOBS) if (now - job.createdAt > JOB_TTL_MS) JOBS.delete(id);
}, 1000 * 60 * 10).unref();

server.listen(config.port, () => {
  const mode = runtimeMode();
  console.log('');
  console.log('  PromptProbe  ·  大模型应用安全体检平台');
  console.log('  ------------------------------------------------');
  console.log(`  地址     http://127.0.0.1:${config.port}`);
  console.log(`  运行模式 ${mode === 'live' ? `真实大模型红队（${config.model} @ ${config.baseUrl}）` : '离线模拟演示（未配置 LLM_API_KEY）'}`);
  console.log('  ------------------------------------------------');
  console.log('  仅可用于对自有或已获授权的应用做安全评估。');
  console.log('');
});
