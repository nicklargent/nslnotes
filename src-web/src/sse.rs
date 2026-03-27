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
