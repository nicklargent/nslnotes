use axum::{
    extract::{Query, State},
    http::{header, StatusCode},
    middleware,
    response::{IntoResponse, Response},
    routing::{delete, get, post, put},
    Extension, Json, Router,
};
use nslnotes_core::watcher::WatcherState;
use rust_embed::Embed;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tokio::sync::broadcast;
use tower_sessions::{cookie::SameSite, Expiry, SessionManagerLayer};

use crate::auth::{self, AuthConfig};
use crate::session_store::{sessions_dir_for, FileSessionStore};
use crate::sse;

#[derive(Embed)]
#[folder = "../dist/"]
struct Assets;

#[derive(Clone)]
pub struct AppState {
    pub settings_path: PathBuf,
    pub watcher_state: Arc<Mutex<WatcherState>>,
    pub broadcast_tx: broadcast::Sender<nslnotes_core::watcher::FileChangeEvent>,
}

#[derive(serde::Deserialize)]
pub struct PathQuery {
    path: String,
}

#[derive(serde::Deserialize)]
pub struct WriteBody {
    path: String,
    content: String,
}

#[derive(serde::Deserialize)]
pub struct PathBody {
    path: String,
}

#[derive(serde::Deserialize)]
pub struct CopyBody {
    src: String,
    dst: String,
}

#[derive(serde::Deserialize)]
pub struct BinaryBody {
    path: String,
    #[serde(rename = "base64Data")]
    base64_data: String,
}

#[derive(serde::Deserialize)]
pub struct BackupBody {
    sources: Vec<nslnotes_core::backup::BackupSource>,
    #[serde(default)]
    filename: Option<String>,
}

fn err_response(status: StatusCode, msg: String) -> Response {
    (status, Json(serde_json::json!({"error": msg}))).into_response()
}

pub fn create_router(
    settings_path: PathBuf,
    watcher_state: Arc<Mutex<WatcherState>>,
    broadcast_tx: broadcast::Sender<nslnotes_core::watcher::FileChangeEvent>,
    auth_config: AuthConfig,
) -> Router {
    let state = AppState {
        settings_path,
        watcher_state,
        broadcast_tx,
    };

    // Auth-gated routes. Every route here requires a valid session.
    let protected = Router::new()
        .route("/files", get(read_file_handler))
        .route("/files", put(write_file_handler))
        .route("/files", delete(delete_file_handler))
        .route("/files/rmdir", delete(delete_directory_handler))
        .route("/files/exists", get(file_exists_handler))
        .route("/files/list", get(list_directory_handler))
        .route("/files/read-md-dir", get(read_md_dir_handler))
        .route("/files/list-md-meta", get(list_md_dir_meta_handler))
        .route("/files/verify", get(verify_directory_handler))
        .route("/files/mkdir", post(ensure_directory_handler))
        .route("/files/copy", post(copy_file_handler))
        .route("/files/binary", put(write_binary_handler))
        .route("/files/size", get(get_file_size_handler))
        .route("/assets", get(serve_asset_handler))
        .route("/settings", get(load_settings_handler))
        .route("/settings", put(save_settings_handler))
        .route("/backup", post(create_backup_handler))
        .route("/watch/start", post(sse::start_watch_handler))
        .route("/watch/stop", post(sse::stop_watch_handler))
        .route("/watch/events", get(sse::events_handler))
        .route("/logout", post(auth::logout_handler))
        .layer(middleware::from_fn(auth::require_auth));

    // Unauthenticated routes. /auth/me returns 401 on its own if unauthenticated
    // so the frontend can detect login state without triggering the middleware.
    let public = Router::new()
        .route("/health", get(auth::health_handler))
        .route("/login", post(auth::login_handler))
        .route("/auth/me", get(auth::me_handler));

    let api = public.merge(protected);

    // Session cookie config: HttpOnly, SameSite=Lax, 30-day rolling expiry.
    // Secure flag is enabled when running behind a TLS-terminating proxy.
    // Sessions persist to disk under settings_dir/sessions/ so a container
    // restart doesn't bounce every logged-in user back to the login screen.
    let session_store = FileSessionStore::new(sessions_dir_for(&state.settings_path));
    let session_layer = SessionManagerLayer::new(session_store)
        .with_name("nslnotes_session")
        .with_secure(auth_config.trust_proxy)
        .with_http_only(true)
        .with_same_site(SameSite::Lax)
        .with_expiry(Expiry::OnInactivity(time::Duration::days(30)));

    Router::new()
        .nest("/api", api)
        .fallback(serve_frontend)
        .layer(session_layer)
        .layer(Extension(auth_config))
        .with_state(state)
}

