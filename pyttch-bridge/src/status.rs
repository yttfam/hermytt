//! Live-edit status message: sends an initial "🔧 thinking..." to Telegram, captures
//! the message_id, then debounces edits as apytti emits tool_use / tool_result SSE events.
//! On done, edits the message into the final response (if it fits) or splits across
//! paragraphs and leaves the status as a "✓ done" trailer.

use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use pyttch::ParseMode;

const EDIT_DEBOUNCE: Duration = Duration::from_millis(1000);
const TELEGRAM_MAX: usize = 4000; // 4096 with headroom for safety

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Verbosity {
    Minimal,
    Kind,
    KindAndArg,
    Progressive,
}

impl Verbosity {
    pub fn parse(s: Option<&str>) -> Self {
        match s.unwrap_or("kind_and_arg") {
            "minimal" => Self::Minimal,
            "kind" => Self::Kind,
            "progressive" => Self::Progressive,
            _ => Self::KindAndArg,
        }
    }
}

#[derive(Default)]
pub struct ProgressState {
    pub completed: VecDeque<(String, String)>, // (name, input_summary)
    pub current: Option<(String, String)>,
}

impl ProgressState {
    pub fn render(&self, v: Verbosity) -> String {
        // Continuity matters: when a tool finishes (current → None) and another hasn't
        // started yet, show the most recently-completed tool with ✓ instead of resetting
        // to "thinking". Otherwise fast tool sequences flicker back to "thinking" and the
        // user thinks the bot stalled.
        match v {
            Verbosity::Minimal => "🔧 thinking…".into(),
            Verbosity::Kind => {
                if let Some((n, _)) = &self.current {
                    format!("🔧 {n}…")
                } else if let Some((n, _)) = self.completed.back() {
                    format!("✓ {n}")
                } else {
                    "🔧 thinking…".into()
                }
            }
            Verbosity::KindAndArg => {
                if let Some((n, a)) = &self.current {
                    if a.is_empty() { format!("🔧 {n}…") }
                    else { format!("🔧 {n}: {}…", clip(a, 60)) }
                } else if let Some((n, a)) = self.completed.back() {
                    if a.is_empty() { format!("✓ {n}") }
                    else { format!("✓ {n}: {}", clip(a, 60)) }
                } else {
                    "🔧 thinking…".into()
                }
            }
            Verbosity::Progressive => {
                let mut s = String::new();
                // Cap completed list to last 20 to stay under telegram limits.
                let skip = self.completed.len().saturating_sub(20);
                for (n, a) in self.completed.iter().skip(skip) {
                    if a.is_empty() {
                        s.push_str(&format!("✓ {n}\n"));
                    } else {
                        s.push_str(&format!("✓ {n}: {}\n", clip(a, 50)));
                    }
                }
                if let Some((n, a)) = &self.current {
                    if a.is_empty() {
                        s.push_str(&format!("🔧 {n}…"));
                    } else {
                        s.push_str(&format!("🔧 {n}: {}…", clip(a, 50)));
                    }
                } else if s.is_empty() {
                    s = "🔧 thinking…".into();
                } else {
                    s = s.trim_end().to_string();
                }
                s
            }
        }
    }
}

fn clip(s: &str, max: usize) -> String {
    if s.chars().count() <= max { s.to_string() }
    else { format!("{}…", s.chars().take(max).collect::<String>()) }
}

pub struct StatusHandle {
    pub message_id: i64,
    pub state: Arc<Mutex<ProgressState>>,
    pub last_text: Arc<Mutex<String>>,
    pub alive: Arc<AtomicBool>,
    pub verbosity: Verbosity,
}

/// Send the initial status message and start the background updater thread.
pub fn start(token: &str, chat_id: i64, verbosity: Verbosity) -> anyhow::Result<StatusHandle> {
    let initial = "🔧 thinking…";
    let message_id = pyttch::send_returning_id(token, chat_id, initial)?;
    let state = Arc::new(Mutex::new(ProgressState::default()));
    let last_text = Arc::new(Mutex::new(initial.to_string()));
    let alive = Arc::new(AtomicBool::new(true));

    spawn_updater(token.to_string(), chat_id, message_id, state.clone(), last_text.clone(), alive.clone(), verbosity);

    Ok(StatusHandle { message_id, state, last_text, alive, verbosity })
}

