// @ts-nocheck
// hermytt /terminal — TypeScript port. Module format because of /vendor/ WASM imports.
//
// MIGRATION NOTE: @ts-nocheck for now (same rationale as admin.ts: ~500 lines
// of duck-typed DOM + WASM bindings). Future work: type the Terminal interface,
// session map, paste/clipboard, scrollback replay.

import initCrytter, { Terminal } from '/vendor/crytter_wasm.js';
import initPrytty, { highlight_safe } from '/vendor/prytty_wasm.js';

try {
  await Promise.all([
    initCrytter('/vendor/crytter_wasm_bg.wasm'),
    initPrytty('/vendor/prytty_wasm_bg.wasm'),
  ]);
  console.log('[hermytt] WASM initialized (crytter + prytty)');
} catch (e) {
  console.error('[hermytt] WASM init failed:', e);
  document.getElementById('status-text').textContent = 'WASM init failed';
}

let highlightEnabled = false;
const hlToggle = document.getElementById('highlight-toggle');
hlToggle.addEventListener('click', () => {
  highlightEnabled = !highlightEnabled;
  hlToggle.style.color = highlightEnabled ? '#fbbf24' : '#4a4a6e';
  hlToggle.title = highlightEnabled ? 'syntax highlighting (on)' : 'syntax highlighting (off)';
});

const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

// Auth: prefer cookie session; fall back to legacy bearer token; redirect to login if neither works.
const TOKEN = sessionStorage.getItem('hermytt-token') || '';
(async () => {
  try {
    const r = await fetch('/auth/me', { credentials: 'same-origin' });
    if (r.ok) {
      const d = await r.json();
      if (d && d.username) return; // cookie session valid
    }
  } catch(e) {}
  if (TOKEN) {
    try {
      const r2 = await fetch('/info', { headers: { 'X-Hermytt-Key': TOKEN } });
      if (r2.ok) return;
    } catch(e) {}
  }
  location.href = '/login?next=' + encodeURIComponent(location.pathname);
})();

const sessions = new Map();
let activeId = null;

function fitAndResize(session) {
  if (!session) return;
  session.term.fit();
  const cols = session.term.cols, rows = session.term.rows;
  // Skip bogus 1x1 resize — retry after layout settles.
  if (cols <= 1 || rows <= 1) {
    setTimeout(() => fitAndResize(session), 100);
    return;
  }
  if (session.ws && session.ws.readyState === WebSocket.OPEN) {
    // Don't send if size hasn't changed.
    if (cols === session._lastCols && rows === session._lastRows) return;
    session._lastCols = cols;
    session._lastRows = rows;
    session.ws.send(JSON.stringify({ resize: [cols, rows] }));
  }
}

function authHeaders() {
  const h = {};
  if (TOKEN) h['X-Hermytt-Key'] = TOKEN;
  return h;
}

async function api(path, opts = {}) {
  return fetch(path, { ...opts, headers: { ...authHeaders(), ...opts.headers } });
}

// Session metadata cache: id → { name, host }
const sessionMeta = new Map();

async function fetchSessions() {
  const res = await api('/sessions');
  if (!res.ok) return [];
  const data = await res.json();
  for (const s of data.sessions) sessionMeta.set(s.id, { name: s.name, host: s.host });
  return data.sessions.map(s => s.id);
}

async function createSession() {
  // Fetch available hosts.
  const hostsRes = await api('/hosts');
  if (!hostsRes.ok) return null;
  const hosts = (await hostsRes.json()).hosts || [];
  if (hosts.length === 0) { alert('No hosts connected — deploy shytti first'); return null; }

  let hostName;
  if (hosts.length === 1) {
    hostName = hosts[0].name;
  } else {
    hostName = prompt('Spawn on which host?\n\n' + hosts.map((h, i) => `${i+1}. ${h.name} (${h.meta?.host || '?'})`).join('\n') + '\n\nEnter number or name:');
    if (!hostName) return null;
    // Allow number selection.
    const idx = parseInt(hostName) - 1;
    if (!isNaN(idx) && idx >= 0 && idx < hosts.length) hostName = hosts[idx].name;
  }

  const res = await api('/hosts/' + encodeURIComponent(hostName) + '/spawn', { method: 'POST', body: '{}' });
  if (!res.ok) return null;
  const data = await res.json();
  if (data.session_id) sessionMeta.set(data.session_id, { name: null, host: hostName });
  return data.session_id;
}

