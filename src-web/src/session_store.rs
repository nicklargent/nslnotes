//! File-backed [`SessionStore`] so login sessions survive container restarts.
//!
//! Sessions live as one JSON file per session ID under `<config-dir>/sessions/`.
//! That mirrors how `settings.json` persists — same volume mount, same backup
//! story. The store is single-user-scale: every request reads + writes a small
//! file synchronously inside `spawn_blocking`. Don't reach for this on a
//! multi-tenant server; for a homelab single-user app it's perfect.

use async_trait::async_trait;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tower_sessions::cookie::time::OffsetDateTime;
use tower_sessions::session_store::{self, SessionStore};
use tower_sessions::session::{Id, Record};

#[derive(Debug, Clone)]
pub struct FileSessionStore {
    dir: Arc<PathBuf>,
}

impl FileSessionStore {
    /// Create the store rooted at `dir`. The directory is created on first use
    /// if it doesn't exist; failures during `save` surface as `Backend` errors
    /// rather than panics.
    pub fn new(dir: PathBuf) -> Self {
        Self { dir: Arc::new(dir) }
    }

    fn file_path(&self, id: &Id) -> PathBuf {
        // Id::to_string is already a base64-safe token, but stick to alnum +
        // standard URL-safe chars defensively in case the encoding ever changes.
        let safe: String = id
            .to_string()
            .chars()
            .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_'))
            .collect();
        self.dir.join(format!("{safe}.json"))
    }
}

fn err(e: impl std::fmt::Display) -> session_store::Error {
    session_store::Error::Backend(e.to_string())
}

#[async_trait]
impl SessionStore for FileSessionStore {
    async fn save(&self, record: &Record) -> session_store::Result<()> {
        let dir = self.dir.clone();
        let path = self.file_path(&record.id);
        let json = serde_json::to_vec(record).map_err(err)?;
        tokio::task::spawn_blocking(move || -> std::io::Result<()> {
            std::fs::create_dir_all(&*dir)?;
            // Write atomically: tmp file + rename so a crashed write doesn't
            // leave a half-serialized session file the next load would reject.
            let tmp = path.with_extension("json.tmp");
            std::fs::write(&tmp, &json)?;
            std::fs::rename(&tmp, &path)?;
            Ok(())
        })
        .await
        .map_err(err)?
        .map_err(err)
    }

    async fn load(&self, id: &Id) -> session_store::Result<Option<Record>> {
        let path = self.file_path(id);
        let bytes = tokio::task::spawn_blocking(move || {
            match std::fs::read(&path) {
                Ok(b) => Ok(Some(b)),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
                Err(e) => Err(e),
            }
        })
        .await
        .map_err(err)?
        .map_err(err)?;

        let Some(bytes) = bytes else { return Ok(None) };
        let record: Record = serde_json::from_slice(&bytes).map_err(err)?;
        if record.expiry_date <= OffsetDateTime::now_utc() {
            // Expired on disk; quietly let it lapse. A real cleanup task could
            // sweep the directory, but for a single user we just leave the
            // file until the next save overwrites it or the user clears the
            // sessions directory.
            return Ok(None);
        }
        Ok(Some(record))
    }

    async fn delete(&self, id: &Id) -> session_store::Result<()> {
        let path = self.file_path(id);
        tokio::task::spawn_blocking(move || match std::fs::remove_file(&path) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e),
        })
        .await
        .map_err(err)?
        .map_err(err)
    }
}

/// Resolve the sessions directory next to the `settings.json` path. Sits in
/// the same volume the user already mounts for persistence.
pub fn sessions_dir_for(settings_path: &Path) -> PathBuf {
    settings_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join("sessions")
}
