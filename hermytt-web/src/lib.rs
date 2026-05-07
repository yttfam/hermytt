use axum::Router;
use axum::http::header;
use axum::response::{Html, IntoResponse};
use axum::routing::get;

const TERMINAL_HTML: &str = include_str!("../static/terminal.html");
const ADMIN_HTML: &str = include_str!("../static/admin.html");
const LOGIN_HTML: &str = include_str!("../static/login.html");
const CHAT_HTML: &str = include_str!("../static/chat.html");
const CHAT_JS: &str = include_str!("../static/chat.js");
const LOGIN_JS: &str = include_str!("../static/login.js");
const ADMIN_JS: &str = include_str!("../static/admin.js");
const TERMINAL_JS: &str = include_str!("../static/terminal.js");

const CRYTTER_WASM: &[u8] = include_bytes!("../static/vendor/crytter_wasm_bg.wasm");
const CRYTTER_JS: &[u8] = include_bytes!("../static/vendor/crytter_wasm.js");
const PRYTTY_WASM: &[u8] = include_bytes!("../static/vendor/prytty_wasm_bg.wasm");
const PRYTTY_JS: &[u8] = include_bytes!("../static/vendor/prytty_wasm.js");

pub fn routes<S: Clone + Send + Sync + 'static>() -> Router<S> {
    Router::new()
        .route("/", get(terminal))
        .route("/terminal", get(terminal))
        .route("/admin", get(admin))
        .route("/chat", get(chat))
        .route("/chat.js", get(chat_js))
        .route("/login", get(login))
        .route("/login.js", get(login_js))
        .route("/admin.js", get(admin_js))
        .route("/terminal.js", get(terminal_js))
        .route("/vendor/crytter_wasm_bg.wasm", get(crytter_wasm))
        .route("/vendor/crytter_wasm.js", get(crytter_js))
        .route("/vendor/prytty_wasm_bg.wasm", get(prytty_wasm))
        .route("/vendor/prytty_wasm.js", get(prytty_js))
}

// Pages and our own JS bundles change every deploy. `no-store` tells the browser
// to never cache them — every page load gets the latest. Bytes are tiny (≤ 30 KB
// per asset) and traffic is LAN, so the bandwidth cost is nil; the upside is no
// more "cmd+shift+R after every deploy" surprise. The vendored WASM (large,
// effectively immutable per release) stays cacheable.
const NO_CACHE: &str = "no-store, max-age=0";

async fn terminal() -> impl IntoResponse {
    ([(header::CACHE_CONTROL, NO_CACHE)], Html(TERMINAL_HTML))
}
async fn admin() -> impl IntoResponse {
    ([(header::CACHE_CONTROL, NO_CACHE)], Html(ADMIN_HTML))
}
async fn chat() -> impl IntoResponse {
    ([(header::CACHE_CONTROL, NO_CACHE)], Html(CHAT_HTML))
}
async fn login() -> impl IntoResponse {
    ([(header::CACHE_CONTROL, NO_CACHE)], Html(LOGIN_HTML))
}

async fn chat_js() -> impl IntoResponse {
    (
        [
            (header::CONTENT_TYPE, "application/javascript; charset=utf-8"),
            (header::CACHE_CONTROL, NO_CACHE),
        ],
        CHAT_JS,
    )
}
async fn login_js() -> impl IntoResponse {
    (
        [
            (header::CONTENT_TYPE, "application/javascript; charset=utf-8"),
            (header::CACHE_CONTROL, NO_CACHE),
        ],
        LOGIN_JS,
    )
}
async fn admin_js() -> impl IntoResponse {
    (
        [
            (header::CONTENT_TYPE, "application/javascript; charset=utf-8"),
            (header::CACHE_CONTROL, NO_CACHE),
        ],
        ADMIN_JS,
    )
}
async fn terminal_js() -> impl IntoResponse {
    (
        [
            (header::CONTENT_TYPE, "application/javascript; charset=utf-8"),
            (header::CACHE_CONTROL, NO_CACHE),
        ],
        TERMINAL_JS,
    )
}

async fn crytter_wasm() -> impl IntoResponse {
    ([(header::CONTENT_TYPE, "application/wasm")], CRYTTER_WASM)
}
async fn crytter_js() -> impl IntoResponse {
    ([(header::CONTENT_TYPE, "application/javascript")], CRYTTER_JS)
}
async fn prytty_wasm() -> impl IntoResponse {
    ([(header::CONTENT_TYPE, "application/wasm")], PRYTTY_WASM)
}
async fn prytty_js() -> impl IntoResponse {
    ([(header::CONTENT_TYPE, "application/javascript")], PRYTTY_JS)
}
