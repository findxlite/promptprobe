const $ = (s) => document.querySelector(s);
const state = {
  status: null,
  profiles: [],
  selectedId: null,
  job: null,
  filter: 'all',
  pollTimer: null,
};

const CAT_COLOR = {
  prompt_leak: '#7aa2ff',
  secret_leak: '#ff7a8b',
  over_agent: '#f2a03d',
  jailbreak: '#b98bff',
  control: '#5f6f9e',
};
const CAT_LABEL = {
  prompt_leak: '系统提示词泄露',
  secret_leak: '敏感信息泄露',
  over_agent: '过度代理/越权',
  jailbreak: '越狱与有害内容',
  control: '正常业务对照',
};

init();

async function init() {
  try {
    const [st, pf] = await Promise.all([
      fetch('/api/status').then((r) => r.json()),
      fetch('/api/profiles').then((r) => r.json()),
    ]);
    state.status = st;
    state.profiles = pf.profiles;
    renderStatus();
    renderProfiles();
    if (state.profiles.length) selectProfile(state.profiles[0].id);
  } catch (e) {
    toast('无法连接本地服务，请确认 node server.js 已启动');
  }

  $('#caseCount').addEventListener('input', (e) => ($('#caseCountVal').textContent = e.target.value));
  $('#btnScan').addEventListener('click', startScan);
  $('#btnHarden').addEventListener('click', doHarden);
  $('#btnRescan').addEventListener('click', doRescan);
  $('#btnReport').addEventListener('click', downloadReport);
  $('#filters').addEventListener('click', (e) => {
    const btn = e.target.closest('.chip');
    if (!btn) return;
    state.filter = btn.dataset.f;
    [...document.querySelectorAll('.chip')].forEach((c) => c.classList.toggle('active', c === btn));
    renderCases();
  });
}

function renderStatus() {
  const st = state.status;
  const badge = $('#modeBadge');
  if (!st) return;
  if (st.mode === 'live') {
    badge.className = 'badge badge-live';
    badge.textContent = 'LIVE · 真实大模型红队';
    $('#modelInfo').textContent = `${st.model} @ ${st.baseUrl.replace(/^https?:\/\//, '')}`;
  } else {
    badge.className = 'badge badge-sim';
    badge.textContent = 'SIMULATED · 离线模拟演示模式';
    $('#modelInfo').textContent = '未配置 LLM_API_KEY（见 .env.example）';
  }
}

function renderProfiles() {
  const box = $('#profileList');
  box.innerHTML = state.profiles
    .map(
      (p) => `
    <div class="profile" data-id="${p.id}">
      <div class="profile-top">
        <span class="profile-name">${esc(p.name)}</span>
        <span class="profile-ind">${esc(p.industry)}</span>
      </div>
      <div class="profile-tag">${esc(p.tagline)}</div>
      <div class="profile-tag" style="opacity:.7">${esc(p.exposure || '')}</div>
      <div class="profile-tools">
        ${(p.tools || []).map((t) => `<span class="tool-chip risk-${esc(t.risk)}">${esc(t.name)} · ${esc(t.desc)}</span>`).join('')}
      </div>
    </div>`
    )
    .join('');
  box.addEventListener('click', (e) => {
    const el = e.target.closest('.profile');
    if (el) selectProfile(el.dataset.id);
  });
}

function selectProfile(id) {
  state.selectedId = id;
  [...document.querySelectorAll('.profile')].forEach((el) => el.classList.toggle('active', el.dataset.id === id));
}

async function startScan() {
  if (!state.selectedId) return toast('请先选择一个受测应用');
  const custom = $('#customPrompt').value.trim();
  $('#btnScan').disabled = true;
  $('#btnScan').textContent = '扫描中…';
  $('#empty').classList.add('hidden');
  $('#panelResult').classList.add('hidden');
  $('#panelHarden').classList.add('hidden');
  $('#panelCompare').classList.add('hidden');
  $('#panelProgress').classList.remove('hidden');
  $('#liveLog').innerHTML = '';
  $('#progressBar').style.width = '0%';
  $('#progressText').textContent = '';

  try {
    const res = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileId: state.selectedId,
        customSystemPrompt: custom || null,
        count: Number($('#caseCount').value),
        seed: Number($('#seed').value) || 20251031,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'scan failed');
    poll(data.jobId);
  } catch (e) {
    toast('启动扫描失败：' + e.message);
    resetScanButton();
  }
}

