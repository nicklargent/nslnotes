use argon2::{
    password_hash::{PasswordHash, PasswordVerifier, SaltString},
    Argon2, PasswordHasher,
};
use nslnotes_core::crypto::{self, Kek};
use axum::{
    extract::ConnectInfo,
    http::{HeaderMap, Request, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Extension, Json,
};
use governor::{
    clock::{DefaultClock, QuantaInstant},
    middleware::NoOpMiddleware,
    state::keyed::DefaultKeyedStateStore,
    Quota, RateLimiter,
};
use rand::rngs::OsRng;
use serde::Deserialize;
use std::net::{IpAddr, SocketAddr};
use std::num::NonZeroU32;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tower_sessions::Session;

pub const SESSION_USER_KEY: &str = "user";
pub const DEFAULT_USER: &str = "default";

/// Process-global KEK set on first successful login. `None` until then; all
/// SMB backend registrations depend on this being populated.
static KEK: std::sync::OnceLock<std::sync::Mutex<Option<Kek>>> = std::sync::OnceLock::new();

fn kek_cell() -> &'static std::sync::Mutex<Option<Kek>> {
    KEK.get_or_init(|| std::sync::Mutex::new(None))
}

/// Return a copy of the current KEK, or `None` if nobody has logged in yet
/// since the process started.
pub fn current_kek() -> Option<Kek> {
    kek_cell().lock().ok().and_then(|g| *g)
}

fn set_kek(kek: Kek) {
    if let Ok(mut g) = kek_cell().lock() {
        *g = Some(kek);
    }
}

type LoginLimiter = RateLimiter<
    IpAddr,
    DefaultKeyedStateStore<IpAddr>,
    DefaultClock,
    NoOpMiddleware<QuantaInstant>,
>;

#[derive(Clone)]
pub struct AuthConfig {
    /// When true, auth is fully disabled: every request is treated as authenticated
    /// and login/logout become no-ops. Controlled by NSLNOTES_DISABLE_AUTH=1.
    pub disabled: bool,
    /// Argon2id PHC hash from NSLNOTES_PASSWORD_HASH. Empty when disabled.
    pub password_hash: Arc<String>,
    /// When true, trust X-Forwarded-For for client IP (for rate limiting) and
    /// emit cookies with Secure flag (TLS assumed on the proxy).
    pub trust_proxy: bool,
    /// Per-IP login rate limiter: 5 attempts / 15 minutes.
    pub login_limiter: Arc<LoginLimiter>,
    /// Path to settings.json — login uses this to reconcile SMB backends once
    /// the KEK is available.
    pub settings_path: std::path::PathBuf,
    /// True when at least one SMB notebook has an encrypted password — i.e.
    /// the login-derived KEK must be present in this process for SMB to
    /// work. Seeded at boot from settings.json and refreshed by
    /// `save_settings_handler` whenever SMB topology changes. The auth
    /// hot path reads this with a relaxed atomic load to decide whether a
    /// session that survived a process restart is actually usable.
    pub kek_required: Arc<AtomicBool>,
}

impl AuthConfig {
    pub fn from_env(settings_path: std::path::PathBuf) -> Result<Self, String> {
        let disabled = std::env::var("NSLNOTES_DISABLE_AUTH")
            .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
            .unwrap_or(false);

        let trust_proxy = std::env::var("NSLNOTES_TRUST_PROXY")
            .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
            .unwrap_or(false);

        // 5 login attempts per 15 minutes per IP. Burst of 5. Kept even when
        // disabled so the struct is uniform; it's simply never consulted.
        let quota = Quota::with_period(Duration::from_secs(180))
            .expect("non-zero period")
            .allow_burst(NonZeroU32::new(5).unwrap());
        let login_limiter = Arc::new(RateLimiter::keyed(quota));

        if disabled {
            return Ok(Self {
                disabled: true,
                password_hash: Arc::new(String::new()),
                trust_proxy,
                login_limiter,
                settings_path,
                kek_required: Arc::new(AtomicBool::new(false)),
            });
        }

        let password_hash = std::env::var("NSLNOTES_PASSWORD_HASH").map_err(|_| {
            "NSLNOTES_PASSWORD_HASH is not set. Generate one with: \
             nslnotes-web hash-password\n\
             (To run without auth for local use only, set NSLNOTES_DISABLE_AUTH=1.)"
                .to_string()
        })?;

        // Validate the hash is parseable up front so we fail fast.
        PasswordHash::new(&password_hash)
            .map_err(|e| format!("NSLNOTES_PASSWORD_HASH is not a valid argon2 PHC string: {e}"))?;

        Ok(Self {
            disabled: false,
            password_hash: Arc::new(password_hash),
            trust_proxy,
            login_limiter,
            settings_path,
            kek_required: Arc::new(AtomicBool::new(false)),
        })
    }
}

/// Hash a plaintext password as argon2id PHC string. Used by the
/// `hash-password` CLI subcommand.
pub fn hash_password(plaintext: &str) -> Result<String, String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(plaintext.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| format!("Failed to hash password: {e}"))
}

