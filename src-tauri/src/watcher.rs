use notify_debouncer_mini::{new_debouncer, notify::RecursiveMode, DebounceEventResult};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::mpsc::channel;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

/// File change event types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FileChangeType {
    Create,
    Modify,
    Delete,
}

/// File change event payload
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileChangeEvent {
    pub path: String,
    #[serde(rename = "type")]
    pub change_type: FileChangeType,
}

/// Watcher state
pub struct WatcherState {
    pub is_watching: bool,
    pub watch_path: Option<String>,
}

impl Default for WatcherState {
    fn default() -> Self {
        Self {
            is_watching: false,
            watch_path: None,
        }
    }
}

/// Start watching a directory for file changes
#[tauri::command]
pub async fn start_watching(
    app: AppHandle,
    path: String,
    state: tauri::State<'_, Arc<Mutex<WatcherState>>>,
) -> Result<(), String> {
    let watch_path = path.clone();

    // Check if already watching
    {
        let mut watcher_state = state.lock().map_err(|e| e.to_string())?;
        if watcher_state.is_watching {
            return Err("Already watching a directory".to_string());
        }
        watcher_state.is_watching = true;
        watcher_state.watch_path = Some(path.clone());
    }

    // Clone state for the thread
    let state_clone = Arc::clone(&state);

    // Spawn watcher thread
    thread::spawn(move || {
        let (tx, rx) = channel::<DebounceEventResult>();

        // Create debounced watcher with 100ms debounce
        let mut debouncer = match new_debouncer(Duration::from_millis(100), tx) {
            Ok(d) => d,
            Err(e) => {
                eprintln!("Failed to create watcher: {}", e);
                if let Ok(mut state) = state_clone.lock() {
                    state.is_watching = false;
                    state.watch_path = None;
                }
                return;
            }
        };

        // Start watching the directory recursively
        if let Err(e) = debouncer
            .watcher()
            .watch(Path::new(&watch_path), RecursiveMode::Recursive)
        {
            eprintln!("Failed to watch directory: {}", e);
            if let Ok(mut state) = state_clone.lock() {
                state.is_watching = false;
                state.watch_path = None;
            }
            return;
        }

        println!("Started watching: {}", watch_path);

        // Process events
        loop {
            match rx.recv() {
                Ok(Ok(events)) => {
                    for event in events {
                        let path_str = event.path.to_string_lossy().to_string();

                        // Only emit events for markdown files
                        if !path_str.ends_with(".md") && !path_str.ends_with(".yaml") {
                            continue;
                        }

                        // Determine change type based on file existence
                        let change_type = if event.path.exists() {
                            // Could be create or modify, we'll treat both as modify
                            // since we can't distinguish without tracking state
                            FileChangeType::Modify
                        } else {
                            FileChangeType::Delete
                        };

                        let file_event = FileChangeEvent {
                            path: path_str,
                            change_type,
                        };

                        // Emit event to frontend
                        if let Err(e) = app.emit("file-changed", &file_event) {
                            eprintln!("Failed to emit event: {}", e);
                        }
                    }
                }
                Ok(Err(error)) => {
                    eprintln!("Watch error: {:?}", error);
                }
                Err(e) => {
                    eprintln!("Channel error: {}", e);
                    break;
                }
            }

            // Check if we should stop watching
            if let Ok(state) = state_clone.lock() {
                if !state.is_watching {
                    break;
                }
            }
        }

        println!("Stopped watching");
    });

    Ok(())
}

/// Stop watching the directory
#[tauri::command]
pub async fn stop_watching(
    state: tauri::State<'_, Arc<Mutex<WatcherState>>>,
) -> Result<(), String> {
    let mut watcher_state = state.lock().map_err(|e| e.to_string())?;
    watcher_state.is_watching = false;
    watcher_state.watch_path = None;
    Ok(())
}

/// Get current watcher status
#[tauri::command]
pub async fn get_watcher_status(
    state: tauri::State<'_, Arc<Mutex<WatcherState>>>,
) -> Result<(bool, Option<String>), String> {
    let watcher_state = state.lock().map_err(|e| e.to_string())?;
    Ok((watcher_state.is_watching, watcher_state.watch_path.clone()))
}
