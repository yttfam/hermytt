use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;

use base64::Engine;
use pyttch::{Listener, Message, Content, ParseMode};
use serde::{Deserialize, Serialize};

use crate::config::{BotConfig, HermyttConfig};

/// Per apytti's contract: each entry must have exactly one of `path` or `data`.
/// We use `data` (base64) since bridge and apytti can be on different hosts.
#[derive(Serialize, Default)]
struct Attachment {
    data: String,
    kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AskResponse {
    #[serde(default)]
    response: String,
    #[serde(default)]
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct KillResponse {
    #[serde(default)]
    killed: u32,
}

/// Per-chat in-flight ask metadata. Lets /kill cancel precisely the right
/// (backend, session_id) on apytti without affecting other chats.
#[derive(Clone, Debug)]
struct InFlight {
    session_id: Option<String>,
    backend: String,
}

type InFlightSlot = Arc<std::sync::Mutex<Option<InFlight>>>;

/// Pyttch's Listener filters by chat_id at construction. Spawn one thread per (bot, chat_id) pair.
pub fn spawn(bot: BotConfig, hermytt: HermyttConfig) {
    if bot.allowed_chat_ids.is_empty() {
        tracing::warn!(bot = %bot.id, "no allowed_chat_ids — bot is closed, skipping");
        return;
    }
    for &chat_id in &bot.allowed_chat_ids {
        let bot = bot.clone();
        let hermytt = hermytt.clone();
        thread::spawn(move || {
            loop {
                if let Err(e) = run(&bot, &hermytt, chat_id) {
                    tracing::error!(bot = %bot.id, chat_id, "loop crashed: {} — restart in 5s", e);
                    thread::sleep(Duration::from_secs(5));
                }
            }
        });
    }
}

fn run(bot: &BotConfig, hermytt: &HermyttConfig, chat_id: i64) -> anyhow::Result<()> {
    let mut listener = Listener::new(&bot.token, chat_id);
    let in_flight: InFlightSlot = Arc::new(std::sync::Mutex::new(None));
    tracing::info!(bot = %bot.id, chat_id, apytti = %bot.apytti, "listener up");
    loop {
        match listener.poll() {
            Ok(messages) => {
                for msg in messages {
                    let raw_text = msg.text_or_caption().unwrap_or("").trim().to_string();

                    // Slash commands always pass — even mid-flight (especially /kill).
                    if raw_text.starts_with("/killall") {
                        handle_killall(bot, hermytt, msg.chat_id);
                        continue;
                    }
                    if raw_text.starts_with("/kill") {
                        handle_kill(bot, hermytt, &in_flight, msg.chat_id);
                        continue;
                    }

                    // If a previous ask is still streaming, drop the new message
                    // instead of stacking handler threads. The user gets a clear
                    // hint and can /kill if they want to take over.
                    if in_flight.lock().unwrap().is_some() {
                        tracing::info!(bot = %bot.id, chat_id = msg.chat_id, "dropped — transaction in progress");
                        let _ = pyttch::send(
                            &bot.token,
                            msg.chat_id,
                            "message dropped — transaction in progress (send /kill to abort)",
                        );
                        continue;
                    }

                    // Hand off to a fresh thread so the listener stays free to
                    // receive /kill while this ask is in flight.
                    let bot_c = bot.clone();
                    let hermytt_c = hermytt.clone();
                    let slot = in_flight.clone();
                    thread::spawn(move || {
                        let backend = bot_c.backend.clone().unwrap_or_else(|| "claude".into());
                        *slot.lock().unwrap() = Some(InFlight {
                            session_id: bot_c.session_id.clone(),
                            backend,
                        });
                        handle_message(&bot_c, &hermytt_c, msg);
                        *slot.lock().unwrap() = None;
                    });
                }
            }
            Err(e) => {
                tracing::warn!(bot = %bot.id, chat_id, "poll error: {} — sleeping 10s", e);
                thread::sleep(Duration::from_secs(10));
            }
        }
    }
}

fn handle_killall(bot: &BotConfig, hermytt: &HermyttConfig, chat_id: i64) {
    let url = format!(
        "{}/registry/{}/proxy/api/ask",
        hermytt.url.trim_end_matches('/'),
        urlencode(&bot.apytti)
    );
    let result = ureq::delete(&url)
        .header("X-Hermytt-Key", &hermytt.token)
        .call();
    let reply = match result {
        Ok(mut resp) => {
            let killed = resp.body_mut().read_json::<KillResponse>().map(|r| r.killed).unwrap_or(0);
            format!("✗ killed {killed} ask{} on {}", if killed == 1 { "" } else { "s" }, bot.apytti)
        }
        Err(e) => format!("kill failed: {e}"),
    };
    let _ = pyttch::send(&bot.token, chat_id, &reply);
}

fn handle_kill(bot: &BotConfig, hermytt: &HermyttConfig, in_flight: &InFlightSlot, chat_id: i64) {
    let info = in_flight.lock().unwrap().clone();
    let Some(info) = info else {
        let _ = pyttch::send(&bot.token, chat_id, "(nothing in flight)");
        return;
    };
    let Some(sid) = info.session_id else {
        // Sessionless ask — apytti can't match by session, recommend /killall.
        let _ = pyttch::send(&bot.token, chat_id, "(no session pinned for this chat — use /killall to abort everything on this machine)");
        return;
    };
    let url = format!(
        "{}/registry/{}/proxy/backends/{}/sessions/{}/cancel",
        hermytt.url.trim_end_matches('/'),
        urlencode(&bot.apytti),
        urlencode(&info.backend),
        urlencode(&sid),
    );
    let result = ureq::post(&url)
        .header("X-Hermytt-Key", &hermytt.token)
        .send_empty();
    let reply = match result {
        Ok(mut resp) => {
            let killed = resp.body_mut().read_json::<KillResponse>().map(|r| r.killed).unwrap_or(0);
            if killed == 0 {
                "(nothing was in flight to kill)".to_string()
            } else {
                format!("✗ killed {killed} ask{}", if killed == 1 { "" } else { "s" })
            }
        }
        Err(e) => format!("kill failed: {e}"),
    };
    let _ = pyttch::send(&bot.token, chat_id, &reply);
}

fn handle_message(bot: &BotConfig, hermytt: &HermyttConfig, msg: Message) {
    let Some((text, attachments)) = prepare_payload(bot, &msg) else {
        let kind = match &msg.content {
            Content::Text(_) => "text",
            Content::Photo { .. } => "photo",
            Content::Document { .. } => "document",
            Content::Sticker { .. } => "sticker",
            Content::Voice { .. } => "voice",
            Content::Video { .. } => "video",
            Content::CallbackQuery { .. } => "callback",
            Content::Other => "other",
        };
        tracing::debug!(bot = %bot.id, chat_id = msg.chat_id, kind, "ignored");
        return;
    };
    let preview: String = text.chars().take(80).collect();
    let verbosity = crate::status::Verbosity::parse(bot.verbosity.as_deref());
    tracing::info!(bot = %bot.id, chat_id = msg.chat_id, attachments = attachments.len(), ?verbosity, "→ apytti: {}", preview);

    // Send the initial "🔧 thinking…" status message; the bg updater edits it as
    // tool_use/tool_result SSE events arrive from apytti. On done, finalize() either
    // edits status into the final response (if it fits in one Telegram message) or
    // splits the response across paragraph boundaries.
    let status = match crate::status::start(&bot.token, msg.chat_id, verbosity) {
        Ok(h) => Some(h),
        Err(e) => {
            tracing::warn!(bot = %bot.id, "status init failed: {}", e);
            None
        }
    };

    // Always run the typing pinger alongside the status message — they target
    // different Telegram surfaces (the chat-list "typing…" dots vs the visible
    // status text), and the dots reassure the user the bot's still alive even
    // when the status text hasn't morphed in the last second.
    let pinger_alive = Arc::new(AtomicBool::new(true));
    spawn_typing_pinger(&bot.token, msg.chat_id, pinger_alive.clone());

    let result = forward_streaming(bot, hermytt, &text, &attachments, status.as_ref());
    pinger_alive.store(false, Ordering::SeqCst);

    let parse_mode = bot.parse_mode.as_deref().and_then(parse_mode);
    match result {
        Ok(reply) => {
            if let Some(s) = status {
                if let Err(e) = s.finalize(&bot.token, msg.chat_id, &reply, parse_mode) {
                    tracing::warn!(bot = %bot.id, "status finalize: {}", e);
                }
            } else {
                if let Err(e) = send_reply(bot, msg.chat_id, &reply) {
                    tracing::error!(bot = %bot.id, "telegram send failed: {}", e);
                }
            }
        }
        Err(e) => {
            tracing::error!(bot = %bot.id, "apytti call failed: {}", e);
            let err_text = format!("(brain unreachable: {})", e);
            if let Some(s) = status {
                let _ = s.finalize(&bot.token, msg.chat_id, &err_text, None);
            } else {
                let _ = send_reply(bot, msg.chat_id, &err_text);
            }
        }
    }
}

/// Build the (prompt, attachments) pair to forward to apytti.
/// For media messages, downloads the bytes to disk and lets apytti own the prompt
/// formatting via her `attachments[]` contract — bridge no longer munges the prompt.
fn prepare_payload(bot: &BotConfig, msg: &Message) -> Option<(String, Vec<Attachment>)> {
    let caption = msg.text_or_caption().map(String::from).unwrap_or_default();
    match &msg.content {
        Content::Text(t) => Some((t.clone(), vec![])),
        Content::Sticker { emoji, .. } => {
            // Stickers are decorative — describe inline rather than download.
            Some((format!("[sticker: {}]", emoji.as_deref().unwrap_or("?")), vec![]))
        }
        Content::Photo { file_id, .. }
        | Content::Document { file_id, .. }
        | Content::Voice { file_id, .. }
        | Content::Video { file_id, .. } => {
            let kind: &'static str = match &msg.content {
                Content::Photo { .. } => "image",
                Content::Document { .. } => "document",
                Content::Voice { .. } => "voice",
                Content::Video { .. } => "video",
                _ => "document",
            };
            let original_name = if let Content::Document { file_name: Some(n), .. } = &msg.content { Some(n.clone()) } else { None };
            let ext = original_name.as_deref()
                .and_then(|n| std::path::Path::new(n).extension().and_then(|e| e.to_str()).map(String::from))
                .unwrap_or_else(|| match &msg.content {
                    Content::Photo { .. } => "jpg".into(),
                    Content::Voice { .. } => "ogg".into(),
                    Content::Video { .. } => "mp4".into(),
                    _ => "bin".into(),
                });
            match download_bytes(&bot.token, file_id) {
                Ok(bytes) => {
                    // Also persist locally for ops/debugging — apytti gets the bytes via base64.
                    let _ = save_locally(bot, msg, &bytes, &ext);
                    let attachment = Attachment {
                        data: base64::engine::general_purpose::STANDARD.encode(&bytes),
                        kind,
                        name: original_name.or_else(|| Some(format!("{}_{}.{ext}", msg.date, file_id_tail(file_id)))),
                    };
                    // Apytti requires a non-empty prompt. When the user sent a bare attachment
                    // with no caption, fall back to a kind-appropriate default.
                    let prompt = if caption.is_empty() {
                        match kind {
                            "image" => "What's in this image?",
                            "document" => "What's in this document?",
                            "voice" => "Transcribe this voice note.",
                            "video" => "Describe this video.",
                            _ => "What is this?",
                        }.to_string()
                    } else {
                        caption
                    };
                    Some((prompt, vec![attachment]))
                }
                Err(e) => {
                    tracing::warn!(bot = %bot.id, "{} download failed: {}", kind, e);
                    let prompt = if caption.is_empty() {
                        format!("[user attached {kind} but download failed: {e}]")
                    } else {
                        format!("[attachment download failed: {e}]\n{caption}")
                    };
                    Some((prompt, vec![]))
                }
            }
        }
        Content::CallbackQuery { .. } | Content::Other => None,
    }
}

fn download_bytes(token: &str, file_id: &str) -> anyhow::Result<Vec<u8>> {
    Ok(pyttch::download_file(token, file_id)?)
}

fn file_id_tail(file_id: &str) -> String {
    file_id.chars().rev().take(12).collect::<String>().chars().rev().collect()
}

/// Best-effort local persistence for ops/debugging — failures here are non-fatal,
/// the actual transport is the base64 in the API call.
fn save_locally(bot: &BotConfig, msg: &Message, bytes: &[u8], ext: &str) -> anyhow::Result<PathBuf> {
    let dir = bot.media_dir
        .clone()
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(format!("/tmp/pyttch-bridge/{}", bot.id)));
    std::fs::create_dir_all(&dir)?;
    let path = dir.join(format!("{}_{}.{ext}", msg.date, file_id_tail("")));
    std::fs::write(&path, bytes)?;
    Ok(path)
}

