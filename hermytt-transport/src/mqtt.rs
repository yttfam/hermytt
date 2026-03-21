use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context, Result};
use async_trait::async_trait;
use hermytt_core::SessionManager;
use rumqttc::{AsyncClient, EventLoop, MqttOptions, QoS};
use tracing::{error, info, warn};

use crate::Transport;

const BUFFER_WINDOW: Duration = Duration::from_millis(500);

pub struct MqttTransport {
    pub broker_host: String,
    pub broker_port: u16,
    pub username: Option<String>,
    pub password: Option<String>,
}

/// Parse an MQTT topic like `hermytt/{session_id}/in`.
/// Returns the session ID if valid, `None` otherwise.
/// Session IDs must be alphanumeric (or "default").
pub fn parse_input_topic(topic: &str) -> Option<&str> {
    let parts: Vec<&str> = topic.split('/').collect();
    if parts.len() != 3 || parts[0] != "hermytt" || parts[2] != "in" {
        return None;
    }
    let session_id = parts[1];
    if session_id == "default" || session_id.chars().all(|c| c.is_ascii_alphanumeric()) {
        Some(session_id)
    } else {
        None
    }
}

#[async_trait]
impl Transport for MqttTransport {
    async fn serve(self: Arc<Self>, sessions: Arc<SessionManager>) -> Result<()> {
        let client_id = format!("hermytt-{}", &uuid::Uuid::new_v4().to_string()[..8]);
        let mut opts = MqttOptions::new(&client_id, &self.broker_host, self.broker_port);
        opts.set_keep_alive(Duration::from_secs(30));

        if let (Some(user), Some(pass)) = (&self.username, &self.password) {
            opts.set_credentials(user, pass);
        }

        let (client, eventloop) = AsyncClient::new(opts, 64);

        client
            .subscribe("hermytt/+/in", QoS::AtMostOnce)
            .await
            .context("failed to subscribe to hermytt/+/in")?;

        info!(
            transport = "mqtt",
            broker = %format!("{}:{}", self.broker_host, self.broker_port),
            "connected"
        );

        let publish_client = client.clone();
        let publish_sessions = sessions.clone();
        tokio::spawn(async move {
            output_publisher(publish_client, publish_sessions).await;
        });

        input_listener(eventloop, sessions).await;

        Ok(())
    }

    fn name(&self) -> &str {
        "mqtt"
    }
}

async fn input_listener(mut eventloop: EventLoop, sessions: Arc<SessionManager>) {
    loop {
        match eventloop.poll().await {
            Ok(rumqttc::Event::Incoming(rumqttc::Packet::Publish(publish))) => {
                let Some(session_id) = parse_input_topic(&publish.topic) else {
                    continue;
                };

                let handle = if session_id == "default" {
                    sessions.default_session().await.ok()
                } else {
                    sessions.get_session(session_id).await
                };

                let Some(handle) = handle else {
                    warn!(topic = %publish.topic, "message for unknown session");
                    continue;
                };

                let mut input = publish.payload.to_vec();
                if !input.ends_with(b"\n") {
                    input.push(b'\n');
                }

                if let Err(e) = handle.stdin_tx.send(input).await {
                    error!(error = %e, "failed to send stdin");
                }
            }
            Ok(_) => {}
            Err(e) => {
                error!(error = %e, "mqtt connection error, retrying...");
                tokio::time::sleep(Duration::from_secs(5)).await;
            }
        }
    }
}

async fn output_publisher(client: AsyncClient, sessions: Arc<SessionManager>) {
    let mut known: std::collections::HashSet<String> = std::collections::HashSet::new();

    loop {
        let ids = sessions.list_sessions().await;
        for id in &ids {
            if known.contains(id) {
                continue;
            }
            known.insert(id.clone());

            let Some(handle) = sessions.get_session(id).await else {
                continue;
            };

            let client = client.clone();
            let session_id = id.clone();
            tokio::spawn(async move {
                let topic = format!("hermytt/{}/out", session_id);
                let mut output = handle.subscribe_buffered(BUFFER_WINDOW);

                while let Some(data) = output.recv().await {
                    let text = String::from_utf8_lossy(&data).to_string();
                    if let Err(e) = client.publish(&topic, QoS::AtMostOnce, false, text).await {
                        error!(error = %e, topic = %topic, "failed to publish");
                        break;
                    }
                }
            });
        }

        tokio::time::sleep(Duration::from_secs(2)).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_valid_topic() {
        assert_eq!(parse_input_topic("hermytt/abc123/in"), Some("abc123"));
    }

    #[test]
    fn parse_default_topic() {
        assert_eq!(parse_input_topic("hermytt/default/in"), Some("default"));
    }

    #[test]
    fn parse_rejects_wrong_prefix() {
        assert_eq!(parse_input_topic("other/abc123/in"), None);
    }

    #[test]
    fn parse_rejects_wrong_suffix() {
        assert_eq!(parse_input_topic("hermytt/abc123/out"), None);
    }

    #[test]
    fn parse_rejects_too_few_segments() {
        assert_eq!(parse_input_topic("hermytt/in"), None);
    }

    #[test]
    fn parse_rejects_too_many_segments() {
        assert_eq!(parse_input_topic("hermytt/a/b/in"), None);
    }

    #[test]
    fn parse_rejects_traversal() {
        assert_eq!(parse_input_topic("hermytt/../../in"), None);
    }

    #[test]
    fn parse_rejects_special_chars() {
        assert_eq!(parse_input_topic("hermytt/abc+def/in"), None);
        assert_eq!(parse_input_topic("hermytt/abc#def/in"), None);
        assert_eq!(parse_input_topic("hermytt/../in"), None);
    }
}
