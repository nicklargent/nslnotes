//! Storage backend abstraction.
//!
//! The [`Backend`] trait isolates the existing free-function API in
//! [`crate::fs_ops`] from the concrete storage implementation. A process-
//! global [`BackendRegistry`] holds one [`local::LocalBackend`] plus a map of
//! [`smb::SmbBackend`]s keyed by `(host, share)`. The free functions in
//! `fs_ops` dispatch through [`registry`] on every call, so a single server
//! can serve multiple notebooks with different backends and credentials.

#[cfg(feature = "smb")]
use std::collections::HashMap;
use std::sync::{Arc, OnceLock};
#[cfg(feature = "smb")]
use std::sync::Mutex;

pub mod local;

#[cfg(feature = "smb")]
pub mod smb;

/// Result of directory verification.
#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct DirectoryStatus {
    pub readable: bool,
    pub writable: bool,
}

/// Metadata snapshot used by the polling watcher to diff tree state.
#[derive(Debug, Clone)]
pub struct FileMeta {
    pub path: String,
    pub size: u64,
    /// Modification time in seconds since Unix epoch.
    pub mtime: i64,
}

/// Entry yielded by [`Backend::walk_for_backup`]. Dirs and files both carry
/// the full logical path; symlinks are reported but not archived.
#[derive(Debug, Clone)]
pub enum BackupEntry {
    Dir { path: String },
    File { path: String, size: u64 },
    Symlink { path: String },
}

/// Storage backend operations. All methods are synchronous; callers in async
/// contexts should wrap in `tokio::task::spawn_blocking`.
pub trait Backend: Send + Sync {
    fn read_file(&self, path: &str) -> Result<String, String>;
    fn write_file(&self, path: &str, content: &str) -> Result<(), String>;
    fn delete_file(&self, path: &str) -> Result<(), String>;
    fn delete_directory(&self, path: &str) -> Result<(), String>;
    fn file_exists(&self, path: &str) -> Result<bool, String>;
    fn list_directory(&self, path: &str) -> Result<Vec<String>, String>;
    fn verify_directory(&self, path: &str) -> Result<DirectoryStatus, String>;
    fn ensure_directory(&self, path: &str) -> Result<(), String>;
    fn copy_file(&self, src: &str, dst: &str) -> Result<(), String>;
    fn write_binary(&self, path: &str, base64_data: &str) -> Result<(), String>;
    fn get_file_size(&self, path: &str) -> Result<u64, String>;

    /// Recursively walk `root` returning metadata for every `.md`/`.yaml` file
    /// beneath it. Used by the polling watcher; backends with native
    /// notifications return an empty vec.
    fn walk_meta(&self, _root: &str) -> Result<Vec<FileMeta>, String> {
        Ok(Vec::new())
    }

    /// Read a file as raw bytes. Needed for backup (binary-safe) and any
    /// non-UTF-8 content. Default impl reuses `read_file` and converts.
    fn read_bytes(&self, path: &str) -> Result<Vec<u8>, String> {
        self.read_file(path).map(|s| s.into_bytes())
    }

    /// Walk `root` returning every directory, file, and symlink encountered.
    /// Used by the backup path. Returned in a stable order (pre-order,
    /// lexicographic within a directory) so archives are reproducible.
    fn walk_for_backup(&self, _root: &str) -> Result<Vec<BackupEntry>, String> {
        Err("walk_for_backup not supported by this backend".into())
    }
}

/// Credentials + target for a single SMB share. The server registers one of
/// these for each `smb://` notebook.
#[cfg(feature = "smb")]
#[derive(Clone, Debug)]
pub struct SmbCredential {
    pub host: String,
    pub share: String,
    pub username: String,
    pub password: String,
    pub domain: String,
}

/// Process-wide registry of storage backends. Always owns a LocalBackend;
/// SMB backends are added on demand.
pub struct BackendRegistry {
    local: Arc<local::LocalBackend>,
    #[cfg(feature = "smb")]
    smb: Mutex<HashMap<(String, String), Arc<smb::SmbBackend>>>,
}

impl BackendRegistry {
    fn new() -> Self {
        Self {
            local: Arc::new(local::LocalBackend),
            #[cfg(feature = "smb")]
            smb: Mutex::new(HashMap::new()),
        }
    }

    /// Look up the Backend that owns `path`. Local paths always resolve to the
    /// LocalBackend. `smb://host/share/...` paths require a matching backend
    /// to have been registered first.
    pub fn for_path(&self, path: &str) -> Result<Arc<dyn Backend>, String> {
        if crate::smb_url::is_smb_url(path) {
            #[cfg(feature = "smb")]
            {
                let parsed = crate::smb_url::parse_smb_url(path)?;
                let map = self.smb.lock().map_err(|e| e.to_string())?;
                return map
                    .get(&(parsed.host.clone(), parsed.share.clone()))
                    .map(|b| b.clone() as Arc<dyn Backend>)
                    .ok_or_else(|| {
                        format!(
                            "no SMB backend registered for host={} share={} (path={path})",
                            parsed.host, parsed.share
                        )
                    });
            }
            #[cfg(not(feature = "smb"))]
            {
                return Err(format!("SMB support not compiled in (path {path})"));
            }
        }
        Ok(self.local.clone())
    }

    #[cfg(feature = "smb")]
    pub fn register_smb(&self, cred: SmbCredential) -> Result<(), String> {
        let url = format!("smb://{}/{}", cred.host, cred.share);
        let backend = smb::SmbBackend::new_with_creds(&url, &cred)?;
        let mut map = self.smb.lock().map_err(|e| e.to_string())?;
        map.insert((cred.host, cred.share), Arc::new(backend));
        Ok(())
    }

    /// Forget all registered SMB backends. Used before re-registering from an
    /// updated settings.json so stale creds don't linger.
    #[cfg(feature = "smb")]
    pub fn clear_smb(&self) {
        if let Ok(mut map) = self.smb.lock() {
            map.clear();
        }
    }
}

static REGISTRY: OnceLock<BackendRegistry> = OnceLock::new();

/// Access the process-wide registry, initializing it on first use.
pub fn registry() -> &'static BackendRegistry {
    REGISTRY.get_or_init(BackendRegistry::new)
}