fn spawn_updater(
    token: String,
    chat_id: i64,
    message_id: i64,
    state: Arc<Mutex<ProgressState>>,
    last_text: Arc<Mutex<String>>,
    alive: Arc<AtomicBool>,
    verbosity: Verbosity,
) {
    thread::spawn(move || {
        let mut last_edit = Instant::now() - EDIT_DEBOUNCE;
        while alive.load(Ordering::SeqCst) {
            thread::sleep(Duration::from_millis(150));
            if !alive.load(Ordering::SeqCst) { return; }
            let now = Instant::now();
            if now.duration_since(last_edit) < EDIT_DEBOUNCE { continue; }

            let desired = state.lock().unwrap().render(verbosity);
            let current = last_text.lock().unwrap().clone();
            if desired == current { continue; }

            match pyttch::edit_message(&token, chat_id, message_id, &desired) {
                Ok(()) => {
                    *last_text.lock().unwrap() = desired;
                    last_edit = now;
                }
                Err(e) => {
                    let s = e.to_string();
                    if s.contains("retry_after") || s.contains("Too Many Requests") {
                        // Telegram is asking us to slow down — give it a full second.
                        last_edit = now + Duration::from_secs(1);
                    } else if s.contains("message is not modified") {
                        // Telegram refused because text identical; cache it as last_text.
                        *last_text.lock().unwrap() = desired;
                        last_edit = now;
                    } else {
                        tracing::debug!("status edit failed: {}", e);
                        last_edit = now;
                    }
                }
            }
        }
    });
}

impl StatusHandle {
    pub fn on_tool_use(&self, name: String, input_summary: String) {
        let mut s = self.state.lock().unwrap();
        // Move any in-flight tool to completed (claude can fire tool_use without intervening tool_result).
        if let Some(prev) = s.current.take() {
            s.completed.push_back(prev);
        }
        s.current = Some((name, input_summary));
    }

    pub fn on_tool_result(&self, _name: String) {
        let mut s = self.state.lock().unwrap();
        if let Some(t) = s.current.take() {
            s.completed.push_back(t);
        }
    }

    /// Stop the background updater and edit the message into the final response.
    /// Returns extra messages (split chunks) the caller should send if response > limit.
    pub fn finalize(self, token: &str, chat_id: i64, response: &str, parse_mode: Option<ParseMode>) -> anyhow::Result<()> {
        self.alive.store(false, Ordering::SeqCst);

        if response.is_empty() {
            // Nothing useful — replace status with a placeholder.
            let _ = pyttch::edit_message(token, chat_id, self.message_id, "(empty response)");
            return Ok(());
        }

        if response.chars().count() <= TELEGRAM_MAX {
            // Fits in one message — edit status into it.
            let r = match parse_mode {
                Some(pm) => pyttch::edit_message_with_parse_mode(token, chat_id, self.message_id, response, pm),
                None => pyttch::edit_message(token, chat_id, self.message_id, response),
            };
            if let Err(e) = r {
                // Edit failed (e.g. invalid markup) — fall back to plain edit + new message.
                let _ = pyttch::edit_message(token, chat_id, self.message_id, "✓ done");
                send_split(token, chat_id, response, parse_mode)?;
                return Err(e);
            }
            return Ok(());
        }

        // Long response — leave status as "✓ done" and send the body in chunks.
        let _ = pyttch::edit_message(token, chat_id, self.message_id, "✓ done");
        send_split(token, chat_id, response, parse_mode)
    }
}

fn send_split(token: &str, chat_id: i64, text: &str, parse_mode: Option<ParseMode>) -> anyhow::Result<()> {
    for chunk in split_response(text, TELEGRAM_MAX) {
        match parse_mode {
            Some(pm) => pyttch::send_with_parse_mode(token, chat_id, &chunk, pm)?,
            None => pyttch::send(token, chat_id, &chunk)?,
        }
        // Small pause between chunks to respect Telegram's per-chat rate.
        thread::sleep(Duration::from_millis(300));
    }
    Ok(())
}

