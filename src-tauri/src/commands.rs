use nslnotes_core::backup::{BackupSource, BackupStats};
use nslnotes_core::fs_ops::DirectoryStatus;
use nslnotes_core::settings::AppSettings;

#[tauri::command]
pub async fn read_file(path: String) -> Result<String, String> {
    nslnotes_core::fs_ops::read_file(&path)
}

#[tauri::command]
pub async fn write_file(path: String, content: String) -> Result<(), String> {
    nslnotes_core::fs_ops::write_file(&path, &content)
}

#[tauri::command]
pub async fn delete_file(path: String) -> Result<(), String> {
    nslnotes_core::fs_ops::delete_file(&path)
}

#[tauri::command]
pub async fn delete_directory(path: String) -> Result<(), String> {
    nslnotes_core::fs_ops::delete_directory(&path)
}

#[tauri::command]
pub async fn file_exists(path: String) -> Result<bool, String> {
    nslnotes_core::fs_ops::file_exists(&path)
}

#[tauri::command]
pub async fn list_directory(path: String) -> Result<Vec<String>, String> {
    nslnotes_core::fs_ops::list_directory(&path)
}

#[tauri::command]
pub async fn verify_directory(path: String) -> Result<DirectoryStatus, String> {
    nslnotes_core::fs_ops::verify_directory(&path)
}

#[tauri::command]
pub async fn ensure_directory(path: String) -> Result<(), String> {
    nslnotes_core::fs_ops::ensure_directory(&path)
}

#[tauri::command]
pub async fn copy_file(src: String, dst: String) -> Result<(), String> {
    nslnotes_core::fs_ops::copy_file(&src, &dst)
}

#[tauri::command]
pub async fn write_binary(path: String, base64_data: String) -> Result<(), String> {
    nslnotes_core::fs_ops::write_binary(&path, &base64_data)
}

#[tauri::command]
pub async fn get_file_size(path: String) -> Result<u64, String> {
    nslnotes_core::fs_ops::get_file_size(&path)
}

#[tauri::command]
pub async fn load_settings() -> Result<AppSettings, String> {
    let settings_path = nslnotes_core::settings::default_path();
    nslnotes_core::settings::load_from_path(&settings_path)
}

#[tauri::command]
pub async fn save_settings(settings: AppSettings) -> Result<(), String> {
    let settings_path = nslnotes_core::settings::default_path();
    nslnotes_core::settings::save_to_path(&settings_path, &settings)
}

#[tauri::command]
pub async fn create_backup(
    sources: Vec<BackupSource>,
    output_path: String,
) -> Result<BackupStats, String> {
    tokio::task::spawn_blocking(move || {
        nslnotes_core::backup::create_backup(&sources, std::path::Path::new(&output_path))
    })
    .await
    .map_err(|e| format!("Backup task panicked: {}", e))?
}

// Linux only: pair of the button-2 interceptor in lib.rs. The frontend
// calls this on middle-click and inserts the returned text at the click
// position, restoring the standard X11/Wayland PRIMARY paste behavior
// that webkit2gtk silently broke for HTML editable regions.
#[cfg(target_os = "linux")]
#[tauri::command]
pub async fn read_primary_selection() -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(|| -> Option<String> {
        use arboard::{Clipboard, GetExtLinux, LinuxClipboardKind};
        let mut clipboard = Clipboard::new().ok()?;
        clipboard
            .get()
            .clipboard(LinuxClipboardKind::Primary)
            .text()
            .ok()
    })
    .await
    .map_err(|e| format!("Primary selection task panicked: {}", e))
}

#[cfg(not(target_os = "linux"))]
#[tauri::command]
pub async fn read_primary_selection() -> Result<Option<String>, String> {
    Ok(None)
}
