use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use async_trait::async_trait;
use axum::Router;
use axum::body::Body;
use axum::extract::ws::{CloseFrame, Message, WebSocket};
use axum::extract::{Path, Query, State, WebSocketUpgrade};
use axum::http::{Request, StatusCode};
use axum::middleware::{self, Next};
use axum::response::Html;
use axum::response::sse::{Event, Sse};
use axum::response::{IntoResponse, Json};
use axum::routing::{get, post};
use hermytt_core::{BufferedOutput, SessionManager};
use serde::{Deserialize, Serialize};
use tracing::{info, warn};

use crate::Transport;

pub struct RestTransport {
    pub port: u16,
    pub bind: String,
    pub auth_token: Option<String>,
}

#[derive(Clone)]
struct AppState {
    sessions: Arc<SessionManager>,
    auth_token: Option<String>,
}

#[derive(Deserialize)]
struct StdinBody {
    input: String,
}

#[derive(Serialize)]
struct SessionInfo {
    id: String,
}

#[derive(Serialize)]
struct SessionListResponse {
    sessions: Vec<SessionInfo>,
}

#[derive(Deserialize)]
struct TokenQuery {
    token: Option<String>,
}

#[async_trait]
impl Transport for RestTransport {
    async fn serve(self: Arc<Self>, sessions: Arc<SessionManager>) -> Result<()> {
        let state = AppState {
            sessions,
            auth_token: self.auth_token.clone(),
        };

        // Web UI is public (it needs the token to connect WS anyway).
        let public = Router::new().route("/", get(web_ui));

        // API routes behind auth.
        let api = Router::new()
            .route("/session", post(create_session))
            .route("/sessions", get(list_sessions))
            .route("/session/{id}/stdin", post(write_stdin))
            .route("/session/{id}/stdout", get(stream_stdout))
            .route("/stdin", post(write_stdin_default))
            .route("/stdout", get(stream_stdout_default))
            .route("/exec", post(exec_default))
            .route("/session/{id}/exec", post(exec_session))
            .route("/ws", get(ws_handler_default))
            .route("/ws/{id}", get(ws_handler))
            .layer(middleware::from_fn_with_state(
                state.clone(),
                auth_middleware,
            ));

        let app = public.merge(api).with_state(state);

        let addr = format!("{}:{}", self.bind, self.port);
        info!(transport = "rest", addr = %addr, "listening");

        let listener = tokio::net::TcpListener::bind(&addr).await?;
        axum::serve(listener, app).await?;
        Ok(())
    }

    fn name(&self) -> &str {
        "rest"
    }
}

async fn auth_middleware(
    State(state): State<AppState>,
    Query(query): Query<TokenQuery>,
    req: Request<Body>,
    next: Next,
) -> Result<impl IntoResponse, StatusCode> {
    let Some(expected) = &state.auth_token else {
        // No token configured — allow all.
        return Ok(next.run(req).await);
    };

    // Check X-Hermytt-Key header first, then ?token= query param.
    let provided = req
        .headers()
        .get("X-Hermytt-Key")
        .and_then(|v| v.to_str().ok())
        .map(String::from)
        .or(query.token);

    match provided {
        Some(ref t) if t == expected => Ok(next.run(req).await),
        _ => {
            warn!(transport = "rest", "unauthorized request");
            Err(StatusCode::UNAUTHORIZED)
        }
    }
}

async fn web_ui(State(state): State<AppState>) -> Html<String> {
    Html(build_web_ui())
}

async fn create_session(
    State(state): State<AppState>,
) -> Result<Json<SessionInfo>, StatusCode> {
    let handle = state
        .sessions
        .create_session()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(SessionInfo { id: handle.id }))
}

async fn list_sessions(State(state): State<AppState>) -> Json<SessionListResponse> {
    let ids = state.sessions.list_sessions().await;
    Json(SessionListResponse {
        sessions: ids.into_iter().map(|id| SessionInfo { id }).collect(),
    })
}

async fn send_stdin(handle: &hermytt_core::SessionHandle, input: &str) -> StatusCode {
    let mut data = input.to_string();
    if !data.ends_with('\n') {
        data.push('\n');
    }
    match handle.stdin_tx.send(data.into_bytes()).await {
        Ok(_) => StatusCode::OK,
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR,
    }
}

async fn write_stdin(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<StdinBody>,
) -> StatusCode {
    let Some(handle) = state.sessions.get_session(&id).await else {
        return StatusCode::NOT_FOUND;
    };
    send_stdin(&handle, &body.input).await
}

