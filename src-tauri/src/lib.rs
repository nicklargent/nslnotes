mod commands;
mod watcher;

use commands::{
    copy_file, delete_directory, delete_file, ensure_directory, file_exists, get_file_size,
    list_directory, load_settings, read_file, save_settings, verify_directory,
    write_binary, write_file,
};
use nslnotes_core::settings::AppSettings;
use nslnotes_core::watcher::WatcherState;
use std::sync::{Arc, Mutex};
use tauri::Manager;
use watcher::{get_watcher_status, start_watching, stop_watching};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Load settings synchronously (for setup/teardown hooks)
fn load_settings_sync() -> Option<AppSettings> {
    let path = nslnotes_core::settings::default_path();
    nslnotes_core::settings::load_from_path(&path).ok()
}

/// Save settings synchronously
fn save_settings_sync(settings: &AppSettings) {
    let path = nslnotes_core::settings::default_path();
    let _ = nslnotes_core::settings::save_to_path(&path, settings);
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
            delete_directory,
            file_exists,
            list_directory,
            verify_directory,
            ensure_directory,
            start_watching,
            stop_watching,
            get_watcher_status,
            load_settings,
            save_settings,
            copy_file,
            write_binary,
            get_file_size
        ])
        .setup(|app| {
            // Log startup info
            let settings_path = nslnotes_core::settings::default_path();
            println!("  Settings:  {}", settings_path.display());

            // Restore window size/maximized state from settings
            if let Some(settings) = load_settings_sync() {
                if let Some(root) = &settings.root_path {
                    println!("  Notes dir: {}", root);
                }
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
                if let Some(mut settings) = load_settings_sync() {
                    if let Ok(maximized) = window.is_maximized() {
                        settings.window_maximized = Some(maximized);
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
                    save_settings_sync(&settings);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