function addSession(id) {
  if (sessions.has(id)) { switchTo(id); return; }

  const container = document.createElement('div');
  container.className = 'term-container';
  container.id = `term-${id}`;
  document.getElementById('terminals').appendChild(container);

  const term = new Terminal({
    cols: 80,
    rows: 24,
    fontSize: isMobile ? 12 : 15,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', Menlo, monospace",
  });

  const session = { id, term, ws: null, container };
  sessions.set(id, session);
  addTab(id);

  // 1. Make container visible (display: block via .active class).
  container.classList.add('active');
  document.querySelectorAll('.term-container').forEach(c => { if (c !== container) c.classList.remove('active'); });
  activeId = id;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.id === id));

  // 2. Open terminal — creates canvas. Container is visible so clientWidth/Height are real.
  term.open(container);

  // 3. Wait for layout, fit, then connect.
  setTimeout(() => {
    fitAndResize(session);
    connectSession(session);
    if (!isMobile) container.focus();
  }, 50);
}

function connectSession(session) {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${scheme}://${location.host}/ws/${session.id}`);
  let authed = false;

  ws.onopen = () => {
    console.log('[hermytt] WS open, TOKEN:', TOKEN ? 'set' : 'empty');
    if (TOKEN) {
      ws.send(TOKEN);
    } else {
      // No auth configured — immediately ready.
      authed = true;
      if (activeId === session.id) updateStatus(true, session.id.slice(0,8));
      fitAndResize(session);
    }
  };

  ws.onmessage = (e) => {
    if (!authed) {
      console.log('[hermytt] WS msg (pre-auth):', e.data.slice(0, 50));
      if (e.data === 'auth:ok') {
        authed = true;
        if (activeId === session.id) updateStatus(true, session.id.slice(0,8));
        fitAndResize(session);
        return;
      }
      return;
    }
    // Session exit signal from server.
    if (e.data === '{"exit":true}') {
      session.term.write('\r\n\x1b[2m... finally, alone again.\x1b[0m\r\n');
      setTimeout(() => removeSession(session.id), 2000);
      return;
    }
    // write() returns device query responses (DA1, CPR, etc.)
    const data = highlightEnabled ? highlight_safe(e.data) : e.data;
    const response = session.term.write(data);
    if (response) ws.send(response);
  };

  ws.onclose = (e) => {
    if (e.code === 4401) {
      updateStatus(false, 'unauthorized');
      return;
    }
    if (sessions.has(session.id)) {
      if (activeId === session.id) updateStatus(false, 'reconnecting...');
      setTimeout(() => { if (sessions.has(session.id)) connectSession(session); }, 2000);
    }
  };

  ws.onerror = () => ws.close();

  // Clipboard helper — falls back to execCommand on plain HTTP
  function copyText(text) {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
  }
  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }

  // Dead key / IME composition handling (French keyboards, accented chars)
  let composing = false;
  session.container.addEventListener('compositionstart', () => { composing = true; });
  session.container.addEventListener('compositionend', (e) => {
    composing = false;
    if (e.data && ws.readyState === WebSocket.OPEN && authed) ws.send(e.data);
  });

  // Keyboard input — attach to container for focus
  session.container.tabIndex = 0;
  session.container.addEventListener('mousedown', () => session.container.focus());

  session.container.addEventListener('keydown', (e) => {
    if (composing) return;
    // Cmd/Ctrl+V = paste — trigger via hidden textarea
    if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
      // Briefly spawn a textarea, focus it, let browser paste, then read it
      const ta = document.createElement('textarea');
      ta.style.cssText = 'position:fixed;left:-9999px;opacity:0';
      document.body.appendChild(ta);
      ta.focus();
      ta.addEventListener('paste', (pe) => {
        const text = pe.clipboardData?.getData('text');
        if (text && ws.readyState === WebSocket.OPEN && authed) ws.send(text);
        setTimeout(() => { ta.remove(); session.container.focus(); }, 0);
      });
      return;
    }
    // Cmd/Ctrl+C with selection = copy to clipboard, don't send to PTY
    if ((e.metaKey || e.ctrlKey) && e.key === 'c' && session.term.hasSelection) {
      e.preventDefault();
      const text = session.term.copySelection();
      if (text) copyText(text);
      session.term.clearSelection();
      return;
    }
    if (ws.readyState !== WebSocket.OPEN || !authed) return;
    const data = session.term.handleKeyEvent(e);
    if (data) {
      ws.send(data);
      e.preventDefault();
    }
  });

  // Clipboard paste fallback (for browsers that fire paste on the container)
  session.container.addEventListener('paste', (e) => {
    if (ws.readyState !== WebSocket.OPEN || !authed) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (!blob) continue;
        const reader = new FileReader();
        reader.onload = () => {
          const b64 = reader.result.split(',')[1];
          if (b64) {
            const ext = item.type.split('/')[1] || 'png';
            ws.send(JSON.stringify({ paste_image: { name: `clipboard.${ext}`, data: b64 } }));
          }
        };
        reader.readAsDataURL(blob);
        return;
      }
    }
    // Plain text paste — send directly to PTY
    const text = e.clipboardData?.getData('text');
    if (text) {
      ws.send(text);
      e.preventDefault();
    }
    // Clear textarea so it doesn't accumulate pasted text.
    setTimeout(() => { clipInput.value = ''; }, 0);
  });

  // Selection — mouse events
  let selMouseDown = false;
  session.container.addEventListener('mousedown', (e) => {
    const rect = session.container.querySelector('canvas')?.getBoundingClientRect();
    if (!rect) return;
    session.term.mouseDown(e.clientX - rect.left, e.clientY - rect.top);
    selMouseDown = true;
  });
  document.addEventListener('mousemove', (e) => {
    if (!selMouseDown) return;
    const rect = session.container.querySelector('canvas')?.getBoundingClientRect();
    if (!rect) return;
    session.term.mouseMove(e.clientX - rect.left, e.clientY - rect.top);
  });
  document.addEventListener('mouseup', () => {
    if (!selMouseDown) return;
    selMouseDown = false;
    session.term.mouseUp();
    const text = session.term.getSelection();
    if (text) copyText(text);
  });

  // Mouse wheel scroll
  session.container.addEventListener('wheel', (e) => {
    const lines = Math.round(e.deltaY / 20);
    if (lines > 0) session.term.scrollDown(Math.abs(lines));
    else if (lines < 0) session.term.scrollUp(Math.abs(lines));
    e.preventDefault();
  }, { passive: false });

  // Title changes
  session.term.onTitleChange((title) => {
    if (activeId === session.id) document.title = (tabLabel(session.id)) + ' — hermytt';
  });

  session.ws = ws;
}

