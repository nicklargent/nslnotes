use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

/// Result of directory verification
#[derive(Debug, Serialize, Deserialize)]
pub struct DirectoryStatus {
    pub readable: bool,
    pub writable: bool,
}

/// Read file contents as string
#[tauri::command]
pub async fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read file '{}': {}", path, e))
}

/// Write content to file, creating parent directories if needed
#[tauri::command]
pub async fn write_file(path: String, content: String) -> Result<(), String> {
    // Ensure parent directory exists
    if let Some(parent) = Path::new(&path).parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory: {}", e))?;
        }
    }

    fs::write(&path, content).map_err(|e| format!("Failed to write file '{}': {}", path, e))
}

/// Delete a file
#[tauri::command]
pub async fn delete_file(path: String) -> Result<(), String> {
    fs::remove_file(&path).map_err(|e| format!("Failed to delete file '{}': {}", path, e))
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
