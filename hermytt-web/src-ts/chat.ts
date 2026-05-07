export {};

import { marked } from 'marked';

// GitHub-Flavored Markdown for assistant turns. Inline HTML is dropped by the
// renderer (we feed claude's text-only output, but defense-in-depth) so a
// stray `<script>` in a response can't execute. Newlines render as <br/> for
// chat-style flow that doesn't require a blank line for a soft break.
marked.setOptions({ gfm: true, breaks: true });

// hermytt /chat — TypeScript port of the original chat.html script.
//
// Same behavior, same network calls, same State shape. The migration adds:
//  - typed shapes for messages, sessions, services, SSE event payloads
//  - non-null assertions / casts at DOM boundaries
//  - explicit `globalThis` registration of functions called from inline HTML onclick handlers
//
// Built via `npm run build` in hermytt-web/. Output: static/chat.js. Bundled into
// the Rust binary by hermytt-web's lib.rs include_str.

// --- Types ---

interface ToolUse {
  name: string;
  input_summary?: string;
}

interface Message {
  role: string;
  content: string;
  timestamp?: string;
  model?: string;
  cost_usd?: number;
  tool_uses?: ToolUse[];
}

interface Session {
  session_id: string;
  dir?: string;
  first_message?: string;
  modified_at?: string;
  bytes?: number;
}

interface Service {
  name: string;
  role: string;
  endpoint: string;
  status: string;
}

interface MeResponse { username?: string | null }
interface RegistryResponse { services?: Service[] }
interface HealthResponse { active_backend?: string | null; enabled_backends?: string[] }
interface SessionsResponse { sessions?: Session[] }
interface MessagesResponse { messages?: Message[]; total?: number }
interface StatusResponse { active?: boolean }
interface AskResponse {
  response?: string;
  session_id?: string | null;
  cost_usd?: number | null;
  backend?: string | null;
  error?: string | null;
}
interface AskDelta { type?: string; text?: string }
interface AskError { type?: string; error?: string }

type AttachmentKind = 'image' | 'document' | 'voice' | 'video' | 'audio';

interface PendingAttachment {
  name: string;
  kind: AttachmentKind;
  mimeType: string;
  data: string;          // base64-encoded raw bytes (no data: URL prefix)
  previewUrl?: string;   // data: URL — only for image kinds, for the chip thumbnail
  size: number;
}

interface ChatState {
  servers: Service[];
  currentServer: string | null;
  backends: string[];
  currentBackend: string | null;
  sessions: Session[];
  currentSid: string | null;
  currentDir: string | null;
  messages: Message[];
  streaming: boolean;
  abortCtl: AbortController | null;
  pendingAttachments: PendingAttachment[];
  _lastSig?: string;
}

// --- Helpers ---

