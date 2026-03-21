use std::sync::Arc;

use anyhow::Result;
use async_trait::async_trait;
use hermytt_core::SessionManager;
use serde::{Deserialize, Serialize};
use tracing::{error, info, warn};

use crate::Transport;

const MAX_MESSAGE_LEN: usize = 4000;

pub struct TelegramTransport {
    pub bot_token: String,
    pub chat_ids: Vec<i64>,
}

#[async_trait]
impl Transport for TelegramTransport {
    async fn serve(self: Arc<Self>, _sessions: Arc<SessionManager>) -> Result<()> {
        let client = reqwest::Client::new();
        let base_url = format!("https://api.telegram.org/bot{}", self.bot_token);

        info!(transport = "telegram", "starting long poll");

        poll_loop(&client, &base_url, &self.chat_ids).await;

        Ok(())
    }

    fn name(&self) -> &str {
        "telegram"
    }
}

#[derive(Deserialize)]
struct TgResponse<T> {
    ok: bool,
    result: Option<T>,
}

#[derive(Deserialize)]
struct TgUpdate {
    update_id: i64,
    message: Option<TgMessage>,
}

#[derive(Deserialize)]
struct TgMessage {
    chat: TgChat,
    text: Option<String>,
}

#[derive(Deserialize)]
struct TgChat {
    id: i64,
}

#[derive(Serialize)]
struct SendMessageRequest<'a> {
    chat_id: i64,
    text: &'a str,
    parse_mode: Option<&'a str>,
}

async fn poll_loop(
    client: &reqwest::Client,
    base_url: &str,
    allowed_chats: &[i64],
) {
    let poll_url = format!("{}/getUpdates", base_url);
    let send_url = format!("{}/sendMessage", base_url);
    let mut offset: i64 = 0;

    loop {
        let resp = client
            .get(&poll_url)
            .query(&[
                ("offset", offset.to_string()),
                ("timeout", "30".to_string()),
            ])
            .send()
            .await;

        let updates: Vec<TgUpdate> = match resp {
            Ok(r) => match r.json::<TgResponse<Vec<TgUpdate>>>().await {
                Ok(tg) if tg.ok => tg.result.unwrap_or_default(),
                Ok(_) => {
                    warn!(transport = "telegram", "API returned ok=false");
                    tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                    continue;
                }
                Err(e) => {
                    error!(transport = "telegram", error = %e, "parse error");
                    tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                    continue;
                }
            },
            Err(e) => {
                error!(transport = "telegram", error = %e, "poll failed");
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                continue;
            }
        };

        for update in updates {
            offset = update.update_id + 1;

            let Some(msg) = update.message else { continue };
            let Some(text) = msg.text else { continue };
            let chat_id = msg.chat.id;

            if !allowed_chats.is_empty() && !allowed_chats.contains(&chat_id) {
                warn!(transport = "telegram", chat_id, "unauthorized chat");
                continue;
            }

            match text.as_str() {
                "/help" | "/start" => {
                    send_message(
                        client,
                        &send_url,
                        chat_id,
                        "hermytt — send any text to run as a shell command",
                    )
                    .await;
                    continue;
                }
                _ => {}
            }

            // Execute directly via sh -c.
            let shell = hermytt_core::platform::default_shell();
            let result = match hermytt_core::exec(&text, shell).await {
                Ok(r) => r,
                Err(e) => {
                    error!(transport = "telegram", error = %e, "exec failed");
                    send_message(client, &send_url, chat_id, &format!("error: {}", e)).await;
                    continue;
                }
            };

            let output = result.combined();

            if output.trim().is_empty() {
                let msg = if result.exit_code == 0 {
                    "(no output)".to_string()
                } else {
                    format!("(exit {})", result.exit_code)
                };
                send_message(client, &send_url, chat_id, &msg).await;
                continue;
            }

            let suffix = if result.exit_code != 0 {
                format!("\n(exit {})", result.exit_code)
            } else {
                String::new()
            };

            for chunk in chunk_message(&output) {
                let formatted = format!("```\n{}\n```{}", chunk.trim_end(), suffix);
                send_message(client, &send_url, chat_id, &formatted).await;
            }
        }
    }
}

async fn send_message(client: &reqwest::Client, url: &str, chat_id: i64, text: &str) {
    let req = SendMessageRequest {
        chat_id,
        text,
        parse_mode: Some("Markdown"),
    };
    if let Err(e) = client.post(url).json(&req).send().await {
        error!(transport = "telegram", error = %e, "send failed");
    }
}

fn chunk_message(text: &str) -> Vec<&str> {
    if text.len() <= MAX_MESSAGE_LEN {
        return vec![text];
    }

    let mut chunks = Vec::new();
    let mut remaining = text;

    while !remaining.is_empty() {
        if remaining.len() <= MAX_MESSAGE_LEN {
            chunks.push(remaining);
            break;
        }

        // M5 fix: safe UTF-8 boundary.
        let boundary = remaining.floor_char_boundary(MAX_MESSAGE_LEN);
        let split_at = remaining[..boundary]
            .rfind('\n')
            .map(|i| i + 1)
            .unwrap_or(boundary);

        chunks.push(&remaining[..split_at]);
        remaining = &remaining[split_at..];
    }

    chunks
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chunk_short_message() {
        assert_eq!(chunk_message("hello"), vec!["hello"]);
    }

    #[test]
    fn chunk_splits_on_newline() {
        let line = "x".repeat(3000);
        let text = format!("{}\n{}", line, line);
        let chunks = chunk_message(&text);
        assert_eq!(chunks.len(), 2);
        assert!(chunks.iter().all(|c| c.len() <= MAX_MESSAGE_LEN));
    }

    #[test]
    fn chunk_hard_split() {
        let text = "x".repeat(MAX_MESSAGE_LEN + 100);
        let chunks = chunk_message(&text);
        assert_eq!(chunks.len(), 2);
        assert_eq!(chunks[0].len(), MAX_MESSAGE_LEN);
    }
}
