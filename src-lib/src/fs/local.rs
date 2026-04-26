//! Local filesystem [`Backend`] implementation.
//!
//! Moved verbatim from the pre-trait `fs_ops` free functions.

use super::{Backend, BackupEntry, DirectoryStatus};
use base64::Engine;
use std::fs;
use std::path::Path;
use walkdir::WalkDir;

pub struct LocalBackend;

fn ensure_parent_dir(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    Ok(())
}

impl Backend for LocalBackend {
    fn read_file(&self, path: &str) -> Result<String, String> {
        fs::read_to_string(path).map_err(|e| format!("Failed to read file '{}': {}", path, e))
    }

    fn write_file(&self, path: &str, content: &str) -> Result<(), String> {
        ensure_parent_dir(Path::new(path))?;
        fs::write(path, content).map_err(|e| format!("Failed to write file '{}': {}", path, e))
    }

    fn delete_file(&self, path: &str) -> Result<(), String> {
        fs::remove_file(path).map_err(|e| format!("Failed to delete file '{}': {}", path, e))
    }

    fn delete_directory(&self, path: &str) -> Result<(), String> {
        let p = Path::new(path);
        if p.exists() {
            fs::remove_dir_all(path)
                .map_err(|e| format!("Failed to delete directory '{}': {}", path, e))
        } else {
            Ok(())
        }
    }

    fn file_exists(&self, path: &str) -> Result<bool, String> {
        Ok(Path::new(path).exists())
    }

    fn list_directory(&self, path: &str) -> Result<Vec<String>, String> {
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

    fn verify_directory(&self, path: &str) -> Result<DirectoryStatus, String> {
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

    fn ensure_directory(&self, path: &str) -> Result<(), String> {
        let dir = Path::new(path);
        if dir.exists() {
            if dir.is_dir() {
                return Ok(());
            } else {
                return Err(format!("Path exists but is not a directory: {}", path));
            }
        }
        fs::create_dir_all(dir)
            .map_err(|e| format!("Failed to create directory '{}': {}", path, e))
    }

    fn copy_file(&self, src: &str, dst: &str) -> Result<(), String> {
        ensure_parent_dir(Path::new(dst))?;
        fs::copy(src, dst)
            .map_err(|e| format!("Failed to copy '{}' to '{}': {}", src, dst, e))?;
        Ok(())
    }

    fn write_binary(&self, path: &str, base64_data: &str) -> Result<(), String> {
        ensure_parent_dir(Path::new(path))?;
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(base64_data)
            .map_err(|e| format!("Failed to decode base64: {}", e))?;
        fs::write(path, bytes)
            .map_err(|e| format!("Failed to write binary file '{}': {}", path, e))
    }

    fn get_file_size(&self, path: &str) -> Result<u64, String> {
        let metadata = fs::metadata(path)
            .map_err(|e| format!("Failed to get file metadata '{}': {}", path, e))?;
        Ok(metadata.len())
    }

    fn read_bytes(&self, path: &str) -> Result<Vec<u8>, String> {
        fs::read(path).map_err(|e| format!("Failed to read '{}': {}", path, e))
    }

    fn list_md_dir_meta(&self, dir: &str) -> Result<Vec<(String, i64)>, String> {
        let entries = self.list_directory(dir)?;
        let mut out = Vec::with_capacity(entries.len());
        for path in entries {
            if !path.ends_with(".md") {
                continue;
            }
            let Ok(meta) = fs::metadata(&path) else {
                continue;
            };
            let mtime = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs() as i64)
                .unwrap_or(0);
            out.push((path, mtime));
        }
        Ok(out)
    }

    fn walk_for_backup(&self, root: &str) -> Result<Vec<BackupEntry>, String> {
        let mut out: Vec<BackupEntry> = Vec::new();
        for res in WalkDir::new(root)
            .follow_links(false)
            .sort_by_file_name()
        {
            let entry = res.map_err(|e| format!("Walk error under '{}': {}", root, e))?;
            let path_str = entry.path().to_string_lossy().into_owned();
            let ft = entry.file_type();
            if ft.is_symlink() {
                out.push(BackupEntry::Symlink { path: path_str });
            } else if ft.is_dir() {
                out.push(BackupEntry::Dir { path: path_str });
            } else if ft.is_file() {
                let size = entry
                    .metadata()
                    .map(|m| m.len())
                    .unwrap_or(0);
                out.push(BackupEntry::File {
                    path: path_str,
                    size,
                });
            }
        }
        Ok(out)
    }
}
