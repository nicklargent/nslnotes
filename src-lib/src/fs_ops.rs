use base64::Engine;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

/// Result of directory verification
#[derive(Debug, Serialize, Deserialize)]
pub struct DirectoryStatus {
    pub readable: bool,
    pub writable: bool,
}

/// Ensure the parent directory of a path exists, creating it if needed.
fn ensure_parent_dir(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    Ok(())
}

/// Read file contents as string
pub fn read_file(path: &str) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| format!("Failed to read file '{}': {}", path, e))
}

/// Write content to file, creating parent directories if needed
pub fn write_file(path: &str, content: &str) -> Result<(), String> {
    ensure_parent_dir(Path::new(path))?;
    fs::write(path, content).map_err(|e| format!("Failed to write file '{}': {}", path, e))
}

/// Delete a file
pub fn delete_file(path: &str) -> Result<(), String> {
    fs::remove_file(path).map_err(|e| format!("Failed to delete file '{}': {}", path, e))
}

/// Delete a directory and all its contents
pub fn delete_directory(path: &str) -> Result<(), String> {
    let p = Path::new(path);
    if p.exists() {
        fs::remove_dir_all(path)
            .map_err(|e| format!("Failed to delete directory '{}': {}", path, e))
    } else {
        Ok(())
    }
}

/// Check if file exists
pub fn file_exists(path: &str) -> Result<bool, String> {
    Ok(Path::new(path).exists())
}

/// List files in directory (returns absolute paths)
pub fn list_directory(path: &str) -> Result<Vec<String>, String> {
    let dir = Path::new(path);

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
pub fn verify_directory(path: &str) -> Result<DirectoryStatus, String> {
    let dir = Path::new(path);

    let readable = dir.exists() && dir.is_dir();

    let writable = if readable {
        let test_file = dir.join(".nslnotes_write_test");
        match fs::write(&test_file, "test") {
            Ok(_) => {
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
pub fn ensure_directory(path: &str) -> Result<(), String> {
    let dir = Path::new(path);

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
pub fn copy_file(src: &str, dst: &str) -> Result<(), String> {
    ensure_parent_dir(Path::new(dst))?;
    fs::copy(src, dst).map_err(|e| format!("Failed to copy '{}' to '{}': {}", src, dst, e))?;
    Ok(())
}

/// Write base64-encoded binary data to a file, creating parent directories if needed
pub fn write_binary(path: &str, base64_data: &str) -> Result<(), String> {
    ensure_parent_dir(Path::new(path))?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64_data)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    fs::write(path, bytes).map_err(|e| format!("Failed to write binary file '{}': {}", path, e))
}

/// Get the size of a file in bytes
pub fn get_file_size(path: &str) -> Result<u64, String> {
    let metadata =
        fs::metadata(path).map_err(|e| format!("Failed to get file metadata '{}': {}", path, e))?;
    Ok(metadata.len())
}
