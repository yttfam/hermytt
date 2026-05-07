//! Tiny HTTP control surface for managing bot bindings live.
//!
//! Auth: every request must carry `X-Hermytt-Key: <hermytt.token>` from config.
//! Bot tokens are redacted to "***" in GET responses; passing "***" in PUT keeps the existing value.
//! On config write, the process exits — systemd restarts with the new config.

use std::io::Read as _;
use std::path::PathBuf;
use std::sync::{Arc, RwLock};

use serde::{Deserialize, Serialize};
use tiny_http::{Header, Method, Request, Response, Server};

use crate::config::{BotConfig, Config};

#[derive(Clone)]
pub struct State {
    pub config: Arc<RwLock<Config>>,
    pub config_path: PathBuf,
    pub auth_token: String,
}

pub fn serve(state: State, port: u16) -> anyhow::Result<()> {
    let server = Server::http(format!("127.0.0.1:{port}"))
        .map_err(|e| anyhow::anyhow!("bind 127.0.0.1:{}: {}", port, e))?;
    tracing::info!(port, "control surface listening");
    for req in server.incoming_requests() {
        if let Err(e) = handle(req, &state) {
            tracing::warn!("control: {}", e);
        }
    }
    Ok(())
}

fn handle(mut req: Request, state: &State) -> anyhow::Result<()> {
    let path = req.url().to_string();
    let method = req.method().clone();
    let auth_ok = req.headers().iter().any(|h| h.field.equiv("X-Hermytt-Key") && h.value.as_str() == state.auth_token);
    let cookie_header = req.headers().iter().find(|h| h.field.equiv("Cookie")).map(|h| h.value.as_str().to_string());

    // Public probe.
    if path == "/health" && method == Method::Get {
        let n = state.config.read().unwrap().bots.len();
        return reply_json(req, 200, &serde_json::json!({"status":"ok","bots":n,"version":env!("CARGO_PKG_VERSION")}));
    }

    // Everything else needs auth — either X-Hermytt-Key or a hermytt session cookie passed through the proxy.
    if !auth_ok && cookie_header.as_deref().map(|h| h.contains("hermytt_session=")).unwrap_or(false) {
        // Cookie path: the hermytt proxy already validated. Trust it.
    } else if !auth_ok {
        return reply_json(req, 401, &serde_json::json!({"error":"unauthorized"}));
    }

    let mut body = String::new();
    let _ = req.as_reader().read_to_string(&mut body);

    let resp = match (method, path.as_str()) {
        (Method::Get, "/bots") => list_bots(state),
        (Method::Post, "/bots") => add_bot(state, &body),
        (Method::Get, p) if p.starts_with("/bots/") => get_bot(state, &p[6..]),
        (Method::Put, p) if p.starts_with("/bots/") => update_bot(state, &p[6..], &body),
        (Method::Delete, p) if p.starts_with("/bots/") => delete_bot(state, &p[6..]),
        _ => Outcome::not_found("no such endpoint"),
    };
    reply_outcome(req, resp)
}

#[derive(Debug, Serialize)]
struct BotView {
    id: String,
    token: String,
    allowed_chat_ids: Vec<i64>,
    apytti: String,
    backend: Option<String>,
    model: Option<String>,
    effort: Option<String>,
    dir: Option<String>,
    media_dir: Option<String>,
    session_id: Option<String>,
    parse_mode: Option<String>,
    verbosity: Option<String>,
}
impl From<&BotConfig> for BotView {
    fn from(b: &BotConfig) -> Self {
        BotView {
            id: b.id.clone(),
            token: if b.token.is_empty() { String::new() } else { "***".to_string() },
            allowed_chat_ids: b.allowed_chat_ids.clone(),
            apytti: b.apytti.clone(),
            backend: b.backend.clone(),
            model: b.model.clone(),
            effort: b.effort.clone(),
            dir: b.dir.clone(),
            media_dir: b.media_dir.clone(),
            session_id: b.session_id.clone(),
            parse_mode: b.parse_mode.clone(),
            verbosity: b.verbosity.clone(),
        }
    }
}

#[derive(Debug, Deserialize)]
struct BotPayload {
    id: Option<String>,
    token: Option<String>,
    #[serde(default)]
    allowed_chat_ids: Vec<i64>,
    apytti: Option<String>,
    #[serde(default)]
    backend: Option<String>,
    #[serde(default)]
    model: Option<String>,
    #[serde(default)]
    effort: Option<String>,
    #[serde(default)]
    dir: Option<String>,
    #[serde(default)]
    media_dir: Option<String>,
    #[serde(default)]
    session_id: Option<String>,
    #[serde(default)]
    parse_mode: Option<String>,
    #[serde(default)]
    verbosity: Option<String>,
}

fn list_bots(state: &State) -> Outcome {
    let cfg = state.config.read().unwrap();
    let bots: Vec<BotView> = cfg.bots.iter().map(BotView::from).collect();
    Outcome::ok(serde_json::json!({"bots": bots}))
}

fn get_bot(state: &State, id: &str) -> Outcome {
    let cfg = state.config.read().unwrap();
    match cfg.bots.iter().find(|b| b.id == id) {
        Some(b) => Outcome::ok(serde_json::to_value(BotView::from(b)).unwrap()),
        None => Outcome::not_found("bot not found"),
    }
}

