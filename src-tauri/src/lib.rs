mod commands;
mod watcher;

use commands::{
    delete_file, ensure_directory, file_exists, get_settings_path, list_directory, load_settings,
    read_file, save_settings, verify_directory, write_file, AppSettings,
};
use std::sync::{Arc, Mutex};
use tauri::Manager;
use watcher::{get_watcher_status, start_watching, stop_watching, WatcherState};

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Load settings synchronously (for setup/teardown hooks)
fn load_settings_sync(app: &tauri::AppHandle) -> Option<AppSettings> {
    let path = get_settings_path(app).ok()?;
    if !path.exists() {
        return Some(AppSettings::default());
    }
    let content = std::fs::read_to_string(&path).ok()?;
    serde_json::from_str(&content).ok()
}

/// Save settings synchronously
fn save_settings_sync(app: &tauri::AppHandle, settings: &AppSettings) {
    if let Ok(path) = get_settings_path(app) {
        if let Ok(json) = serde_json::to_string_pretty(settings) {
            let _ = std::fs::write(path, json);
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
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
            get_watcher_status,
            load_settings,
            save_settings
        ])
        .setup(|app| {
            // Restore window size/maximized state from settings
            if let Some(settings) = load_settings_sync(&app.handle()) {
                if let Some(window) = app.get_webview_window("main") {
                    let w = settings.window_width.unwrap_or(1200.0);
                    let h = settings.window_height.unwrap_or(800.0);
                    let _ = window.set_size(tauri::LogicalSize::new(w, h));
                    if settings.window_maximized == Some(true) {
                        let _ = window.maximize();
                    }
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                // Save window state before closing
                let app = window.app_handle();
                if let Some(mut settings) = load_settings_sync(app) {
                    if let Ok(maximized) = window.is_maximized() {
                        settings.window_maximized = Some(maximized);
                        // Save the un-maximized size so restore doesn't open maximized-sized
                        if !maximized {
                            if let Ok(size) = window.inner_size() {
                                if let Ok(scale) = window.scale_factor() {
                                    settings.window_width =
                                        Some(size.width as f64 / scale);
                                    settings.window_height =
                                        Some(size.height as f64 / scale);
                                }
                            }
                        }
                    }
                    save_settings_sync(app, &settings);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
