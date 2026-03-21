use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use async_trait::async_trait;
use hermytt_core::SessionManager;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpListener;
use tracing::{error, info, warn};

use crate::Transport;

pub struct TcpTransport {
    pub port: u16,
    pub bind: String,
    pub auth_token: Option<String>,
}

#[async_trait]
impl Transport for TcpTransport {
    async fn serve(self: Arc<Self>, sessions: Arc<SessionManager>) -> Result<()> {
        let addr = format!("{}:{}", self.bind, self.port);
        let listener = TcpListener::bind(&addr).await?;
        info!(transport = "tcp", addr = %addr, "listening");

        loop {
            let (stream, peer) = listener.accept().await?;
            info!(transport = "tcp", peer = %peer, "client connected");

            let sessions = sessions.clone();
            let auth_token = self.auth_token.clone();
            tokio::spawn(async move {
                if let Err(e) = handle_connection(stream, sessions, auth_token).await {
                    error!(transport = "tcp", peer = %peer, error = %e, "connection error");
                }
                info!(transport = "tcp", peer = %peer, "client disconnected");
            });
        }
    }

    fn name(&self) -> &str {
        "tcp"
    }
}

async fn handle_connection(
    stream: tokio::net::TcpStream,
    sessions: Arc<SessionManager>,
    auth_token: Option<String>,
) -> Result<()> {
    let (reader, mut writer) = stream.into_split();
    let mut reader = BufReader::new(reader);

    // First-line token auth.
    if let Some(expected) = &auth_token {
        writer.write_all(b"token: ").await?;
        let mut line = String::new();
        reader.read_line(&mut line).await?;
        let provided = line.trim();
        if provided != expected {
            warn!(transport = "tcp", "unauthorized connection");
            writer.write_all(b"unauthorized\n").await?;
            return Ok(());
        }
        writer.write_all(b"ok\n").await?;
    }

    let handle = sessions.default_session().await?;
    let stdin_tx = handle.stdin_tx.clone();
    let mut output = handle.subscribe_buffered(Duration::ZERO);

    let write_task = tokio::spawn(async move {
        while let Some(data) = output.recv().await {
            if writer.write_all(&data).await.is_err() {
                break;
            }
        }
    });

    let read_task = tokio::spawn(async move {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf).await {
                Ok(0) => break,
                Ok(n) => {
                    if stdin_tx.send(buf[..n].to_vec()).await.is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    });

    tokio::select! {
        _ = write_task => {}
        _ = read_task => {}
    }

    Ok(())
}
