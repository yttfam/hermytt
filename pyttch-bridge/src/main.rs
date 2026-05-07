mod announce;
mod bot;
mod config;
mod control;
mod status;

use std::path::PathBuf;
use std::sync::{Arc, RwLock};

use clap::Parser;

const VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Parser, Debug)]
#[command(
    name = "pyttch-bridge",
    version = VERSION,
    about = "Stateless Telegram <-> apytti router. Throwaway until pyttch.daemon ships.",
)]
struct Cli {
    /// Path to TOML config (default: /etc/pyttch-bridge/config.toml)
    #[arg(short, long)]
    config: Option<PathBuf>,

    /// HTTP control surface port (default: 7783, bound to 127.0.0.1)
    #[arg(long, default_value_t = 7783)]
    control_port: u16,
}

fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,pyttch_bridge=info".into()),
        )
        .init();

    let args = Cli::parse();
    let config_path = args
        .config
        .unwrap_or_else(|| PathBuf::from("/etc/pyttch-bridge/config.toml"));
    let cfg = config::Config::load(&config_path)?;

    let host = hostname::get().ok().and_then(|h| h.to_str().map(String::from)).unwrap_or_else(|| "unknown".into());
    let name = cfg.hermytt.name.clone().unwrap_or_else(|| format!("pyttch-bridge-{host}"));
    // We bind 127.0.0.1; default-announce loopback so a same-box hermytt's proxy reaches us
    // without needing LAN routing. Overridable via [hermytt].endpoint in config.
    let endpoint = cfg.hermytt.endpoint.clone().unwrap_or_else(|| format!("http://127.0.0.1:{}", args.control_port));

    tracing::info!(version = VERSION, name = %name, bots = cfg.bots.len(), control_port = args.control_port, "pyttch-bridge starting");

    let auth_token = cfg.hermytt.token.clone();
    announce::spawn(cfg.hermytt.clone(), name, endpoint, VERSION.to_string());
    for bot_cfg in cfg.bots.iter().cloned() {
        bot::spawn(bot_cfg, cfg.hermytt.clone());
    }

    let shared_cfg = Arc::new(RwLock::new(cfg));
    let control_state = control::State {
        config: shared_cfg,
        config_path,
        auth_token,
    };
    // The control surface runs in the main thread; the bot/announce loops run in spawned threads.
    control::serve(control_state, args.control_port)
}
