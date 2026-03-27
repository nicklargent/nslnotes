use nslnotes_core::watcher::{FileChangeEvent, WatcherState};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter};

/// Start watching a directory for file changes.
/// Bridges core watcher events to Tauri app.emit().
#[tauri::command]
pub async fn start_watching(
    app: AppHandle,
    path: String,
    state: tauri::State<'_, Arc<Mutex<WatcherState>>>,
) -> Result<(), String> {
    let (tx, rx) = mpsc::channel::<FileChangeEvent>();

    nslnotes_core::watcher::start_watching(&path, &state, tx)?;

    // Bridge thread: reads from channel and emits Tauri events
    thread::spawn(move || {
        loop {
            match rx.recv() {
                Ok(event) => {
                    if let Err(e) = app.emit("file-changed", &event) {
                        eprintln!("Failed to emit event: {}", e);
                    }
                }
                Err(_) => {
                    // Channel closed, watcher stopped
                    break;
                }
            }
        }
    });

    Ok(())
}

/// Stop watching the directory
#[tauri::command]
pub async fn stop_watching(
    state: tauri::State<'_, Arc<Mutex<WatcherState>>>,
) -> Result<(), String> {
    nslnotes_core::watcher::stop_watching(&state)
}

/// Get current watcher status
#[tauri::command]
pub async fn get_watcher_status(
    state: tauri::State<'_, Arc<Mutex<WatcherState>>>,
) -> Result<(bool, Option<String>), String> {
    nslnotes_core::watcher::get_watcher_status(&state)
}
