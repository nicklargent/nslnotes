//! Thin shim over [`crate::fs::BackendRegistry`]. Keeps the free-function API
//! stable for callers (Tauri commands, web routes) while storage is pluggable
//! per-path.

use crate::fs::registry;
pub use crate::fs::DirectoryStatus;
use std::sync::Arc;

pub fn read_file(path: &str) -> Result<String, String> {
    registry().for_path(path)?.read_file(path)
}

pub fn write_file(path: &str, content: &str) -> Result<(), String> {
    registry().for_path(path)?.write_file(path, content)
}

pub fn delete_file(path: &str) -> Result<(), String> {
    registry().for_path(path)?.delete_file(path)
}

pub fn delete_directory(path: &str) -> Result<(), String> {
    registry().for_path(path)?.delete_directory(path)
}

pub fn file_exists(path: &str) -> Result<bool, String> {
    registry().for_path(path)?.file_exists(path)
}

pub fn list_directory(path: &str) -> Result<Vec<String>, String> {
    registry().for_path(path)?.list_directory(path)
}

pub fn verify_directory(path: &str) -> Result<DirectoryStatus, String> {
    registry().for_path(path)?.verify_directory(path)
}

pub fn ensure_directory(path: &str) -> Result<(), String> {
    registry().for_path(path)?.ensure_directory(path)
}

pub fn copy_file(src: &str, dst: &str) -> Result<(), String> {
    // For cross-backend copies we'd need to stream through the server; today
    // both paths must share a backend. Local copies and same-share SMB copies
    // both satisfy that.
    let backend = registry().for_path(src)?;
    let dst_backend = registry().for_path(dst)?;
    if !Arc::ptr_eq(&backend, &dst_backend) {
        return Err(format!(
            "copy across backends is not supported: {src} -> {dst}"
        ));
    }
    backend.copy_file(src, dst)
}

pub fn write_binary(path: &str, base64_data: &str) -> Result<(), String> {
    registry().for_path(path)?.write_binary(path, base64_data)
}

pub fn get_file_size(path: &str) -> Result<u64, String> {
    registry().for_path(path)?.get_file_size(path)
}
