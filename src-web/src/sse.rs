use axum::{
    extract::State,
    http::StatusCode,
    response::{
        sse::{Event, Sse},
        IntoResponse, Response,
    },
    Json,
};
use nslnotes_core::watcher::FileChangeEvent;
use std::convert::Infallible;
use tokio::sync::broadcast;
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;

use crate::routes::AppState;

#[derive(serde::Deserialize)]
pub struct WatchBody {
    path: String,
}

/// Create a broadcast channel for SSE events
pub fn create_broadcast() -> broadcast::Sender<FileChangeEvent> {
    let (tx, _) = broadcast::channel::<FileChangeEvent>(256);
    tx
}

/// Start watching a directory
pub async fn start_watch_handler(
    State(state): State<AppState>,
    Json(body): Json<WatchBody>,
) -> Response {
    // Idempotency: a browser reload re-issues this without ever calling
    // /api/watch/stop, so the second call would otherwise hit "Already
    // watching" from the core watcher and 500. Short-circuit when the
    // existing watcher is already on the requested path; the original bridge
    // thread is still forwarding events to broadcast_tx.
    match nslnotes_core::watcher::get_watcher_status(&state.watcher_state) {
        Ok((true, Some(ref current))) if current == &body.path => {
            return StatusCode::OK.into_response();
        }
        Ok((true, _)) => {
            // Different path — caller should stop first. Surface a 409 so the
            // frontend can react instead of getting an opaque 500.
            return (
                StatusCode::CONFLICT,
                "Watcher is already running on a different path; call /api/watch/stop first",
            )
                .into_response();
        }
        Ok(_) => {}
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    }

    let broadcast_tx = state.broadcast_tx.clone();

    // Create mpsc channel for core watcher → bridge
    let (tx, rx) = std::sync::mpsc::channel::<FileChangeEvent>();

    if let Err(e) = nslnotes_core::watcher::start_watching(&body.path, &state.watcher_state, tx) {
        return (StatusCode::INTERNAL_SERVER_ERROR, e).into_response();
    }

    // Bridge thread: reads from mpsc and forwards to broadcast
    tokio::task::spawn_blocking(move || {
        loop {
            match rx.recv() {
                Ok(event) => {
                    // Ignore send errors (no subscribers yet)
                    let _ = broadcast_tx.send(event);
                }
                Err(_) => break,
            }
        }
    });

    StatusCode::OK.into_response()
}

/// Stop watching the directory
pub async fn stop_watch_handler(State(state): State<AppState>) -> Response {
    match nslnotes_core::watcher::stop_watching(&state.watcher_state) {
        Ok(()) => StatusCode::OK.into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    }
}

/// SSE endpoint for file change events
pub async fn events_handler(
    State(state): State<AppState>,
) -> Sse<impl tokio_stream::Stream<Item = Result<Event, Infallible>>> {
    let rx = state.broadcast_tx.subscribe();
    let stream = BroadcastStream::new(rx).filter_map(|result| match result {
        Ok(event) => {
            let data = serde_json::to_string(&event).unwrap_or_default();
            Some(Ok(Event::default().data(data)))
        }
        Err(_) => None,
    });

    Sse::new(stream)
}
