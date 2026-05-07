//! User auth: argon2id password hashing, in-memory session store, login/logout/CRUD handlers.
//!
//! Wire model:
//! - Service-to-service callers send `X-Hermytt-Key: <static-token>` (unchanged).
//! - Browser users authenticate via `POST /auth/login`, get a `hermytt_session` cookie
//!   (HttpOnly, SameSite=Strict). Both are accepted by the auth middleware.
//! - User store persists to a TOML file alongside hermytt.toml. Atomic writes (tempfile + rename).
//! - Session store is in-memory only; restart kicks every browser user.
//!
//! First user added becomes admin. Once at least one user exists, browser flow requires login.
//! Static `X-Hermytt-Key` continues to work regardless (services need it).

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use argon2::password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use axum::extract::{Path as AxPath, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Json};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;
use tracing::{info, warn};

const SESSION_COOKIE: &str = "hermytt_session";
const SESSION_TTL: Duration = Duration::from_secs(60 * 60 * 24 * 14); // 14 days

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub username: String,
    pub password_hash: String,
    #[serde(default)]
    pub created_at: u64, // unix millis
    #[serde(default)]
    pub last_login: Option<u64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct UsersFile {
    #[serde(default)]
    pub users: Vec<User>,
}

#[derive(Debug, Clone)]
pub struct SessionInfo {
    pub username: String,
    pub created: Instant,
    pub last_seen: Instant,
}

#[derive(Clone)]
pub struct AuthState {
    pub users_path: PathBuf,
    pub users: Arc<RwLock<UsersFile>>,
    pub sessions: Arc<RwLock<HashMap<String, SessionInfo>>>,
}

impl AuthState {
    pub fn load(users_path: impl Into<PathBuf>) -> Self {
        let users_path = users_path.into();
        let users = if users_path.exists() {
            std::fs::read_to_string(&users_path)
                .ok()
                .and_then(|s| toml::from_str(&s).ok())
                .unwrap_or_default()
        } else {
            UsersFile::default()
        };
        Self {
            users_path,
            users: Arc::new(RwLock::new(users)),
            sessions: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Returns true if any user is configured. When false, browser flow falls back
    /// to bare-token mode and login isn't required.
    pub async fn has_users(&self) -> bool {
        !self.users.read().await.users.is_empty()
    }

    /// Look up the username for a session token, refreshing last_seen.
    pub async fn validate_session(&self, token: &str) -> Option<String> {
        let mut sessions = self.sessions.write().await;
        // Expire stale sessions opportunistically.
        let now = Instant::now();
        sessions.retain(|_, s| now.duration_since(s.created) < SESSION_TTL);
        let s = sessions.get_mut(token)?;
        s.last_seen = now;
        Some(s.username.clone())
    }

    async fn save(&self) -> std::io::Result<()> {
        let users = self.users.read().await.clone();
        let s = toml::to_string_pretty(&users).map_err(|e| std::io::Error::other(e.to_string()))?;
        let tmp = self.users_path.with_extension("toml.tmp");
        if let Some(parent) = self.users_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(&tmp, s)?;
        std::fs::rename(&tmp, &self.users_path)?;
        Ok(())
    }
}

/// CLI helper to add a user to the file directly (bootstrap path).
pub fn cli_add_user(users_path: &Path, username: &str, password: &str) -> anyhow::Result<()> {
    let mut file: UsersFile = if users_path.exists() {
        toml::from_str(&std::fs::read_to_string(users_path)?)?
    } else {
        UsersFile::default()
    };
    if file.users.iter().any(|u| u.username == username) {
        anyhow::bail!("user '{}' already exists", username);
    }
    file.users.push(User {
        username: username.to_string(),
        password_hash: hash_password(password)?,
        created_at: now_millis(),
        last_login: None,
    });
    let s = toml::to_string_pretty(&file)?;
    let tmp = users_path.with_extension("toml.tmp");
    if let Some(parent) = users_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&tmp, s)?;
    std::fs::rename(&tmp, users_path)?;
    Ok(())
}

fn hash_password(password: &str) -> anyhow::Result<String> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let h = argon2
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| anyhow::anyhow!("hash failed: {e}"))?;
    Ok(h.to_string())
}

