use anyhow::Result;
use tokio::process::Command;

/// Execute a shell command directly (no PTY), capture stdout + stderr.
/// Clean, no ANSI, no prompt, no echo. For request-response transports.
pub async fn exec(cmd: &str, shell: &str) -> Result<ExecResult> {
    let output = Command::new(shell)
        .arg("-c")
        .arg(cmd)
        .output()
        .await?;

    Ok(ExecResult {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code: output.status.code().unwrap_or(-1),
    })
}

pub struct ExecResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}

impl ExecResult {
    /// Combined output — stderr appended if non-empty.
    pub fn combined(&self) -> String {
        if self.stderr.is_empty() {
            self.stdout.clone()
        } else if self.stdout.is_empty() {
            self.stderr.clone()
        } else {
            format!("{}\n{}", self.stdout.trim_end(), self.stderr)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn exec_simple_command() {
        let result = exec("echo hello", "/bin/sh").await.unwrap();
        assert_eq!(result.stdout.trim(), "hello");
        assert_eq!(result.exit_code, 0);
    }

    #[tokio::test]
    async fn exec_captures_stderr() {
        let result = exec("echo err >&2", "/bin/sh").await.unwrap();
        assert_eq!(result.stderr.trim(), "err");
    }

    #[tokio::test]
    async fn exec_exit_code() {
        let result = exec("exit 42", "/bin/sh").await.unwrap();
        assert_eq!(result.exit_code, 42);
    }

    #[tokio::test]
    async fn exec_combined_output() {
        let result = exec("echo out; echo err >&2", "/bin/sh").await.unwrap();
        let combined = result.combined();
        assert!(combined.contains("out"));
        assert!(combined.contains("err"));
    }

    #[tokio::test]
    async fn exec_no_ansi_junk() {
        let result = exec("whoami", "/bin/sh").await.unwrap();
        assert!(!result.stdout.contains('\x1b'));
        assert!(!result.stdout.contains("[0m"));
    }
}
