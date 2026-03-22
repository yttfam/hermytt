use axum::Router;
use axum::http::header;
use axum::response::{Html, IntoResponse};
use axum::routing::get;

const TERMINAL_HTML: &str = include_str!("../static/terminal.html");
const ADMIN_HTML: &str = include_str!("../static/admin.html");

const CRYTTER_WASM: &[u8] = include_bytes!("../static/vendor/crytter_wasm_bg.wasm");
const CRYTTER_JS: &[u8] = include_bytes!("../static/vendor/crytter_wasm.js");

pub fn routes<S: Clone + Send + Sync + 'static>() -> Router<S> {
    Router::new()
        .route("/", get(terminal))
        .route("/terminal", get(terminal))
        .route("/admin", get(admin))
        .route("/vendor/crytter_wasm_bg.wasm", get(crytter_wasm))
        .route("/vendor/crytter_wasm.js", get(crytter_js))
}

async fn terminal() -> Html<&'static str> {
    Html(TERMINAL_HTML)
}

async fn admin() -> Html<&'static str> {
    Html(ADMIN_HTML)
}

async fn crytter_wasm() -> impl IntoResponse {
    ([(header::CONTENT_TYPE, "application/wasm")], CRYTTER_WASM)
}

async fn crytter_js() -> impl IntoResponse {
    ([(header::CONTENT_TYPE, "application/javascript")], CRYTTER_JS)
}