fn add_bot(state: &State, body: &str) -> Outcome {
    let p: BotPayload = match serde_json::from_str(body) {
        Ok(p) => p,
        Err(e) => return Outcome::bad(format!("invalid json: {e}")),
    };
    let id = match p.id { Some(s) if !s.is_empty() => s, _ => return Outcome::bad("id required") };
    let token = match p.token { Some(s) if !s.is_empty() && s != "***" => s, _ => return Outcome::bad("telegram token required") };
    let apytti = match p.apytti { Some(s) if !s.is_empty() => s, _ => return Outcome::bad("apytti service name required") };

    {
        let cfg = state.config.read().unwrap();
        if cfg.bots.iter().any(|b| b.id == id) {
            return Outcome::conflict("bot id already exists");
        }
    }

    let new_bot = BotConfig {
        id: id.clone(),
        token,
        allowed_chat_ids: p.allowed_chat_ids,
        apytti,
        backend: p.backend,
        model: p.model,
        effort: p.effort,
        dir: p.dir,
        media_dir: p.media_dir,
        session_id: p.session_id,
        parse_mode: p.parse_mode,
        verbosity: p.verbosity,
    };

    let mut new_cfg = state.config.read().unwrap().clone();
    new_cfg.bots.push(new_bot);
    if let Err(e) = new_cfg.save(&state.config_path) {
        return Outcome::server(format!("save failed: {e}"));
    }
    *state.config.write().unwrap() = new_cfg;
    tracing::info!(bot_id = %id, "bot added — exiting for systemd restart");
    schedule_restart();
    Outcome::ok(serde_json::json!({"ok": true, "id": id}))
}

fn update_bot(state: &State, id: &str, body: &str) -> Outcome {
    let p: BotPayload = match serde_json::from_str(body) {
        Ok(p) => p,
        Err(e) => return Outcome::bad(format!("invalid json: {e}")),
    };
    let mut new_cfg = state.config.read().unwrap().clone();
    let idx = match new_cfg.bots.iter().position(|b| b.id == id) {
        Some(i) => i,
        None => return Outcome::not_found("bot not found"),
    };
    let bot = &mut new_cfg.bots[idx];
    if let Some(t) = p.token { if t != "***" && !t.is_empty() { bot.token = t; } }
    if !p.allowed_chat_ids.is_empty() { bot.allowed_chat_ids = p.allowed_chat_ids; }
    if let Some(a) = p.apytti { if !a.is_empty() { bot.apytti = a; } }
    if p.backend.is_some() { bot.backend = p.backend; }
    if p.model.is_some() { bot.model = p.model; }
    if p.effort.is_some() { bot.effort = p.effort; }
    if p.dir.is_some() { bot.dir = p.dir; }
    if p.media_dir.is_some() { bot.media_dir = p.media_dir; }
    if p.session_id.is_some() { bot.session_id = p.session_id; }
    if p.parse_mode.is_some() { bot.parse_mode = p.parse_mode; }
    if p.verbosity.is_some() { bot.verbosity = p.verbosity; }

    if let Err(e) = new_cfg.save(&state.config_path) {
        return Outcome::server(format!("save failed: {e}"));
    }
    *state.config.write().unwrap() = new_cfg;
    tracing::info!(bot_id = %id, "bot updated — exiting for systemd restart");
    schedule_restart();
    Outcome::ok(serde_json::json!({"ok": true}))
}

fn delete_bot(state: &State, id: &str) -> Outcome {
    let mut new_cfg = state.config.read().unwrap().clone();
    let before = new_cfg.bots.len();
    new_cfg.bots.retain(|b| b.id != id);
    if new_cfg.bots.len() == before {
        return Outcome::not_found("bot not found");
    }
    if let Err(e) = new_cfg.save(&state.config_path) {
        return Outcome::server(format!("save failed: {e}"));
    }
    *state.config.write().unwrap() = new_cfg;
    tracing::info!(bot_id = %id, "bot deleted — exiting for systemd restart");
    schedule_restart();
    Outcome::ok(serde_json::json!({"ok": true}))
}

fn schedule_restart() {
    // Give the response time to flush, then exit. systemd Restart=always brings us back.
    std::thread::spawn(|| {
        std::thread::sleep(std::time::Duration::from_millis(250));
        std::process::exit(0);
    });
}

// --- response plumbing ---

struct Outcome {
    status: u16,
    body: serde_json::Value,
}
impl Outcome {
    fn ok(v: serde_json::Value) -> Self { Self { status: 200, body: v } }
    fn bad(m: impl Into<String>) -> Self { Self { status: 400, body: serde_json::json!({"error": m.into()}) } }
    fn not_found(m: impl Into<String>) -> Self { Self { status: 404, body: serde_json::json!({"error": m.into()}) } }
    fn conflict(m: impl Into<String>) -> Self { Self { status: 409, body: serde_json::json!({"error": m.into()}) } }
    fn server(m: impl Into<String>) -> Self { Self { status: 500, body: serde_json::json!({"error": m.into()}) } }
}

fn reply_outcome(req: Request, o: Outcome) -> anyhow::Result<()> {
    reply_json(req, o.status, &o.body)
}

fn reply_json(req: Request, status: u16, body: &serde_json::Value) -> anyhow::Result<()> {
    let json = serde_json::to_string(body)?;
    let resp = Response::from_string(json)
        .with_status_code(status)
        .with_header(Header::from_bytes(b"Content-Type".as_ref(), b"application/json".as_ref()).unwrap());
    req.respond(resp)?;
    Ok(())
}
