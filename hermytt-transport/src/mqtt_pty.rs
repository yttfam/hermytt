use std::collections::HashSet;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context, Result};
use async_trait::async_trait;
use hermytt_core::session::PTY_EXIT_SENTINEL;
use hermytt_core::SessionManager;
use rumqttc::{AsyncClient, EventLoop, MqttOptions, QoS};
use tokio::sync::mpsc;
use tracing::{error, info, warn};

use crate::Transport;

pub struct MqttPtyTransport {
    pub broker_host: String,
    pub broker_port: u16,
    pub username: Option<String>,
    pub password: Option<String>,
    pub buffer_ms: u64,
}

/// Parse `hermytt/{session_id}/pty/in` topics.
fn parse_pty_input_topic(topic: &str) -> Option<&str> {
    let parts: Vec<&str> = topic.split('/').collect();
    if parts.len() != 4 || parts[0] != "hermytt" || parts[2] != "pty" || parts[3] != "in" {
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
impl Transport for MqttPtyTransport {
    async fn serve(self: Arc<Self>, sessions: Arc<SessionManager>) -> Result<()> {
        let client_id = format!("hermytt-pty-{}", &uuid::Uuid::new_v4().to_string()[..8]);
        let mut opts = MqttOptions::new(&client_id, &self.broker_host, self.broker_port);
        opts.set_keep_alive(Duration::from_secs(30));

        if let (Some(user), Some(pass)) = (&self.username, &self.password) {
            opts.set_credentials(user, pass);
        }

        let (client, eventloop) = AsyncClient::new(opts, 256);

        client
            .subscribe("hermytt/+/pty/in", QoS::AtMostOnce)
            .await
            .context("failed to subscribe to hermytt/+/pty/in")?;

        info!(
            transport = "mqtt-pty",
            broker = %format!("{}:{}", self.broker_host, self.broker_port),
            buffer_ms = self.buffer_ms,
            "connected"
        );

        let buffer_window = Duration::from_millis(self.buffer_ms);

        // Channel for routing incoming pty/in messages to session stdin.
        let (input_tx, mut input_rx) = mpsc::channel::<(String, Vec<u8>)>(256);

        // Spawn eventloop poller.
        let client_reconnect = client.clone();
        tokio::spawn(async move {
            poll_eventloop(eventloop, client_reconnect, input_tx).await;
        });

        // Spawn input router: receives (session_id, data) and sends to session stdin.
        let sessions_for_input = sessions.clone();
        tokio::spawn(async move {
            while let Some((session_id, data)) = input_rx.recv().await {
                let handle = if session_id == "default" {
                    sessions_for_input.default_session().await.ok()
                } else {
                    sessions_for_input.get_session(&session_id).await
                };
                if let Some(handle) = handle {
                    if handle.stdin_tx.send(data).await.is_err() {
                        warn!(transport = "mqtt-pty", session = %session_id, "stdin closed");
                    }
                }
            }
        });

        // Auto-attach loop: poll for sessions, attach output forwarders to new ones.
        let mut attached: HashSet<String> = HashSet::new();
        loop {
            let current_ids = sessions.list_sessions().await;
            for session_id in &current_ids {
                if attached.contains(session_id) {
                    continue;
                }
                let Some(handle) = sessions.get_session(session_id).await else {
                    continue;
                };

                let sid = session_id.clone();
                let publish_client = client.clone();
                let mut output = handle.subscribe_buffered(buffer_window);

                // Announce session.
                let _ = publish_client
                    .publish(
                        &format!("hermytt/{sid}/pty/meta"),
                        QoS::AtMostOnce,
                        false,
                        format!(r#"{{"event":"created","session":"{sid}"}}"#).as_bytes(),
                    )
                    .await;

                tokio::spawn(async move {
                    let out_topic = format!("hermytt/{sid}/pty/out");
                    while let Some(data) = output.recv().await {
                        if data.ends_with(PTY_EXIT_SENTINEL) {
                            let _ = publish_client
                                .publish(
                                    &format!("hermytt/{sid}/pty/meta"),
                                    QoS::AtMostOnce,
                                    false,
                                    format!(r#"{{"event":"exited","session":"{sid}"}}"#).as_bytes(),
                                )
                                .await;
                            break;
                        }
                        if let Err(e) =
                            publish_client.publish(&out_topic, QoS::AtMostOnce, false, data).await
                        {
                            error!(transport = "mqtt-pty", session = %sid, error = %e, "publish failed");
                            break;
                        }
                    }
                    info!(transport = "mqtt-pty", session = %sid, "detached");
                });

                info!(transport = "mqtt-pty", session = %session_id, "attached");
                attached.insert(session_id.clone());
            }

            // Remove stale entries for sessions that no longer exist.
            let current_set: HashSet<&String> = current_ids.iter().collect();
            attached.retain(|id| current_set.contains(id));

            tokio::time::sleep(Duration::from_secs(1)).await;
        }
    }

    fn name(&self) -> &str {
        "mqtt-pty"
    }
}

async fn poll_eventloop(
    mut eventloop: EventLoop,
    client: AsyncClient,
    input_tx: mpsc::Sender<(String, Vec<u8>)>,
) {
    loop {
        match eventloop.poll().await {
            Ok(rumqttc::Event::Incoming(rumqttc::Packet::Publish(publish))) => {
                if let Some(session_id) = parse_pty_input_topic(&publish.topic) {
                    let _ = input_tx
                        .send((session_id.to_string(), publish.payload.to_vec()))
                        .await;
                }
            }
            Ok(rumqttc::Event::Incoming(rumqttc::Packet::ConnAck(_))) => {
                info!(transport = "mqtt-pty", "reconnected, resubscribing");
                if let Err(e) = client.subscribe("hermytt/+/pty/in", QoS::AtMostOnce).await {
                    error!(transport = "mqtt-pty", error = %e, "resubscribe failed");
                }
            }
            Ok(_) => {}
            Err(e) => {
                error!(transport = "mqtt-pty", error = %e, "connection error, retrying...");
                tokio::time::sleep(Duration::from_secs(5)).await;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_valid_pty_topic() {
        assert_eq!(parse_pty_input_topic("hermytt/abc123/pty/in"), Some("abc123"));
    }

    #[test]
    fn parse_default_pty_topic() {
        assert_eq!(parse_pty_input_topic("hermytt/default/pty/in"), Some("default"));
    }

    #[test]
    fn parse_rejects_exec_topic() {
        assert_eq!(parse_pty_input_topic("hermytt/abc123/in"), None);
    }

    #[test]
    fn parse_rejects_wrong_prefix() {
        assert_eq!(parse_pty_input_topic("other/abc123/pty/in"), None);
    }

    #[test]
    fn parse_rejects_pty_out() {
        assert_eq!(parse_pty_input_topic("hermytt/abc123/pty/out"), None);
    }

    #[test]
    fn parse_rejects_traversal() {
        assert_eq!(parse_pty_input_topic("hermytt/../../pty/in"), None);
    }

    #[test]
    fn parse_rejects_special_chars() {
        assert_eq!(parse_pty_input_topic("hermytt/abc+def/pty/in"), None);
        assert_eq!(parse_pty_input_topic("hermytt/abc#def/pty/in"), None);
    }
}
