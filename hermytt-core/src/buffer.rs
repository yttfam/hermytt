use std::pin::Pin;
use std::time::Duration;

use tokio::sync::broadcast;
use tokio::time::Sleep;

/// Wraps a broadcast receiver and batches output chunks within a time window.
///
/// - `Duration::ZERO` = no buffering, pass through immediately.
/// - Any other duration = accumulate bytes, flush when the window expires
///   or the buffer hits `max_bytes`.
pub struct BufferedOutput {
    rx: broadcast::Receiver<Vec<u8>>,
    window: Duration,
    max_bytes: usize,
    buf: Vec<u8>,
    deadline: Option<Pin<Box<Sleep>>>,
}

impl BufferedOutput {
    pub fn new(rx: broadcast::Receiver<Vec<u8>>, window: Duration) -> Self {
        Self {
            rx,
            window,
            max_bytes: 16 * 1024, // 16KB hard flush
            buf: Vec::new(),
            deadline: None,
        }
    }

    /// Receive the next chunk of output. Returns `None` when the channel closes.
    ///
    /// With `Duration::ZERO`, this returns each broadcast message as-is.
    /// Otherwise, it accumulates messages within the window and returns them as one blob.
    pub async fn recv(&mut self) -> Option<Vec<u8>> {
        if self.window.is_zero() {
            return self.recv_raw().await;
        }
        self.recv_buffered().await
    }

    async fn recv_raw(&mut self) -> Option<Vec<u8>> {
        loop {
            match self.rx.recv().await {
                Ok(data) => return Some(data),
                Err(broadcast::error::RecvError::Lagged(n)) => {
                    tracing::warn!(skipped = n, "output receiver lagged, dropped frames");
                    continue;
                }
                Err(broadcast::error::RecvError::Closed) => return None,
            }
        }
    }

    async fn recv_buffered(&mut self) -> Option<Vec<u8>> {
        loop {
            // If we have buffered data, race between more input and the deadline.
            if !self.buf.is_empty() {
                let deadline = self
                    .deadline
                    .get_or_insert_with(|| Box::pin(tokio::time::sleep(self.window)));

                tokio::select! {
                    biased;
                    // Deadline expired — flush what we have.
                    _ = deadline.as_mut() => {
                        return Some(self.flush());
                    }
                    result = self.rx.recv() => {
                        match result {
                            Ok(data) => {
                                self.buf.extend_from_slice(&data);
                                if self.buf.len() >= self.max_bytes {
                                    return Some(self.flush());
                                }
                            }
                            Err(broadcast::error::RecvError::Lagged(_)) => continue,
                            Err(broadcast::error::RecvError::Closed) => {
                                return if self.buf.is_empty() {
                                    None
                                } else {
                                    Some(self.flush())
                                };
                            }
                        }
                    }
                }
            } else {
                // Buffer empty — just wait for the next message.
                match self.rx.recv().await {
                    Ok(data) => {
                        self.buf.extend_from_slice(&data);
                        // Start the clock.
                        self.deadline =
                            Some(Box::pin(tokio::time::sleep(self.window)));
                        // If already at max, flush immediately.
                        if self.buf.len() >= self.max_bytes {
                            return Some(self.flush());
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(broadcast::error::RecvError::Closed) => return None,
                }
            }
        }
    }

    fn flush(&mut self) -> Vec<u8> {
        self.deadline = None;
        std::mem::take(&mut self.buf)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn raw_passthrough() {
        let (tx, _) = broadcast::channel::<Vec<u8>>(16);
        let mut buf = BufferedOutput::new(tx.subscribe(), Duration::ZERO);

        tx.send(b"hello".to_vec()).unwrap();
        tx.send(b"world".to_vec()).unwrap();

        assert_eq!(buf.recv().await.unwrap(), b"hello");
        assert_eq!(buf.recv().await.unwrap(), b"world");
    }

    #[tokio::test]
    async fn raw_returns_none_on_close() {
        let (tx, _) = broadcast::channel::<Vec<u8>>(16);
        let mut buf = BufferedOutput::new(tx.subscribe(), Duration::ZERO);
        drop(tx);
        assert!(buf.recv().await.is_none());
    }

    #[tokio::test(start_paused = true)]
    async fn buffered_batches_within_window() {
        let (tx, _) = broadcast::channel::<Vec<u8>>(16);
        let mut buf = BufferedOutput::new(tx.subscribe(), Duration::from_millis(100));

        tx.send(b"a".to_vec()).unwrap();
        tx.send(b"b".to_vec()).unwrap();
        tx.send(b"c".to_vec()).unwrap();

        // Advance past the window.
        tokio::time::advance(Duration::from_millis(150)).await;

        let result = buf.recv().await.unwrap();
        assert_eq!(result, b"abc");
    }

    #[tokio::test(start_paused = true)]
    async fn buffered_flushes_on_max_bytes() {
        let (tx, _) = broadcast::channel::<Vec<u8>>(16);
        let mut buf = BufferedOutput::new(tx.subscribe(), Duration::from_secs(10));
        buf.max_bytes = 5;

        tx.send(b"abc".to_vec()).unwrap();
        tx.send(b"def".to_vec()).unwrap();

        let result = buf.recv().await.unwrap();
        assert_eq!(result, b"abcdef"); // 6 bytes >= 5, flushed immediately
    }

    #[tokio::test]
    async fn buffered_flushes_remainder_on_close() {
        let (tx, _) = broadcast::channel::<Vec<u8>>(16);
        let mut buf = BufferedOutput::new(tx.subscribe(), Duration::from_secs(10));

        tx.send(b"leftover".to_vec()).unwrap();
        drop(tx);

        // Should get the buffered data even though window hasn't expired.
        let result = buf.recv().await.unwrap();
        assert_eq!(result, b"leftover");

        // Next call should return None.
        assert!(buf.recv().await.is_none());
    }
}