function poll(jobId) {
  clearInterval(state.pollTimer);
  state.pollTimer = setInterval(async () => {
    try {
      const job = await fetch(`/api/jobs/${jobId}`).then((r) => r.json());
      state.job = job;
      if (job.status === 'running') return updateProgress(job);
      if (job.status === 'error') {
        clearInterval(state.pollTimer);
        resetScanButton();
        return toast('扫描失败：' + job.error);
      }
      clearInterval(state.pollTimer);
      resetScanButton();
      $('#panelProgress').classList.add('hidden');
      $('#panelResult').classList.remove('hidden');
      renderResult(job);
      if (job.after) {
        $('#panelCompare').classList.remove('hidden');
        renderCompare(job);
      }
    } catch (e) {
      /* 轮询失败忽略 */
    }
  }, 500);
}

function updateProgress(job) {
  const p = job.progress || { done: 0, total: 0, last: null };
  const pctv = p.total ? Math.round((p.done / p.total) * 100) : 0;
  $('#progressBar').style.width = pctv + '%';
  $('#progressText').textContent = `${p.done}/${p.total || '?'}`;
  if (p.last) {
    const li = document.createElement('li');
    const isBreach = p.last.verdict === 'breach';
    li.innerHTML = `<span class="mono" style="color:#6f7da8">${esc(p.last.id)}</span>
      <span style="flex:1">${esc(p.last.title)}</span>
      <span class="${isBreach ? 'v-breach' : 'v-safe'}">${isBreach ? '✗ 攻击成功' : '✓ 已拦截'}</span>`;
    const log = $('#liveLog');
    log.prepend(li);
    while (log.children.length > 40) log.lastChild.remove();
  }
}

function resetScanButton() {
  $('#btnScan').disabled = false;
  $('#btnScan').textContent = '开始安全体检';
}

/* ---------------- 结果渲染 ---------------- */
function renderResult(job) {
  const m = job.result.metrics;
  const score = m.riskScore;
  const color = score >= 85 ? '#2fbf7a' : score >= 70 ? '#f2b03d' : score >= 50 ? '#ff8b4a' : '#ff5c6c';

  $('#scoreVal').textContent = score;
  $('#scoreVal').style.color = color;
  const deg = Math.round((score / 100) * 360);
  $('#scoreRing').style.background = `conic-gradient(${color} ${deg}deg, #1d2748 ${deg}deg)`;
  const lv = $('#riskLevel');
  lv.textContent = '风险等级：' + m.level;
  lv.className = 'risk-level risk-' + m.level;

  $('#kpiAsr').textContent = (m.asr * 100).toFixed(1) + '%';
  $('#kpiAsr').style.color = m.asr > 0.5 ? '#ff9aa5' : m.asr > 0.3 ? '#f7c463' : '#6ee7ad';
  $('#kpiBreach').textContent = `${m.breaches}/${m.totalAttacks}`;
  $('#kpiFpr').textContent = (m.control.fpr * 100).toFixed(1) + '%';
  $('#kpiDet').textContent = m.detection ? m.detection.f1.toFixed(2) : '—';

  $('#runMeta').textContent =
    `模式：${job.result.mode === 'live' ? 'LIVE 真实模型' : 'SIMULATED 模拟'} · 种子：${job.result.seed} · ` +
    `耗时：${(job.result.durationMs / 1000).toFixed(1)}s · p50：${m.latency.p50}ms · 判定链：${job.result.judge.llm}`;

  $('#catBars').innerHTML = m.byCategory
    .map((c) => {
      const w = Math.round(c.asr * 100);
      const col = CAT_COLOR[c.category] || '#7aa2ff';
      return `<div class="cat-row">
        <div class="cat-name">${esc(c.label)}<small>${esc(c.owasp)}</small></div>
        <div class="cat-track"><div class="cat-fill" style="width:${w}%;background:linear-gradient(90deg,${col},${col}aa)"></div></div>
        <div class="cat-val">${c.breaches}/${c.total} · ${w}%</div>
      </div>`;
    })
    .join('');

  $('#btnHarden').disabled = false;
  $('#btnReport').disabled = false;
  $('#btnRescan').disabled = !job.hardened;
  if (job.hardened) renderHarden(job.hardened);
  renderCases();
}

