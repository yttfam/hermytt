use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::Json;
use tracing::{info, warn};

use crate::rest::AppState;

pub(crate) async fn registry_proxy(
    State(state): State<AppState>,
    Path((name, path)): Path<(String, String)>,
    method: axum::http::Method,
    headers: axum::http::HeaderMap,
    body: axum::body::Bytes,
) -> Result<axum::response::Response, (StatusCode, Json<serde_json::Value>)> {
    info!(
        transport = "proxy",
        service = %name,
        method = %method,
        path = %path,
        body_bytes = body.len(),
        "proxy request"
    );
    let svc = state.registry.get(&name).await.ok_or_else(|| {
        (StatusCode::NOT_FOUND, Json(serde_json::json!({"error": format!("service '{}' not found", name)})))
    })?;
    if svc.status == hermytt_core::registry::ServiceStatus::Disconnected {
        return Err((StatusCode::BAD_GATEWAY, Json(serde_json::json!({"error": format!("service '{}' is disconnected", name)}))));
    }
    if !svc.endpoint.starts_with("http") {
        return Err((StatusCode::BAD_GATEWAY, Json(serde_json::json!({"error": format!("service '{}' has no HTTP endpoint", name)}))));
    }

    let path = path.trim_start_matches('/');
    let url = format!("{}/{}", svc.endpoint.trim_end_matches('/'), path);

    let client = reqwest::Client::new();
    let mut req = client.request(method.clone(), &url);
    for (k, v) in headers.iter() {
        let name = k.as_str().to_ascii_lowercase();
        if matches!(
            name.as_str(),
            "host" | "connection" | "content-length" | "transfer-encoding" | "keep-alive" | "upgrade"
        ) {
            continue;
        }
        req = req.header(k.as_str(), v);
    }
    if !body.is_empty() {
        req = req.body(body.to_vec());
    }

    let resp = req.send().await.map_err(|e| {
        warn!(transport = "proxy", service = %name, url = %url, error = %e, "upstream error");
        (StatusCode::BAD_GATEWAY, Json(serde_json::json!({"error": format!("proxy error: {}", e)})))
    })?;

    let status = StatusCode::from_u16(resp.status().as_u16()).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
    info!(transport = "proxy", service = %name, url = %url, status = %status.as_u16(), "proxy response");
    let content_type = resp
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/json")
        .to_string();

    // Stream the upstream body straight through — DO NOT collect with `.bytes()`,
    // that would buffer the whole response before flushing. SSE consumers (the
    // pyttch-bridge status updater, the /chat tab) need byte-by-byte progress.
    use futures_util::StreamExt;
    let stream = resp.bytes_stream().map(|r| r.map_err(std::io::Error::other));
    let body = axum::body::Body::from_stream(stream);

    Ok(axum::response::Response::builder()
        .status(status)
        .header("content-type", content_type)
        .body(body)
        .unwrap())
}
