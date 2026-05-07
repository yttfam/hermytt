// @ts-nocheck
export {};
// hermytt /admin — TypeScript port of admin.html's inline script.
//
// MIGRATION NOTE: this file is @ts-nocheck for now. The original JS was
// ~1500 lines of duck-typed DOM access; strictifying it all at once would
// be a day of mechanical fixes for marginal value. The structural migration
// ships today (single TS source, esbuild bundle, source organization).
// Strict types follow progressively as we touch sections — pull functions
// into a typed island, add real shapes, remove this directive once the
// whole file is clean.

// Auth: redirect to login if no token.
// Auth state: prefer cookie session (set by /auth/login). Legacy bearer token still accepted.
let TOKEN = sessionStorage.getItem('hermytt-token') || '';
let CURRENT_USER = null;
function authHeaders() { const h = {'Content-Type':'application/json'}; if (TOKEN) h['X-Hermytt-Key'] = TOKEN; return h; }
async function logout() {
  try { await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' }); } catch(e) {}
  sessionStorage.removeItem('hermytt-token');
  location.href = '/login';
}
(async () => {
  try {
    const r = await fetch('/auth/me', { credentials: 'same-origin' });
    if (r.ok) {
      const d = await r.json();
      if (d.username) {
        CURRENT_USER = d.username;
        const slot = document.getElementById('whoami');
        if (slot) slot.textContent = d.username;
        return;
      }
    }
  } catch(e) {}
  // Cookie path failed — fall back to legacy bearer-token check.
  if (TOKEN) {
    try {
      const r2 = await fetch('/info', { headers: { 'X-Hermytt-Key': TOKEN } });
      if (r2.ok) return;
    } catch(e) {}
  }
  location.href = '/login?next=' + encodeURIComponent(location.pathname);
})();
const esc = s => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };

function banner(msg, cls) {
  const el = document.getElementById('banner-area');
  el.textContent = msg; el.className = 'banner ' + cls;
}

function relTime(ts) {
  if (!ts) return '-';
  const secs = Math.floor((Date.now() / 1000) - ts);
  if (secs < 5) return 'now';
  if (secs < 60) return secs + 's ago';
  if (secs < 3600) return Math.floor(secs/60) + 'm ago';
  return Math.floor(secs/3600) + 'h ago';
}