function renderCases() {
  const job = state.job;
  if (!job || !job.result) return;
  const f = state.filter;
  const list = job.result.cases.filter((c) => {
    if (f === 'all') return true;
    if (f === 'control') return c.category === 'control';
    if (f === 'breach') return c.verdict === 'breach' && c.category !== 'control';
    return c.verdict === 'safe' && c.category !== 'control';
  });

  $('#caseList').innerHTML = list
    .map((c) => {
      const isBreach = c.verdict === 'breach';
      const dotCls = c.category === 'control' ? 'dot-control' : isBreach ? 'dot-breach' : 'dot-safe';
      const vtCls = isBreach ? 'vt-breach' : 'vt-safe';
      const vt = isBreach ? '✗ 攻击成功' : '✓ 已拦截';
      const ev = (c.evidence || []).length
        ? `<div class="evidence"><b>判定依据</b>：${c.evidence.map(esc).join('；')}</div>`
        : '';
      return `<div class="case" data-cat="${c.category}">
        <div class="case-head">
          <span class="dot ${dotCls}"></span>
          <span class="case-id">${esc(c.id)}</span>
          <span class="case-title">${esc(c.title)}</span>
          <span class="mut-tag">${esc(c.mutationLabel)}</span>
          <span class="verdict-tag ${vtCls}">${vt}</span>
        </div>
        <div class="case-body">
          <div class="kv"><div class="kv-label">类别 / 检测器</div>
            <div class="kv-content">${esc(CAT_LABEL[c.category] || c.category)} · ${esc(c.detector)}${c.crossChecked ? ' · 已语义复核' : ''} · 置信度 ${c.confidence}</div></div>
          <div class="kv"><div class="kv-label">攻击载荷（${esc(c.mutationLabel)}）</div>
            <div class="kv-content attack">${esc(c.attackPrompt)}</div></div>
          <div class="kv"><div class="kv-label">被测应用回复</div>
            <div class="kv-content ${isBreach ? 'reply-breach' : 'reply-safe'}">${esc(c.reply || '（空）')}</div></div>
          ${ev}
        </div>
      </div>`;
    })
    .join('');

  if (!list.length) $('#caseList').innerHTML = '<div class="skeleton">该筛选下没有用例。</div>';

  $('#caseList').querySelectorAll('.case-head').forEach((h) => {
    h.addEventListener('click', () => h.parentElement.classList.toggle('open'));
  });
}

/* ---------------- 加固 ---------------- */
async function doHarden() {
  const job = state.job;
  if (!job) return;
  $('#btnHarden').disabled = true;
  try {
    const res = await fetch(`/api/jobs/${job.id}/harden`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'harden failed');
    state.job.hardened = data;
    renderHarden(data);
    $('#btnRescan').disabled = false;
    $('#panelHarden').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    toast('生成加固方案失败：' + e.message);
  } finally {
    $('#btnHarden').disabled = false;
  }
}

function renderHarden(h) {
  $('#panelHarden').classList.remove('hidden');
  $('#hardenRules').innerHTML = h.changes
    .map(
      (c) => `<div class="harden-item">
        <div class="h-title">${esc(c.title)}
          ${c.triggeredBy ? '<span class="pill">本次命中 · 定向补强</span>' : '<span class="pill pill-off">通用加固</span>'}
        </div>
        <div class="h-text">${esc(c.text)}</div>
      </div>`
    )
    .join('');
  $('#hardenPrompt').textContent = h.hardenedPrompt;
}

