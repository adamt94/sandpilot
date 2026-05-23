export function dashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sandpilot</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0d1117;--surface:#161b22;--surface2:#21262d;
  --border:#30363d;--text:#e6edf3;--muted:#7d8590;
  --green:#3fb950;--red:#f85149;--yellow:#d29922;
  --blue:#58a6ff;--purple:#bc8cff;--orange:#f0883e;
}
body{background:var(--bg);color:var(--text);font-family:'SF Mono','Fira Code',monospace;font-size:13px;line-height:1.5}
header{display:flex;align-items:center;justify-content:space-between;padding:14px 24px;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--bg);z-index:10}
.logo{font-size:15px;font-weight:600;letter-spacing:.5px}
.logo span{color:var(--blue)}
.header-right{display:flex;align-items:center;gap:16px;color:var(--muted);font-size:12px}
.dot{width:7px;height:7px;border-radius:50%;background:var(--green);display:inline-block;margin-right:6px}
.dot.offline{background:var(--red)}
button.refresh{background:none;border:1px solid var(--border);color:var(--muted);border-radius:5px;padding:3px 10px;cursor:pointer;font-family:inherit;font-size:12px}
button.refresh:hover{border-color:var(--blue);color:var(--blue)}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:1px;background:var(--border);border-bottom:1px solid var(--border)}
.stat{background:var(--surface);padding:16px 20px}
.stat-val{font-size:22px;font-weight:600;letter-spacing:-.5px}
.stat-label{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.8px;margin-top:2px}
.stat-val.green{color:var(--green)}
.stat-val.red{color:var(--red)}
.stat-val.blue{color:var(--blue)}
.stat-val.yellow{color:var(--yellow)}
section{padding:20px 24px}
.section-title{font-size:11px;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);margin-bottom:12px}
.active-grid{display:flex;flex-direction:column;gap:8px;margin-bottom:24px}
.active-card{background:var(--surface);border:1px solid var(--border);border-left:3px solid var(--blue);border-radius:6px;padding:12px 16px;display:flex;align-items:center;gap:12px}
.active-card .spinner{color:var(--blue);animation:spin 1.2s linear infinite;display:inline-block;font-size:14px}
@keyframes spin{to{transform:rotate(360deg)}}
.active-card .job-main{flex:1;min-width:0}
.active-card .job-row1{display:flex;align-items:center;gap:10px;margin-bottom:3px}
.active-card .job-id{color:var(--blue);font-size:12px}
.active-card .repo{background:var(--surface2);border:1px solid var(--border);border-radius:3px;padding:1px 7px;font-size:11px}
.active-card .model-badge{color:var(--purple);font-size:11px}
.active-card .elapsed{color:var(--yellow);font-size:12px;font-variant-numeric:tabular-nums}
.active-card .prompt-preview{color:var(--muted);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.btn-cancel{background:none;border:1px solid var(--border);color:var(--muted);border-radius:4px;padding:4px 10px;cursor:pointer;font-family:inherit;font-size:11px;flex-shrink:0}
.btn-cancel:hover{border-color:var(--red);color:var(--red)}
.btn-apply{background:var(--surface2);border:1px solid var(--border);color:var(--text);border-radius:4px;padding:4px 10px;cursor:pointer;font-family:inherit;font-size:11px;white-space:nowrap}
.btn-apply:hover{border-color:var(--green);color:var(--green)}
.btn-apply[disabled]{cursor:not-allowed;opacity:.45}
.table-scroll{overflow-x:auto}
table{width:100%;border-collapse:collapse;min-width:700px}
thead th{text-align:left;padding:8px 10px;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.8px;border-bottom:1px solid var(--border);font-weight:400;white-space:nowrap}
tbody tr.job-row{cursor:pointer}
tbody tr.job-row:hover td{background:var(--surface)}
tbody tr.job-row td{padding:9px 10px;border-bottom:1px solid var(--border);white-space:nowrap;vertical-align:top}
tbody tr.job-row td.prompt-cell{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:300px}
tr.expanded-row td{background:var(--surface);border-bottom:1px solid var(--border)}
.expand-content{padding:12px 4px 8px}
.expand-meta{display:flex;gap:24px;margin-bottom:12px;flex-wrap:wrap}
.expand-meta span{color:var(--muted);font-size:12px;word-break:break-word;overflow-wrap:break-word}
.expand-meta span b{color:var(--text)}
.events-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
.events-header span{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.05em}
.copy-logs-btn{background:none;border:1px solid var(--border);color:var(--muted);cursor:pointer;padding:2px 8px;border-radius:3px;font-size:11px;transition:color .1s,border-color .1s}
.copy-logs-btn:hover{color:var(--blue);border-color:var(--blue)}
.copy-logs-btn.copied{color:var(--green);border-color:var(--green)}
.events-box{background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:8px 12px;max-height:360px;overflow:auto;font-size:12px;line-height:1.5}
.ev-row{display:flex;gap:8px;padding:2px 0;align-items:baseline;min-width:0}
.ev-timestamp{color:var(--muted);font-size:10px;flex-shrink:0;font-variant-numeric:tabular-nums;opacity:.6;min-width:56px}
.ev-badge{font-size:10px;padding:0 5px;border-radius:3px;flex-shrink:0;font-weight:600;text-transform:uppercase;letter-spacing:.2px;line-height:1.8;min-width:46px;text-align:center}
.ev-badge.ev-status{background:rgba(88,166,255,.15);color:var(--blue)}
.ev-badge.ev-info{background:rgba(125,133,144,.12);color:var(--muted)}
.ev-badge.ev-stdout{background:rgba(230,237,243,.06);color:var(--muted)}
.ev-badge.ev-stderr{background:rgba(240,136,62,.15);color:var(--orange)}
.ev-badge.ev-error{background:rgba(248,81,73,.15);color:var(--red)}
.ev-content{white-space:pre-wrap;word-break:break-word;flex:1;min-width:0}
.ev-content.ev-status{color:var(--blue)}
.ev-content.ev-info{color:var(--muted)}
.ev-content.ev-stdout{color:var(--text)}
.ev-content.ev-stderr{color:var(--orange)}
.ev-content.ev-error{color:var(--red)}
.status-icon{font-size:13px}
.status-icon.succeeded{color:var(--green)}
.status-icon.failed{color:var(--red)}
.status-icon.cancelled{color:var(--muted)}
.status-icon.queued{color:var(--muted)}
.status-icon.preparing,.status-icon.running{color:var(--blue)}
.tag{background:var(--surface2);border:1px solid var(--border);border-radius:3px;padding:1px 6px;font-size:11px}
.model-text{color:var(--purple)}
.duration-text{color:var(--muted);font-variant-numeric:tabular-nums}
.age-text{color:var(--muted)}
.chevron{color:var(--muted);transition:transform .15s;display:inline-block}
.chevron.open{transform:rotate(90deg)}
.id-cell{display:flex;align-items:center;gap:5px;font-size:11px;color:var(--muted)}
.copy-btn{background:none;border:none;color:var(--muted);cursor:pointer;padding:2px 4px;border-radius:3px;font-size:16px;opacity:0;transition:opacity .1s}
.thinking-badge{color:var(--orange);font-size:11px;font-weight:500}
.id-cell:hover .copy-btn{opacity:1}
.copy-btn:hover{color:var(--blue);background:var(--surface2)}
.copy-btn.copied{color:var(--green);opacity:1}
.empty{color:var(--muted);padding:32px 0;text-align:center;font-size:13px}
#error-banner{background:#2d1a1a;border:1px solid var(--red);color:var(--red);padding:10px 24px;font-size:12px;display:none}
.id-container{position:relative;display:inline-block;padding-right:24px}
.copy-btn{position:absolute;right:0;top:50%;transform:translateY(-50%);background:var(--surface2);border:1px solid var(--border);color:var(--muted);border-radius:3px;padding:2px 6px;cursor:pointer;font-family:inherit;font-size:11px;opacity:0;transition:opacity .15s}
.id-container:hover .copy-btn{opacity:1}
.copy-btn:hover{border-color:var(--blue);color:var(--blue)}
.copy-btn:active{background:var(--blue);color:var(--bg)}
</style>
</head>
<body>
<div id="error-banner"></div>
<header>
  <div class="logo">◆ <span>Sand</span>pilot</div>
  <div class="header-right">
    <span><span class="dot" id="status-dot"></span><span id="status-text">connecting…</span></span>
    <button class="refresh" onclick="refresh()">↺ refresh</button>
  </div>
</header>
<div class="stats" id="stats"></div>
<div id="main"></div>

<script>
const token = new URLSearchParams(location.search).get('token') || '';
let jobs = [];
let expandedId = null;
let eventsCache = {};
let lastUpdated = null;
let tickHandle = null;

async function api(path) {
  const r = await fetch(path, { headers: { authorization: 'Bearer ' + token } });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function refresh() {
  try {
    const data = await api('/v1/jobs');
    jobs = data.jobs;
    lastUpdated = Date.now();
    if (expandedId) {
      const ev = await api('/v1/jobs/' + expandedId + '/events');
      eventsCache[expandedId] = ev.events;
    }
    showError(null);
    setStatus(true);
  } catch (e) {
    showError(e.message);
    setStatus(false);
  }
  render();
}

function setStatus(ok) {
  document.getElementById('status-dot').className = 'dot' + (ok ? '' : ' offline');
  document.getElementById('status-text').textContent = ok
    ? 'updated ' + relTime(lastUpdated)
    : 'unreachable';
}

function showError(msg) {
  const el = document.getElementById('error-banner');
  if (msg) { el.textContent = '⚠ ' + msg; el.style.display = 'block'; }
  else el.style.display = 'none';
}

function render() {
  renderStats();
  renderMain();
}

function renderStats() {
  const total = jobs.length;
  const succeeded = jobs.filter(j => j.status === 'succeeded').length;
  const failed = jobs.filter(j => j.status === 'failed').length;
  const active = jobs.filter(j => j.status === 'running' || j.status === 'preparing' || j.status === 'queued').length;
  const finished = jobs.filter(j => j.finishedAt && j.startedAt);
  const avgMs = finished.length
    ? finished.reduce((s, j) => s + (new Date(j.finishedAt) - new Date(j.startedAt)), 0) / finished.length
    : 0;
  const rate = (succeeded + failed) > 0 ? Math.round(succeeded / (succeeded + failed) * 100) : null;

  const models = {};
  for (const j of jobs) { models[modelLabel(j.model, null)] = (models[modelLabel(j.model, null)] || 0) + 1; }
  const topModel = Object.entries(models).sort((a,b) => b[1]-a[1])[0];

  document.getElementById('stats').innerHTML =
    stat(total, 'total jobs', '') +
    stat(rate !== null ? rate + '%' : '—', 'success rate', rate !== null ? (rate >= 80 ? 'green' : rate >= 50 ? 'yellow' : 'red') : '') +
    stat(active || '0', 'active now', active > 0 ? 'blue' : '') +
    stat(avgMs ? fmtDuration(avgMs) : '—', 'avg duration', '') +
    stat(topModel ? topModel[0] : '—', 'top model', 'purple');
}

function stat(val, label, cls) {
  return '<div class="stat"><div class="stat-val ' + cls + '">' + val + '</div><div class="stat-label">' + label + '</div></div>';
}

function renderMain() {
  const active = jobs.filter(j => ['queued','preparing','running'].includes(j.status));
  const history = jobs.filter(j => !['queued','preparing','running'].includes(j.status));

  let html = '<section>';
  if (active.length > 0) {
    html += '<div class="section-title">active</div><div class="active-grid">';
    for (const j of active) html += activeCard(j);
    html += '</div>';
  }

  html += '<div class="section-title">history</div>';
  if (history.length === 0) {
    html += '<div class="empty">no completed jobs yet</div>';
  } else {
    html += '<div class="table-scroll"><table><thead><tr>';
    html += '<th></th><th>job</th><th>repo</th><th>model</th><th>prompt</th><th>result</th><th>duration</th><th>finished</th><th></th>';
    html += '</tr></thead><tbody>';
    for (const j of history) html += jobRow(j);
    html += '</tbody></table></div>';
  }
  html += '</section>';

  document.getElementById('main').innerHTML = html;
  attachListeners();
}

function activeCard(j) {
  const elapsed = j.startedAt ? Date.now() - new Date(j.startedAt) : 0;
  return '<div class="active-card">' +
    '<span class="spinner">⟳</span>' +
    '<div class="job-main">' +
      '<div class="job-row1">' +
        '<span class="id-cell job-id">' + j.id.slice(0,18) + copyBtn(j.id) + '</span>' +
        '<span class="repo tag">' + esc(j.repoName) + '</span>' +
        '<span class="model-badge">' + modelLabel(j.model, j.thinking) + '</span>' +
        '<span class="elapsed" data-start="' + (j.startedAt||'') + '">' + fmtDuration(elapsed) + '</span>' +
      '</div>' +
      '<div class="prompt-preview">' + esc(j.prompt) + '</div>' +
    '</div>' +
    '<button class="btn-cancel" data-cancel="' + j.id + '">cancel</button>' +
  '</div>';
}

function jobRow(j) {
  const isExpanded = expandedId === j.id;
  const dur = j.finishedAt && j.startedAt
    ? fmtDuration(new Date(j.finishedAt) - new Date(j.startedAt))
    : '—';
  const rows = '<tr class="job-row" data-id="' + j.id + '">' +
    '<td><span class="status-icon ' + j.status + '">' + statusIcon(j.status) + '</span></td>' +
    '<td><div class="id-cell" onclick="event.stopPropagation()">' + j.id.slice(0,16) + copyBtn(j.id) + '</div></td>' +
    '<td><span class="tag">' + esc(j.repoName) + '</span></td>' +
    '<td class="model-text">' + modelLabel(j.model, j.thinking) + '</td>' +
    '<td class="prompt-cell">' + esc(j.prompt) + '</td>' +
    '<td>' + resultCell(j) + '</td>' +
    '<td class="duration-text">' + dur + '</td>' +
    '<td class="age-text">' + (j.finishedAt ? relTime(new Date(j.finishedAt)) : '—') + '</td>' +
    '<td><span class="chevron' + (isExpanded ? ' open' : '') + '">›</span></td>' +
  '</tr>';

  if (!isExpanded) return rows;

  const events = eventsCache[j.id] || [];
  const evHtml = events.length
    ? events.map(e => renderEvent(e)).join('')
    : '<div style="color:var(--muted)">no events</div>';

  return rows + '<tr class="expanded-row"><td colspan="9"><div class="expand-content">' +
    '<div class="expand-meta">' +
      '<span><b>prompt:</b> ' + esc(j.prompt) + '</span>' +
      (j.sessionId ? '<span><b>session:</b> ' + j.sessionId + '</span>' : '') +
      '<span><b>source branch:</b> ' + esc(j.sourceBranch) + '</span>' +
      (j.resultBranch ? '<span><b>result branch:</b> ' + esc(j.resultBranch) + '</span>' : '') +
      (j.resultAppliedAt ? '<span><b>applied:</b> ' + esc(j.resultAppliedAt) + '</span>' : '') +
      (j.resultError ? '<span style="color:var(--red)"><b>error:</b> ' + esc(j.resultError) + '</span>' : '') +
      (j.clientCwd ? '<span><b>cwd:</b> ' + esc(j.clientCwd) + '</span>' : '') +
      (j.warning ? '<span style="color:var(--yellow)"><b>⚠</b> ' + esc(j.warning) + '</span>' : '') +
    '</div>' +
    '<div class="events-header"><span>logs</span><button class="copy-logs-btn" data-copy-logs="' + j.id + '">⎘ copy</button></div>' +
    '<div class="events-box" id="events-box-' + j.id + '">' + evHtml + '</div>' +
  '</div></td></tr>';
}

function resultCell(j) {
  if (j.resultBranch) return '<span class="tag">' + esc(j.resultBranch) + '</span>';
  if (j.resultAppliedAt) return '<span class="tag">applied</span>';
  if (j.status === 'succeeded') {
    const disabled = j.clientCwd ? '' : ' disabled title="no checkout path recorded"';
    return '<button class="btn-apply" data-apply="' + j.id + '"' + disabled + '>apply</button>';
  }
  return '<span class="age-text">—</span>';
}

function attachListeners() {
  for (const btn of document.querySelectorAll('[data-copy]')) {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const id = btn.dataset.copy;
      await navigator.clipboard.writeText(id);
      btn.textContent = '✓';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = '⎘'; btn.classList.remove('copied'); }, 1500);
    });
  }
  for (const btn of document.querySelectorAll('[data-copy-logs]')) {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const id = btn.dataset.copyLogs;
      const events = eventsCache[id] || [];
      const text = events.map(ev => '[' + ev.type + '] ' + ev.payload).join('\n');
      await navigator.clipboard.writeText(text);
      btn.textContent = '✓ copied';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = '⎘ copy'; btn.classList.remove('copied'); }, 1500);
    });
  }
  for (const btn of document.querySelectorAll('[data-cancel]')) {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const id = btn.dataset.cancel;
      try {
        await fetch('/v1/jobs/' + id + '/cancel', {
          method: 'POST', body: '{}',
          headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }
        });
        await refresh();
      } catch(err) { showError(err.message); }
    });
  }
  for (const btn of document.querySelectorAll('[data-apply]')) {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const id = btn.dataset.apply;
      btn.disabled = true;
      btn.textContent = 'applying...';
      try {
        const r = await fetch('/v1/jobs/' + id + '/apply', {
          method: 'POST', body: '{}',
          headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }
        });
        if (!r.ok) throw new Error(await r.text());
        await refresh();
      } catch(err) {
        showError(err.message);
        btn.disabled = false;
        btn.textContent = 'apply';
      }
    });
  }
  for (const btn of document.querySelectorAll('[data-copy]')) {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const id = btn.dataset.copy;
      try {
        await navigator.clipboard.writeText(id);
        const originalText = btn.textContent;
        btn.textContent = '✓';
        setTimeout(() => { btn.textContent = originalText; }, 1000);
      } catch(err) {
        console.error('Failed to copy:', err);
      }
    });
  }
  for (const row of document.querySelectorAll('tr.job-row')) {
    row.addEventListener('click', async () => {
      const id = row.dataset.id;
      if (expandedId === id) {
        expandedId = null;
      } else {
        expandedId = id;
        try {
          const ev = await api('/v1/jobs/' + id + '/events');
          eventsCache[id] = ev.events;
        } catch(e) { showError(e.message); }
      }
      render();
    });
  }
}

