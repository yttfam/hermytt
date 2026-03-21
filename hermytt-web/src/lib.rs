use axum::Router;
use axum::response::Html;
use axum::routing::get;

const TERMINAL_HTML: &str = include_str!("../static/terminal.html");
const ADMIN_HTML: &str = include_str!("../static/admin.html");

/// Returns the web UI routes. Mount these on the main router.
///
/// - `/` — terminal UI (xterm.js, tabbed sessions)
/// - `/admin` — admin dashboard (sessions, transports, quick exec)
pub fn routes<S: Clone + Send + Sync + 'static>() -> Router<S> {
    Router::new()
        .route("/", get(terminal))
        .route("/terminal", get(terminal))
        .route("/admin", get(admin))
}

async fn terminal() -> Html<&'static str> {
    Html(TERMINAL_HTML)
}

async fn admin() -> Html<&'static str> {
    Html(ADMIN_HTML)
}
