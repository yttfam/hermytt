use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "hermytt", about = "The hermit TTY")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Start the hermytt server
    Start {
        /// Config file path
        #[arg(short, long)]
        config: Option<String>,
    },
    /// List active sessions
    List,
}

fn main() {
    let cli = Cli::parse();
    match cli.command {
        Commands::Start { config } => {
            println!("TODO: start server with config: {:?}", config);
        }
        Commands::List => {
            println!("TODO: list sessions");
        }
    }
}
