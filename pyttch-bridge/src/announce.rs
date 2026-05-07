use std::thread;
use std::time::Duration;

use crate::config::HermyttConfig;

const HEARTBEAT: Duration = Duration::from_secs(15);

pub fn spawn(cfg: HermyttConfig, name: String, endpoint: String, version: String) {
    thread::spawn(move || {
        loop {
            match announce_once(&cfg, &name, &endpoint, &version) {
                Ok(status) => tracing::debug!(status, "announced to hermytt"),
                Err(e) => tracing::warn!("announce error: {}", e),
            }
            thread::sleep(HEARTBEAT);
        }
    });
}

fn announce_once(cfg: &HermyttConfig, name: &str, endpoint: &str, version: &str) -> anyhow::Result<u16> {
    let url = format!("{}/registry/announce", cfg.url.trim_end_matches('/'));
    let body = serde_json::json!({
        "name": name,
        "role": "messenger",
        "endpoint": endpoint,
        "version": version,
        "host": hostname::get().ok().and_then(|h| h.to_str().map(String::from)).unwrap_or_default(),
    });
    let resp = ureq::post(&url)
        .header("X-Hermytt-Key", &cfg.token)
        .header("Content-Type", "application/json")
        .send_json(body)?;
    Ok(resp.status().as_u16())
}
