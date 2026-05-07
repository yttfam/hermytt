use std::path::Path;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub hermytt: HermyttConfig,
    #[serde(default, rename = "bots")]
    pub bots: Vec<BotConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HermyttConfig {
    /// Hermytt registry URL (e.g. http://localhost:7777).
    pub url: String,
    /// X-Hermytt-Key for the registry + proxy.
    pub token: String,
    /// Override the registered service name (default: pyttch-bridge-<hostname>).
    #[serde(default)]
    pub name: Option<String>,
    /// Override the announced endpoint (default: http://<hostname>:0 — we don't expose an HTTP control surface yet).
    #[serde(default)]
    pub endpoint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BotConfig {
    /// Friendly id for logs.
    pub id: String,
    /// Telegram bot token.
    pub token: String,
    /// Whitelist of chat_ids allowed to talk to this bot. Empty = closed (default).
    #[serde(default)]
    pub allowed_chat_ids: Vec<i64>,
    /// Service name in hermytt's registry to forward to (e.g. apytti-speedwagon).
    pub apytti: String,
    /// Optional backend override on each /api/ask call.
    #[serde(default)]
    pub backend: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub effort: Option<String>,
    /// Optional working dir override forwarded to apytti.
    #[serde(default)]
    pub dir: Option<String>,
    /// Where to save downloaded Telegram media (photos, files, voice, video).
    /// Defaults to /tmp/pyttch-bridge/{bot_id} when not set.
    #[serde(default)]
    pub media_dir: Option<String>,
    /// Optional apytti session_id to pin the conversation to. When set, every
    /// message goes to the same claude session — true conversational continuity.
    /// When None, each message is independent (apytti generates a new session).
    #[serde(default)]
    pub session_id: Option<String>,
    /// Telegram parse mode for replies. "Markdown", "MarkdownV2", "HTML", or null for plain.
    #[serde(default)]
    pub parse_mode: Option<String>,
    /// How verbose the live-edit status message is during claude's tool work.
    /// "minimal" | "kind" | "kind_and_arg" | "progressive". Default: "kind_and_arg".
    #[serde(default)]
    pub verbosity: Option<String>,
}

impl Config {
    pub fn save(&self, path: &Path) -> anyhow::Result<()> {
        let s = toml::to_string_pretty(self)
            .map_err(|e| anyhow::anyhow!("serialize config: {}", e))?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let tmp = path.with_extension("toml.tmp");
        std::fs::write(&tmp, s)?;
        std::fs::rename(&tmp, path)?;
        Ok(())
    }
}

impl Config {
    pub fn load(path: &Path) -> anyhow::Result<Self> {
        let s = std::fs::read_to_string(path)
            .map_err(|e| anyhow::anyhow!("read {}: {}", path.display(), e))?;
        let cfg: Config = toml::from_str(&s)
            .map_err(|e| anyhow::anyhow!("parse {}: {}", path.display(), e))?;
        Ok(cfg)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_minimal() {
        let s = r#"
[hermytt]
url = "http://localhost:7777"
token = "abc"

[[bots]]
id = "marianne"
token = "111:AAA"
allowed_chat_ids = [1089362604]
apytti = "apytti-speedwagon"
        "#;
        let cfg: Config = toml::from_str(s).unwrap();
        assert_eq!(cfg.bots.len(), 1);
        assert_eq!(cfg.bots[0].apytti, "apytti-speedwagon");
        assert_eq!(cfg.bots[0].allowed_chat_ids, vec![1089362604]);
    }

    #[test]
    fn closed_by_default() {
        let s = r#"
[hermytt]
url = "x"
token = "y"
[[bots]]
id = "a"
token = "t"
apytti = "z"
        "#;
        let cfg: Config = toml::from_str(s).unwrap();
        assert!(cfg.bots[0].allowed_chat_ids.is_empty());
    }
}