/// Split text into chunks <= `max` chars, preferring boundaries at `\n\n` (paragraph),
/// then `\n` (line), and finally hard-cutting if a line itself is too long.
fn split_response(text: &str, max: usize) -> Vec<String> {
    let mut chunks: Vec<String> = Vec::new();
    let mut current = String::new();

    for paragraph in text.split("\n\n") {
        let para = paragraph.trim_end_matches('\n');
        let separator = if current.is_empty() { "" } else { "\n\n" };
        if current.chars().count() + separator.len() + para.chars().count() <= max {
            current.push_str(separator);
            current.push_str(para);
            continue;
        }
        if !current.is_empty() {
            chunks.push(std::mem::take(&mut current));
        }
        if para.chars().count() <= max {
            current = para.to_string();
            continue;
        }
        // Single paragraph too big — split by lines, and finally by chars if a line is also too big.
        for line in para.split('\n') {
            let sep = if current.is_empty() { "" } else { "\n" };
            if current.chars().count() + sep.len() + line.chars().count() <= max {
                current.push_str(sep);
                current.push_str(line);
                continue;
            }
            if !current.is_empty() {
                chunks.push(std::mem::take(&mut current));
            }
            if line.chars().count() <= max {
                current = line.to_string();
            } else {
                // Hard cut by chars.
                let mut buf = String::new();
                for c in line.chars() {
                    if buf.chars().count() == max {
                        chunks.push(std::mem::take(&mut buf));
                    }
                    buf.push(c);
                }
                current = buf;
            }
        }
    }
    if !current.is_empty() {
        chunks.push(current);
    }
    chunks
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn split_short_passthrough() {
        let out = split_response("hello", 100);
        assert_eq!(out, vec!["hello"]);
    }

    #[test]
    fn split_paragraph_boundary() {
        let s = "para one\n\npara two\n\npara three";
        let out = split_response(s, 12);
        assert_eq!(out, vec!["para one", "para two", "para three"]);
    }

    #[test]
    fn split_packs_paragraphs() {
        let s = "aa\n\nbb\n\ncc\n\ndd";
        let out = split_response(s, 8);
        // "aa\n\nbb" = 6 chars, fits. Then "cc\n\ndd" = 6 chars.
        assert_eq!(out, vec!["aa\n\nbb", "cc\n\ndd"]);
    }

    #[test]
    fn split_huge_line_hard_cut() {
        let s = "x".repeat(250);
        let out = split_response(&s, 100);
        assert_eq!(out.len(), 3);
        assert_eq!(out[0].len(), 100);
        assert_eq!(out[1].len(), 100);
        assert_eq!(out[2].len(), 50);
    }

    #[test]
    fn verbosity_parse() {
        assert_eq!(Verbosity::parse(Some("minimal")), Verbosity::Minimal);
        assert_eq!(Verbosity::parse(Some("kind")), Verbosity::Kind);
        assert_eq!(Verbosity::parse(None), Verbosity::KindAndArg);
        assert_eq!(Verbosity::parse(Some("garbage")), Verbosity::KindAndArg);
    }

    #[test]
    fn progress_render_minimal() {
        let p = ProgressState::default();
        assert_eq!(p.render(Verbosity::Minimal), "🔧 thinking…");
    }

    #[test]
    fn progress_render_kind() {
        let mut p = ProgressState::default();
        p.current = Some(("Bash".into(), "ls".into()));
        assert_eq!(p.render(Verbosity::Kind), "🔧 Bash…");
        assert_eq!(p.render(Verbosity::KindAndArg), "🔧 Bash: ls…");
    }

    #[test]
    fn progress_render_progressive() {
        let mut p = ProgressState::default();
        p.completed.push_back(("Read".into(), "kitchen.jpg".into()));
        p.completed.push_back(("Bash".into(), "ls".into()));
        p.current = Some(("Edit".into(), "lease.pdf".into()));
        let s = p.render(Verbosity::Progressive);
        assert!(s.contains("✓ Read: kitchen.jpg"));
        assert!(s.contains("✓ Bash: ls"));
        assert!(s.contains("🔧 Edit: lease.pdf…"));
    }
}