fn verify_password(password: &str, hash: &str) -> bool {
    let Ok(parsed) = PasswordHash::new(hash) else { return false };
    Argon2::default().verify_password(password.as_bytes(), &parsed).is_ok()
}

fn new_session_token() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

fn now_millis() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64
}

/// Extract the session cookie value from a Cookie header, if present.
pub fn extract_session_cookie(headers: &HeaderMap) -> Option<String> {
    let raw = headers.get(header::COOKIE)?.to_str().ok()?;
    for kv in raw.split(';') {
        let kv = kv.trim();
        if let Some(rest) = kv.strip_prefix(&format!("{}=", SESSION_COOKIE)) {
            return Some(rest.to_string());
        }
    }
    None
}

// ---------- Handlers ----------

#[derive(Deserialize)]
pub struct LoginBody {
    pub username: String,
    pub password: String,
}

#[derive(Serialize)]
pub struct UserView {
    pub username: String,
    pub created_at: u64,
    pub last_login: Option<u64>,
}

impl From<&User> for UserView {
    fn from(u: &User) -> Self {
        UserView { username: u.username.clone(), created_at: u.created_at, last_login: u.last_login }
    }
}

pub async fn login(
    State(state): State<crate::rest::AppState>,
    Json(body): Json<LoginBody>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let auth = state.auth.clone();
    let mut users = auth.users.write().await;
    let user = users.users.iter_mut().find(|u| u.username == body.username);
    let Some(user) = user else {
        warn!("login failed: unknown user");
        return Err((StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error": "invalid credentials"}))));
    };
    if !verify_password(&body.password, &user.password_hash) {
        warn!(username = %body.username, "login failed: bad password");
        return Err((StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error": "invalid credentials"}))));
    }
    user.last_login = Some(now_millis());
    let username = user.username.clone();
    drop(users);
    auth.save().await.ok();

    let token = new_session_token();
    let now = Instant::now();
    auth.sessions.write().await.insert(
        token.clone(),
        SessionInfo { username: username.clone(), created: now, last_seen: now },
    );
    info!(username = %username, "login");

    let cookie = format!(
        "{name}={tok}; Path=/; HttpOnly; SameSite=Strict; Max-Age={age}",
        name = SESSION_COOKIE,
        tok = token,
        age = SESSION_TTL.as_secs()
    );
    let mut resp = Json(serde_json::json!({"username": username})).into_response();
    resp.headers_mut().insert(header::SET_COOKIE, cookie.parse().unwrap());
    Ok(resp)
}

pub async fn logout(
    State(state): State<crate::rest::AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    if let Some(tok) = extract_session_cookie(&headers) {
        state.auth.sessions.write().await.remove(&tok);
    }
    let cookie = format!("{}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0", SESSION_COOKIE);
    let mut resp = Json(serde_json::json!({"ok": true})).into_response();
    resp.headers_mut().insert(header::SET_COOKIE, cookie.parse().unwrap());
    resp
}

pub async fn me(
    State(state): State<crate::rest::AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, StatusCode> {
    if let Some(tok) = extract_session_cookie(&headers) {
        if let Some(username) = state.auth.validate_session(&tok).await {
            return Ok(Json(serde_json::json!({"username": username, "auth_mode": "session"})));
        }
    }
    // Fallback for token-bearer admins (unusual but supported).
    Ok(Json(serde_json::json!({"username": null, "auth_mode": "token"})))
}

pub async fn list_users(
    State(state): State<crate::rest::AppState>,
) -> Json<serde_json::Value> {
    let users = state.auth.users.read().await;
    let views: Vec<UserView> = users.users.iter().map(UserView::from).collect();
    Json(serde_json::json!({"users": views}))
}

#[derive(Deserialize)]
pub struct AddUserBody {
    pub username: String,
    pub password: String,
}

pub async fn add_user(
    State(state): State<crate::rest::AppState>,
    Json(body): Json<AddUserBody>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    if body.username.is_empty() || body.password.len() < 6 {
        return Err((StatusCode::BAD_REQUEST, Json(serde_json::json!({"error": "username required, password ≥ 6 chars"}))));
    }
    let auth = state.auth.clone();
    let mut users = auth.users.write().await;
    if users.users.iter().any(|u| u.username == body.username) {
        return Err((StatusCode::CONFLICT, Json(serde_json::json!({"error": "user already exists"}))));
    }
    let hash = hash_password(&body.password).map_err(|e|
        (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()})))
    )?;
    users.users.push(User {
        username: body.username.clone(),
        password_hash: hash,
        created_at: now_millis(),
        last_login: None,
    });
    drop(users);
    auth.save().await.map_err(|e|
        (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": format!("save failed: {e}")})))
    )?;
    info!(username = %body.username, "user added");
    Ok(Json(serde_json::json!({"ok": true, "username": body.username})))
}

pub async fn delete_user(
    State(state): State<crate::rest::AppState>,
    AxPath(username): AxPath<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let auth = state.auth.clone();
    let mut users = auth.users.write().await;
    if users.users.len() <= 1 {
        return Err((StatusCode::CONFLICT, Json(serde_json::json!({"error": "refusing to delete last user — admin recovery would require CLI"}))));
    }
    let before = users.users.len();
    users.users.retain(|u| u.username != username);
    if users.users.len() == before {
        return Err((StatusCode::NOT_FOUND, Json(serde_json::json!({"error": "user not found"}))));
    }
    drop(users);
    // Kick any active sessions for this user.
    let mut sessions = auth.sessions.write().await;
    sessions.retain(|_, s| s.username != username);
    drop(sessions);
    auth.save().await.map_err(|e|
        (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": format!("save failed: {e}")})))
    )?;
    info!(username = %username, "user deleted");
    Ok(Json(serde_json::json!({"ok": true})))
}

#[derive(Deserialize)]
pub struct ChangePasswordBody {
    #[serde(default)]
    pub old_password: Option<String>,
    pub new_password: String,
}

pub async fn change_password(
    State(state): State<crate::rest::AppState>,
    AxPath(username): AxPath<String>,
    headers: HeaderMap,
    Json(body): Json<ChangePasswordBody>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    if body.new_password.len() < 6 {
        return Err((StatusCode::BAD_REQUEST, Json(serde_json::json!({"error": "new password must be ≥ 6 chars"}))));
    }
    let auth = state.auth.clone();
    // Determine the caller's username (if cookie-authenticated). Token-only callers can change anyone.
    let caller = if let Some(tok) = extract_session_cookie(&headers) {
        auth.validate_session(&tok).await
    } else {
        None
    };

    let mut users = auth.users.write().await;
    let user = users.users.iter_mut().find(|u| u.username == username).ok_or_else(||
        (StatusCode::NOT_FOUND, Json(serde_json::json!({"error": "user not found"})))
    )?;

    // If caller is the same user, require old_password. Token-only or cross-user (admin reset) skip the check.
    let self_change = caller.as_deref() == Some(username.as_str());
    if self_change {
        let old = body.old_password.as_deref().unwrap_or("");
        if !verify_password(old, &user.password_hash) {
            return Err((StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error": "old password incorrect"}))));
        }
    }
    user.password_hash = hash_password(&body.new_password).map_err(|e|
        (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()})))
    )?;
    drop(users);
    auth.save().await.map_err(|e|
        (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": format!("save failed: {e}")})))
    )?;
    info!(username = %username, self_change, "password changed");
    Ok(Json(serde_json::json!({"ok": true})))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_and_verify_roundtrip() {
        let h = hash_password("hunter2").unwrap();
        assert!(verify_password("hunter2", &h));
        assert!(!verify_password("hunter3", &h));
    }

    #[test]
    fn cookie_extraction() {
        let mut h = HeaderMap::new();
        h.insert(header::COOKIE, "foo=bar; hermytt_session=abcdef; baz=qux".parse().unwrap());
        assert_eq!(extract_session_cookie(&h).as_deref(), Some("abcdef"));
    }

    #[test]
    fn cookie_extraction_alone() {
        let mut h = HeaderMap::new();
        h.insert(header::COOKIE, "hermytt_session=alone".parse().unwrap());
        assert_eq!(extract_session_cookie(&h).as_deref(), Some("alone"));
    }
}
