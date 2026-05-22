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
.stats{display:grid;grid-template-columns:repeat(5,1fr);gap:1px;background:var(--border);border-bottom:1px solid var(--border)}
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
table{width:100%;border-collapse:collapse}
thead th{text-align:left;padding:8px 10px;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.8px;border-bottom:1px solid var(--border);font-weight:400}
tbody tr.job-row{cursor:pointer}
tbody tr.job-row:hover td{background:var(--surface)}
tbody tr.job-row td{padding:9px 10px;border-bottom:1px solid var(--border);white-space:nowrap;vertical-align:top}
tbody tr.job-row td.prompt-cell{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px}
tr.expanded-row td{background:var(--surface);border-bottom:1px solid var(--border)}
.expand-content{padding:12px 4px 8px}
.expand-meta{display:flex;gap:24px;margin-bottom:12px;flex-wrap:wrap}
.expand-meta span{color:var(--muted);font-size:12px}
.expand-meta span b{color:var(--text)}
.events-box{background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:10px 12px;max-height:260px;overflow-y:auto;font-size:12px;line-height:1.6}
.ev-status{color:var(--blue)}
.ev-info{color:var(--muted)}
.ev-stdout{color:var(--text)}
.ev-stderr{color:var(--yellow)}
.ev-error{color:var(--red)}
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
.empty{color:var(--muted);padding:32px 0;text-align:center;font-size:13px}
#error-banner{background:#2d1a1a;border:1px solid var(--red);color:var(--red);padding:10px 24px;font-size:12px;display:none}
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
  for (const j of jobs) { models[shortModel(j.model)] = (models[shortModel(j.model)] || 0) + 1; }
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
    html += '<table><thead><tr>';
    html += '<th></th><th>job</th><th>repo</th><th>model</th><th>prompt</th><th>duration</th><th>finished</th><th></th>';
    html += '</tr></thead><tbody>';
    for (const j of history) html += jobRow(j);
    html += '</tbody></table>';
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
        '<span class="job-id">' + j.id.slice(0,18) + '</span>' +
        '<span class="repo tag">' + esc(j.repoName) + '</span>' +
        '<span class="model-badge">' + shortModel(j.model) + '</span>' +
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
    '<td style="font-size:11px;color:var(--muted)">' + j.id.slice(0,16) + '</td>' +
    '<td><span class="tag">' + esc(j.repoName) + '</span></td>' +
    '<td class="model-text">' + shortModel(j.model) + '</td>' +
    '<td class="prompt-cell">' + esc(j.prompt) + '</td>' +
    '<td class="duration-text">' + dur + '</td>' +
    '<td class="age-text">' + (j.finishedAt ? relTime(new Date(j.finishedAt)) : '—') + '</td>' +
    '<td><span class="chevron' + (isExpanded ? ' open' : '') + '">›</span></td>' +
  '</tr>';

  if (!isExpanded) return rows;

  const events = eventsCache[j.id] || [];
  const evHtml = events.length
    ? events.map(e => '<div class="ev-' + e.type + '">[' + e.type + '] ' + esc(e.payload) + '</div>').join('')
    : '<div style="color:var(--muted)">no events</div>';

  return rows + '<tr class="expanded-row"><td colspan="8"><div class="expand-content">' +
    '<div class="expand-meta">' +
      '<span><b>prompt:</b> ' + esc(j.prompt) + '</span>' +
      (j.sessionId ? '<span><b>session:</b> ' + j.sessionId + '</span>' : '') +
      (j.clientCwd ? '<span><b>cwd:</b> ' + esc(j.clientCwd) + '</span>' : '') +
      (j.warning ? '<span style="color:var(--yellow)"><b>⚠</b> ' + esc(j.warning) + '</span>' : '') +
    '</div>' +
    '<div class="events-box">' + evHtml + '</div>' +
  '</div></td></tr>';
}

function attachListeners() {
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

function shortModel(m) {
  if (!m) return '—';
  if (m.includes('opus')) return 'opus';
  if (m.includes('sonnet')) return 'sonnet';
  if (m.includes('haiku')) return 'haiku';
  if (m.startsWith('codex') || m.startsWith('o')) return 'codex';
  return m.slice(0, 10);
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