function statusIcon(s) {
  return { succeeded:'✓', failed:'✗', cancelled:'⊘', queued:'·', preparing:'·', running:'⟳' }[s] || '?';
}

function modelLabel(m, thinking) {
  if (!m) return '—';
  let label;
  const claudeMatch = m.match(/^claude-(opus|sonnet|haiku)-(\d+)-(\d+)/);
  if (claudeMatch) {
    label = claudeMatch[1] + ' ' + claudeMatch[2] + '.' + claudeMatch[3];
  } else {
    label = m;
  }
  if (thinking) label += ' · <span class="thinking-badge">' + thinking + '</span>';
  return label;
}

function copyBtn(id) {
  return '<button class="copy-btn" data-copy="' + id + '" title="copy id">⎘</button>';
}

function fmtDuration(ms) {
  if (!ms) return '0s';
  const s = Math.floor(ms / 1000);
  if (s < 60) return s + 's';
  return Math.floor(s / 60) + 'm ' + (s % 60) + 's';
}

function relTime(ts) {
  const diff = Date.now() - new Date(ts);
  const s = Math.floor(diff / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s/60) + 'm ago';
  if (s < 86400) return Math.floor(s/3600) + 'h ago';
  return Math.floor(s/86400) + 'd ago';
}

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function renderEvent(e) {
  const ts = e.createdAt ? '<span class="ev-timestamp">' + fmtTime(e.createdAt) + '</span>' : '';
  return '<div class="ev-row">' +
    ts +
    '<span class="ev-badge ev-' + e.type + '">' + e.type + '</span>' +
    '<span class="ev-content ev-' + e.type + '">' + esc(e.payload) + '</span>' +
  '</div>';
}

function fmtTime(iso) {
  const d = new Date(iso);
  return d.toTimeString().slice(0, 8);
}

// tick every second to update elapsed timers and relative times
function tick() {
  if (lastUpdated) {
    setStatus(jobs.length >= 0);
    for (const el of document.querySelectorAll('[data-start]')) {
      const start = el.dataset.start;
      if (start) el.textContent = fmtDuration(Date.now() - new Date(start));
    }
  }
}

refresh();
setInterval(refresh, 5000);
setInterval(tick, 1000);
</script>
</body>
</html>`;
}