function tabLabel(id) {
  const meta = sessionMeta.get(id);
  return meta?.name || id.slice(0, 12);
}

function addTab(id) {
  const tab = document.createElement('div');
  tab.className = 'tab';
  tab.dataset.id = id;
  tab.innerHTML = `<span>${tabLabel(id)}</span><span class="close">\u00d7</span>`;
  tab.addEventListener('click', (e) => {
    e.target.classList.contains('close') ? removeSession(id) : switchTo(id);
  });
  document.getElementById('new-tab').before(tab);
}

function switchTo(id) {
  activeId = id;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.term-container').forEach(c => c.classList.remove('active'));
  const tab = document.querySelector(`.tab[data-id="${id}"]`);
  const container = document.getElementById(`term-${id}`);
  if (tab) tab.classList.add('active');
  if (container) container.classList.add('active');
  const session = sessions.get(id);
  if (session) {
    setTimeout(() => {
      fitAndResize(session);
      // Second fit after render settles
      setTimeout(() => fitAndResize(session), 200);
    }, 50);
    if (!isMobile) session.container.focus();
    const connected = session.ws && session.ws.readyState === WebSocket.OPEN;
    const label = tabLabel(id);
    updateStatus(connected, connected ? label : 'connecting...');
    document.title = label + ' — hermytt';
  }
}