fn spawn_typing_pinger(token: &str, chat_id: i64, alive: Arc<AtomicBool>) -> thread::JoinHandle<()> {
    let token = token.to_string();
    thread::spawn(move || {
        // Fire one immediately so the indicator shows up before the user wonders if anything's happening.
        let _ = pyttch::send_typing(&token, chat_id);
        // Then re-fire every ~4s while the work is still in flight.
        while alive.load(Ordering::SeqCst) {
            // Short sleeps so we react quickly when alive flips.
            for _ in 0..40 {
                if !alive.load(Ordering::SeqCst) { return; }
                thread::sleep(Duration::from_millis(100));
            }
            if !alive.load(Ordering::SeqCst) { return; }
            let _ = pyttch::send_typing(&token, chat_id);
        }
    })
}

/// Stream from apytti's SSE `/api/ask?stream=true`, dispatch tool_use/tool_result
/// events to the status updater, and return the final response text from the `done` event.
/// Falls back to one-shot JSON parsing if the response isn't an event-stream (older apytti).
fn forward_streaming(
    bot: &BotConfig,
    hermytt: &HermyttConfig,
    prompt: &str,
    attachments: &[Attachment],
    status: Option<&crate::status::StatusHandle>,
) -> anyhow::Result<String> {
    use std::io::{BufRead, BufReader};

    let url = format!(
        "{}/registry/{}/proxy/api/ask",
        hermytt.url.trim_end_matches('/'),
        urlencode(&bot.apytti)
    );
    let body = build_ask_body(bot, prompt, attachments, /*stream*/ true);
    let mut resp = ureq::post(&url)
        .header("X-Hermytt-Key", &hermytt.token)
        .header("Content-Type", "application/json")
        .send_json(body)?;

    let content_type = resp.headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    if !content_type.contains("event-stream") {
        // Non-streaming response (old apytti or proxy that didn't preserve content-type).
        let parsed: AskResponse = resp.body_mut().read_json()?;
        if let Some(err) = parsed.error { anyhow::bail!("apytti error: {}", err); }
        return Ok(parsed.response);
    }

    let reader = BufReader::new(resp.body_mut().as_reader());
    let mut event = String::new();
    let mut data = String::new();
    let mut final_response = String::new();
    let mut got_done = false;

    for line in reader.lines() {
        let line = match line { Ok(l) => l, Err(_) => continue };
        if line.is_empty() {
            if !data.is_empty() {
                handle_sse_event(&event, &data, status, &mut final_response, &mut got_done);
                event.clear();
                data.clear();
            }
            if got_done { break; }
            continue;
        }
        if let Some(rest) = line.strip_prefix("event:") {
            event = rest.trim().to_string();
        } else if let Some(rest) = line.strip_prefix("data:") {
            if !data.is_empty() { data.push('\n'); }
            data.push_str(rest.trim_start_matches(' '));
        }
    }

    if !got_done {
        anyhow::bail!("stream ended without a done event");
    }
    Ok(final_response)
}

