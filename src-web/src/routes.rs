use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{delete, get, post, put},
    Json, Router,
};
use nslnotes_core::watcher::WatcherState;
use rust_embed::Embed;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tokio::sync::broadcast;
use tower_http::cors::{Any, CorsLayer};

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

fn err_response(status: StatusCode, msg: String) -> Response {
    (status, Json(serde_json::json!({"error": msg}))).into_response()
}

pub fn create_router(
    settings_path: PathBuf,
    watcher_state: Arc<Mutex<WatcherState>>,
    broadcast_tx: broadcast::Sender<nslnotes_core::watcher::FileChangeEvent>,
) -> Router {
    let state = AppState {
        settings_path,
        watcher_state,
        broadcast_tx,
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let api = Router::new()
        .route("/files", get(read_file_handler))
        .route("/files", put(write_file_handler))
        .route("/files", delete(delete_file_handler))
        .route("/files/rmdir", delete(delete_directory_handler))
        .route("/files/exists", get(file_exists_handler))
        .route("/files/list", get(list_directory_handler))
        .route("/files/verify", get(verify_directory_handler))
        .route("/files/mkdir", post(ensure_directory_handler))
        .route("/files/copy", post(copy_file_handler))
        .route("/files/binary", put(write_binary_handler))
        .route("/files/size", get(get_file_size_handler))
        .route("/assets", get(serve_asset_handler))
        .route("/settings", get(load_settings_handler))
        .route("/settings", put(save_settings_handler))
        .route("/watch/start", post(sse::start_watch_handler))
        .route("/watch/stop", post(sse::stop_watch_handler))
        .route("/watch/events", get(sse::events_handler));

    Router::new()
        .nest("/api", api)
        .fallback(serve_frontend)
        .layer(cors)
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
    match std::fs::read(path) {
        Ok(bytes) => {
            let mime = mime_guess::from_path(path)
                .first_or_octet_stream()
                .to_string();
            (
                [(axum::http::header::CONTENT_TYPE, mime)],
                bytes,
            )
                .into_response()
        }
        Err(e) => err_response(
            StatusCode::NOT_FOUND,
            format!("Failed to read asset '{}': {}", path, e),
        ),
    }
}

async fn load_settings_handler(State(state): State<AppState>) -> Response {
    match nslnotes_core::settings::load_from_path(&state.settings_path) {
        Ok(settings) => Json(settings).into_response(),
        Err(e) => err_response(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

async fn save_settings_handler(
    State(state): State<AppState>,
    Json(settings): Json<nslnotes_core::settings::AppSettings>,
) -> Response {
    match nslnotes_core::settings::save_to_path(&state.settings_path, &settings) {
        Ok(()) => StatusCode::OK.into_response(),
        Err(e) => err_response(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
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
