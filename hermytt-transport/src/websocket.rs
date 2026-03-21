use std::sync::Arc;

use anyhow::Result;
use async_trait::async_trait;
use axum::Router;
use axum::extract::ws::{Message, WebSocket};
use axum::extract::{Path, State, WebSocketUpgrade};
use axum::response::IntoResponse;
use axum::routing::get;
use hermytt_core::SessionManager;
use tracing::info;

use crate::Transport;

pub struct WebSocketTransport {
    pub port: u16,
    pub bind: String,
}

#[derive(Clone)]
struct WsState {
    sessions: Arc<SessionManager>,
}

#[async_trait]
impl Transport for WebSocketTransport {
    async fn serve(self: Arc<Self>, sessions: Arc<SessionManager>) -> Result<()> {
        let state = WsState { sessions };

        let app = Router::new()
            .route("/ws/{id}", get(ws_handler))
            .route("/ws", get(ws_handler_default))
            .with_state(state);

        let addr = format!("{}:{}", self.bind, self.port);
        info!(transport = "websocket", addr = %addr, "listening");

        let listener = tokio::net::TcpListener::bind(&addr).await?;
        axum::serve(listener, app).await?;
        Ok(())
    }

    fn name(&self) -> &str {
        "websocket"
    }
}

async fn ws_handler(
    State(state): State<WsState>,
    Path(id): Path<String>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| async move {
        let Some(handle) = state.sessions.get_session(&id).await else {
            return;
        };
        handle_socket(socket, handle).await;
    })
}

async fn ws_handler_default(
    State(state): State<WsState>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| async move {
        let Ok(handle) = state.sessions.default_session().await else {
            return;
        };
        handle_socket(socket, handle).await;
    })
}

async fn handle_socket(mut socket: WebSocket, handle: hermytt_core::SessionHandle) {
    let stdin_tx = handle.stdin_tx.clone();
    let mut output_rx = handle.subscribe_output();

    loop {
        tokio::select! {
            // PTY output -> WebSocket
            result = output_rx.recv() => {
                match result {
                    Ok(data) => {
                        let text = String::from_utf8_lossy(&data).to_string();
                        if socket.send(Message::text(text)).await.is_err() {
                            break;
                        }
                    }
                    Err(_) => break,
                }
            }
            // WebSocket -> PTY stdin
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        let bytes = text.as_bytes().to_vec();
                        if stdin_tx.send(bytes).await.is_err() {
                            break;
                        }
                    }
                    Some(Ok(Message::Binary(data))) => {
                        if stdin_tx.send(data.to_vec()).await.is_err() {
                            break;
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    _ => {}
                }
            }
        }
    }

    info!(session = %handle.id, "websocket client disconnected");
}