fn handle_sse_event(
    event: &str,
    data: &str,
    status: Option<&crate::status::StatusHandle>,
    final_response: &mut String,
    got_done: &mut bool,
) {
    let val: serde_json::Value = match serde_json::from_str(data) {
        Ok(v) => v,
        Err(_) => return,
    };
    match event {
        "tool_use" => {
            let name = val.get("name").and_then(|v| v.as_str()).unwrap_or("?").to_string();
            let arg = val.get("input_summary").and_then(|v| v.as_str()).unwrap_or("").to_string();
            tracing::info!(tool = %name, arg = %arg, "sse: tool_use");
            if let Some(s) = status {
                s.on_tool_use(name, arg);
            }
        }
        "tool_result" => {
            let name = val.get("name").and_then(|v| v.as_str()).unwrap_or("?").to_string();
            tracing::info!(tool = %name, "sse: tool_result");
            if let Some(s) = status {
                s.on_tool_result(name);
            }
        }
        "delta" => {
            // Per apytti's contract, delta is for the visible reply text. We don't render
            // partial text into Telegram (that's what status edits are for) — we wait for done.
        }
        "done" => {
            *got_done = true;
            if let Some(r) = val.get("response").and_then(|v| v.as_str()) {
                *final_response = r.to_string();
            }
            if let Some(err) = val.get("error").and_then(|v| v.as_str()) {
                if !err.is_empty() {
                    *final_response = format!("[error] {err}");
                }
            }
        }
        "error" => {
            *got_done = true;
            let err = val.get("error").and_then(|v| v.as_str()).unwrap_or("upstream error");
            *final_response = format!("[error] {err}");
        }
        _ => {}
    }
}