async fn write_stdin_default(
    State(state): State<AppState>,
    Json(body): Json<StdinBody>,
) -> StatusCode {
    let Ok(handle) = state.sessions.default_session().await else {
        return StatusCode::INTERNAL_SERVER_ERROR;
    };
    send_stdin(&handle, &body.input).await
}

async fn resolve_stdout(
    handle: hermytt_core::SessionHandle,
) -> impl IntoResponse {
    let output = handle.subscribe_buffered(REST_BUFFER_WINDOW);
    make_sse_stream(output)
}

async fn stream_stdout(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, StatusCode> {
    let Some(handle) = state.sessions.get_session(&id).await else {
        return Err(StatusCode::NOT_FOUND);
    };
    Ok(resolve_stdout(handle).await)
}

async fn stream_stdout_default(
    State(state): State<AppState>,
) -> Result<impl IntoResponse, StatusCode> {
    let Ok(handle) = state.sessions.default_session().await else {
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    };
    Ok(resolve_stdout(handle).await)
}

// --- WebSocket handlers (embedded in REST for single-port mobile support) ---

async fn ws_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(query): Query<TokenQuery>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    if !check_ws_auth(&state, &query) {
        return ws.on_upgrade(|mut socket| async move {
            let _ = socket.send(Message::Close(Some(CloseFrame {
                code: 4401, reason: "unauthorized".into(),
            }))).await;
        });
    }
    ws.on_upgrade(move |socket| async move {
        let Some(handle) = state.sessions.get_session(&id).await else { return };
        handle_ws_socket(socket, handle).await;
    })
}

async fn ws_handler_default(
    State(state): State<AppState>,
    Query(query): Query<TokenQuery>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    if !check_ws_auth(&state, &query) {
        return ws.on_upgrade(|mut socket| async move {
            let _ = socket.send(Message::Close(Some(CloseFrame {
                code: 4401, reason: "unauthorized".into(),
            }))).await;
        });
    }
    ws.on_upgrade(move |socket| async move {
        let Ok(handle) = state.sessions.default_session().await else { return };
        handle_ws_socket(socket, handle).await;
    })
}

fn check_ws_auth(state: &AppState, query: &TokenQuery) -> bool {
    match &state.auth_token {
        None => true,
        Some(expected) => query.token.as_deref() == Some(expected.as_str()),
    }
}

async fn handle_ws_socket(mut socket: WebSocket, handle: hermytt_core::SessionHandle) {
    let stdin_tx = handle.stdin_tx.clone();
    let mut output_rx = handle.subscribe_output();

    loop {
        tokio::select! {
            result = output_rx.recv() => {
                match result {
                    Ok(data) => {
                        let text = String::from_utf8_lossy(&data).to_string();
                        if socket.send(Message::text(text)).await.is_err() { break; }
                    }
                    Err(_) => break,
                }
            }
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        if stdin_tx.send(text.as_bytes().to_vec()).await.is_err() { break; }
                    }
                    Some(Ok(Message::Binary(data))) => {
                        if stdin_tx.send(data.to_vec()).await.is_err() { break; }
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    _ => {}
                }
            }
        }
    }

    info!(session = %handle.id, "websocket client disconnected");
}

/// Execute a command directly (no PTY) and return clean output.

#[derive(Serialize)]
struct ExecResponse {
    stdout: String,
    stderr: String,
    exit_code: i32,
}

async fn exec_default(
    State(_state): State<AppState>,
    Json(body): Json<StdinBody>,
) -> Result<Json<ExecResponse>, StatusCode> {
    run_exec(&body.input).await
}

async fn exec_session(
    State(_state): State<AppState>,
    Path(_id): Path<String>,
    Json(body): Json<StdinBody>,
) -> Result<Json<ExecResponse>, StatusCode> {
    run_exec(&body.input).await
}

async fn run_exec(cmd: &str) -> Result<Json<ExecResponse>, StatusCode> {
    let shell = hermytt_core::platform::default_shell();
    let result = hermytt_core::exec(cmd, shell)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(ExecResponse {
        stdout: result.stdout,
        stderr: result.stderr,
        exit_code: result.exit_code,
    }))
}

/// SSE buffer window — accumulate PTY output for this long before sending.
const REST_BUFFER_WINDOW: Duration = Duration::from_millis(100);

