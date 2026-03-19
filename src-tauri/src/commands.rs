use base64::Engine;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::{AppHandle, Manager};

/// Result of directory verification
#[derive(Debug, Serialize, Deserialize)]
pub struct DirectoryStatus {
    pub readable: bool,
    pub writable: bool,
}

/// Application settings
#[derive(Debug, Serialize, Deserialize, Default, Clone)]
pub struct AppSettings {
    #[serde(rename = "rootPath")]
    pub root_path: Option<String>,
    #[serde(rename = "leftColumnWidth", default)]
    pub left_column_width: Option<f64>,
    #[serde(rename = "rightColumnWidth", default)]
    pub right_column_width: Option<f64>,
    #[serde(rename = "fontSize", default)]
    pub font_size: Option<f64>,
    #[serde(rename = "windowWidth", default)]
    pub window_width: Option<f64>,
    #[serde(rename = "windowHeight", default)]
    pub window_height: Option<f64>,
    #[serde(rename = "windowMaximized", default)]
    pub window_maximized: Option<bool>,
    #[serde(rename = "darkMode", default)]
    pub dark_mode: Option<bool>,
}

/// Settings filename
const SETTINGS_FILE: &str = "settings.json";

/// Ensure the parent directory of a path exists, creating it if needed.
fn ensure_parent_dir(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    Ok(())
}

/// Read file contents as string
#[tauri::command]
pub async fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read file '{}': {}", path, e))
}

/// Write content to file, creating parent directories if needed
#[tauri::command]
pub async fn write_file(path: String, content: String) -> Result<(), String> {
    ensure_parent_dir(Path::new(&path))?;
    fs::write(&path, content).map_err(|e| format!("Failed to write file '{}': {}", path, e))
}

/// Delete a file
#[tauri::command]
pub async fn delete_file(path: String) -> Result<(), String> {
    fs::remove_file(&path).map_err(|e| format!("Failed to delete file '{}': {}", path, e))
}

/// Delete a directory and all its contents
#[tauri::command]
pub async fn delete_directory(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.exists() {
        fs::remove_dir_all(&path).map_err(|e| format!("Failed to delete directory '{}': {}", path, e))
    } else {
        Ok(())
    }
}

/// Check if file exists
#[tauri::command]
pub async fn file_exists(path: String) -> Result<bool, String> {
    Ok(Path::new(&path).exists())
}

/// List files in directory (returns absolute paths)
#[tauri::command]
pub async fn list_directory(path: String) -> Result<Vec<String>, String> {
    let dir = Path::new(&path);

    if !dir.exists() {
        return Err(format!("Directory does not exist: {}", path));
    }

    if !dir.is_dir() {
        return Err(format!("Path is not a directory: {}", path));
    }

    let entries = fs::read_dir(dir).map_err(|e| format!("Failed to read directory: {}", e))?;

    let mut files: Vec<String> = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        if let Some(path_str) = entry.path().to_str() {
            files.push(path_str.to_string());
        }
    }

    files.sort();
    Ok(files)
}

/// Verify directory is accessible and writable
#[tauri::command]
pub async fn verify_directory(path: String) -> Result<DirectoryStatus, String> {
    let dir = Path::new(&path);

    let readable = dir.exists() && dir.is_dir();

    // Test writability by attempting to create a temp file
    let writable = if readable {
        let test_file = dir.join(".nslnotes_write_test");
        match fs::write(&test_file, "test") {
            Ok(_) => {
                // Clean up test file
                let _ = fs::remove_file(&test_file);
                true
            }
            Err(_) => false,
        }
    } else {
        false
    };

    Ok(DirectoryStatus { readable, writable })
}

/// Ensure directory exists, creating if necessary
#[tauri::command]
pub async fn ensure_directory(path: String) -> Result<(), String> {
    let dir = Path::new(&path);

    if dir.exists() {
        if dir.is_dir() {
            return Ok(());
        } else {
            return Err(format!("Path exists but is not a directory: {}", path));
        }
    }

    fs::create_dir_all(dir).map_err(|e| format!("Failed to create directory '{}': {}", path, e))
}

/// Copy a file from src to dst, creating parent directories if needed
#[tauri::command]
pub async fn copy_file(src: String, dst: String) -> Result<(), String> {
    ensure_parent_dir(Path::new(&dst))?;
    fs::copy(&src, &dst).map_err(|e| format!("Failed to copy '{}' to '{}': {}", src, dst, e))?;
    Ok(())
}

/// Write base64-encoded binary data to a file, creating parent directories if needed
#[tauri::command]
pub async fn write_binary(path: String, base64_data: String) -> Result<(), String> {
    ensure_parent_dir(Path::new(&path))?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&base64_data)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    fs::write(&path, bytes).map_err(|e| format!("Failed to write binary file '{}': {}", path, e))
}

/// Get the size of a file in bytes
#[tauri::command]
pub async fn get_file_size(path: String) -> Result<u64, String> {
    let metadata = fs::metadata(&path)
        .map_err(|e| format!("Failed to get file metadata '{}': {}", path, e))?;
    Ok(metadata.len())
}

/// Get the settings file path
pub fn get_settings_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Failed to get config directory: {}", e))?;

    // Ensure config directory exists
    if !config_dir.exists() {
        fs::create_dir_all(&config_dir)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }

    Ok(config_dir.join(SETTINGS_FILE))
}

/// Load application settings
#[tauri::command]
pub async fn load_settings(app: AppHandle) -> Result<AppSettings, String> {
    let settings_path = get_settings_path(&app)?;

    if !settings_path.exists() {
        return Ok(AppSettings::default());
    }

    let content = fs::read_to_string(&settings_path)
        .map_err(|e| format!("Failed to read settings: {}", e))?;

    serde_json::from_str(&content).map_err(|e| format!("Failed to parse settings: {}", e))
}

/// Save application settings
#[tauri::command]
pub async fn save_settings(app: AppHandle, settings: AppSettings) -> Result<(), String> {
    let settings_path = get_settings_path(&app)?;

    let content =
        serde_json::to_string_pretty(&settings).map_err(|e| format!("Failed to serialize settings: {}", e))?;

    fs::write(&settings_path, content).map_err(|e| format!("Failed to write settings: {}", e))
}