fn build_ask_body(bot: &BotConfig, prompt: &str, attachments: &[Attachment], stream: bool) -> serde_json::Value {
    let mut body = serde_json::json!({ "prompt": prompt });
    if stream { body["stream"] = serde_json::Value::Bool(true); }
    if !attachments.is_empty() {
        body["attachments"] = serde_json::to_value(attachments).unwrap_or_else(|_| serde_json::Value::Array(vec![]));
    }
    if let Some(b) = &bot.backend { body["backend"] = serde_json::Value::String(b.clone()); }
    if let Some(m) = &bot.model { body["model"] = serde_json::Value::String(m.clone()); }
    if let Some(e) = &bot.effort { body["effort"] = serde_json::Value::String(e.clone()); }
    if let Some(d) = &bot.dir { body["dir"] = serde_json::Value::String(d.clone()); }
    if let Some(s) = &bot.session_id { body["session_id"] = serde_json::Value::String(s.clone()); }
    body
}


fn send_reply(bot: &BotConfig, chat_id: i64, text: &str) -> anyhow::Result<()> {
    // Telegram has a 4096-char message limit. Truncate noisily rather than fail silently.
    let payload = if text.chars().count() > 4000 {
        let truncated: String = text.chars().take(4000).collect();
        format!("{truncated}\n\n... (truncated)")
    } else {
        text.to_string()
    };
    if let Some(mode) = bot.parse_mode.as_deref().and_then(parse_mode) {
        pyttch::send_with_parse_mode(&bot.token, chat_id, &payload, mode)?;
    } else {
        pyttch::send(&bot.token, chat_id, &payload)?;
    }
    Ok(())
}

fn parse_mode(s: &str) -> Option<ParseMode> {
    match s.to_ascii_lowercase().as_str() {
        "html" => Some(ParseMode::Html),
        "markdown" => Some(ParseMode::Markdown),
        "markdownv2" => Some(ParseMode::MarkdownV2),
        _ => None,
    }
}

fn urlencode(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => (b as char).to_string(),
            _ => format!("%{:02X}", b),
        })
        .collect()
}
