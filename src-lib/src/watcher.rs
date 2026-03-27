use notify_debouncer_mini::{new_debouncer, notify::RecursiveMode, DebounceEventResult};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::mpsc::{self, Sender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

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

/// Start watching a directory for file changes.
/// Events are sent through the provided `event_tx` channel.
/// The watcher runs in a background thread and checks `state` to know when to stop.
pub fn start_watching(
    path: &str,
    state: &Arc<Mutex<WatcherState>>,
    event_tx: Sender<FileChangeEvent>,
) -> Result<(), String> {
    let watch_path = path.to_string();

    // Check if already watching
    {
        let mut watcher_state = state.lock().map_err(|e| e.to_string())?;
        if watcher_state.is_watching {
            return Err("Already watching a directory".to_string());
        }
        watcher_state.is_watching = true;
        watcher_state.watch_path = Some(path.to_string());
    }

    let state_clone = Arc::clone(state);

    thread::spawn(move || {
        let (tx, rx) = mpsc::channel::<DebounceEventResult>();

        let mut debouncer = match new_debouncer(Duration::from_millis(100), tx) {
            Ok(d) => d,
            Err(e) => {
                eprintln!("Failed to create watcher: {}", e);
                if let Ok(mut s) = state_clone.lock() {
                    s.is_watching = false;
                    s.watch_path = None;
                }
                return;
            }
        };

        if let Err(e) = debouncer
            .watcher()
            .watch(Path::new(&watch_path), RecursiveMode::Recursive)
        {
            eprintln!("Failed to watch directory: {}", e);
            if let Ok(mut s) = state_clone.lock() {
                s.is_watching = false;
                s.watch_path = None;
            }
            return;
        }

        println!("Started watching: {}", watch_path);

        loop {
            match rx.recv() {
                Ok(Ok(events)) => {
                    for event in events {
                        let path_str = event.path.to_string_lossy().to_string();

                        // Only emit events for markdown files
                        if !path_str.ends_with(".md") && !path_str.ends_with(".yaml") {
                            continue;
                        }

                        let change_type = if event.path.exists() {
                            FileChangeType::Modify
                        } else {
                            FileChangeType::Delete
                        };

                        let file_event = FileChangeEvent {
                            path: path_str,
                            change_type,
                        };

                        if event_tx.send(file_event).is_err() {
                            // Receiver dropped, stop watching
                            break;
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

            if let Ok(s) = state_clone.lock() {
                if !s.is_watching {
                    break;
                }
            }
        }

        println!("Stopped watching");
    });

    Ok(())
}

/// Stop watching the directory
pub fn stop_watching(state: &Arc<Mutex<WatcherState>>) -> Result<(), String> {
    let mut watcher_state = state.lock().map_err(|e| e.to_string())?;
    watcher_state.is_watching = false;
    watcher_state.watch_path = None;
    Ok(())
}

/// Get current watcher status
pub fn get_watcher_status(
    state: &Arc<Mutex<WatcherState>>,
) -> Result<(bool, Option<String>), String> {
    let watcher_state = state.lock().map_err(|e| e.to_string())?;
    Ok((watcher_state.is_watching, watcher_state.watch_path.clone()))
}
