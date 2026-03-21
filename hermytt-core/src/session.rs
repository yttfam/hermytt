use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Arc;

use anyhow::{Context, Result};
use portable_pty::{CommandBuilder, PtySize, native_pty_system};
use tokio::sync::{Mutex, RwLock, broadcast, mpsc};
use tracing::{error, info};

/// Short session ID (first 8 chars of uuid).
pub type SessionId = String;

/// A handle that transports use to interact with a session.
#[derive(Clone)]
pub struct SessionHandle {
    pub id: SessionId,
    /// Send bytes to the PTY's stdin.
    pub stdin_tx: mpsc::Sender<Vec<u8>>,
    /// Subscribe to PTY output.
    pub output_tx: broadcast::Sender<Vec<u8>>,
    /// Read the scrollback buffer.
    pub scrollback: Arc<Mutex<ScrollbackBuffer>>,
}

impl SessionHandle {
    /// Subscribe to the output broadcast channel (raw, no buffering).
    pub fn subscribe_output(&self) -> broadcast::Receiver<Vec<u8>> {
        self.output_tx.subscribe()
    }

    /// Subscribe with a buffering window. `Duration::ZERO` = no buffering.
    pub fn subscribe_buffered(
        &self,
        window: std::time::Duration,
    ) -> crate::buffer::BufferedOutput {
        crate::buffer::BufferedOutput::new(self.output_tx.subscribe(), window)
    }
}

pub struct ScrollbackBuffer {
    lines: Vec<String>,
    capacity: usize,
}

impl ScrollbackBuffer {
    pub fn new(capacity: usize) -> Self {
        Self {
            lines: Vec::with_capacity(capacity),
            capacity,
        }
    }

    pub fn push(&mut self, data: &str) {
        for line in data.split('\n') {
            if self.lines.len() >= self.capacity {
                self.lines.remove(0);
            }
            self.lines.push(line.to_string());
        }
    }

    pub fn get_all(&self) -> Vec<String> {
        self.lines.clone()
    }
}

/// A running PTY session.
pub struct Session {
    pub id: SessionId,
    pub handle: SessionHandle,
    stdin_rx: Mutex<Option<mpsc::Receiver<Vec<u8>>>>,
    shell: String,
}

impl Session {
    pub fn new(shell: &str, scrollback_capacity: usize) -> Result<Arc<Self>> {
        let id = uuid::Uuid::new_v4().to_string()[..8].to_string();
        let (stdin_tx, stdin_rx) = mpsc::channel::<Vec<u8>>(256);
        let (output_tx, _) = broadcast::channel::<Vec<u8>>(256);
        let scrollback = Arc::new(Mutex::new(ScrollbackBuffer::new(scrollback_capacity)));

        let handle = SessionHandle {
            id: id.clone(),
            stdin_tx,
            output_tx,
            scrollback: scrollback.clone(),
        };

        Ok(Arc::new(Self {
            id,
            handle,
            stdin_rx: Mutex::new(Some(stdin_rx)),
            shell: shell.to_string(),
        }))
    }

    /// Spawn the PTY and start I/O loops. Call once.
    pub async fn start(self: &Arc<Self>) -> Result<()> {
        let mut stdin_rx = self
            .stdin_rx
            .lock()
            .await
            .take()
            .context("session already started")?;

        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .context("failed to open PTY")?;

        let mut cmd = CommandBuilder::new(&self.shell);
        cmd.env("TERM", "xterm-256color");
        let _child = pair
            .slave
            .spawn_command(cmd)
            .context("failed to spawn shell")?;

        // Drop the slave side — we only need the master.
        drop(pair.slave);

        let mut master_writer = pair.master.take_writer()?;
        let mut master_reader = pair.master.try_clone_reader()?;

        let output_tx = self.handle.output_tx.clone();
        let scrollback = self.handle.scrollback.clone();
        let session_id = self.id.clone();

        // PTY stdout -> broadcast
        tokio::task::spawn_blocking(move || {
            let mut buf = [0u8; 4096];
            loop {
                match master_reader.read(&mut buf) {
                    Ok(0) => {
                        info!(session = %session_id, "PTY closed");
                        break;
                    }
                    Ok(n) => {
                        let data = buf[..n].to_vec();
                        if let Ok(text) = std::str::from_utf8(&data) {
                            if let Ok(mut sb) = scrollback.try_lock() {
                                sb.push(text);
                            }
                        }
                        // Ignore send errors — just means no subscribers right now.
                        let _ = output_tx.send(data);
                    }
                    Err(e) => {
                        error!(session = %session_id, error = %e, "PTY read error");
                        break;
                    }
                }
            }
        });

        // stdin channel -> PTY stdin
        tokio::spawn(async move {
            while let Some(data) = stdin_rx.recv().await {
                if master_writer.write_all(&data).is_err() {
                    break;
                }
            }
        });

        info!(session = %self.id, shell = %self.shell, "session started");
        Ok(())
    }
}

/// Manages multiple sessions.
pub struct SessionManager {
    sessions: RwLock<HashMap<SessionId, Arc<Session>>>,
    shell: String,
    scrollback_capacity: usize,
}

impl SessionManager {
    pub fn new(shell: &str, scrollback_capacity: usize) -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
            shell: shell.to_string(),
            scrollback_capacity,
        }
    }

    pub async fn create_session(&self) -> Result<SessionHandle> {
        let session = Session::new(&self.shell, self.scrollback_capacity)?;
        session.start().await?;
        let handle = session.handle.clone();
        self.sessions.write().await.insert(handle.id.clone(), session);
        info!(session = %handle.id, "session created");
        Ok(handle)
    }

    pub async fn get_session(&self, id: &str) -> Option<SessionHandle> {
        self.sessions.read().await.get(id).map(|s| s.handle.clone())
    }

    pub async fn list_sessions(&self) -> Vec<SessionId> {
        self.sessions.read().await.keys().cloned().collect()
    }

    /// Get the default (first/only) session, or create one if none exist.
    pub async fn default_session(&self) -> Result<SessionHandle> {
        let sessions = self.sessions.read().await;
        if let Some(session) = sessions.values().next() {
            return Ok(session.handle.clone());
        }
        drop(sessions);
        self.create_session().await
    }
}