const esc = (s: unknown): string => {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(s ?? '').replace(/[&<>"']/g, c => map[c] || c);
};

const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} not found`);
  return el;
};

const $sel = (id: string): HTMLSelectElement => $(id) as HTMLSelectElement;
const $textarea = (id: string): HTMLTextAreaElement => $(id) as HTMLTextAreaElement;
const $button = (id: string): HTMLButtonElement => $(id) as HTMLButtonElement;

let TOKEN: string = sessionStorage.getItem('hermytt-token') || '';
let CURRENT_USER: string | null = null;

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (TOKEN) h['X-Hermytt-Key'] = TOKEN;
  return h;
}

async function logout(): Promise<void> {
  try { await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' }); } catch {}
  sessionStorage.removeItem('hermytt-token');
  location.href = '/login';
}

function showStatus(msg: string, level: '' | 'err' | 'warn' = ''): void {
  const el = $('status');
  el.textContent = msg;
  el.className = 'show ' + level;
}
function hideStatus(): void { $('status').className = ''; }

const State: ChatState = {
  servers: [],
  currentServer: null,
  backends: [],
  currentBackend: null,
  sessions: [],
  currentSid: null,
  currentDir: null,
  messages: [],
  streaming: false,
  abortCtl: null,
  pendingAttachments: [],
};

// --- Boot ---

(async () => {
  try {
    const r = await fetch('/auth/me', { credentials: 'same-origin' });
    if (r.ok) {
      const d = await r.json() as MeResponse;
      if (d.username) {
        CURRENT_USER = d.username;
        $('whoami').textContent = d.username;
      }
    }
  } catch {}
  if (!CURRENT_USER && TOKEN) {
    try {
      const r2 = await fetch('/info', { headers: { 'X-Hermytt-Key': TOKEN } });
      if (!r2.ok) { location.href = '/login?next=/chat'; return; }
    } catch { location.href = '/login?next=/chat'; return; }
  } else if (!CURRENT_USER && !TOKEN) {
    location.href = '/login?next=/chat';
    return;
  }
  await refreshServers();
  await refreshAfterServerChange();
})();

// --- Servers ---

async function refreshServers(): Promise<void> {
  try {
    const r = await fetch('/registry', { credentials: 'same-origin', headers: authHeaders() });
    if (!r.ok) { showStatus('failed to fetch registry', 'err'); return; }
    const d = await r.json() as RegistryResponse;
    State.servers = (d.services || []).filter(s => s.role === 'gateway' && s.status === 'connected');
    const sel = $sel('server');
    if (!State.servers.length) {
      sel.innerHTML = '<option value="">no apytti instances connected</option>';
      sel.disabled = true;
      $('side').innerHTML = `<div class="empty">no apytti instances are registered.<br><br>Start one and configure it to announce to <code>${esc(location.origin)}</code>.</div>`;
      return;
    }
    sel.disabled = false;
    sel.innerHTML = State.servers.map(s => `<option value="${esc(s.name)}">${esc(s.name)}</option>`).join('');
    if (!State.currentServer || !State.servers.find(s => s.name === State.currentServer)) {
      State.currentServer = State.servers[0].name;
      sel.value = State.currentServer;
    }
  } catch (e) {
    showStatus('registry error: ' + e, 'err');
  }
}

$sel('server').addEventListener('change', async () => {
  State.currentServer = $sel('server').value;
  State.currentBackend = null;
  State.currentSid = null;
  State.currentDir = null;
  State.messages = [];
  await refreshAfterServerChange();
});

async function refreshAfterServerChange(): Promise<void> {
  if (!State.currentServer) return;
  await loadHealth();
  await refreshSessions();
  renderMessages({ forceScroll: true });
}

async function loadHealth(): Promise<void> {
  if (!State.currentServer) return;
  const proxy = `/registry/${encodeURIComponent(State.currentServer)}/proxy`;
  try {
    const r = await fetch(`${proxy}/health`, { credentials: 'same-origin', headers: authHeaders() });
    if (!r.ok) { showStatus(`server ${State.currentServer} unreachable (${r.status})`, 'err'); return; }
    const h = await r.json() as HealthResponse;
    State.backends = h.enabled_backends || [];
    if (!State.currentBackend || !State.backends.includes(State.currentBackend)) {
      State.currentBackend = h.active_backend && State.backends.includes(h.active_backend)
        ? h.active_backend
        : (State.backends[0] || null);
    }
    const sel = $sel('backend');
    if (!State.backends.length) {
      sel.innerHTML = '<option value="">no backends enabled</option>';
      sel.disabled = true;
      showStatus(`${State.currentServer} has no backends enabled — configure one in admin → ${State.currentServer} → Config`, 'warn');
    } else {
      sel.disabled = false;
      sel.innerHTML = State.backends.map(b => `<option value="${esc(b)}" ${b === State.currentBackend ? 'selected' : ''}>${esc(b)}</option>`).join('');
      hideStatus();
    }
  } catch (e) { showStatus('health check failed: ' + e, 'err'); }
}

$sel('backend').addEventListener('change', async () => {
  State.currentBackend = $sel('backend').value;
  State.currentSid = null;
  State.currentDir = null;
  State.messages = [];
  await refreshSessions();
  renderMessages({ forceScroll: true });
});

// --- Sidebar ---

async function refreshSessions(): Promise<void> {
  const side = $('side');
  if (!State.currentServer || !State.currentBackend) {
    side.innerHTML = `<div class="empty">pick a server + backend first</div>`;
    return;
  }
  side.innerHTML = `<div class="empty">loading…</div>`;
  try {
    const proxy = `/registry/${encodeURIComponent(State.currentServer)}/proxy`;
    const r = await fetch(`${proxy}/backends/${encodeURIComponent(State.currentBackend)}/sessions`, { credentials: 'same-origin', headers: authHeaders() });
    if (!r.ok) { side.innerHTML = `<div class="empty" style="color:var(--red)">err ${r.status}</div>`; return; }
    const d = await r.json() as SessionsResponse;
    State.sessions = d.sessions || [];
    if (!State.sessions.length) {
      side.innerHTML = `<div class="empty">no ${esc(State.currentBackend)} sessions yet — say something below to start one</div>`;
      return;
    }
    side.innerHTML = State.sessions.map(s => {
      const sel = s.session_id === State.currentSid ? ' selected' : '';
      const when = s.modified_at ? relTime(Date.parse(s.modified_at)) : '';
      const project = s.dir ? (s.dir.split('/').filter(Boolean).pop() || s.dir) : '(no dir)';
      const firstMsg = (s.first_message || '').slice(0, 80);
      return `<div class="row${sel}" data-sid="${esc(s.session_id)}" onclick="selectSession('${esc(s.session_id)}')" title="${esc(s.dir || '')}">
        <div class="project">${esc(project)}</div>
        ${firstMsg ? `<div class="preview-small">${esc(firstMsg)}</div>` : ''}
        <div class="meta"><span></span><span>${esc(when)}<span data-status-for="${esc(s.session_id)}"></span></span></div>
      </div>`;
    }).join('');
    // Throttle status probes: prioritize selected + top 10, stagger 200ms.
    const targets: string[] = [];
    if (State.currentSid) targets.push(State.currentSid);
    for (const s of State.sessions.slice(0, 10)) {
      if (s.session_id !== State.currentSid) targets.push(s.session_id);
    }
    targets.forEach((sid, i) => setTimeout(() => probeStatus(sid), i * 200));
  } catch (e) {
    side.innerHTML = `<div class="empty" style="color:var(--red)">${esc(String(e))}</div>`;
  }
}

async function probeStatus(sid: string): Promise<void> {
  if (!State.currentServer || !State.currentBackend) return;
  try {
    const proxy = `/registry/${encodeURIComponent(State.currentServer)}/proxy`;
    const r = await fetch(`${proxy}/backends/${encodeURIComponent(State.currentBackend)}/sessions/${encodeURIComponent(sid)}/status`, { credentials: 'same-origin', headers: authHeaders() });
    if (!r.ok) return;
    const d = await r.json() as StatusResponse;
    const slot = document.querySelector(`[data-status-for="${CSS.escape(sid)}"]`);
    if (slot && d.active) {
      slot.innerHTML = ` <span title="another claude is using this session" style="color:var(--yellow)">⚠</span>`;
    }
  } catch {}
}

async function selectSession(sid: string): Promise<void> {
  if (State.streaming) return;
  if (!State.currentServer || !State.currentBackend) return;
  const session = State.sessions.find(s => s.session_id === sid);
  State.currentSid = sid;
  State.currentDir = session?.dir || null;
  for (const row of Array.from(document.querySelectorAll<HTMLElement>('#side .row'))) {
    row.classList.toggle('selected', row.dataset['sid'] === sid);
  }
  $('ctxbar').textContent = State.currentDir
    ? `${State.currentServer} · ${State.currentBackend} · ${State.currentDir}`
    : `${State.currentServer} · ${State.currentBackend}`;
  const msgs = $('msgs');
  msgs.innerHTML = `<div class="empty">loading…</div>`;
  try {
    const proxy = `/registry/${encodeURIComponent(State.currentServer)}/proxy`;
    const r = await fetch(`${proxy}/backends/${encodeURIComponent(State.currentBackend)}/sessions/${encodeURIComponent(sid)}/messages`, { credentials: 'same-origin', headers: authHeaders() });
    if (!r.ok) { msgs.innerHTML = `<div class="empty" style="color:var(--red)">err ${r.status}</div>`; return; }
    const d = await r.json() as MessagesResponse;
    State.messages = d.messages || [];
    State._lastSig = messagesSignature(State.messages);
    renderMessages({ forceScroll: true });
  } catch (e) {
    msgs.innerHTML = `<div class="empty" style="color:var(--red)">${esc(String(e))}</div>`;
  }
}

$button('btn-new').addEventListener('click', () => {
  if (State.streaming) return;
  State.currentSid = null;
  State.currentDir = null;
  State.messages = [];
  for (const row of Array.from(document.querySelectorAll('#side .row'))) row.classList.remove('selected');
  $('ctxbar').textContent = `${State.currentServer} · ${State.currentBackend} · (new — first message picks the cwd)`;
  $('msgs').innerHTML = `<div class="empty">type a message below to start a new ${esc(State.currentBackend)} session</div>`;
  $textarea('input').focus();
});

$button('btn-refresh').addEventListener('click', async () => {
  await refreshServers();
  await loadHealth();
  await refreshSessions();
  // Also re-fetch the open session's messages so the user can manually pull
  // updates if the background poll missed them (or the tab was suspended).
  if (State.currentSid && State.currentServer && State.currentBackend && !State.streaming) {
    try {
      const proxy = `/registry/${encodeURIComponent(State.currentServer)}/proxy`;
      const r = await fetch(`${proxy}/backends/${encodeURIComponent(State.currentBackend)}/sessions/${encodeURIComponent(State.currentSid)}/messages`, { credentials: 'same-origin', headers: authHeaders() });
      if (r.ok) {
        const d = await r.json() as MessagesResponse;
        const fresh = d.messages || [];
        const newSig = messagesSignature(fresh);
        if (newSig !== State._lastSig) {
          State.messages = fresh;
          State._lastSig = newSig;
          renderMessages({ forceScroll: true });
        }
      }
    } catch {}
  }
});

// --- Mobile drawer ---
// Hamburger toggles a `body.drawer-open` class. The sidebar slides in via CSS
// transform (see media query). Backdrop click and session-pick both auto-close.

function toggleDrawer(open?: boolean): void {
  const cls = document.body.classList;
  if (typeof open === 'boolean') cls.toggle('drawer-open', open);
  else cls.toggle('drawer-open');
}

const drawerBtn = document.getElementById('btn-drawer');
if (drawerBtn) drawerBtn.addEventListener('click', () => toggleDrawer());

const drawerBackdrop = document.getElementById('drawer-backdrop');
if (drawerBackdrop) drawerBackdrop.addEventListener('click', () => toggleDrawer(false));

// On a phone, the sidebar takes the full screen — closing it after picking a
// session is the natural expectation (Telegram / Slack pattern).
document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement | null;
  if (!target) return;
  if (target.closest('#side .row')) toggleDrawer(false);
});

// Auto-close when the viewport returns to desktop width.
window.addEventListener('resize', () => {
  if (window.innerWidth > 720) toggleDrawer(false);
});

// --- Windowed rendering ---
// State.messages is the source of truth (full history). We mount only the last
// VIEW_LIMIT bubbles in the DOM. "Load older" prepends another chunk on demand.

const VIEW_LIMIT = 100;
let viewStartIdx = 0;
let renderedCount = 0;

function renderMessages(opts: { forceScroll?: boolean } = {}): void {
  const msgs = $('msgs');
  // Capture scroll position BEFORE clobbering innerHTML — once the DOM resets,
  // scrollHeight changes and the metric becomes meaningless.
  const wasAtBottom = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 80;

  if (!State.messages.length) {
    msgs.innerHTML = `<div class="empty">${State.currentSid ? 'empty session' : 'pick a session on the left, or click + new'}</div>`;
    viewStartIdx = 0;
    renderedCount = 0;
    return;
  }
  const total = State.messages.length;
  viewStartIdx = Math.max(0, total - VIEW_LIMIT);
  const visible = State.messages.slice(viewStartIdx);
  let html = '';
  if (viewStartIdx > 0) html += renderLoadOlderBtn();
  html += visible.map(m => renderBubble(m)).join('');
  msgs.innerHTML = html;
  renderedCount = visible.length;
  // Only scroll to bottom on explicit user actions (selectSession, new, send) OR
  // if user was already pinned to the bottom. If they scrolled up to read, leave them be.
  if (opts.forceScroll || wasAtBottom) {
    msgs.scrollTop = msgs.scrollHeight;
  }
}

function renderLoadOlderBtn(): string {
  const remaining = viewStartIdx;
  const next = Math.min(VIEW_LIMIT, remaining);
  return `<button class="load-older" onclick="loadOlder()">↑ Load ${next} older message${next === 1 ? '' : 's'} (${remaining} above)</button>`;
}

function loadOlder(): void {
  const msgs = $('msgs');
  const oldStart = viewStartIdx;
  viewStartIdx = Math.max(0, viewStartIdx - VIEW_LIMIT);
  const newOnes = State.messages.slice(viewStartIdx, oldStart);
  const oldHeight = msgs.scrollHeight;
  const oldScroll = msgs.scrollTop;
  const existingBtn = msgs.querySelector('.load-older');
  if (existingBtn) existingBtn.remove();
  let html = '';
  if (viewStartIdx > 0) html += renderLoadOlderBtn();
  html += newOnes.map(renderBubble).join('');
  msgs.insertAdjacentHTML('afterbegin', html);
  renderedCount += newOnes.length;
  const heightDelta = msgs.scrollHeight - oldHeight;
  msgs.scrollTop = oldScroll + heightDelta;
}

function appendNewMessages(): void {
  const msgs = $('msgs');
  if (renderedCount === 0 || viewStartIdx + renderedCount > State.messages.length) {
    return renderMessages();
  }
  if (viewStartIdx + renderedCount === State.messages.length) return;
  const wasAtBottom = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 80;
  const fragment = State.messages.slice(viewStartIdx + renderedCount).map(renderBubble).join('');
  msgs.insertAdjacentHTML('beforeend', fragment);
  renderedCount = State.messages.length - viewStartIdx;
  if (wasAtBottom) msgs.scrollTop = msgs.scrollHeight;
}

function messagesSignature(arr: Message[] | undefined): string {
  if (!arr || !arr.length) return '0';
  const last = arr[arr.length - 1]!;
  return `${arr.length}:${(last.content || '').length}:${last.timestamp || ''}`;
}

function fmtTimestamp(iso?: string): { rel: string; full: string } {
  if (!iso) return { rel: '', full: '' };
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { rel: '', full: '' };
  const now = Date.now();
  const ago = Math.floor((now - d.getTime()) / 1000);
  let rel = '';
  if (ago < 0) rel = 'just now';
  else if (ago < 10) rel = 'just now';
  else if (ago < 60) rel = `${ago}s ago`;
  else if (ago < 3600) rel = `${Math.floor(ago / 60)}m ago`;
  else if (ago < 86400) rel = `${Math.floor(ago / 3600)}h ago`;
  else if (ago < 7 * 86400) rel = `${Math.floor(ago / 86400)}d ago`;
  else rel = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  // For older messages, also show the time-of-day inline so it's not just "3d ago".
  const full = d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  return { rel, full };
}

function renderBubble(m: Message): string {
  const role = m.role || 'unknown';
  // 1. Render GFM. marked escapes <, >, & by default — no need to pre-escape.
  // 2. Post-process the HTML to replace our literal markers with chip spans.
  //    The markers (`[tool: X]`, `[tool result]`, `[thinking]`) survive markdown
  //    parsing intact because they're not valid md syntax.
  let html: string;
  try {
    html = marked.parse(m.content || '', { async: false }) as string;
  } catch {
    html = `<p>${esc(m.content || '')}</p>`;
  }
  const withChips = html
    .replace(/\[tool:\s*([^\]]+)\]/g, (_: string, n: string) => `<span class="tool-chip">${esc(n.trim())}</span>`)
    .replace(/\[tool result\]/g, `<span class="tool-chip result">tool result</span>`)
    .replace(/\[thinking\]/g, `<span class="thinking">[thinking]</span>`);
  const tools = (m.tool_uses || []).map(t =>
    `<span class="tu" title="${esc(t.input_summary || '')}"><strong>${esc(t.name)}</strong>${esc(t.input_summary || '')}</span>`
  ).join('');
  const model = m.model ? `<span class="model">${esc(m.model)}</span>` : '';
  const { rel, full } = fmtTimestamp(m.timestamp);
  const tsTag = rel
    ? `<span class="ts" title="${esc(full)}">${esc(rel)}</span>`
    : '';
  return `<div class="msg ${esc(role)}">
    <div class="role"><span>${esc(role)}</span>${model}${tsTag}</div>
    <div class="content">${withChips}</div>
    ${tools ? `<div class="tool-uses">${tools}</div>` : ''}
  </div>`;
}

// --- Send (streaming) ---

$textarea('input').addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!State.streaming) send(); }
});
$button('send').addEventListener('click', () => {
  // Same button does double duty: send when idle, stop when streaming.
  if (State.streaming) {
    killCurrent();
  } else {
    send();
  }
});

/** Stop the current ask. Aborting the fetch closes the SSE stream from our side;
 *  apytti's `kill_on_drop` then SIGKILLs the underlying claude subprocess.
 *  We could instead POST /backends/{backend}/sessions/{sid}/cancel, but local abort
 *  works for sessionless calls too and produces the same end state. */
function killCurrent(): void {
  if (!State.streaming || !State.abortCtl) return;
  State.abortCtl.abort();
}

// --- Attachments ---

function inferKind(mimeType: string): AttachmentKind {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  return 'document';
}

function fileToAttachment(file: File): Promise<PendingAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      // Strip the "data:image/jpeg;base64," prefix — apytti wants raw base64 in `data`.
      const base64 = dataUrl.includes(',') ? dataUrl.split(',', 2)[1]! : dataUrl;
      const mimeType = file.type || 'application/octet-stream';
      const kind = inferKind(mimeType);
      const ext = mimeType.split('/')[1] || 'bin';
      const name = file.name && file.name !== 'image.png'
        ? file.name
        : `pasted_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.${ext}`;
      resolve({
        name,
        kind,
        mimeType,
        data: base64,
        previewUrl: kind === 'image' ? dataUrl : undefined,
        size: file.size,
      });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

function renderAttachments(): void {
  const slot = $('attachments');
  if (!State.pendingAttachments.length) {
    slot.innerHTML = '';
    return;
  }
  slot.innerHTML = State.pendingAttachments.map((a, i) => {
    const visual = a.previewUrl
      ? `<img src="${a.previewUrl}" alt="${esc(a.name)}">`
      : `<span class="icon">📎</span>`;
    return `<div class="attachment-chip">
      ${visual}
      <span class="name" title="${esc(a.name)}">${esc(a.name)}</span>
      <span class="size">${esc(formatBytes(a.size))}</span>
      <span class="remove" onclick="removeAttachment(${i})" title="remove">×</span>
    </div>`;
  }).join('');
}

function removeAttachment(i: number): void {
  const removed = State.pendingAttachments.splice(i, 1)[0];
  if (removed?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(removed.previewUrl);
  renderAttachments();
}

async function ingestFiles(files: FileList | File[]): Promise<void> {
  const list = Array.from(files);
  for (const f of list) {
    try {
      State.pendingAttachments.push(await fileToAttachment(f));
    } catch (e) {
      showStatus(`failed to read ${f.name}: ${e}`, 'err');
    }
  }
  renderAttachments();
}

// Paste — Cmd+V on the textarea. Lets text pastes through (no clipboardData.files);
// for images and other binary blobs, intercepts and adds as attachments.
$textarea('input').addEventListener('paste', async (e: ClipboardEvent) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  const files: File[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    if (item.kind === 'file') {
      const f = item.getAsFile();
      if (f) files.push(f);
    }
  }
  if (files.length === 0) return;  // plain text paste — let the default handler fill the textarea
  e.preventDefault();
  await ingestFiles(files);
});

// Drag-and-drop anywhere on the composer (or the whole window). Highlight visible.
window.addEventListener('dragover', (e: DragEvent) => {
  if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes('Files')) return;
  e.preventDefault();
  document.body.classList.add('drag-over');
});
window.addEventListener('dragleave', (e: DragEvent) => {
  if (e.relatedTarget) return;
  document.body.classList.remove('drag-over');
});
window.addEventListener('drop', async (e: DragEvent) => {
  if (!e.dataTransfer || e.dataTransfer.files.length === 0) return;
  e.preventDefault();
  document.body.classList.remove('drag-over');
  await ingestFiles(e.dataTransfer.files);
  $textarea('input').focus();
});

async function send(): Promise<void> {
  if (State.streaming) return;
  if (!State.currentServer || !State.currentBackend) {
    showStatus('pick server + backend first', 'warn');
    return;
  }
  const input = $textarea('input');
  const text = input.value.trim();
  // Allow sending with no text if there are pending attachments.
  if (!text && State.pendingAttachments.length === 0) return;

  // Capture attachments now and clear from the pending list before the network
  // call returns — UI shows them gone immediately, can't double-send.
  const attachments = State.pendingAttachments.splice(0);
  renderAttachments();

  // Local user-bubble content: include a small marker per attachment so the
  // user sees what they sent in the transcript even before apytti's prepended
  // "[attached image: name -> path]" lines arrive via the next poll.
  const userBubbleContent = attachments.length
    ? attachments.map(a => `📎 ${a.name}`).join('\n') + (text ? '\n\n' + text : '')
    : text;
  State.messages.push({ role: 'user', content: userBubbleContent, timestamp: new Date().toISOString() });
  const partial: Message = { role: 'assistant', content: '', timestamp: new Date().toISOString() };
  State.messages.push(partial);
  appendNewMessages();
  input.value = '';
  State.streaming = true;
  document.body.classList.add('streaming');
  // Don't disable the button — same button morphs into "Stop" so a click
  // during streaming routes to killCurrent() instead of send().
  $button('send').textContent = '✗ Stop';

  // Apytti's contract — exactly one of {path, data}. We always use data (base64).
  const wireAttachments = attachments.map(a => ({
    data: a.data,
    kind: a.kind,
    name: a.name,
  }));

  const body: Record<string, unknown> = {
    prompt: text || '(see attachment)',  // apytti < 0.6.3 rejected empty prompts; harmless on newer
    backend: State.currentBackend,
    stream: true,
  };
  if (State.currentSid) body['session_id'] = State.currentSid;
  if (State.currentDir) body['dir'] = State.currentDir;
  if (wireAttachments.length) body['attachments'] = wireAttachments;

  const ctl = new AbortController();
  State.abortCtl = ctl;
  try {
    const proxy = `/registry/${encodeURIComponent(State.currentServer)}/proxy`;
    const r = await fetch(`${proxy}/api/ask`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: authHeaders(),
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    if (!r.ok || !r.body) {
      const t = await r.text().catch(() => '');
      partial.content = `[error ${r.status}] ${t}`;
      updateLastBubble(partial);
      return;
    }
    const ct = r.headers.get('content-type') || '';
    if (ct.includes('event-stream')) {
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const block = buf.slice(0, idx); buf = buf.slice(idx + 2);
          const lines = block.split('\n');
          let event = 'message', data = '';
          for (const ln of lines) {
            if (ln.startsWith('event:')) event = ln.slice(6).trim();
            else if (ln.startsWith('data:')) data += (data ? '\n' : '') + ln.slice(5).replace(/^ /, '');
          }
          if (!data) continue;
          let payload: AskResponse & AskDelta & AskError;
          try { payload = JSON.parse(data); } catch { continue; }
          if (event === 'delta' && payload.text) {
            partial.content += payload.text;
            updateLastBubble(partial);
          } else if (event === 'done') {
            partial.content = payload.response || partial.content;
            if (payload.session_id) State.currentSid = payload.session_id;
            if (payload.cost_usd != null) partial.cost_usd = payload.cost_usd;
            if (payload.backend) partial.model = payload.backend;
            updateLastBubble(partial);
          } else if (event === 'error') {
            partial.content += `\n[error] ${payload.error || 'unknown'}`;
            updateLastBubble(partial);
          }
        }
      }
    } else {
      const data = await r.json() as AskResponse;
      if (data.error) partial.content = `[error] ${data.error}`;
      else {
        partial.content = data.response || '';
        if (data.session_id) State.currentSid = data.session_id;
        if (data.backend) partial.model = data.backend;
      }
      updateLastBubble(partial);
    }
  } catch (e: unknown) {
    // User-initiated abort (the ✗ Stop button) → AbortError, render gracefully.
    if (e instanceof Error && e.name === 'AbortError') {
      partial.content = (partial.content || '') + '\n[stopped]';
      updateLastBubble(partial);
    } else {
      partial.content = `[error] ${String(e)}`;
      updateLastBubble(partial);
    }
  } finally {
    State.streaming = false;
    document.body.classList.remove('streaming');
    State.abortCtl = null;
    $button('send').textContent = 'Send';
    State._lastSig = messagesSignature(State.messages);
    if (State.currentSid && !State.sessions.find(s => s.session_id === State.currentSid)) {
      refreshSessions();
    }
  }
}

function updateLastBubble(partial: Message): void {
  const msgs = $('msgs');
  const last = msgs.lastElementChild;
  if (!last) { renderMessages({ forceScroll: true }); return; }
  const wasAtBottom = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 80;
  const fresh = document.createElement('div');
  fresh.innerHTML = renderBubble(partial);
  if (fresh.firstElementChild) msgs.replaceChild(fresh.firstElementChild, last);
  if (wasAtBottom) msgs.scrollTop = msgs.scrollHeight;
}

function relTime(ms: number): string {
  const diff = Math.floor((Date.now() - ms) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// --- Background polling ---

let pollTickCount = 0;
async function backgroundPoll(): Promise<void> {
  if (State.streaming) return;
  if (document.visibilityState !== 'visible') return;
  if (!State.currentServer || !State.currentBackend) return;

  pollTickCount++;
  if (State.currentSid) {
    try {
      const proxy = `/registry/${encodeURIComponent(State.currentServer)}/proxy`;
      const since = State.messages.length;
      const r = await fetch(`${proxy}/backends/${encodeURIComponent(State.currentBackend)}/sessions/${encodeURIComponent(State.currentSid)}/messages?since=${since}`, { credentials: 'same-origin', headers: authHeaders() });
      if (r.ok) {
        const d = await r.json() as MessagesResponse;
        const incoming = d.messages || [];
        const total = typeof d.total === 'number' ? d.total : (since + incoming.length);
        if (incoming.length === 0 && total === since) {
          // Caught up.
        } else if (incoming.length === total) {
          // Server returned full set — old apytti or external truncation.
          State.messages = incoming;
          State._lastSig = messagesSignature(State.messages);
          renderMessages();
        } else {
          State.messages = State.messages.concat(incoming);
          State._lastSig = messagesSignature(State.messages);
          appendNewMessages();
        }
      }
    } catch {}
  }
  if (pollTickCount % 6 === 0) refreshSessions();
}
setInterval(backgroundPoll, 5000);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') backgroundPoll();
});

// --- Globals for inline-HTML onclick handlers ---
// `selectSession`, `loadOlder`, `logout` are referenced from generated row HTML
// and the header logout link, so they have to be reachable as globals.
declare global {
  interface Window {
    selectSession: typeof selectSession;
    loadOlder: typeof loadOlder;
    logout: typeof logout;
    removeAttachment: typeof removeAttachment;
  }
}
window.selectSession = selectSession;
window.loadOlder = loadOlder;
window.logout = logout;
window.removeAttachment = removeAttachment;