fn make_sse_stream(
    mut output: BufferedOutput,
) -> Sse<impl tokio_stream::Stream<Item = Result<Event, std::convert::Infallible>>> {
    let stream = async_stream::stream! {
        while let Some(data) = output.recv().await {
            let text = String::from_utf8_lossy(&data).to_string();
            yield Ok(Event::default().data(text));
        }
    };
    Sse::new(stream).keep_alive(
        axum::response::sse::KeepAlive::new()
            .interval(Duration::from_secs(15))
            .text("ping"),
    )
}

fn build_web_ui() -> String {
    r##"<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<title>hermytt</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/css/xterm.min.css">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    background: #0a0a0a;
    font-family: monospace;
    overflow: hidden;
    touch-action: manipulation;
  }
  body {
    display: flex;
    flex-direction: column;
    height: 100vh;
    padding-top: env(safe-area-inset-top, 0px);
  }
  #bar {
    background: #1a1a2e;
    color: #7f7f9f;
    padding: 6px 14px;
    font-size: 13px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #2a2a3e;
    flex-shrink: 0;
  }
  #bar .name { color: #c0c0e0; font-weight: bold; }
  #bar .dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: #555;
    display: inline-block;
    margin-right: 6px;
    transition: background 0.3s;
  }
  #bar .dot.on { background: #4ade80; }
  #tabs {
    background: #12121f;
    display: flex;
    align-items: center;
    gap: 0;
    border-bottom: 1px solid #2a2a3e;
    flex-shrink: 0;
    overflow-x: auto;
  }
  .tab {
    padding: 6px 16px;
    color: #6f6f8f;
    cursor: pointer;
    border-right: 1px solid #1a1a2e;
    font-size: 13px;
    white-space: nowrap;
    user-select: none;
    transition: all 0.15s;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .tab:hover { background: #1a1a2e; color: #9f9fbf; }
  .tab.active { background: #0a0a0a; color: #e0e0e0; border-bottom: 2px solid #60a5fa; }
  .tab .close {
    opacity: 0;
    font-size: 11px;
    color: #6f6f8f;
    transition: opacity 0.15s;
  }
  .tab:hover .close { opacity: 1; }
  .tab .close:hover { color: #ff6b6b; }
  #new-tab {
    padding: 6px 12px;
    color: #4a4a6e;
    cursor: pointer;
    font-size: 16px;
    transition: color 0.15s;
    flex-shrink: 0;
  }
  #new-tab:hover { color: #60a5fa; }
  #terminals {
    flex: 1;
    position: relative;
    min-height: 0;
    overflow: hidden;
  }
  .term-container {
    position: absolute;
    inset: 0;
    display: none;
  }
  .term-container.active {
    display: block;
  }
  #mobile-input {
    display: none;
    background: #12121f;
    border-top: 1px solid #2a2a3e;
    padding: 6px 8px calc(6px + env(safe-area-inset-bottom, 0px));
    flex-shrink: 0;
  }
  #mobile-input form {
    display: flex;
    gap: 6px;
  }
  #mobile-input input {
    flex: 1;
    background: #0a0a0a;
    border: 1px solid #2a2a3e;
    color: #e0e0e0;
    padding: 8px 10px;
    font-family: 'JetBrains Mono', 'Fira Code', 'SF Mono', Menlo, monospace;
    font-size: 14px;
    border-radius: 4px;
    outline: none;
  }
  #mobile-input input:focus {
    border-color: #60a5fa;
  }
  #mobile-input button {
    background: #1a1a2e;
    border: 1px solid #2a2a3e;
    color: #9f9fbf;
    padding: 8px 14px;
    font-family: monospace;
    font-size: 14px;
    border-radius: 4px;
    cursor: pointer;
  }
  #mobile-input button:active {
    background: #2a2a3e;
  }
  .mobile #mobile-input { display: block; }
  .mobile .tab .close { opacity: 1; }
  .mobile #bar { padding: 4px 10px; font-size: 12px; }
  .mobile .tab { padding: 4px 10px; font-size: 12px; }
</style>
</head>
<body>
<div id="bar">
  <span><span class="name">hermytt</span> · the hermit tty</span>
  <span><span class="dot" id="status"></span><span id="status-text">ready</span></span>
</div>
<div id="tabs"><div id="new-tab" title="new session">+</div></div>
<div id="terminals"></div>
<div id="mobile-input">
  <form id="mobile-form">
    <input type="text" id="mobile-text" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="type command...">
    <button type="submit">&#x23CE;</button>
    <button type="button" id="btn-ctrl-c" style="color:#ff6b6b">^C</button>
    <button type="button" id="btn-tab">&#x21E5;</button>
  </form>