async function doRescan() {
  const job = state.job;
  if (!job || !job.hardened) return;
  $('#btnRescan').disabled = true;
  $('#btnRescan').textContent = '复测中…';
  try {
    const res = await fetch(`/api/jobs/${job.id}/rescan`, { method: 'POST' });
    if (!res.ok) throw new Error((await res.json()).error);
    await new Promise((resolve) => {
      const t = setInterval(async () => {
        const j = await fetch(`/api/jobs/${job.id}`).then((r) => r.json());
        state.job = j;
        if (j.after?.status === 'done' || j.after?.status === 'error') {
          clearInterval(t);
          resolve();
        }
      }, 600);
    });
    $('#panelCompare').classList.remove('hidden');
    renderCompare(state.job);
    $('#panelCompare').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    toast('复测失败：' + e.message);
  } finally {
    $('#btnRescan').disabled = false;
    $('#btnRescan').textContent = '用加固方案复测';
  }
}

function renderCompare(job) {
  const a = job.result.metrics;
  const b = job.after?.result?.metrics;
  if (!b) {
    $('#compareBars').innerHTML = '<div class="skeleton">复测进行中…</div>';
    return;
  }
  const rows = [
    { label: '总体 ASR', before: a.asr, after: b.asr },
    ...a.byCategory.map((c) => {
      const ac = b.byCategory.find((x) => x.category === c.category);
      return { label: c.label, before: c.asr, after: ac ? ac.asr : 0 };
    }),
  ];
  $('#compareBars').innerHTML = rows
    .map(
      (r) => `<div class="cmp-row">
      <div class="cat-name">${esc(r.label)}</div>
      <div class="cmp-track">
        <div class="cmp-bar before" style="width:${Math.max(2, r.before * 100)}%"></div>
        <div class="cmp-bar after" style="width:${Math.max(2, r.after * 100)}%"></div>
      </div>
      <div class="cmp-legend">${(r.before * 100).toFixed(0)}% <span style="color:#6f7da8">→</span> <span style="color:#6ee7ad">${(r.after * 100).toFixed(0)}%</span></div>
    </div>`
    )
    .join('');

  const bw = a.weightedAsr;
  const aw = b.weightedAsr;
  $('#compareTable').innerHTML = `
    <thead><tr><th>指标</th><th>加固前</th><th>加固后</th><th>变化</th></tr></thead>
    <tbody>
      <tr><td>安全评分</td><td class="num">${a.riskScore}</td><td class="num">${b.riskScore}</td>
        <td class="num up">+${b.riskScore - a.riskScore}</td></tr>
      <tr><td>攻击成功率 ASR</td><td class="num">${(a.asr * 100).toFixed(1)}%</td><td class="num">${(b.asr * 100).toFixed(1)}%</td>
        <td class="num ${b.asr < a.asr ? 'up' : 'down'}">${((b.asr - a.asr) * 100).toFixed(1)} pp</td></tr>
      <tr><td>加权 ASR</td><td class="num">${(bw * 100).toFixed(1)}%</td><td class="num">${(aw * 100).toFixed(1)}%</td>
        <td class="num ${aw < bw ? 'up' : 'down'}">${((aw - bw) * 100).toFixed(1)} pp</td></tr>
      <tr><td>成功攻击 / 用例</td><td class="num">${a.breaches}/${a.totalAttacks}</td><td class="num">${b.breaches}/${b.totalAttacks}</td>
        <td class="num up">−${a.breaches - b.breaches}</td></tr>
      <tr><td>误报率</td><td class="num">${(a.control.fpr * 100).toFixed(1)}%</td><td class="num">${(b.control.fpr * 100).toFixed(1)}%</td>
        <td class="num">—</td></tr>
      ${b.detection ? `<tr><td>判定器 F1</td><td class="num">${a.detection ? a.detection.f1 : '—'}</td><td class="num">${b.detection.f1}</td><td class="num">—</td></tr>` : ''}
    </tbody>`;
}

async function downloadReport() {
  const job = state.job;
  if (!job) return;
  try {
    const res = await fetch(`/api/jobs/${job.id}/report`);
    const data = await res.json();
    const blob = new Blob([data.markdown], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `PromptProbe-体检报告-${job.target.name}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('报告已导出');
  } catch (e) {
    toast('导出失败：' + e.message);
  }
}

/* ---------------- utils ---------------- */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3200);
}