function removeSession(id) {
  const session = sessions.get(id);
  if (!session) return;
  if (session.ws) session.ws.close();
  session.container.remove();
  sessions.delete(id);
  document.querySelector(`.tab[data-id="${id}"]`)?.remove();
  if (activeId === id) {
    const remaining = [...sessions.keys()];
    remaining.length > 0 ? switchTo(remaining.at(-1)) : (activeId = null, updateStatus(false, 'no sessions'));
  }
}

function updateStatus(on, text) {
  document.getElementById('status').classList.toggle('on', on);
  document.getElementById('status-text').textContent = text;
}

document.getElementById('new-tab').addEventListener('click', async () => {
  const id = await createSession();
  if (id) addSession(id);
});

window.addEventListener('resize', () => {
  if (activeId) fitAndResize(sessions.get(activeId));
});

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey) {
    const ids = [...sessions.keys()], idx = ids.indexOf(activeId);
    if (e.key === 'T') { e.preventDefault(); document.getElementById('new-tab').click(); }
    if (e.key === 'W' && activeId) { e.preventDefault(); removeSession(activeId); }
    if (e.key === '[' && idx > 0) { e.preventDefault(); switchTo(ids[idx - 1]); }
    if (e.key === ']' && idx < ids.length - 1) { e.preventDefault(); switchTo(ids[idx + 1]); }
  }
});

// Mobile
if (isMobile) document.body.classList.add('mobile');
function fixHeight() {
  document.body.style.height = window.innerHeight + 'px';
  if (activeId) setTimeout(() => fitAndResize(sessions.get(activeId)), 50);
}
fixHeight();
window.addEventListener('resize', fixHeight);

const mobileText = document.getElementById('mobile-text');
function mobileSend(data) {
  if (!activeId) return false;
  const session = sessions.get(activeId);
  if (!session?.ws || session.ws.readyState !== WebSocket.OPEN) {
    mobileText.placeholder = 'not connected...';
    return false;
  }
  session.ws.send(data);
  return true;
}
document.getElementById('mobile-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (mobileText.value && mobileSend(mobileText.value + '\r')) mobileText.value = '';
});
mobileText.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (mobileText.value && mobileSend(mobileText.value + '\r')) mobileText.value = '';
  }
});
document.getElementById('btn-ctrl-c').addEventListener('click', () => mobileSend('\x03'));
document.getElementById('btn-tab').addEventListener('click', () => {
  if (mobileText.value) { mobileSend(mobileText.value + '\t'); mobileText.value = ''; }
  else mobileSend('\t');
});

if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => {
    if (activeId) setTimeout(() => fitAndResize(sessions.get(activeId)), 100);
  });
}

// Render loop — crytter batches writes, render() draws to canvas
function renderLoop() {
  sessions.forEach(s => s.term.render());
  requestAnimationFrame(renderLoop);
}
requestAnimationFrame(renderLoop);

// Boot
console.log('[hermytt] crytter loaded, fetching sessions...');
const ids = await fetchSessions();
console.log('[hermytt] sessions:', ids);
if (ids.length === 0) {
  const id = await createSession();
  if (id) addSession(id);
} else {
  ids.forEach(id => addSession(id));
}
