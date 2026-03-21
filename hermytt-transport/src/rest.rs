use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use async_trait::async_trait;
use axum::Router;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::sse::{Event, Sse};
use axum::response::{IntoResponse, Json};
use axum::routing::{get, post};
use hermytt_core::{BufferedOutput, SessionManager};
use serde::{Deserialize, Serialize};
use tracing::info;

use crate::Transport;

pub struct RestTransport {
    pub port: u16,
    pub bind: String,
}

#[derive(Clone)]
struct AppState {
    sessions: Arc<SessionManager>,
}

#[derive(Deserialize)]
struct StdinBody {
    input: String,
}

#[derive(Serialize)]
struct SessionInfo {
    id: String,
}

#[derive(Serialize)]
struct SessionListResponse {
    sessions: Vec<SessionInfo>,
}

#[async_trait]
impl Transport for RestTransport {
    async fn serve(self: Arc<Self>, sessions: Arc<SessionManager>) -> Result<()> {
        let state = AppState { sessions };

        let app = Router::new()
            .route("/session", post(create_session))
            .route("/sessions", get(list_sessions))
            .route("/session/{id}/stdin", post(write_stdin))
            .route("/session/{id}/stdout", get(stream_stdout))
            // Convenience: default session
            .route("/stdin", post(write_stdin_default))
            .route("/stdout", get(stream_stdout_default))
            .with_state(state);

        let addr = format!("{}:{}", self.bind, self.port);
        info!(transport = "rest", addr = %addr, "listening");

        let listener = tokio::net::TcpListener::bind(&addr).await?;
        axum::serve(listener, app).await?;
        Ok(())
    }

    fn name(&self) -> &str {
        "rest"
    }
}

async fn create_session(
    State(state): State<AppState>,
) -> Result<Json<SessionInfo>, StatusCode> {
    let handle = state
        .sessions
        .create_session()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(SessionInfo { id: handle.id }))
}

async fn list_sessions(State(state): State<AppState>) -> Json<SessionListResponse> {
    let ids = state.sessions.list_sessions().await;
    Json(SessionListResponse {
        sessions: ids.into_iter().map(|id| SessionInfo { id }).collect(),
    })
}

async fn write_stdin(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<StdinBody>,
) -> StatusCode {
    let Some(handle) = state.sessions.get_session(&id).await else {
        return StatusCode::NOT_FOUND;
    };
    let mut input = body.input.clone();
    if !input.ends_with('\n') {
        input.push('\n');
    }
    match handle.stdin_tx.send(input.into_bytes()).await {
        Ok(_) => StatusCode::OK,
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR,
    }
}

async fn write_stdin_default(
    State(state): State<AppState>,
    Json(body): Json<StdinBody>,
) -> StatusCode {
    let Ok(handle) = state.sessions.default_session().await else {
        return StatusCode::INTERNAL_SERVER_ERROR;
    };
    let mut input = body.input.clone();
    if !input.ends_with('\n') {
        input.push('\n');
    }
    match handle.stdin_tx.send(input.into_bytes()).await {
        Ok(_) => StatusCode::OK,
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR,
    }
}

async fn stream_stdout(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, StatusCode> {
    let Some(handle) = state.sessions.get_session(&id).await else {
        return Err(StatusCode::NOT_FOUND);
    };
    let output = handle.subscribe_buffered(REST_BUFFER_WINDOW);
    Ok(make_sse_stream(output))
}

async fn stream_stdout_default(
    State(state): State<AppState>,
) -> Result<impl IntoResponse, StatusCode> {
    let Ok(handle) = state.sessions.default_session().await else {
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    };
    let output = handle.subscribe_buffered(REST_BUFFER_WINDOW);
    Ok(make_sse_stream(output))
}

/// SSE buffer window — accumulate PTY output for this long before sending.
const REST_BUFFER_WINDOW: Duration = Duration::from_millis(100);

fn make_sse_stream(
    mut output: BufferedOutput,
) -> Sse<impl tokio_stream::Stream<Item = Result<Event, std::convert::Infallible>>> {
    let stream = async_stream::stream! {
        while let Some(data) = output.recv().await {
            let text = String::from_utf8_lossy(&data).to_string();
            yield Ok(Event::default().data(text));
        }
    };
    Sse::new(stream).keep_alive(
        axum::response::sse::KeepAlive::new()
            .interval(Duration::from_secs(15))
            .text("ping"),
    )
}
