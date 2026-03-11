mod commands;
mod watcher;

use commands::{
    delete_file, ensure_directory, file_exists, list_directory, read_file, verify_directory,
    write_file,
};
use std::sync::{Arc, Mutex};
use watcher::{get_watcher_status, start_watching, stop_watching, WatcherState};

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(Arc::new(Mutex::new(WatcherState::default())))
        .invoke_handler(tauri::generate_handler![
            greet,
            read_file,
            write_file,
            delete_file,
            file_exists,
            list_directory,
            verify_directory,
            ensure_directory,
            start_watching,
            stop_watching,
            get_watcher_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
