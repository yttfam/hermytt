mod config;

use std::sync::Arc;

use anyhow::Result;
use clap::Parser;
use hermytt_core::SessionManager;
use hermytt_transport::Transport;
use hermytt_transport::rest::RestTransport;
use hermytt_transport::websocket::WebSocketTransport;
use tracing::info;

#[derive(Parser)]
#[command(name = "hermytt", about = "The hermit TTY — transport-agnostic terminal multiplexer")]
struct Args {
    /// Path to config file
    #[arg(short, long)]
    config: Option<String>,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .init();

    let args = Args::parse();
    let config = config::Config::load(args.config.as_deref())?;

    info!("hermytt starting up");

    let sessions = Arc::new(SessionManager::new(
        &config.server.shell,
        config.server.scrollback,
    ));

    // Create a default session on startup.
    let default = sessions.create_session().await?;
    info!(session = %default.id, "default session ready");

    let mut tasks = Vec::new();

    if let Some(rest_config) = &config.transport.rest {
        let transport = Arc::new(RestTransport {
            port: rest_config.port,
            bind: config.server.bind.clone(),
        });
        let sessions = sessions.clone();
        tasks.push(tokio::spawn(async move {
            if let Err(e) = transport.serve(sessions).await {
                tracing::error!(transport = "rest", error = %e, "transport failed");
            }
        }));
    }

    if let Some(ws_config) = &config.transport.websocket {
        let transport = Arc::new(WebSocketTransport {
            port: ws_config.port,
            bind: config.server.bind.clone(),
        });
        let sessions = sessions.clone();
        tasks.push(tokio::spawn(async move {
            if let Err(e) = transport.serve(sessions).await {
                tracing::error!(transport = "websocket", error = %e, "transport failed");
            }
        }));
    }

    // Wait for all transports (they run forever until killed).
    futures_util::future::join_all(tasks).await;

    Ok(())
}