/// Verify `plaintext` against the PHC hash and, on success, extract the
/// argon2 hash output as the [`Kek`]. Returns `None` on any mismatch or
/// parse failure so callers can't distinguish causes (avoids timing oracle).
fn verify_and_derive(plaintext: &str, phc: &str) -> Option<Kek> {
    let parsed = PasswordHash::new(phc).ok()?;
    Argon2::default()
        .verify_password(plaintext.as_bytes(), &parsed)
        .ok()?;
    crypto::kek_from_hash(&parsed).ok()
}

#[derive(Deserialize)]
pub struct LoginBody {
    pub password: String,
}

/// Determine the client IP for rate-limiting purposes. When trust_proxy is on,
/// honor the first X-Forwarded-For entry; otherwise use the peer address.
fn client_ip(trust_proxy: bool, headers: &HeaderMap, peer: SocketAddr) -> IpAddr {
    if trust_proxy {
        if let Some(xff) = headers.get("x-forwarded-for").and_then(|v| v.to_str().ok()) {
            if let Some(first) = xff.split(',').next() {
                if let Ok(ip) = first.trim().parse::<IpAddr>() {
                    return ip;
                }
            }
        }
    }
    peer.ip()
}

pub async fn login_handler(
    Extension(auth): Extension<AuthConfig>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    session: Session,
    headers: HeaderMap,
    Json(body): Json<LoginBody>,
) -> Response {
    if auth.disabled {
        // Auth is off; accept any password and move on.
        let _ = session.insert(SESSION_USER_KEY, DEFAULT_USER).await;
        return (
            StatusCode::OK,
            Json(serde_json::json!({ "user": DEFAULT_USER })),
        )
            .into_response();
    }

    let ip = client_ip(auth.trust_proxy, &headers, peer);

    // Check rate limit before doing argon2 work so attackers can't amplify CPU cost.
    if auth.login_limiter.check_key(&ip).is_err() {
        return (
            StatusCode::TOO_MANY_REQUESTS,
            [(axum::http::header::RETRY_AFTER, "900")],
            Json(serde_json::json!({ "error": "Too many login attempts. Try again later." })),
        )
            .into_response();
    }

    let Some(kek) = verify_and_derive(&body.password, &auth.password_hash) else {
        return (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "error": "Invalid password" })),
        )
            .into_response();
    };

    // Stash the KEK globally so SMB credential decryption works for this and
    // subsequent sessions until the process exits. Then reload settings and
    // (re)register any SMB notebooks with the just-derived key. Migration of
    // any legacy plaintext `smbPassword` entries happens here.
    set_kek(kek);
    crate::reconcile_after_login(&auth.settings_path);

    // Rotate the session ID on successful login to prevent fixation.
    if let Err(e) = session.cycle_id().await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("Session error: {e}") })),
        )
            .into_response();
    }
    if let Err(e) = session.insert(SESSION_USER_KEY, DEFAULT_USER).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("Session error: {e}") })),
        )
            .into_response();
    }

    (
        StatusCode::OK,
        Json(serde_json::json!({ "user": DEFAULT_USER })),
    )
        .into_response()
}

pub async fn logout_handler(session: Session) -> Response {
    // Clear the session; the cookie is cleared by tower-sessions on the next response.
    let _ = session.flush().await;
    StatusCode::NO_CONTENT.into_response()
}

pub async fn me_handler(
    Extension(auth): Extension<AuthConfig>,
    session: Session,
) -> Response {
    if auth.disabled {
        return Json(serde_json::json!({ "user": DEFAULT_USER })).into_response();
    }
    match session.get::<String>(SESSION_USER_KEY).await {
        Ok(Some(user)) => {
            // Session cookie is valid, but if SMB notebooks rely on the
            // login-derived KEK and this process doesn't have it (typically
            // after a restart), report unauthenticated so the frontend
            // shows the login screen instead of an empty notebook.
            if auth.kek_required.load(Ordering::Relaxed) && current_kek().is_none() {
                return (
                    StatusCode::UNAUTHORIZED,
                    Json(serde_json::json!({ "error": "Re-authentication required" })),
                )
                    .into_response();
            }
            Json(serde_json::json!({ "user": user })).into_response()
        }
        _ => (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "error": "Not authenticated" })),
        )
            .into_response(),
    }
}

pub async fn health_handler() -> Response {
    Json(serde_json::json!({ "status": "ok" })).into_response()
}

/// Middleware that gates all wrapped routes. Rejects with 401 JSON when the
/// session does not carry a user marker. Short-circuits when auth is disabled.
pub async fn require_auth(
    Extension(auth): Extension<AuthConfig>,
    session: Session,
    req: Request<axum::body::Body>,
    next: Next,
) -> Response {
    if auth.disabled {
        return next.run(req).await;
    }
    match session.get::<String>(SESSION_USER_KEY).await {
        Ok(Some(_)) => {
            // Same gate as `me_handler`: a session that survived a process
            // restart still passes the cookie check, but without the KEK
            // we cannot decrypt SMB credentials, so any protected call
            // would fail with a 500 from the registry. Return 401 instead
            // so `authedFetch` fires `AUTH_EXPIRED_EVENT` and the user is
            // bounced to the login screen.
            if auth.kek_required.load(Ordering::Relaxed) && current_kek().is_none() {
                return (
                    StatusCode::UNAUTHORIZED,
                    Json(serde_json::json!({ "error": "Re-authentication required" })),
                )
                    .into_response();
            }
            next.run(req).await
        }
        _ => (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "error": "Authentication required" })),
        )
            .into_response(),
    }
}