</div>
<script src="https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/lib/xterm.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0.10.0/lib/addon-fit.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@xterm/addon-web-links@0.11.0/lib/addon-web-links.min.js"></script>
<script>
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
const WS_PORT = location.port || (location.protocol === 'https:' ? 443 : 80);
const TOKEN = new URLSearchParams(location.search).get('token') || '';
const sessions = new Map();
let activeId = null;

const THEME = {
  background: '#0a0a0a',
  foreground: '#e0e0e0',
  cursor: '#c0c0e0',
  selectionBackground: '#3a3a5e',
  black: '#1a1a2e',
  red: '#ff6b6b',
  green: '#4ade80',
  yellow: '#fbbf24',
  blue: '#60a5fa',
  magenta: '#c084fc',
  cyan: '#22d3ee',
  white: '#e0e0e0',
  brightBlack: '#4a4a6e',
  brightRed: '#fca5a5',
  brightGreen: '#86efac',
  brightYellow: '#fde68a',
  brightBlue: '#93c5fd',
  brightMagenta: '#d8b4fe',
  brightCyan: '#67e8f9',
  brightWhite: '#ffffff',
};

function authHeaders() {
  const h = {};
  if (TOKEN) h['X-Hermytt-Key'] = TOKEN;
  return h;
}

async function fetchSessions() {
  const tokenParam = TOKEN ? `?token=${TOKEN}` : '';
  const res = await fetch(`/sessions${tokenParam}`, { headers: authHeaders() });
  if (!res.ok) return [];
  const data = await res.json();
  return data.sessions.map(s => s.id);
}

async function createSession() {
  const tokenParam = TOKEN ? `?token=${TOKEN}` : '';
  const res = await fetch(`/session${tokenParam}`, { method: 'POST', headers: authHeaders() });
  if (!res.ok) return null;
  const data = await res.json();
  return data.id;
}

function addSession(id) {
  if (sessions.has(id)) {
    switchTo(id);
    return;
  }

  const container = document.createElement('div');
  container.className = 'term-container';
  container.id = `term-${id}`;
  document.getElementById('terminals').appendChild(container);

  const term = new window.Terminal({
    cursorBlink: true,
    fontSize: isMobile ? 12 : 15,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', Menlo, monospace",
    theme: THEME,
    allowProposedApi: true,
  });

  const fitAddon = new window.FitAddon.FitAddon();
  const webLinksAddon = new window.WebLinksAddon.WebLinksAddon();
  term.loadAddon(fitAddon);
  term.loadAddon(webLinksAddon);
  term.open(container);

  const session = { id, term, fitAddon, ws: null, container };
  sessions.set(id, session);

  connectSession(session);
  addTab(id);
  switchTo(id);
}

function connectSession(session) {
  const wsHost = location.hostname || 'localhost';
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  const tokenParam = TOKEN ? `?token=${TOKEN}` : '';
  const ws = new WebSocket(`${scheme}://${wsHost}:${WS_PORT}/ws/${session.id}${tokenParam}`);

  ws.onopen = () => {
    if (activeId === session.id) updateStatus(true, session.id);
  };

  ws.onmessage = (e) => {
    session.term.write(e.data);
  };

  ws.onclose = (e) => {
    if (e.code === 4401) {
      session.term.write('\r\n\x1b[31m[hermytt] unauthorized\x1b[0m\r\n');
      if (activeId === session.id) updateStatus(false, 'unauthorized');
      return;
    }
    if (sessions.has(session.id)) {
      if (activeId === session.id) updateStatus(false, 'reconnecting...');
      setTimeout(() => {
        if (sessions.has(session.id)) connectSession(session);
      }, 2000);
    }
  };

  ws.onerror = () => ws.close();

  session.term.onData((data) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  });

  session.ws = ws;
}

function addTab(id) {
  const tab = document.createElement('div');
  tab.className = 'tab';
  tab.dataset.id = id;
  tab.innerHTML = `<span>${id.slice(0, 8)}</span><span class="close">\u00d7</span>`;

  tab.addEventListener('click', (e) => {
    if (e.target.classList.contains('close')) {
      removeSession(id);
    } else {
      switchTo(id);
    }
  });

  const newTabBtn = document.getElementById('new-tab');
  newTabBtn.parentNode.insertBefore(tab, newTabBtn);
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
    // Delay fit to let the container render with correct dimensions.
    setTimeout(() => session.fitAddon.fit(), 50);
    if (!isMobile) session.term.focus();
    const connected = session.ws && session.ws.readyState === WebSocket.OPEN;
    updateStatus(connected, connected ? id : 'connecting...');
  }
}

