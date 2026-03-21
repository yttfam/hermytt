use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct Config {
    #[serde(default)]
    pub server: ServerConfig,
    #[serde(default)]
    pub transport: TransportConfig,
}

#[derive(Debug, Deserialize)]
pub struct ServerConfig {
    #[serde(default = "default_bind")]
    pub bind: String,
    #[serde(default = "default_shell")]
    pub shell: String,
    #[serde(default = "default_scrollback")]
    pub scrollback: usize,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            bind: default_bind(),
            shell: default_shell(),
            scrollback: default_scrollback(),
        }
    }
}

#[derive(Debug, Default, Deserialize)]
pub struct TransportConfig {
    #[serde(default)]
    pub rest: Option<RestConfig>,
    #[serde(default)]
    pub websocket: Option<WebSocketConfig>,
}

#[derive(Debug, Deserialize)]
pub struct RestConfig {
    #[serde(default = "default_rest_port")]
    pub port: u16,
}

#[derive(Debug, Deserialize)]
pub struct WebSocketConfig {
    #[serde(default = "default_ws_port")]
    pub port: u16,
}

fn default_bind() -> String {
    "0.0.0.0".to_string()
}
fn default_shell() -> String {
    "/bin/bash".to_string()
}
fn default_scrollback() -> usize {
    1000
}
fn default_rest_port() -> u16 {
    7777
}
fn default_ws_port() -> u16 {
    7778
}

impl Config {
    pub fn load(path: Option<&str>) -> anyhow::Result<Self> {
        match path {
            Some(p) => {
                let content = std::fs::read_to_string(p)?;
                Ok(toml::from_str(&content)?)
            }
            None => Ok(Config {
                server: ServerConfig::default(),
                transport: TransportConfig {
                    rest: Some(RestConfig { port: 7777 }),
                    websocket: Some(WebSocketConfig { port: 7778 }),
                },
            }),
        }
    }
}