async fn read_file_handler(Query(q): Query<PathQuery>) -> Response {
    match nslnotes_core::fs_ops::read_file(&q.path) {
        Ok(content) => content.into_response(),
        Err(e) => err_response(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

async fn write_file_handler(Json(body): Json<WriteBody>) -> Response {
    match nslnotes_core::fs_ops::write_file(&body.path, &body.content) {
        Ok(()) => StatusCode::OK.into_response(),
        Err(e) => err_response(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

async fn delete_file_handler(Query(q): Query<PathQuery>) -> Response {
    match nslnotes_core::fs_ops::delete_file(&q.path) {
        Ok(()) => StatusCode::OK.into_response(),
        Err(e) => err_response(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

async fn delete_directory_handler(Query(q): Query<PathQuery>) -> Response {
    match nslnotes_core::fs_ops::delete_directory(&q.path) {
        Ok(()) => StatusCode::OK.into_response(),
        Err(e) => err_response(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

async fn file_exists_handler(Query(q): Query<PathQuery>) -> Response {
    match nslnotes_core::fs_ops::file_exists(&q.path) {
        Ok(exists) => Json(serde_json::json!({ "exists": exists })).into_response(),
        Err(e) => err_response(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

async fn list_directory_handler(Query(q): Query<PathQuery>) -> Response {
    match nslnotes_core::fs_ops::list_directory(&q.path) {
        Ok(files) => Json(files).into_response(),
        Err(e) => err_response(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

/// Return `(path, mtime_seconds)` for every `.md` file directly under `path`.
/// One round-trip per directory; the frontend uses this to cheaply confirm a
/// cached index is still up to date before re-reading any file contents.
async fn list_md_dir_meta_handler(Query(q): Query<PathQuery>) -> Response {
    let path = q.path.clone();
    let result = tokio::task::spawn_blocking(move || nslnotes_core::fs_ops::list_md_dir_meta(&path))
        .await;
    match result {
        Ok(Ok(entries)) => {
            let body: Vec<serde_json::Value> = entries
                .into_iter()
                .map(|(p, m)| serde_json::json!({ "path": p, "mtime": m }))
                .collect();
            Json(body).into_response()
        }
        Ok(Err(e)) => err_response(StatusCode::INTERNAL_SERVER_ERROR, e),
        Err(e) => err_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("list_md_dir_meta join error: {e}"),
        ),
    }
}

/// Bulk read every `.md` file directly under `path` and return their contents.
/// One HTTP round-trip per directory replaces N+1 round-trips (list + each
/// read) — a meaningful speedup when the backend is SMB and every file op
/// queues on a single worker thread.
async fn read_md_dir_handler(Query(q): Query<PathQuery>) -> Response {
    let path = q.path.clone();
    let result = tokio::task::spawn_blocking(move || nslnotes_core::fs_ops::read_md_dir(&path))
        .await;
    match result {
        Ok(Ok(entries)) => {
            let body: Vec<serde_json::Value> = entries
                .into_iter()
                .map(|(p, c, m)| {
                    serde_json::json!({ "path": p, "content": c, "mtime": m })
                })
                .collect();
            Json(body).into_response()
        }
        Ok(Err(e)) => err_response(StatusCode::INTERNAL_SERVER_ERROR, e),
        Err(e) => err_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("read_md_dir join error: {e}"),
        ),
    }
}

async fn verify_directory_handler(Query(q): Query<PathQuery>) -> Response {
    match nslnotes_core::fs_ops::verify_directory(&q.path) {
        Ok(status) => Json(status).into_response(),
        Err(e) => err_response(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

async fn ensure_directory_handler(Json(body): Json<PathBody>) -> Response {
    match nslnotes_core::fs_ops::ensure_directory(&body.path) {
        Ok(()) => StatusCode::OK.into_response(),
        Err(e) => err_response(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

async fn copy_file_handler(Json(body): Json<CopyBody>) -> Response {
    match nslnotes_core::fs_ops::copy_file(&body.src, &body.dst) {
        Ok(()) => StatusCode::OK.into_response(),
        Err(e) => err_response(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

async fn write_binary_handler(Json(body): Json<BinaryBody>) -> Response {
    match nslnotes_core::fs_ops::write_binary(&body.path, &body.base64_data) {
        Ok(()) => StatusCode::OK.into_response(),
        Err(e) => err_response(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

async fn get_file_size_handler(Query(q): Query<PathQuery>) -> Response {
    match nslnotes_core::fs_ops::get_file_size(&q.path) {
        Ok(size) => Json(serde_json::json!({ "size": size })).into_response(),
        Err(e) => err_response(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

async fn serve_asset_handler(Query(q): Query<PathQuery>) -> Response {
    let path = &q.path;
    // Dispatch through the backend registry so smb:// asset paths work the
    // same as local ones — the previous `std::fs::read` only handled local
    // files and silently failed for SMB-backed notebooks.
    let backend = match nslnotes_core::fs::registry().for_path(path) {
        Ok(b) => b,
        Err(e) => return err_response(StatusCode::NOT_FOUND, e),
    };
    match backend.read_bytes(path) {
        Ok(bytes) => {
            let mime = mime_guess::from_path(path)
                .first_or_octet_stream()
                .to_string();
            ([(axum::http::header::CONTENT_TYPE, mime)], bytes).into_response()
        }
        Err(e) => err_response(
            StatusCode::NOT_FOUND,
            format!("Failed to read asset '{}': {}", path, e),
        ),
    }
}

async fn load_settings_handler(State(state): State<AppState>) -> Response {
    match nslnotes_core::settings::load_from_path(&state.settings_path) {
        Ok(mut settings) => {
            // Never let a plaintext SMB password reach the browser even if one
            // slipped into the file (legacy format, disabled-auth mode that
            // later switched to enabled, etc.).
            for nb in &mut settings.notebooks {
                nb.smb_password = None;
            }
            Json(settings).into_response()
        }
        Err(e) => err_response(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

async fn save_settings_handler(
    State(state): State<AppState>,
    Json(mut settings): Json<nslnotes_core::settings::AppSettings>,
) -> Response {
    // Used for two things: (1) the SMB-registry fingerprint diff so a
    // pure UI-state save doesn't churn the SMB session; (2) preserving
    // credentials the browser doesn't have — `load_settings_handler`
    // strips `smbPassword` from the response, so without merging from
    // disk a routine save would wipe on-disk creds.
    let prior_settings = nslnotes_core::settings::load_from_path(&state.settings_path).ok();
    let prior_smb = prior_settings
        .as_ref()
        .map(smb_registry_fingerprint)
        .unwrap_or_default();

    // Encrypt any plaintext smbPassword the frontend just sent us so we never
    // persist SMB credentials in the clear (unless auth is disabled, in which
    // case we have no key and the legacy plaintext path stays).
    let kek = crate::auth::current_kek();
    let mut cred_change = false;
    for nb in &mut settings.notebooks {
        if !nslnotes_core::smb_url::is_smb_url(&nb.path) {
            continue;
        }
        if let Some(plain) = nb.smb_password.take() {
            if plain.is_empty() {
                continue;
            }
            cred_change = true;
            match kek.as_ref() {
                Some(k) => match nslnotes_core::crypto::encrypt_str(k, &plain) {
                    Ok(enc) => nb.smb_password_enc = Some(enc),
                    Err(e) => {
                        return err_response(
                            StatusCode::INTERNAL_SERVER_ERROR,
                            format!("encrypt smb password: {e}"),
                        );
                    }
                },
                None => {
                    // No KEK (disabled-auth mode). Keep plaintext so the
                    // notebook still works; persistence will reflect that.
                    nb.smb_password = Some(plain);
                }
            }
        }

        // Merge in any credentials the client didn't send. This is the
        // "load_settings stripped them, browser saved settings without
        // re-supplying them" case — match by id to find the on-disk
        // notebook and preserve its password material.
        if nb.smb_password.is_none() && nb.smb_password_enc.is_none() {
            if let Some(prior) = prior_settings.as_ref() {
                if let Some(prior_nb) = prior.notebooks.iter().find(|p| p.id == nb.id) {
                    if prior_nb.smb_password_enc.is_some() {
                        nb.smb_password_enc = prior_nb.smb_password_enc.clone();
                    } else if prior_nb.smb_password.is_some() {
                        nb.smb_password = prior_nb.smb_password.clone();
                    }
                }
            }
        }
    }

    match nslnotes_core::settings::save_to_path(&state.settings_path, &settings) {
        Ok(()) => {
            let new_smb = smb_registry_fingerprint(&settings);
            if cred_change || new_smb != prior_smb {
                crate::reconcile_smb_backends(&settings, kek);
            }
            StatusCode::OK.into_response()
        }
        Err(e) => err_response(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

/// Identity of every SMB notebook for registry-reconcile purposes. Two
/// settings files with equal fingerprints produce the same registry, so we
/// can skip `clear_smb` + re-register when they match.
fn smb_registry_fingerprint(
    settings: &nslnotes_core::settings::AppSettings,
) -> Vec<(String, String, String, String)> {
    settings
        .notebooks
        .iter()
        .filter(|nb| nslnotes_core::smb_url::is_smb_url(&nb.path))
        .map(|nb| {
            (
                nb.path.clone(),
                nb.smb_username.clone().unwrap_or_default(),
                nb.smb_password_enc.clone().unwrap_or_default(),
                nb.smb_domain.clone().unwrap_or_default(),
            )
        })
        .collect()
}

/// Sanitize a client-supplied filename against header injection and path
/// traversal. Anything non-matching falls back to a unix-timestamp default.
fn safe_backup_filename(candidate: Option<String>) -> String {
    fn is_ok(c: char) -> bool {
        c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-')
    }
    if let Some(name) = candidate {
        if !name.is_empty() && name.len() <= 128 && name.chars().all(is_ok) {
            return name;
        }
    }
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("nslnotes-backup-{}.tar.gz", ts)
}

async fn create_backup_handler(Json(body): Json<BackupBody>) -> Response {
    // Build the archive into memory. Acceptable for typical notebook sizes
    // (markdown + small assets, usually < 100 MB). If this becomes a bottleneck
    // for multi-GB notebooks, switch to a streaming body backed by a channel
    // + spawn_blocking producer.
    let sources = body.sources;
    let result = tokio::task::spawn_blocking(move || {
        let mut buf: Vec<u8> = Vec::new();
        let stats = nslnotes_core::backup::create_backup_to_writer(&sources, &mut buf)?;
        Ok::<_, String>((stats, buf))
    })
    .await;

    let (stats, bytes) = match result {
        Ok(Ok(v)) => v,
        Ok(Err(e)) => return err_response(StatusCode::BAD_REQUEST, e),
        Err(e) => {
            return err_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Backup task panicked: {}", e),
            );
        }
    };

    let filename = safe_backup_filename(body.filename);
    let disposition = format!("attachment; filename=\"{}\"", filename);
    let stats_json = serde_json::to_string(&stats)
        .unwrap_or_else(|_| "{}".to_string());

    let headers = [
        (header::CONTENT_TYPE, "application/gzip".to_string()),
        (header::CONTENT_DISPOSITION, disposition),
        (
            header::HeaderName::from_static("x-backup-stats"),
            stats_json,
        ),
    ];
    (StatusCode::OK, headers, bytes).into_response()
}

async fn serve_frontend(uri: axum::http::Uri) -> Response {
    let path = uri.path().trim_start_matches('/');

    // Try exact match first
    if let Some(file) = Assets::get(path) {
        let mime = mime_guess::from_path(path)
            .first_or_octet_stream()
            .to_string();
        return (
            [(axum::http::header::CONTENT_TYPE, mime)],
            file.data.to_vec(),
        )
            .into_response();
    }

    // SPA fallback: serve index.html for non-file paths
    if let Some(file) = Assets::get("index.html") {
        return (
            [(
                axum::http::header::CONTENT_TYPE,
                "text/html".to_string(),
            )],
            file.data.to_vec(),
        )
            .into_response();
    }

    StatusCode::NOT_FOUND.into_response()
}