function removeSession(id) {
  const session = sessions.get(id);
  if (!session) return;

  if (session.ws) session.ws.close();
  session.term.dispose();
  session.container.remove();
  sessions.delete(id);

  const tab = document.querySelector(`.tab[data-id="${id}"]`);
  if (tab) tab.remove();

  if (activeId === id) {
    const remaining = [...sessions.keys()];
    if (remaining.length > 0) {
      switchTo(remaining[remaining.length - 1]);
    } else {
      activeId = null;
      updateStatus(false, 'no sessions');
    }
  }
}

function updateStatus(on, text) {
  const dot = document.getElementById('status');
  const statusText = document.getElementById('status-text');
  dot.classList.toggle('on', on);
  statusText.textContent = text;
}

document.getElementById('new-tab').addEventListener('click', async () => {
  const id = await createSession();
  if (id) addSession(id);
});

window.addEventListener('resize', () => {
  if (activeId) {
    const session = sessions.get(activeId);
    if (session) session.fitAddon.fit();
  }
});

// Keyboard shortcut: Ctrl+Shift+T = new tab, Ctrl+Shift+W = close tab
// Ctrl+Shift+[ and ] = prev/next tab
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey) {
    const ids = [...sessions.keys()];
    const idx = ids.indexOf(activeId);
    if (e.key === 'T') { e.preventDefault(); document.getElementById('new-tab').click(); }
    if (e.key === 'W' && activeId) { e.preventDefault(); removeSession(activeId); }
    if (e.key === '[' && idx > 0) { e.preventDefault(); switchTo(ids[idx - 1]); }
    if (e.key === ']' && idx < ids.length - 1) { e.preventDefault(); switchTo(ids[idx + 1]); }
  }
});

// Mobile setup.
if (isMobile) document.body.classList.add('mobile');

// iOS viewport fix: set body height from actual window.innerHeight.
function fixHeight() {
  document.body.style.height = window.innerHeight + 'px';
  if (activeId) {
    const session = sessions.get(activeId);
    if (session) setTimeout(() => session.fitAddon.fit(), 50);
  }
}
fixHeight();
window.addEventListener('resize', fixHeight);

const mobileForm = document.getElementById('mobile-form');
const mobileText = document.getElementById('mobile-text');

function mobileSend(data) {
  if (!activeId) return false;
  const session = sessions.get(activeId);
  if (!session || !session.ws || session.ws.readyState !== WebSocket.OPEN) {
    mobileText.placeholder = 'not connected...';
    return false;
  }
  session.ws.send(data);
  return true;
}

// Submit via form submit event.
mobileForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = mobileText.value;
  if (!text) return;
  if (mobileSend(text + '\r')) {
    mobileText.value = '';
  }
});

// Also handle Enter key directly (iOS sometimes doesn't fire submit).
mobileText.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const text = mobileText.value;
    if (!text) return;
    if (mobileSend(text + '\r')) {
      mobileText.value = '';
    }
  }
});

document.getElementById('btn-ctrl-c').addEventListener('click', () => {
  mobileSend('\x03');
});

document.getElementById('btn-tab').addEventListener('click', () => {
  const text = mobileText.value;
  if (text) {
    mobileSend(text + '\t');
    mobileText.value = '';
  } else {
    mobileSend('\t');
  }
});

// Handle virtual keyboard resize.
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => {
    if (activeId) {
      const session = sessions.get(activeId);
      if (session) setTimeout(() => session.fitAddon.fit(), 100);
    }
  });
}

// Debug helper for mobile.
function dbg(msg) {
  if (isMobile) {
    mobileText.placeholder = msg;
  }
  console.log('[hermytt]', msg);
}

// Load existing sessions on startup.
(async () => {
  try {
    dbg('fetching sessions...');
    const ids = await fetchSessions();
    dbg(`got ${ids.length} sessions`);
    if (ids.length === 0) {
      dbg('creating session...');
      const id = await createSession();
      if (id) {
        dbg(`created ${id.slice(0,8)}, connecting ws...`);
        addSession(id);
      } else {
        dbg('create failed — check token');
      }
    } else {
      dbg(`loading ${ids.length} sessions...`);
      ids.forEach(id => addSession(id));
    }
  } catch (e) {
    dbg('error: ' + e.message);
  }
})();
</script>
</body>
</html>"##
    .to_string()
}