// --- Family / Registry ---
async function refreshFamily() {
  try {
    const res = await fetch('/registry', { headers: authHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    const services = data.services || [];
    document.getElementById('s-services').textContent = services.filter(s => s.status === 'connected').length;
    document.getElementById('svc-count').textContent = services.length ? ` (${services.length})` : '';
    const tbody = document.getElementById('family-table');
    if (!services.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-row">no family members connected</td></tr>';
      return;
    }
    tbody.innerHTML = services.map(s => {
      const on = s.status === 'connected';
      const dotCls = on ? 'dot-on' : 'dot-off';
      const role = (s.role || 'shell').toLowerCase();
      const configurable = on && s.endpoint.startsWith('http');
      const rowCls = configurable ? 'svc-configurable' : '';
      const click = configurable ? `onclick="openServicePanel('${esc(s.name)}')"` : '';
      return `<tr class="${rowCls}" ${click}>
        <td><span class="dot ${dotCls}"></span></td>
        <td>${esc(s.name)}${configurable?' \u2699':''}</td>
        <td><span class="role role-${role}">${esc(role)}</span></td>
        <td style="color:var(--text-dim)">${esc(s.meta?.host || s.name)}</td>
        <td><span class="meta-tag">${esc(s.endpoint === 'control-ws' ? 'mode 1' : s.endpoint === 'paired' ? 'mode 2' : s.endpoint || '-')}</span></td>
        <td style="color:var(--text-muted)">${relTime(s.last_seen)}</td>
      </tr>`;
    }).join('');
  } catch(e) {}
}

// --- Sessions ---
async function refreshSessions() {
  const res = await fetch('/sessions', { headers: authHeaders() });
  if (!res.ok) return;
  const data = await res.json();
  document.getElementById('s-sessions').textContent = data.sessions.length;
  const tbody = document.getElementById('sessions-table');
  tbody.innerHTML = data.sessions.map(s => `
    <tr>
      <td><span class="dot dot-on"></span></td>
      <td><span class="session-name" ondblclick="renameSession('${esc(s.id)}',this)" title="double-click to rename">${esc(s.name || s.id)}</span>${s.host ? ' <span class="meta-tag">' + esc(s.host) + '</span>' : ''}</td>
      <td style="text-align:right;display:flex;gap:4px;justify-content:flex-end">
        <a href="/#${encodeURIComponent(s.id)}" class="btn">open</a>
        <button class="btn btn-red" onclick="killSession('${esc(s.id)}')">kill</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="3" class="empty-row">no sessions</td></tr>';
}

document.getElementById('btn-add-host').addEventListener('click', () => {
  document.getElementById('modal-title').textContent = 'Pair Host';
  document.getElementById('modal-fields').innerHTML = `
    <div class="field">
      <label>pairing token</label>
      <input type="text" id="pair-token" placeholder="paste token from shytti pair" spellcheck="false" autocomplete="off">
      <div class="hint">run "shytti pair" on the target machine, paste the token here</div>
    </div>
  `;
  document.getElementById('modal-bg').classList.add('active');
  document.getElementById('modal-save').onclick = async () => {
    const token = document.getElementById('pair-token').value.trim();
    if (!token) return;
    closeModal();
    banner('pairing...', 'warn');
    const res = await fetch('/hosts/pair', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ token }) });
    const data = await res.json();
    if (!res.ok) { banner(data.error || 'pairing failed', 'err'); return; }
    banner('paired with ' + data.name, 'ok');
    setTimeout(() => document.getElementById('banner-area').className = 'banner', 3000);
    refreshAll();
  };
});

async function killSession(id) {
  if (!confirm('Kill session ' + id.slice(0,8) + '?')) return;
  await fetch('/internal/session/' + encodeURIComponent(id), { method: 'DELETE', headers: authHeaders() });
  refreshSessions();
}

document.getElementById('btn-kill-all').addEventListener('click', async () => {
  const r = await fetch('/sessions', { headers: authHeaders() });
  if (!r.ok) return banner('failed to list sessions', 'err');
  const data = await r.json();
  const ids = (data.sessions || []).map(s => s.id);
  if (!ids.length) return banner('no sessions', 'warn');
  if (!confirm(`Kill all ${ids.length} sessions? This is irreversible.`)) return;
  banner(`killing ${ids.length}…`, 'warn');
  let killed = 0, failed = 0;
  await Promise.all(ids.map(async id => {
    const r = await fetch('/internal/session/' + encodeURIComponent(id), { method: 'DELETE', headers: authHeaders() });
    if (r.ok) killed++; else failed++;
  }));
  banner(`killed ${killed}${failed ? `, ${failed} failed` : ''}`, failed ? 'warn' : 'ok');
  setTimeout(() => document.getElementById('banner-area').className = 'banner', 4000);
  refreshSessions();
});

function renameSession(id, el) {
  const current = el.textContent;
  const input = document.createElement('input');
  input.type = 'text';
  input.value = current;
  input.style.cssText = 'font-size:12px;background:var(--bg);border:1px solid var(--accent);color:var(--text);padding:1px 4px;font-family:var(--font);width:180px;border-radius:3px';
  el.replaceWith(input);
  input.focus();
  input.select();
  const save = async () => {
    const name = input.value.trim();
    if (name && name !== current) {
      await fetch('/session/' + encodeURIComponent(id) + '/name', {
        method: 'PUT', headers: authHeaders(), body: JSON.stringify({ name })
      });
    }
    refreshSessions();
  };
  input.addEventListener('blur', save);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { input.value = current; input.blur(); }
  });
}

// --- Info ---
async function refreshInfo() {
  try {
    const res = await fetch('/info', { headers: authHeaders() });
    if (!res.ok) { document.getElementById('s-status').textContent = 'error'; return; }
    const data = await res.json();
    document.getElementById('s-status').textContent = 'online';
    document.getElementById('s-shell').textContent = data.shell?.split('/').pop() || '-';
  } catch(e) { document.getElementById('s-status').textContent = 'offline'; }
}

document.getElementById('btn-new-session').addEventListener('click', async () => {
  // Check for connected shytti hosts.
  let hosts = [];
  try {
    const res = await fetch('/hosts', { headers: authHeaders() });
    if (res.ok) { const data = await res.json(); hosts = data.hosts || []; }
  } catch(e) {}

  if (hosts.length === 0) {
    banner('no hosts connected — deploy shytti first', 'err');
    return;
  }

  // Show host picker (or spawn directly if only one host).
  if (hosts.length === 1) {
    const url = '/hosts/' + encodeURIComponent(hosts[0].name) + '/spawn';
    const res = await fetch(url, { method: 'POST', headers: authHeaders(), body: JSON.stringify({}) });
    const data = await res.json();
    if (!res.ok) { banner(data.error || 'spawn failed', 'err'); }
    refreshSessions();
    return;
  }

  const modal = document.getElementById('modal-fields');
  document.getElementById('modal-title').textContent = 'New Session';
  modal.innerHTML = `
    <div class="field"><label>host</label>
    <select id="host-select" style="width:100%;background:var(--bg);border:1px solid var(--border);color:var(--text);padding:6px 8px;font-family:var(--font);font-size:11px;border-radius:3px">
      ${hosts.map(h => `<option value="${esc(h.name)}">${esc(h.name)}${h.meta?.host ? ' (' + esc(h.meta.host) + ')' : ''}</option>`).join('')}
    </select></div>
  `;
  document.getElementById('modal-bg').classList.add('active');
  document.getElementById('modal-save').onclick = async () => {
    const host = document.getElementById('host-select').value;
    closeModal();
    const url = '/hosts/' + encodeURIComponent(host) + '/spawn';
    const res = await fetch(url, { method: 'POST', headers: authHeaders(), body: JSON.stringify({}) });
    const data = await res.json();
    if (!res.ok) { banner(data.error || 'spawn failed', 'err'); }
    refreshSessions();
  };
});

// --- Exec ---
document.getElementById('btn-exec').addEventListener('click', runExec);
document.getElementById('exec-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') runExec(); });
async function runExec() {
  const input = document.getElementById('exec-input');
  const output = document.getElementById('exec-out');
  const cmd = input.value.trim(); if (!cmd) return;
  output.style.display = 'block'; output.textContent = '...';
  const res = await fetch('/exec', { method:'POST', headers:authHeaders(), body:JSON.stringify({input:cmd}) });
  if (!res.ok) { output.textContent = `err ${res.status}`; return; }
  const data = await res.json();
  let text = data.stdout || '';
  if (data.stderr) text += (text ? '\n' : '') + data.stderr;
  if (data.exit_code !== 0) text += `\n[exit ${data.exit_code}]`;
  output.textContent = text || '(empty)';
  input.value = '';
}

// --- Transports ---
let config = null, dirty = false;

const TRANSPORT_DEFS = {
  rest: { label:'REST + WS', fields:[{key:'port',label:'Port',type:'number',required:true,default:7777}] },
  mqtt: { label:'MQTT', fields:[
    {key:'broker',label:'Broker',type:'text',required:true,placeholder:'mqtt.example.com'},
    {key:'port',label:'Port',type:'number',default:1883},
    {key:'username',label:'User',type:'text'},
    {key:'password',label:'Pass',type:'password'},
  ]},
  mqtt_pty: { label:'MQTT PTY', fields:[
    {key:'buffer_ms',label:'Buffer (ms)',type:'number',default:200,hint:'output batching window — 0 for raw passthrough'},
  ], requires:'mqtt' },
  tcp: { label:'TCP', fields:[{key:'port',label:'Port',type:'number',required:true,default:7779}] },
};

async function loadConfig() {
  try {
    const res = await fetch('/config', { headers: authHeaders() });
    if (res.status === 404) { config = {}; return; }
    if (!res.ok) return;
    config = await res.json();
  } catch(e) { config = {}; }
  renderTransports();
}

function isEnabled(n) { return config?.transport?.[n] != null; }
function getTC(n) { return config?.transport?.[n] || {}; }

function renderTransports() {
  const tbody = document.getElementById('transports-table');
  tbody.innerHTML = Object.entries(TRANSPORT_DEFS).map(([name, def]) => {
    const on = isEnabled(name); const cfg = getTC(name);
    let ep = '-';
    if (on) {
      if (name==='mqtt_pty') { const mc=getTC('mqtt'); ep=mc.broker?mc.broker+':'+(mc.port||1883):'(via mqtt)'; }
      else if (cfg.port) ep=':'+cfg.port; else if (cfg.broker) ep=cfg.broker+':'+(cfg.port||1883);
    }
    return `<tr>
      <td><label class="toggle"><input type="checkbox" data-t="${esc(name)}" ${on?'checked':''}><span class="sl"></span></label></td>
      <td><span class="dot ${on?'dot-on':'dot-off'}"></span>${esc(def.label)}</td>
      <td style="color:var(--text-dim)">${esc(ep)}</td>
      <td style="text-align:right"><button class="btn" data-edit="${esc(name)}" ${!on?'disabled style="opacity:0.2"':''}>edit</button></td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('input[type=checkbox]').forEach(cb => {
    cb.addEventListener('change', () => {
      const n = cb.dataset.t;
      const def = TRANSPORT_DEFS[n];
      if (!config.transport) config.transport = {};
      if (cb.checked) {
        if (def.requires && !isEnabled(def.requires)) { cb.checked = false; banner(def.label + ' requires ' + TRANSPORT_DEFS[def.requires].label, 'err'); setTimeout(()=>document.getElementById('banner-area').className='banner',3000); return; }
        const d={}; def.fields.forEach(f=>{if(f.default!=null)d[f.key]=f.default}); config.transport[n]=d;
      } else {
        delete config.transport[n];
        // Disable dependents.
        Object.entries(TRANSPORT_DEFS).forEach(([dn,dd])=>{ if(dd.requires===n && isEnabled(dn)) delete config.transport[dn]; });
      }
      dirty = true; renderTransports(); saveConfig();
    });
  });
  tbody.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => openEditModal(b.dataset.edit)));
  const saveBtn = document.getElementById('btn-save-transports');
  saveBtn.style.opacity = dirty ? 1 : 0.3;
  saveBtn.style.pointerEvents = dirty ? 'auto' : 'none';
  if (dirty) { saveBtn.textContent = '● Save changes'; saveBtn.style.background = 'var(--accent)'; saveBtn.style.color = '#000'; }
  else { saveBtn.textContent = 'Save'; saveBtn.style.background = ''; saveBtn.style.color = ''; }
}

function openEditModal(name) {
  const def = TRANSPORT_DEFS[name]; const cfg = getTC(name);
  document.getElementById('modal-title').textContent = def.label;
  const fields = document.getElementById('modal-fields');
  fields.innerHTML = def.fields.map(f => {
    let v = cfg[f.key] ?? '';
    if (f.key==='chat_ids' && Array.isArray(v)) v = v.join(', ');
    return `<div class="field"><label>${esc(f.label)}${f.required?' *':''}</label><input type="${f.type||'text'}" data-key="${esc(f.key)}" value="${esc(String(v))}" placeholder="${esc(f.placeholder||'')}">
    ${f.hint?'<div class="hint">'+esc(f.hint)+'</div>':''}</div>`;
  }).join('');
  document.getElementById('modal-bg').classList.add('active');
  document.getElementById('modal-save').onclick = () => {
    const u = {}; let ok = true;
    fields.querySelectorAll('input').forEach(i => {
      const k=i.dataset.key, fd=def.fields.find(f=>f.key===k); let v=i.value.trim();
      i.parentElement.querySelector('.error')?.remove();
      if (fd.required&&!v) { const e=document.createElement('div'); e.className='error'; e.textContent='required'; i.parentElement.appendChild(e); ok=false; return; }
      if (!v) return;
      if (fd.type==='number') { const n=parseInt(v); if(isNaN(n)||n<1||n>65535){const e=document.createElement('div');e.className='error';e.textContent='1-65535';i.parentElement.appendChild(e);ok=false;return;} u[k]=n; }
      else if (k==='chat_ids') u[k]=v.split(',').map(s=>parseInt(s.trim())).filter(n=>!isNaN(n));
      else u[k]=v;
    });
    if (!ok) return;
    if (!config.transport) config.transport = {};
    config.transport[name] = u; dirty = true; closeModal(); renderTransports(); saveConfig();
  };
}
function closeModal() { document.getElementById('modal-bg').classList.remove('active'); document.getElementById('modal-box').classList.remove('wide'); document.getElementById('modal-save').style.display = ''; }
document.getElementById('modal-cancel').addEventListener('click', closeModal);
document.getElementById('modal-bg').addEventListener('click', (e) => { if (e.target.id==='modal-bg') closeModal(); });

async function saveConfig() {
  if (!dirty) return;
  const payload = Object.fromEntries(Object.entries(config).filter(([k]) => k !== 'auth'));
  const res = await fetch('/config', { method:'PUT', headers:authHeaders(), body:JSON.stringify(payload) });
  const data = await res.json();
  if (!res.ok) { banner(data.error||'save failed','err'); return; }
  dirty = false; renderTransports();
  banner('saved — restart to apply','warn');
  document.getElementById('btn-restart').style.display = 'inline-block';
}
document.getElementById('btn-save-transports').addEventListener('click', saveConfig);

document.getElementById('btn-restart').addEventListener('click', async () => {
  if (!confirm('Restart hermytt? Active sessions will terminate.')) return;
  banner('restarting...','warn');
  await fetch('/restart', { method:'POST', headers:authHeaders() });
  document.getElementById('btn-restart').style.display = 'none';
  let n = 0;
  const poll = setInterval(async () => {
    n++;
    try { const r = await fetch('/info',{headers:authHeaders()}); if(r.ok){clearInterval(poll);banner('restarted','ok');setTimeout(()=>document.getElementById('banner-area').className='banner',3000);loadConfig();refreshAll();} }
    catch(e) { if(n>30){clearInterval(poll);banner('server did not come back','err');} }
  }, 1000);
});

window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

// --- Service config panel ---

async function openServicePanel(name) {
  const regRes = await fetch('/registry', { headers: authHeaders() });
  const regData = await regRes.json();
  const svc = (regData.services || []).find(s => s.name === name);
  if (!svc) return banner('service not found', 'err');

  const role = (svc.role || 'unknown').toLowerCase();
  if (role === 'parser') return openParserPanel(name);
  if (role === 'gateway') return openGatewayPanel(name);
  if (role === 'messenger') return openMessengerPanel(name);

  // Generic fallback: raw JSON
  const proxy = `/registry/${encodeURIComponent(name)}/proxy`;
  const [statusRes, configRes] = await Promise.all([
    fetch(`${proxy}/status`, { headers: authHeaders() }).catch(() => null),
    fetch(`${proxy}/config`, { headers: authHeaders() }).catch(() => null),
  ]);
  const status = statusRes?.ok ? await statusRes.json() : {};
  const svcConfig = configRes?.ok ? await configRes.json() : {};
  document.getElementById('modal-title').textContent = name;
  document.getElementById('modal-fields').innerHTML =
    `<div class="field"><label>Status</label><pre style="font-size:11px;color:var(--text-dim);white-space:pre-wrap">${esc(JSON.stringify(status, null, 2))}</pre></div>
     <div class="field"><label>Config</label><pre style="font-size:11px;color:var(--text-dim);white-space:pre-wrap">${esc(JSON.stringify(svcConfig, null, 2))}</pre></div>`;
  document.getElementById('modal-bg').classList.add('active');
  document.getElementById('modal-save').style.display = 'none';
}

async function openParserPanel(name) {
  const proxy = `/registry/${encodeURIComponent(name)}/proxy`;

  // Try multi-session endpoint first, fall back to single-session
  const [gryttiSessionsRes, hermyttSessionsRes, statusRes] = await Promise.all([
    fetch(`${proxy}/sessions`, { headers: authHeaders() }).catch(() => null),
    fetch('/sessions', { headers: authHeaders() }),
    fetch(`${proxy}/status`, { headers: authHeaders() }).catch(() => null),
  ]);

  const hermyttSessions = (await hermyttSessionsRes.json()).sessions || [];
  const status = statusRes?.ok ? await statusRes.json() : {};
  let gryttiSessions = [];
  let multiMode = false;

  if (gryttiSessionsRes?.ok) {
    const data = await gryttiSessionsRes.json();
    gryttiSessions = data.sessions || [];
    multiMode = true;
  } else {
    // Fallback: single-session from /config
    const configRes = await fetch(`${proxy}/config`, { headers: authHeaders() }).catch(() => null);
    const cfg = configRes?.ok ? await configRes.json() : {};
    if (cfg.session_id) {
      gryttiSessions = [{
        session_id: cfg.session_id,
        claude_state: status.claude_state || 'unknown',
        telegram_connected: cfg.telegram_connected || false,
        telegram_chat_id: status.telegram_chat_id || null,
        messages_processed: status.messages_processed || 0,
        debounce_ms: cfg.debounce_ms || 200,
      }];
    }
  }

  document.getElementById('modal-title').textContent = 'grytti — PTY Parser';
  document.getElementById('modal-box').classList.add('wide');
  const fields = document.getElementById('modal-fields');

  let html = '';

  // Global status bar
  html += `<div style="display:flex;gap:16px;margin-bottom:14px;flex-wrap:wrap;font-size:12px;color:var(--text-dim)">`;
  html += `<div>uptime: ${esc(String(status.uptime_secs ? Math.floor(status.uptime_secs/60)+'m' : status.uptime || '-'))}</div>`;
  html += `<div>MQTT: ${esc(status.mqtt_host || '-')}</div>`;
  html += `</div>`;

  // Cross-reference grytti's bindings with hermytt's live sessions to flag zombies.
  // Only apply when we successfully fetched hermytt sessions; an empty fetch shouldn't paint everything red.
  const hermyttIds = new Set(hermyttSessions.map(s => s.id));
  const haveHermyttList = hermyttSessionsRes && hermyttSessionsRes.ok;

  // Sessions table
  if (gryttiSessions.length) {
    html += `<table style="width:100%;font-size:12px;margin-bottom:12px">
      <thead><tr><th></th><th>session</th><th>claude</th><th>telegram</th><th>msgs</th><th></th></tr></thead><tbody>`;
    for (const gs of gryttiSessions) {
      const isZombie = haveHermyttList && !hermyttIds.has(gs.session_id);
      if (isZombie) {
        html += `<tr style="background:rgba(240,96,96,0.06)">
          <td><span style="color:var(--red);font-weight:bold">✗</span></td>
          <td style="color:var(--text-dim);text-decoration:line-through">${esc(gs.session_id.slice(0,12))}</td>
          <td colspan="3" style="color:var(--red);font-size:11px">zombie — session no longer exists on hermytt</td>
          <td style="text-align:right"><button class="btn btn-red" onclick="removeZombieParserSession('${esc(name)}','${esc(gs.session_id)}')">remove</button></td>
        </tr>`;
        continue;
      }
      const cls = String(gs.claude_state || 'unknown').toLowerCase().replace(/[^a-z_]/g,'');
      const tgDot = gs.telegram_connected ? 'dot-on' : 'dot-off';
      const tgLabel = gs.telegram_chat_id ? `chat ${gs.telegram_chat_id}` : 'not connected';
      html += `<tr>
        <td><span class="dot ${gs.telegram_connected?'dot-on':'dot-off'}"></span></td>
        <td>${esc(gs.session_id.slice(0,12))}</td>
        <td><span class="svc-status ${cls}">\u25cf ${esc(cls)}</span></td>
        <td><span class="dot ${tgDot}"></span> ${esc(tgLabel)}</td>
        <td>${gs.messages_processed || 0}</td>
        <td style="text-align:right;display:flex;gap:4px;justify-content:flex-end">
          <button class="btn" onclick="editParserSession('${esc(name)}','${esc(gs.session_id)}')">edit</button>
          ${multiMode ? `<button class="btn btn-red" onclick="deleteParserSession('${esc(name)}','${esc(gs.session_id)}')">rm</button>` : ''}
        </td>
      </tr>`;
    }
    html += `</tbody></table>`;
  } else {
    html += `<div style="color:var(--text-muted);font-size:12px;margin-bottom:12px">no sessions configured</div>`;
  }

  // Add session button
  html += `<div style="border-top:1px solid var(--border);padding-top:12px;margin-top:8px">
    <div style="font-size:11px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Add session</div>
    <div style="display:flex;gap:8px;align-items:end;flex-wrap:wrap">
      <div style="flex:1;min-width:140px"><label style="font-size:10px;color:var(--text-dim)">Session</label><select id="grytti-add-session">
        <option value="">— pick —</option>
        ${hermyttSessions.filter(s => !gryttiSessions.find(g => g.session_id === s.id)).map(s =>
          `<option value="${esc(s.id)}">${esc(s.id)}${s.host ? ' ('+esc(s.host)+')' : ''}</option>`
        ).join('')}
      </select></div>
      <div style="flex:1;min-width:200px"><label style="font-size:10px;color:var(--text-dim)">Telegram bot token <span style="color:var(--text-muted)">(optional — blank = headless)</span></label><input type="text" id="grytti-add-token" placeholder="123456:ABC-DEF..."></div>
      <button class="btn" onclick="addParserSession('${esc(name)}')">add</button>
    </div>
  </div>`;

  // Send stdin
  html += `<div style="border-top:1px solid var(--border);padding-top:12px;margin-top:12px">
    <div style="display:flex;gap:8px;align-items:end">
      <div style="flex:1"><label style="font-size:10px;color:var(--text-dim)">Send to stdin</label>
        <div style="display:flex;gap:4px">
          <select id="grytti-send-session" style="width:140px">
            ${gryttiSessions.map(s => `<option value="${esc(s.session_id)}">${esc(s.session_id.slice(0,12))}</option>`).join('')}
          </select>
          <input type="text" id="grytti-send-text" placeholder="type command..." style="flex:1">
        </div>
      </div>
      <button class="btn" onclick="parserSendStdin('${esc(name)}')">send</button>
    </div>
  </div>`;

  fields.innerHTML = html;
  document.getElementById('modal-bg').classList.add('active');
  document.getElementById('modal-save').style.display = 'none';
}

async function addParserSession(name) {
  const sid = document.getElementById('grytti-add-session').value;
  const token = document.getElementById('grytti-add-token').value.trim();
  if (!sid) return banner('pick a session', 'err');
  // bot token is optional — headless mode if omitted
  const proxy = `/registry/${encodeURIComponent(name)}/proxy`;
  const res = await fetch(`${proxy}/sessions`, {
    method: 'POST', headers: authHeaders(),
    body: JSON.stringify(Object.assign({ session_id: sid, debounce_ms: 200 }, token ? { bot_token: token } : {}))
  });
  if (res.ok) { closeModal(); banner('session added', 'ok'); setTimeout(() => document.getElementById('banner-area').className = 'banner', 3000); openParserPanel(name); }
  else { const d = await res.json().catch(() => ({})); banner(d.error || 'failed', 'err'); }
}

async function editParserSession(name, sessionId) {
  const proxy = `/registry/${encodeURIComponent(name)}/proxy`;
  // Fetch current session config + hermytt sessions in parallel
  const [gryttiRes, hermyttRes] = await Promise.all([
    fetch(`${proxy}/sessions`, { headers: authHeaders() }).catch(() => null),
    fetch('/sessions', { headers: authHeaders() }),
  ]);
  let session = {};
  if (gryttiRes?.ok) {
    const data = await gryttiRes.json();
    session = (data.sessions || []).find(s => s.session_id === sessionId) || {};
  }
  const hermyttSessions = (await hermyttRes.json()).sessions || [];

  document.getElementById('modal-title').textContent = `Edit — ${sessionId.slice(0,12)}`;
  const fields = document.getElementById('modal-fields');
  fields.innerHTML = `
    <div class="field"><label>Session</label><select id="edit-session-id">
      ${hermyttSessions.map(s =>
        `<option value="${esc(s.id)}" ${s.id === sessionId ? 'selected' : ''}>${esc(s.id)}${s.host ? ' ('+esc(s.host)+')' : ''}</option>`
      ).join('')}
    </select></div>
    <div class="field"><label>Telegram bot token</label><input type="text" id="edit-bot-token" value="" placeholder="${session.telegram_connected ? '(token set — leave blank to keep)' : '123456:ABC-DEF...'}"></div>
    <div class="field"><label>Debounce (ms): <span id="edit-debounce-val">${session.debounce_ms || 200}</span></label>
      <input type="range" id="edit-debounce" min="50" max="2000" step="50" value="${session.debounce_ms || 200}" oninput="document.getElementById('edit-debounce-val').textContent=this.value">
    </div>`;

  document.getElementById('modal-bg').classList.add('active');
  document.getElementById('modal-save').style.display = '';
  document.getElementById('modal-save').onclick = async () => {
    const update = {
      session_id: document.getElementById('edit-session-id').value,
      debounce_ms: parseInt(document.getElementById('edit-debounce').value),
    };
    const token = document.getElementById('edit-bot-token').value.trim();
    if (token) update.bot_token = token;
    const r = await fetch(`${proxy}/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'PUT', headers: authHeaders(), body: JSON.stringify(update)
    });
    if (r.ok) { closeModal(); banner('updated', 'ok'); setTimeout(() => document.getElementById('banner-area').className = 'banner', 3000); openParserPanel(name); }
    else if (r.status === 404) { banner('session not found', 'err'); }
    else { const d = await r.json().catch(() => ({})); banner(d.error || 'update failed', 'err'); }
  };
}

async function removeZombieParserSession(name, sessionId) {
  const proxy = `/registry/${encodeURIComponent(name)}/proxy`;
  const res = await fetch(`${proxy}/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE', headers: authHeaders() });
  if (res.ok) {
    banner('zombie removed', 'ok');
    setTimeout(() => document.getElementById('banner-area').className = 'banner', 3000);
    openParserPanel(name);
  } else if (res.status === 404) {
    banner('grytti rejected DELETE — her reconcile loop should clean it up within 30s', 'warn');
    setTimeout(() => document.getElementById('banner-area').className = 'banner', 5000);
  } else {
    const d = await res.json().catch(() => ({}));
    banner(d.error || 'remove failed', 'err');
  }
}

async function deleteParserSession(name, sessionId) {
  if (!confirm(`Remove session ${sessionId.slice(0,12)}? This disconnects the Telegram bot.`)) return;
  const proxy = `/registry/${encodeURIComponent(name)}/proxy`;
  const res = await fetch(`${proxy}/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE', headers: authHeaders() });
  if (res.ok) { banner('removed', 'ok'); setTimeout(() => document.getElementById('banner-area').className = 'banner', 3000); openParserPanel(name); }
  else if (res.status === 404) { banner('session not found', 'err'); }
  else { const d = await res.json().catch(() => ({})); banner(d.error || 'delete failed', 'err'); }
}

// --- Messenger (pyttch-bridge) ---
async function openMessengerPanel(name) {
  const proxy = `/registry/${encodeURIComponent(name)}/proxy`;
  const [botsRes, regRes] = await Promise.all([
    fetch(`${proxy}/bots`, authFetchOpts()).catch(() => null),
    fetch('/registry', authFetchOpts()).catch(() => null),
  ]);
  const bots = botsRes?.ok ? (await botsRes.json()).bots || [] : [];
  const services = regRes?.ok ? (await regRes.json()).services || [] : [];
  const apyttis = services.filter(s => s.role === 'gateway' && s.status === 'connected').map(s => s.name);

  document.getElementById('modal-title').textContent = `${name} — Telegram bridges`;
  document.getElementById('modal-box').classList.add('wide');
  const fields = document.getElementById('modal-fields');

  let html = `<div style="font-size:11px;color:var(--text-dim);margin-bottom:10px">Each binding routes one Telegram chat ↔ one apytti session. Saving any change persists to <code>/etc/pyttch-bridge/config.toml</code> and restarts the daemon.</div>`;

  if (!bots.length) {
    html += `<div style="color:var(--text-muted);font-size:12px;margin-bottom:14px;padding:18px;border:1px dashed var(--border);border-radius:3px;text-align:center">no bots configured yet</div>`;
  } else {
    html += `<table style="width:100%;font-size:12px;margin-bottom:12px"><thead><tr><th></th><th>id</th><th>chat ids</th><th>apytti</th><th>session</th><th></th></tr></thead><tbody>`;
    for (const b of bots) {
      const sid = (b.session_id || '').slice(0, 8) || '<span style="color:var(--text-muted)">new each time</span>';
      const chats = (b.allowed_chat_ids || []).join(', ') || '<span style="color:var(--red)">closed</span>';
      const apyttiOk = apyttis.includes(b.apytti);
      html += `<tr>
        <td><span class="dot ${apyttiOk?'dot-on':'dot-off'}" title="${apyttiOk?'apytti reachable':'apytti not in registry'}"></span></td>
        <td>${esc(b.id)}</td>
        <td style="font-family:var(--font);font-size:11px">${chats}</td>
        <td>${esc(b.apytti)}</td>
        <td style="color:var(--text-dim)">${typeof sid === 'string' ? esc(sid) : sid}</td>
        <td style="text-align:right;display:flex;gap:4px;justify-content:flex-end">
          <button class="btn" onclick='editBridgeBot(${JSON.stringify(name)},${JSON.stringify(b)},${JSON.stringify(apyttis)})'>edit</button>
          <button class="btn btn-red" onclick="deleteBridgeBot('${esc(name)}','${esc(b.id)}')">rm</button>
        </td>
      </tr>`;
    }
    html += `</tbody></table>`;
  }

  html += `<button class="btn btn-blue" onclick='addBridgeBot(${JSON.stringify(name)},${JSON.stringify(apyttis)})'>+ add bot</button>`;

  fields.innerHTML = html;
  document.getElementById('modal-bg').classList.add('active');
  document.getElementById('modal-save').style.display = 'none';
}

function bridgeBotForm(existing, apyttis) {
  const b = existing || { id:'', token:'', allowed_chat_ids:[], apytti:'', backend:'', model:'', effort:'', dir:'', session_id:'', parse_mode:'', verbosity:'kind_and_arg' };
  return `
    <div class="field"><label>id (friendly name, e.g. "marianne")</label><input type="text" id="bb-id" value="${esc(b.id)}" ${existing?'disabled':''} placeholder="marianne"></div>
    <div class="field"><label>Telegram bot token</label><input type="password" id="bb-token" placeholder="${b.token === '***' ? '(set — leave blank to keep)' : '123456:ABC-DEF...'}"></div>
    <div class="field"><label>Allowed chat IDs (comma-separated)</label><input type="text" id="bb-chats" value="${esc((b.allowed_chat_ids||[]).join(', '))}" placeholder="1089362604"></div>
    <div class="field"><label>Apytti instance</label>
      <select id="bb-apytti" onchange="onBridgeApyttiChange()">
        <option value="">— pick —</option>
        ${apyttis.map(a => `<option value="${esc(a)}" ${b.apytti===a?'selected':''}>${esc(a)}</option>`).join('')}
      </select>
    </div>
    <div class="field"><label>Pin to session (optional — leave blank for new-each-time)</label>
      <input type="text" id="bb-session" list="bb-session-list" value="${esc(b.session_id||'')}" placeholder="paste session_id or pick from suggestions" oninput="onBridgeSessionPick()">
      <datalist id="bb-session-list"></datalist>
      <div class="hint" id="bb-session-hint">pick an apytti instance first to load sessions</div>
    </div>
    <div class="field"><label>Parse mode</label>
      <select id="bb-parse-mode">
        <option value="" ${!b.parse_mode?'selected':''}>(plain)</option>
        <option value="Markdown" ${b.parse_mode==='Markdown'?'selected':''}>Markdown</option>
        <option value="MarkdownV2" ${b.parse_mode==='MarkdownV2'?'selected':''}>MarkdownV2</option>
        <option value="HTML" ${b.parse_mode==='HTML'?'selected':''}>HTML</option>
      </select>
    </div>
    <div class="field"><label>Status verbosity (live-edit during work)</label>
      <select id="bb-verbosity">
        <option value="minimal" ${b.verbosity==='minimal'?'selected':''}>minimal — just "🔧 thinking…"</option>
        <option value="kind" ${b.verbosity==='kind'?'selected':''}>kind — "🔧 Bash…" / "🔧 Read…"</option>
        <option value="kind_and_arg" ${(!b.verbosity||b.verbosity==='kind_and_arg')?'selected':''}>kind + arg — "🔧 Bash: git status…" (default)</option>
        <option value="progressive" ${b.verbosity==='progressive'?'selected':''}>progressive — full audit trail of every tool</option>
      </select>
    </div>
    <details style="margin-top:8px">
      <summary style="cursor:pointer;font-size:11px;color:var(--text-dim)">advanced overrides</summary>
      <div class="field" style="margin-top:6px"><label>backend</label><input type="text" id="bb-backend" value="${esc(b.backend||'')}" placeholder="claude"></div>
      <div class="field"><label>model</label>
        <input type="text" id="bb-model" list="bb-model-list" value="${esc(b.model||'')}" placeholder="claude-sonnet-4-6">
        <datalist id="bb-model-list"></datalist>
      </div>
      <div class="field"><label>effort</label>
        <select id="bb-effort">
          <option value="" ${!b.effort?'selected':''}>—</option>
          <option value="low" ${b.effort==='low'?'selected':''}>low</option>
          <option value="medium" ${b.effort==='medium'?'selected':''}>medium</option>
          <option value="high" ${b.effort==='high'?'selected':''}>high</option>
        </select>
      </div>
      <div class="field"><label>working dir (CWD passed to claude)</label><input type="text" id="bb-dir" value="${esc(b.dir||'')}" placeholder="/path/to/project"></div>
    </details>`;
}

async function onBridgeApyttiChange() {
  const apytti = document.getElementById('bb-apytti').value;
  const list = document.getElementById('bb-session-list');
  const hint = document.getElementById('bb-session-hint');
  const modelList = document.getElementById('bb-model-list');
  list.innerHTML = '';
  if (modelList) modelList.innerHTML = '';
  window._bbSessions = {};  // session_id → {dir, ...}
  if (!apytti) { hint.textContent = 'pick an apytti instance first to load sessions'; return; }
  hint.textContent = 'loading sessions…';
  try {
    // Sessions
    const r = await fetch(`/registry/${encodeURIComponent(apytti)}/proxy/backends/claude/sessions`, authFetchOpts());
    if (!r.ok) { hint.textContent = `failed (${r.status})`; return; }
    const d = await r.json();
    const sessions = (d.sessions || []).slice(0, 200);
    for (const s of sessions) {
      window._bbSessions[s.session_id] = s;
      const opt = document.createElement('option');
      opt.value = s.session_id;
      const project = s.dir ? (s.dir.split('/').filter(Boolean).pop() || s.dir) : '(no dir)';
      const when = s.modified_at ? relTime(Date.parse(s.modified_at)) : '';
      opt.label = when ? `${project} · ${when}` : project;
      list.appendChild(opt);
    }
    hint.textContent = `${sessions.length} sessions — type a project name to filter, or paste a session_id`;
  } catch(e) { hint.textContent = 'fetch error: ' + e; }

  // Models — populate the model datalist from apytti's cache, all backends merged.
  if (modelList) {
    try {
      const mr = await fetch(`/registry/${encodeURIComponent(apytti)}/proxy/models`, authFetchOpts());
      if (mr.ok) {
        const md = await mr.json();
        for (const [bk, entry] of Object.entries(md || {})) {
          if (entry.via === 'error' || entry.via === 'missing') continue;
          for (const m of entry.models || []) {
            const opt = document.createElement('option');
            opt.value = m;
            opt.label = `${m} · ${bk}`;
            modelList.appendChild(opt);
          }
        }
      }
    } catch(e) {}
  }
}

function onBridgeSessionPick() {
  // When user picks (or types) a session_id that matches one we cached,
  // auto-fill the working dir field if it's empty.
  const sid = document.getElementById('bb-session').value.trim();
  const dirEl = document.getElementById('bb-dir');
  const sessions = window._bbSessions || {};
  const s = sessions[sid];
  if (!s || !s.dir) return;
  if (dirEl && !dirEl.value.trim()) dirEl.value = s.dir;
}

function addBridgeBot(name, apyttis) {
  document.getElementById('modal-title').textContent = `Add bot — ${name}`;
  document.getElementById('modal-fields').innerHTML = bridgeBotForm(null, apyttis);
  document.getElementById('modal-save').style.display = '';
  document.getElementById('modal-save').onclick = () => submitBridgeBot(name, false);
}

function editBridgeBot(name, bot, apyttis) {
  document.getElementById('modal-title').textContent = `Edit bot — ${bot.id}`;
  document.getElementById('modal-fields').innerHTML = bridgeBotForm(bot, apyttis);
  // If editing and apytti is preselected, load its sessions immediately.
  if (bot.apytti) onBridgeApyttiChange();
  document.getElementById('modal-save').style.display = '';
  document.getElementById('modal-save').onclick = () => submitBridgeBot(name, true, bot.id);
}

async function submitBridgeBot(name, isEdit, existingId) {
  const idEl = document.getElementById('bb-id');
  const id = isEdit ? existingId : idEl.value.trim();
  const token = document.getElementById('bb-token').value.trim();
  const chatsRaw = document.getElementById('bb-chats').value.trim();
  const apytti = document.getElementById('bb-apytti').value;
  const session_id = document.getElementById('bb-session').value.trim();
  const parse_mode = document.getElementById('bb-parse-mode').value;
  const verbosity = document.getElementById('bb-verbosity').value;
  const backend = document.getElementById('bb-backend')?.value.trim() || '';
  const model = document.getElementById('bb-model')?.value.trim() || '';
  const effort = document.getElementById('bb-effort')?.value || '';
  const dir = document.getElementById('bb-dir')?.value.trim() || '';

  if (!id) return banner('id required', 'err');
  if (!apytti) return banner('apytti required', 'err');
  if (!isEdit && !token) return banner('telegram token required', 'err');

  const allowed_chat_ids = chatsRaw
    .split(',').map(s => s.trim()).filter(Boolean)
    .map(s => parseInt(s, 10)).filter(n => !Number.isNaN(n));

  const body = { id, allowed_chat_ids, apytti };
  if (token) body.token = token;
  if (session_id) body.session_id = session_id; else body.session_id = null;
  if (parse_mode) body.parse_mode = parse_mode; else body.parse_mode = null;
  if (verbosity) body.verbosity = verbosity;
  if (backend) body.backend = backend;
  if (model) body.model = model;
  if (effort) body.effort = effort;
  if (dir) body.dir = dir;

  const proxy = `/registry/${encodeURIComponent(name)}/proxy`;
  const url = isEdit ? `${proxy}/bots/${encodeURIComponent(id)}` : `${proxy}/bots`;
  const method = isEdit ? 'PUT' : 'POST';
  const r = await fetch(url, { method, ...authFetchOpts({ headers: { 'Content-Type': 'application/json' } }), body: JSON.stringify(body) });
  if (r.ok) {
    closeModal();
    banner(isEdit ? 'updated — bridge restarting' : 'added — bridge restarting', 'ok');
    setTimeout(() => { document.getElementById('banner-area').className = 'banner'; openMessengerPanel(name); }, 2500);
  } else {
    const d = await r.json().catch(() => ({}));
    banner(d.error || `failed (${r.status})`, 'err');
  }
}

async function deleteBridgeBot(name, id) {
  if (!confirm(`Remove bot "${id}"? This stops Telegram routing for it.`)) return;
  const r = await fetch(`/registry/${encodeURIComponent(name)}/proxy/bots/${encodeURIComponent(id)}`, { method: 'DELETE', ...authFetchOpts() });
  if (r.ok) {
    banner('removed — bridge restarting', 'ok');
    setTimeout(() => { document.getElementById('banner-area').className = 'banner'; openMessengerPanel(name); }, 2500);
  } else {
    const d = await r.json().catch(() => ({}));
    banner(d.error || 'remove failed', 'err');
  }
}

// --- Gateway (apytti) ---
const GATEWAY_SCHEMA_FALLBACK = {
  claude:  { fields: [
    {name:'enabled',type:'bool'},{name:'model',type:'string'},{name:'effort',type:'enum',options:['low','medium','high']},
    {name:'dir',type:'path'},{name:'skip_permissions',type:'bool'},{name:'allow',type:'string[]'},{name:'resume',type:'bool'}
  ], supports_effort:true, supports_cost:true },
  copilot: { fields: [
    {name:'enabled',type:'bool'},{name:'model',type:'string'},{name:'effort',type:'enum',options:['low','medium','high']},
    {name:'dir',type:'path'},{name:'skip_permissions',type:'bool'},{name:'resume',type:'bool'}
  ], supports_effort:true },
  gemini:  { fields: [
    {name:'enabled',type:'bool'},{name:'model',type:'string'},{name:'dir',type:'path'},
    {name:'skip_permissions',type:'bool'},{name:'resume',type:'bool'}
  ] },
  ollama:  { fields: [
    {name:'enabled',type:'bool'},{name:'model',type:'string'},{name:'endpoint',type:'url'}
  ] }
};

async function openGatewayPanel(name) {
  const proxy = `/registry/${encodeURIComponent(name)}/proxy`;
  const [healthRes, schemaRes, configRes, modelsRes] = await Promise.all([
    fetch(`${proxy}/health`, { headers: authHeaders() }).catch(() => null),
    fetch(`${proxy}/backends/schema`, { headers: authHeaders() }).catch(() => null),
    fetch(`${proxy}/config`, { headers: authHeaders() }).catch(() => null),
    fetch(`${proxy}/models`, { headers: authHeaders() }).catch(() => null),
  ]);
  const health = healthRes?.ok ? await healthRes.json() : {};
  const schema = schemaRes?.ok ? await schemaRes.json() : GATEWAY_SCHEMA_FALLBACK;
  const config = configRes?.ok ? await configRes.json() : { active: null, backends: {} };
  const models = modelsRes?.ok ? await modelsRes.json() : {};

  window._apyttiState = { name, proxy, schema, config, health, models, cfgBackend: config.active || Object.keys(schema)[0], _pending: {} };

  document.getElementById('modal-title').textContent = `${name} — AI Gateway`;
  document.getElementById('modal-box').classList.add('wide');
  const fields = document.getElementById('modal-fields');

  fields.innerHTML = `
    <div class="gw-meta-row">
      <div>version: <span style="color:var(--text)">${esc(health.version || '-')}</span></div>
      <div>active: <span style="color:var(--blue)">${esc(health.active_backend || '—')}</span></div>
      <div>enabled: ${(health.enabled_backends || []).map(b => `<span class="meta-tag">${esc(b)}</span>`).join(' ') || '<span style="color:var(--text-muted)">—</span>'}</div>
    </div>
    <div style="display:flex;gap:0;border-bottom:1px solid var(--border);margin-bottom:12px">
      <button class="gw-tab active" id="gw-tab-ask" onclick="gatewayTab('ask')">Ask</button>
      <button class="gw-tab" id="gw-tab-config" onclick="gatewayTab('config')">Config</button>
      <a class="gw-tab" href="/chat" target="_blank" title="open full chat in /chat" style="margin-left:auto;text-decoration:none">Chat ↗</a>
    </div>
    <div id="gw-pane-ask"></div>
    <div id="gw-pane-config" style="display:none"></div>`;
  document.getElementById('modal-bg').classList.add('active');
  document.getElementById('modal-save').style.display = 'none';
  renderGatewayAsk();
  renderGatewayConfig();
  // Chat lazy-loads on first tab activation (it fetches sessions list).
}

function gatewayTab(which) {
  for (const t of ['ask','config']) {
    document.getElementById('gw-pane-'+t).style.display = (t===which) ? '' : 'none';
    document.getElementById('gw-tab-'+t).classList.toggle('active', t===which);
  }
}

function renderGatewayAsk() {
  const { schema, config } = window._apyttiState;
  const enabled = Object.keys(schema).filter(k => config.backends?.[k]?.enabled);
  const pane = document.getElementById('gw-pane-ask');
  if (!enabled.length) {
    pane.innerHTML = `<div style="color:var(--text-muted);font-size:12px;padding:14px 0">no backends enabled — configure one in the <a href="#" onclick="gatewayTab('config');return false" style="color:var(--blue)">Config</a> tab</div>`;
    return;
  }
  const { models } = window._apyttiState;
  const datalists = enabled.map(b => {
    const entry = models?.[b];
    const list = (entry && entry.via !== 'error' && Array.isArray(entry.models)) ? entry.models : [];
    return `<datalist id="gw-ask-dl-${esc(b)}">${list.map(m => `<option value="${esc(m)}">`).join('')}</datalist>`;
  }).join('');
  const initialBackend = enabled.includes(config.active) ? config.active : enabled[0];
  pane.innerHTML = `
    ${datalists}
    <div class="gw-row">
      <div><label class="gw-lbl">Backend</label>
        <select class="gw-select" id="gw-ask-backend" onchange="gatewayAskBackendChange()">
          ${enabled.map(b => `<option value="${esc(b)}" ${b===initialBackend?'selected':''}>${esc(b)}</option>`).join('')}
        </select></div>
      <div><label class="gw-lbl">Model (optional)</label>
        <input class="gw-input" type="text" id="gw-ask-model" list="gw-ask-dl-${esc(initialBackend)}" placeholder="default — start typing for suggestions"></div>
      <div><label class="gw-lbl">Effort</label>
        <select class="gw-select" id="gw-ask-effort">
          <option value="">—</option><option value="low">low</option><option value="medium">medium</option><option value="high">high</option>
        </select></div>
      <div><label class="gw-lbl">Session ID (optional)</label>
        <input class="gw-input" type="text" id="gw-ask-session" placeholder="resume previous"></div>
    </div>
    <div style="margin-top:10px"><label class="gw-lbl">Prompt</label>
      <textarea class="gw-textarea" id="gw-ask-prompt" rows="5"></textarea></div>
    <div style="display:flex;gap:8px;align-items:center;margin:10px 0">
      <button class="btn btn-blue" onclick="askGateway()">Send</button>
      <span id="gw-ask-meta" style="font-size:11px;color:var(--text-muted)"></span>
    </div>
    <pre id="gw-ask-response" class="gw-resp" style="display:none"></pre>`;
}

function gatewayAskBackendChange() {
  const b = document.getElementById('gw-ask-backend').value;
  document.getElementById('gw-ask-model').setAttribute('list', `gw-ask-dl-${b}`);
}

async function askGateway() {
  const { proxy } = window._apyttiState;
  const prompt = document.getElementById('gw-ask-prompt').value.trim();
  if (!prompt) return banner('prompt required', 'err');
  const body = { prompt, backend: document.getElementById('gw-ask-backend').value };
  const model = document.getElementById('gw-ask-model').value.trim();
  const effort = document.getElementById('gw-ask-effort').value;
  const session = document.getElementById('gw-ask-session').value.trim();
  if (model) body.model = model;
  if (effort) body.effort = effort;
  if (session) body.session_id = session;

  const meta = document.getElementById('gw-ask-meta');
  const out = document.getElementById('gw-ask-response');
  meta.textContent = 'asking…';
  out.style.display = 'none';
  const t0 = Date.now();
  try {
    const res = await fetch(`${proxy}/api/ask`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
    const data = await res.json();
    const ms = Date.now() - t0;
    if (!res.ok || data.error) {
      meta.textContent = `error (${ms}ms)`;
      out.textContent = data.error || ('HTTP ' + res.status);
      out.style.display = '';
      return;
    }
    const cost = data.cost_usd != null ? `$${data.cost_usd.toFixed(4)}` : '—';
    meta.innerHTML = `${ms}ms · ${esc(cost)} · ${esc(data.backend||'?')} · <span style="color:var(--blue);cursor:pointer;text-decoration:underline" onclick="document.getElementById('gw-ask-session').value='${esc(data.session_id||'')}'" title="click to resume">${esc((data.session_id||'').slice(0,12))}</span>`;
    out.textContent = data.response || '';
    out.style.display = '';
  } catch(e) {
    meta.textContent = 'failed';
    out.textContent = String(e);
    out.style.display = '';
  }
}

// --- Chat tab ---
async function renderGatewayChat() {
  const { proxy, schema, config } = window._apyttiState;
  const enabled = Object.keys(schema).filter(k => config.backends?.[k]?.enabled);
  const pane = document.getElementById('gw-pane-chat');
  if (!enabled.length) {
    pane.innerHTML = `<div class="gw-chat-empty">no backends enabled — flip one on in <a href="#" onclick="gatewayTab('config');return false" style="color:var(--blue)">Config</a></div>`;
    return;
  }
  const initialBackend = enabled.includes(config.active) ? config.active : enabled[0];
  window._apyttiState.chat = { backend: initialBackend, sessions: [], currentSid: null, currentDir: null, messages: [], streaming: false, abort: null };

  pane.innerHTML = `
    <div class="gw-chat-toolbar">
      <select class="gw-select" id="gw-chat-backend" style="width:auto" onchange="gatewayChatBackendChange()">
        ${enabled.map(b => `<option value="${esc(b)}" ${b===initialBackend?'selected':''}>${esc(b)}</option>`).join('')}
      </select>
      <button class="btn" onclick="gatewayChatNewSession()" title="Start a fresh conversation">+ New</button>
      <button class="btn" onclick="gatewayChatRefresh()" title="Refresh sessions list">↻</button>
      <span class="ctx" id="gw-chat-ctx"></span>
    </div>
    <div class="gw-chat-grid">
      <div class="gw-chat-side" id="gw-chat-side"><div class="gw-chat-empty">loading…</div></div>
      <div class="gw-chat-main">
        <div class="gw-chat-msgs" id="gw-chat-msgs"><div class="gw-chat-empty">pick a session on the left, or click + New</div></div>
        <div class="gw-chat-send">
          <textarea class="gw-textarea" id="gw-chat-input" placeholder="message — Cmd+Enter to send"></textarea>
          <button class="btn btn-blue" id="gw-chat-send" onclick="sendGatewayChat()">Send</button>
        </div>
      </div>
    </div>`;
  document.getElementById('gw-chat-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendGatewayChat(); }
  });
  window._apyttiState._chatLoaded = true;
  await gatewayChatRefresh();
}

async function gatewayChatBackendChange() {
  const { chat } = window._apyttiState;
  chat.backend = document.getElementById('gw-chat-backend').value;
  chat.currentSid = null; chat.currentDir = null; chat.messages = [];
  document.getElementById('gw-chat-msgs').innerHTML = `<div class="gw-chat-empty">pick a session on the left, or click + New</div>`;
  document.getElementById('gw-chat-ctx').textContent = '';
  await gatewayChatRefresh();
}

async function gatewayChatRefresh() {
  const { proxy, chat } = window._apyttiState;
  const side = document.getElementById('gw-chat-side');
  side.innerHTML = `<div class="gw-chat-empty">loading…</div>`;
  try {
    const r = await fetch(`${proxy}/backends/${encodeURIComponent(chat.backend)}/sessions`, { headers: authHeaders() });
    if (!r.ok) { side.innerHTML = `<div class="gw-chat-empty" style="color:var(--red)">err ${r.status}</div>`; return; }
    const data = await r.json();
    chat.sessions = data.sessions || [];
    if (!chat.sessions.length) { side.innerHTML = `<div class="gw-chat-empty">no ${esc(chat.backend)} sessions yet</div>`; return; }
    side.innerHTML = chat.sessions.map(s => {
      const sel = s.session_id === chat.currentSid ? ' selected' : '';
      const when = s.modified_at ? relTime(Date.parse(s.modified_at)) : '';
      const dir = s.dir ? s.dir.split('/').slice(-2).join('/') : '';
      return `<div class="gw-chat-side-row${sel}" data-sid="${esc(s.session_id)}" data-dir="${esc(s.dir||'')}" onclick="selectGatewayChatSession('${esc(s.session_id)}')">
        <div class="preview">${esc(s.first_message || '(empty)')}</div>
        <div class="meta"><span title="${esc(s.dir||'')}">${esc(dir)}</span><span>${esc(when)}<span data-status-for="${esc(s.session_id)}"></span></span></div>
      </div>`;
    }).join('');
    // Fire-and-forget per-session in-use status checks (don't block).
    for (const s of chat.sessions.slice(0, 30)) probeSessionStatus(s.session_id);
  } catch(e) {
    side.innerHTML = `<div class="gw-chat-empty" style="color:var(--red)">${esc(String(e))}</div>`;
  }
}

async function probeSessionStatus(sid) {
  const { proxy, chat } = window._apyttiState;
  try {
    const r = await fetch(`${proxy}/backends/${encodeURIComponent(chat.backend)}/sessions/${encodeURIComponent(sid)}/status`, { headers: authHeaders() });
    if (!r.ok) return;
    const data = await r.json();
    const slot = document.querySelector(`[data-status-for="${CSS.escape(sid)}"]`);
    if (slot && data.active) slot.innerHTML = ` <span title="another claude is using this session" style="color:var(--yellow)">⚠</span>`;
  } catch(e) {}
}

async function selectGatewayChatSession(sid) {
  const { proxy, chat } = window._apyttiState;
  if (chat.streaming) return banner('still streaming', 'warn');
  const session = chat.sessions.find(s => s.session_id === sid);
  chat.currentSid = sid;
  chat.currentDir = session?.dir || null;
  for (const row of document.querySelectorAll('.gw-chat-side-row')) row.classList.toggle('selected', row.dataset.sid === sid);
  document.getElementById('gw-chat-ctx').textContent = chat.currentDir ? `↳ ${chat.currentDir}` : '';
  const msgs = document.getElementById('gw-chat-msgs');
  msgs.innerHTML = `<div class="gw-chat-empty">loading…</div>`;
  try {
    const r = await fetch(`${proxy}/backends/${encodeURIComponent(chat.backend)}/sessions/${encodeURIComponent(sid)}/messages`, { headers: authHeaders() });
    if (!r.ok) { msgs.innerHTML = `<div class="gw-chat-empty" style="color:var(--red)">err ${r.status}</div>`; return; }
    const data = await r.json();
    chat.messages = data.messages || [];
    renderChatMessages();
  } catch(e) {
    msgs.innerHTML = `<div class="gw-chat-empty" style="color:var(--red)">${esc(String(e))}</div>`;
  }
}

function gatewayChatNewSession() {
  const { chat } = window._apyttiState;
  if (chat.streaming) return banner('still streaming', 'warn');
  chat.currentSid = null;
  chat.currentDir = null;
  chat.messages = [];
  for (const row of document.querySelectorAll('.gw-chat-side-row')) row.classList.remove('selected');
  document.getElementById('gw-chat-ctx').textContent = '(new session — first message picks the cwd)';
  document.getElementById('gw-chat-msgs').innerHTML = `<div class="gw-chat-empty">type a message to start a new ${esc(chat.backend)} session</div>`;
  document.getElementById('gw-chat-input').focus();
}

function renderChatMessages() {
  const { chat } = window._apyttiState;
  const msgs = document.getElementById('gw-chat-msgs');
  if (!chat.messages.length) { msgs.innerHTML = `<div class="gw-chat-empty">empty session</div>`; return; }
  msgs.innerHTML = chat.messages.map(m => renderChatBubble(m)).join('');
  msgs.scrollTop = msgs.scrollHeight;
}

function renderChatBubble(m) {
  const role = m.role || 'unknown';
  // Replace [tool: Name] inline markers with chips
  const escaped = esc(m.content || '');
  const withChips = escaped.replace(/\[tool:\s*([^\]]+)\]/g, (_, n) => `<span class="tool-chip">${n.trim()}</span>`)
                            .replace(/\[tool result\]/g, `<span class="tool-chip" style="color:var(--text-dim);background:rgba(120,120,140,0.12);border-color:rgba(120,120,140,0.25)">tool result</span>`)
                            .replace(/\[thinking\]/g, `<span class="thinking">[thinking]</span>`);
  const tools = (m.tool_uses || []).map(t =>
    `<span class="tu"><strong>${esc(t.name)}</strong>${t.input_summary ? esc(t.input_summary) : ''}</span>`
  ).join('');
  const model = m.model ? `<span class="model">${esc(m.model)}</span>` : '';
  const ts = m.timestamp ? new Date(m.timestamp).toLocaleString() : '';
  return `<div class="gw-chat-msg ${esc(role)}">
    <div class="role"><span title="${esc(ts)}">${esc(role)}</span>${model}</div>
    <div class="content">${withChips}</div>
    ${tools ? `<div class="tool-uses">${tools}</div>` : ''}
  </div>`;
}

async function sendGatewayChat() {
  const { proxy, chat } = window._apyttiState;
  if (chat.streaming) return banner('already streaming', 'warn');
  const input = document.getElementById('gw-chat-input');
  const text = input.value.trim();
  if (!text) return;

  // Optimistically render the user message
  chat.messages.push({ role: 'user', content: text, timestamp: new Date().toISOString() });
  // Append a placeholder assistant message we'll fill via SSE
  const partial = { role: 'assistant', content: '', timestamp: new Date().toISOString(), _partial: true };
  chat.messages.push(partial);
  renderChatMessages();
  input.value = '';
  chat.streaming = true;
  document.getElementById('gw-chat-send').disabled = true;

  const body = { prompt: text, backend: chat.backend, stream: true };
  if (chat.currentSid) body.session_id = chat.currentSid;
  if (chat.currentDir) body.dir = chat.currentDir;

  const ctl = new AbortController();
  chat.abort = ctl;
  try {
    const r = await fetch(`${proxy}/api/ask`, {
      method: 'POST', headers: authHeaders(), body: JSON.stringify(body), signal: ctl.signal,
    });
    if (!r.ok || !r.body) {
      const t = await r.text().catch(() => '');
      partial.content = `[error ${r.status}] ${t}`;
      partial._partial = false;
      renderChatMessages();
      return;
    }
    const ct = r.headers.get('content-type') || '';
    if (ct.includes('event-stream')) {
      // SSE stream
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const block = buf.slice(0, idx); buf = buf.slice(idx + 2);
          const lines = block.split('\n');
          let event = 'message', data = '';
          for (const ln of lines) {
            if (ln.startsWith('event:')) event = ln.slice(6).trim();
            else if (ln.startsWith('data:')) data += (data ? '\n' : '') + ln.slice(5).replace(/^ /, '');
          }
          if (!data) continue;
          let payload; try { payload = JSON.parse(data); } catch(e) { continue; }
          if (event === 'delta' && payload.text) {
            partial.content += payload.text;
            renderChatBubbleUpdate(partial);
          } else if (event === 'done') {
            partial._partial = false;
            partial.content = payload.response || partial.content;
            if (payload.session_id) chat.currentSid = payload.session_id;
            if (payload.cost_usd != null) partial.cost_usd = payload.cost_usd;
            if (payload.backend) partial.model = payload.backend;
            renderChatMessages();
          } else if (event === 'error') {
            partial.content += `\n[error] ${payload.error || 'unknown'}`;
            partial._partial = false;
            renderChatMessages();
          }
        }
      }
    } else {
      // One-shot JSON
      const data = await r.json();
      if (data.error) partial.content = `[error] ${data.error}`;
      else { partial.content = data.response || ''; if (data.session_id) chat.currentSid = data.session_id; if (data.backend) partial.model = data.backend; }
      partial._partial = false;
      renderChatMessages();
    }
  } catch(e) {
    if (e.name !== 'AbortError') {
      partial.content = `[error] ${String(e)}`;
      partial._partial = false;
      renderChatMessages();
    }
  } finally {
    chat.streaming = false;
    chat.abort = null;
    document.getElementById('gw-chat-send').disabled = false;
    // If we got a brand-new session_id, refresh sidebar so it appears
    if (chat.currentSid && !chat.sessions.find(s => s.session_id === chat.currentSid)) {
      gatewayChatRefresh();
    }
  }
}

function renderChatBubbleUpdate(partial) {
  // Replace just the last bubble in-place to avoid full rerender during streaming
  const msgs = document.getElementById('gw-chat-msgs');
  const last = msgs.lastElementChild;
  if (!last) { renderChatMessages(); return; }
  const fresh = document.createElement('div');
  fresh.innerHTML = renderChatBubble(partial);
  msgs.replaceChild(fresh.firstElementChild, last);
  msgs.scrollTop = msgs.scrollHeight;
}

function renderGatewayConfig() {
  const { schema, config, cfgBackend } = window._apyttiState;
  const pane = document.getElementById('gw-pane-config');
  const backends = Object.keys(schema);

  const { models } = window._apyttiState;
  const tabs = backends.map(b => {
    const on = config.backends?.[b]?.enabled;
    const active = b === cfgBackend ? ' active' : '';
    const dim = on ? '' : ' disabled';
    const v = models?.[b]?.via;
    let badge;
    if (v === 'probing') badge = '<span title="probing" style="margin-right:5px;color:var(--blue)">⏳</span>';
    else if (v === 'error') badge = '<span title="probe failed" style="margin-right:5px;color:var(--red)">✗</span>';
    else if (v === 'live' || v === 'probe') badge = '<span title="discovered" style="margin-right:5px;color:var(--green)">✓</span>';
    else badge = on ? '<span class="dot dot-on" style="width:5px;height:5px;margin-right:5px;vertical-align:middle"></span>' : '<span class="dot dot-off" style="width:5px;height:5px;margin-right:5px;vertical-align:middle"></span>';
    return `<button class="gw-tab${active}${dim}" data-backend="${esc(b)}" onclick="gatewayCfgTab('${esc(b)}')">${badge}${esc(b)}</button>`;
  }).join('');

  pane.innerHTML = `
    <div style="display:flex;gap:12px;align-items:center;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid var(--border);flex-wrap:wrap">
      <label class="gw-lbl" style="margin:0">Active</label>
      <select class="gw-select" id="gw-cfg-active" style="width:auto;min-width:130px">
        <option value="">(none)</option>
        ${backends.map(b => `<option value="${esc(b)}" ${config.active===b?'selected':''}>${esc(b)}</option>`).join('')}
      </select>
      <div style="flex:1"></div>
      <button class="btn" id="gw-discover-btn" onclick="discoverModels()" title="Probe every enabled backend for its model list — Gemini may take several minutes">↻ Discover models</button>
      <span id="gw-discover-meta" style="font-size:11px;color:var(--text-muted)"></span>
    </div>
    <div style="display:flex;gap:0;border-bottom:1px solid var(--border);margin-bottom:10px">${tabs}</div>
    <div id="gw-cfg-form"></div>
    <div style="display:flex;gap:8px;margin-top:14px;align-items:center">
      <button class="btn btn-blue" onclick="saveGatewayConfig()">Save all</button>
      <span id="gw-cfg-meta" style="font-size:11px;color:var(--text-muted)"></span>
    </div>`;
  renderGatewayCfgForm();
}

function gatewayCfgTab(b) {
  captureGatewayCfgForm();
  window._apyttiState.cfgBackend = b;
  const btns = document.querySelectorAll('#gw-pane-config .gw-tab');
  for (const btn of btns) btn.classList.toggle('active', btn.dataset.backend === b);
  renderGatewayCfgForm();
}

function renderGatewayCfgForm() {
  const { schema, config, cfgBackend, _pending, models } = window._apyttiState;
  const spec = schema[cfgBackend];
  if (!spec) return;
  const cur = (_pending && _pending[cfgBackend]) || config.backends?.[cfgBackend] || {};
  const caps = [];
  if (spec.supports_effort) caps.push('effort');
  if (spec.supports_cost) caps.push('cost');
  if (spec.supports_streaming) caps.push('stream');

  const mEntry = models?.[cfgBackend];
  let mLine = '';
  if (!mEntry || mEntry.via === 'missing') {
    mLine = `<span style="color:var(--text-muted)">no models discovered</span>`;
  } else if (mEntry.via === 'probing') {
    mLine = `<span style="color:var(--blue)">⏳ probing…</span>`;
  } else if (mEntry.via === 'error') {
    mLine = `<span style="color:var(--red)">probe failed: ${esc(mEntry.error || 'unknown')}</span>`;
  } else {
    const when = mEntry.fetched_at ? relTime(Date.parse(mEntry.fetched_at)) : '';
    mLine = `<span style="color:var(--text-dim)">${(mEntry.models||[]).length} model${(mEntry.models||[]).length===1?'':'s'} via ${esc(mEntry.via)}${when?' · '+esc(when):''}</span>`;
  }

  const form = document.getElementById('gw-cfg-form');
  form.innerHTML = `
    <div style="display:flex;gap:8px;align-items:baseline;margin-bottom:8px;flex-wrap:wrap">
      <strong style="color:var(--text);font-size:12px;text-transform:uppercase;letter-spacing:0.5px">${esc(cfgBackend)}</strong>
      ${caps.map(c => `<span class="meta-tag">${esc(c)}</span>`).join(' ')}
      <div style="flex:1"></div>
      ${mLine}
      <button class="btn" style="padding:2px 6px" onclick="discoverModels('${esc(cfgBackend)}')" title="re-probe ${esc(cfgBackend)}">↻</button>
    </div>
    <datalist id="gw-cfg-dl-${esc(cfgBackend)}">${((mEntry?.via!=='error' && mEntry?.models)||[]).map(m => `<option value="${esc(m)}">`).join('')}</datalist>
    <div class="gw-row">${spec.fields.map(f => renderGatewayField(cfgBackend, f, cur[f.name])).join('')}</div>`;
}

function renderGatewayField(backend, f, value) {
  const id = `gw-cfg-${backend}-${f.name}`;
  const lbl = `<label class="gw-lbl">${esc(f.name)}</label>`;
  if (f.type === 'bool') {
    return `<div style="align-self:center"><label class="gw-chk"><input type="checkbox" id="${id}" ${value?'checked':''}>${esc(f.name)}</label></div>`;
  }
  if (f.type === 'enum') {
    return `<div>${lbl}<select class="gw-select" id="${id}">
      <option value="">—</option>
      ${(f.options||[]).map(o => `<option value="${esc(o)}" ${value===o?'selected':''}>${esc(o)}</option>`).join('')}
    </select></div>`;
  }
  if (f.type === 'string[]') {
    const v = Array.isArray(value) ? value.join(', ') : '';
    return `<div style="grid-column:1/-1">${lbl}<input class="gw-input" type="text" id="${id}" value="${esc(v)}" placeholder="comma-separated, e.g. Bash(git:*), Read(*)"></div>`;
  }
  const v = value == null ? '' : String(value);
  const redacted = (typeof value === 'string' && value === '***');
  const display = redacted ? '' : v;
  let ph = redacted ? '(set — leave blank to keep)' : '';
  let listAttr = '';
  if (f.name === 'model') {
    listAttr = ` list="gw-cfg-dl-${backend}"`;
    if (!ph) ph = 'type or pick from discovered models';
  }
  return `<div>${lbl}<input class="gw-input" type="text" id="${id}"${listAttr} value="${esc(display)}" placeholder="${esc(ph)}"></div>`;
}

function captureGatewayCfgForm() {
  const { schema, config, cfgBackend } = window._apyttiState;
  if (!cfgBackend || !schema[cfgBackend]) return;
  const pending = window._apyttiState._pending || {};
  const cur = (pending[cfgBackend] ?? config.backends?.[cfgBackend]) || {};
  const out = { ...cur };
  for (const f of schema[cfgBackend].fields) {
    const el = document.getElementById(`gw-cfg-${cfgBackend}-${f.name}`);
    if (!el) continue;
    if (f.type === 'bool') out[f.name] = el.checked;
    else if (f.type === 'string[]') out[f.name] = el.value.split(',').map(s => s.trim()).filter(Boolean);
    else out[f.name] = el.value;
  }
  pending[cfgBackend] = out;
  window._apyttiState._pending = pending;
}

async function discoverModels(backend) {
  captureGatewayCfgForm();
  const { proxy, config } = window._apyttiState;
  const enabledList = Object.keys(window._apyttiState.schema).filter(k => config.backends?.[k]?.enabled);
  const includesGemini = backend ? backend === 'gemini' : enabledList.includes('gemini');
  if (includesGemini) {
    if (!confirm('Gemini can take several minutes to probe. Continue?')) return;
  }

  const btn = document.getElementById('gw-discover-btn');
  const meta = document.getElementById('gw-discover-meta');
  if (btn) btn.disabled = true;
  const label = backend ? `probing ${backend}…` : `probing ${enabledList.length} backend${enabledList.length===1?'':'s'}…`;
  if (meta) meta.textContent = label;

  const url = backend ? `${proxy}/models/init?backend=${encodeURIComponent(backend)}` : `${proxy}/models/init`;

  // Poll /models every 5s while the init is in flight — picks up partial updates if apytti writes them incrementally.
  const poll = setInterval(async () => {
    try {
      const r = await fetch(`${proxy}/models`, { headers: authHeaders() });
      if (r.ok) {
        window._apyttiState.models = await r.json();
        renderGatewayCfgForm();
        renderGatewayAsk();
      }
    } catch(e) {}
  }, 5000);

  try {
    const res = await fetch(url, { method: 'POST', headers: authHeaders() });
    if (res.ok) {
      window._apyttiState.models = await res.json();
      if (meta) meta.textContent = 'done';
      banner('models discovered', 'ok');
      setTimeout(() => { document.getElementById('banner-area').className = 'banner'; if (meta) meta.textContent = ''; }, 3000);
    } else {
      const d = await res.json().catch(() => ({}));
      if (meta) meta.textContent = 'failed: ' + (d.error || res.status);
      banner('discovery failed', 'err');
    }
  } catch(e) {
    if (meta) meta.textContent = 'failed: ' + String(e);
  } finally {
    clearInterval(poll);
    if (btn) btn.disabled = false;
    renderGatewayCfgForm();
    renderGatewayAsk();
  }
}

async function saveGatewayConfig() {
  captureGatewayCfgForm();
  const { proxy, schema, config, _pending } = window._apyttiState;
  const active = document.getElementById('gw-cfg-active').value || null;
  const payload = { active, backends: {} };
  const merged = { ...(config.backends || {}), ...(_pending || {}) };
  for (const b of Object.keys(schema)) {
    const spec = schema[b];
    const src = merged[b] || {};
    const cur = config.backends?.[b] || {};
    const out = {};
    for (const f of spec.fields) {
      const v = src[f.name];
      if (f.type === 'bool') { out[f.name] = !!v; continue; }
      if (f.type === 'string[]') { out[f.name] = Array.isArray(v) ? v : []; continue; }
      const sv = (v == null) ? '' : String(v).trim();
      if (sv === '' && cur[f.name] === '***') continue;
      if (sv === '') continue;
      out[f.name] = sv;
    }
    payload.backends[b] = out;
  }

  const meta = document.getElementById('gw-cfg-meta');
  meta.textContent = 'saving…';
  const res = await fetch(`${proxy}/config`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify(payload) });
  if (res.ok) {
    meta.textContent = 'saved';
    banner('config saved', 'ok');
    setTimeout(() => { document.getElementById('banner-area').className = 'banner'; meta.textContent = ''; }, 3000);
    openGatewayPanel(window._apyttiState.name);
  } else {
    const d = await res.json().catch(() => ({}));
    meta.textContent = 'failed: ' + (d.error || res.status);
    banner('save failed', 'err');
  }
}

async function parserSendStdin(name) {
  const sid = document.getElementById('grytti-send-session').value;
  const text = document.getElementById('grytti-send-text').value.trim();
  if (!text) return;
  const proxy = `/registry/${encodeURIComponent(name)}/proxy`;
  const res = await fetch(`${proxy}/session/send`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ session_id: sid, text }) });
  if (res.ok) { document.getElementById('grytti-send-text').value = ''; banner('sent', 'ok'); setTimeout(() => document.getElementById('banner-area').className = 'banner', 2000); }
  else { banner('send failed', 'err'); }
}

// --- Boot ---
// --- Users ---
async function refreshUsers() {
  try {
    const r = await fetch('/auth/users', authFetchOpts());
    if (!r.ok) {
      document.getElementById('users-table').innerHTML = `<tr><td class="empty-row">unable to load users</td></tr>`;
      return;
    }
    const d = await r.json();
    const users = d.users || [];
    document.getElementById('users-count').textContent = users.length ? `(${users.length})` : '';
    if (!users.length) {
      document.getElementById('users-table').innerHTML = `<tr><td class="empty-row">no users yet — add one to enable login</td></tr>`;
      return;
    }
    document.getElementById('users-table').innerHTML = users.map(u => {
      const last = u.last_login ? relTime(u.last_login) : '<span style="color:var(--text-muted)">never</span>';
      const isMe = CURRENT_USER === u.username;
      return `<tr>
        <td><span class="dot dot-on"></span></td>
        <td>${esc(u.username)}${isMe ? ' <span class="meta-tag">you</span>' : ''}</td>
        <td style="color:var(--text-dim)">last login ${last}</td>
        <td style="text-align:right;display:flex;gap:4px;justify-content:flex-end">
          <button class="btn" onclick="changePassword('${esc(u.username)}')">change password</button>
          ${isMe ? '' : `<button class="btn btn-red" onclick="deleteUser('${esc(u.username)}')">remove</button>`}
        </td>
      </tr>`;
    }).join('');
  } catch(e) {}
}
function authFetchOpts(opts = {}) {
  return Object.assign({ credentials: 'same-origin' }, opts, {
    headers: Object.assign({}, opts.headers || {}, authHeaders()),
  });
}
document.getElementById('btn-add-user').addEventListener('click', () => {
  document.getElementById('modal-title').textContent = 'Add user';
  document.getElementById('modal-fields').innerHTML = `
    <div class="field"><label>username</label><input type="text" id="new-username" autocomplete="off"></div>
    <div class="field"><label>password (min 6)</label><input type="password" id="new-password" autocomplete="new-password"></div>`;
  document.getElementById('modal-bg').classList.add('active');
  document.getElementById('modal-save').onclick = async () => {
    const username = document.getElementById('new-username').value.trim();
    const password = document.getElementById('new-password').value;
    if (!username || password.length < 6) return banner('username + 6+ char password required', 'err');
    const r = await fetch('/auth/users', { method: 'POST', ...authFetchOpts({ headers: { 'Content-Type': 'application/json' } }), body: JSON.stringify({ username, password }) });
    if (r.ok) { closeModal(); banner('user added', 'ok'); setTimeout(() => document.getElementById('banner-area').className = 'banner', 3000); refreshUsers(); }
    else { const d = await r.json().catch(() => ({})); banner(d.error || 'add failed', 'err'); }
  };
});

async function deleteUser(username) {
  if (!confirm(`Remove user "${username}"?`)) return;
  const r = await fetch('/auth/users/' + encodeURIComponent(username), { method: 'DELETE', ...authFetchOpts() });
  if (r.ok) { banner('user removed', 'ok'); setTimeout(() => document.getElementById('banner-area').className = 'banner', 3000); refreshUsers(); }
  else { const d = await r.json().catch(() => ({})); banner(d.error || 'remove failed', 'err'); }
}

function changePassword(username) {
  const isMe = CURRENT_USER === username;
  document.getElementById('modal-title').textContent = `Change password — ${username}`;
  document.getElementById('modal-fields').innerHTML = `
    ${isMe ? '<div class="field"><label>old password</label><input type="password" id="cp-old" autocomplete="current-password"></div>' : ''}
    <div class="field"><label>new password (min 6)</label><input type="password" id="cp-new" autocomplete="new-password"></div>`;
  document.getElementById('modal-bg').classList.add('active');
  document.getElementById('modal-save').onclick = async () => {
    const new_password = document.getElementById('cp-new').value;
    const old_password = isMe ? document.getElementById('cp-old').value : null;
    if (new_password.length < 6) return banner('password must be 6+ chars', 'err');
    const body = { new_password };
    if (old_password) body.old_password = old_password;
    const r = await fetch('/auth/users/' + encodeURIComponent(username) + '/password', {
      method: 'PUT',
      ...authFetchOpts({ headers: { 'Content-Type': 'application/json' } }),
      body: JSON.stringify(body),
    });
    if (r.ok) { closeModal(); banner('password changed', 'ok'); setTimeout(() => document.getElementById('banner-area').className = 'banner', 3000); refreshUsers(); }
    else { const d = await r.json().catch(() => ({})); banner(d.error || 'change failed', 'err'); }
  };
}

function refreshAll() { refreshInfo(); refreshSessions(); refreshFamily(); refreshUsers(); }
loadConfig(); refreshAll();
setInterval(refreshAll, 5000);
