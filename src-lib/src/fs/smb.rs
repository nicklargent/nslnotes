//! SMB2/3 [`Backend`] implementation via libsmbclient (pavao).
//!
//! libsmbclient contexts are not safe to touch from multiple threads — its
//! internal state (credentials cache, connection handles) assumes a single
//! owning thread. We sidestep that with a dedicated worker thread that owns
//! the [`pavao::SmbClient`]; `Backend` methods send closures to the worker
//! via a channel and block on the reply.
//!
//! Compiled only when the `smb` feature is enabled.

use super::{Backend, BackupEntry, DirectoryStatus};
use crate::watcher::{FileChangeEvent, FileChangeType, WatcherState};
use base64::Engine;
use pavao::{SmbClient, SmbCredentials, SmbDirentType, SmbOpenOptions, SmbOptions};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::mpsc::{self, Sender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

// The SMB worker channel is `Sender + Clone + Sync` on its own; no Mutex
// wrapper needed, and removing it saves one lock per SMB op.

/// Parsed connection info. `server = smb://host`, `share = notebooks`,
/// `mount_prefix` is the optional path within the share that maps to the
/// logical root (empty when `rootPath = smb://host/share`).
#[derive(Clone, Debug)]
pub struct SmbConfig {
    pub server: String,
    pub share: String,
    pub mount_prefix: String,
    pub username: String,
    pub password: String,
    pub workgroup: String,
}

impl SmbConfig {
    /// Parse host/share/path from the URL. Credentials come from the
    /// [`crate::fs::SmbCredential`] supplied at registration time.
    pub fn from_url_and_creds(
        url: &str,
        cred: &super::SmbCredential,
    ) -> Result<Self, String> {
        let parsed = crate::smb_url::parse_smb_url(url)?;
        let mount_prefix = if parsed.subpath.is_empty() {
            String::new()
        } else {
            format!("/{}", parsed.subpath)
        };
        let workgroup = if cred.domain.is_empty() {
            "WORKGROUP".to_string()
        } else {
            cred.domain.clone()
        };

        Ok(Self {
            server: format!("smb://{}", parsed.host),
            share: parsed.share,
            mount_prefix,
            username: cred.username.clone(),
            password: cred.password.clone(),
            workgroup,
        })
    }

    pub fn url_prefix(&self) -> String {
        format!("{}/{}{}", self.server, self.share, self.mount_prefix)
    }
}

/// A unit of work for the SMB worker thread: a closure + reply channel.
type Job = Box<dyn FnOnce(&mut Option<SmbClient>) + Send>;

pub struct SmbBackend {
    config: SmbConfig,
    tx: Sender<Job>,
}

impl SmbBackend {
    /// Build a backend from a URL plus explicit credentials. Creds come from
    /// the notebook entry in `settings.json`.
    pub fn new_with_creds(url: &str, cred: &super::SmbCredential) -> Result<Self, String> {
        let config = SmbConfig::from_url_and_creds(url, cred)?;
        let (tx, rx) = mpsc::channel::<Job>();
        let (ready_tx, ready_rx) = mpsc::channel::<Result<(), String>>();
        let worker_config = config.clone();
        // Build the client inside the worker thread so libsmbclient's thread-
        // local state is owned by that thread from the start.
        thread::Builder::new()
            .name("smb-worker".into())
            .spawn(move || {
                let mut client: Option<SmbClient> = match build_client(&worker_config) {
                    Ok(c) => {
                        let _ = ready_tx.send(Ok(()));
                        Some(c)
                    }
                    Err(e) => {
                        let _ = ready_tx.send(Err(e));
                        return;
                    }
                };
                while let Ok(job) = rx.recv() {
                    job(&mut client);
                }
                drop(client.take());
            })
            .map_err(|e| format!("failed to spawn smb worker: {e}"))?;
        ready_rx
            .recv()
            .map_err(|_| "smb worker died during connect".to_string())??;
        Ok(Self { config, tx })
    }

    fn resolve(&self, path: &str) -> Result<String, String> {
        let prefix = self.config.url_prefix();
        let rel = if path == prefix {
            ""
        } else if let Some(r) = path.strip_prefix(&prefix) {
            r.strip_prefix('/').unwrap_or(r)
        } else {
            return Err(format!("path outside configured SMB root: {path}"));
        };
        let mp = self.config.mount_prefix.trim_start_matches('/');
        let joined = match (mp.is_empty(), rel.is_empty()) {
            (true, true) => "/".to_string(),
            (true, false) => format!("/{rel}"),
            (false, true) => format!("/{mp}"),
            (false, false) => format!("/{mp}/{rel}"),
        };
        Ok(joined)
    }

    fn parent_of(path: &str) -> Option<String> {
        let trimmed = path.trim_end_matches('/');
        trimmed.rsplit_once('/').map(|(p, _)| {
            if p.is_empty() {
                "/".into()
            } else {
                p.to_string()
            }
        })
    }

    /// Submit a closure to the SMB worker, reconnecting once on failure.
    fn run<T, F>(&self, op: F) -> Result<T, String>
    where
        T: Send + 'static,
        F: FnOnce(&SmbClient) -> Result<T, String> + Send + Clone + 'static,
    {
        let config = self.config.clone();
        let (reply_tx, reply_rx) = mpsc::channel::<Result<T, String>>();
        let op_for_job = op.clone();
        let job: Job = Box::new(move |slot| {
            if slot.is_none() {
                match build_client(&config) {
                    Ok(c) => *slot = Some(c),
                    Err(e) => {
                        let _ = reply_tx.send(Err(format!("SMB reconnect failed: {e}")));
                        return;
                    }
                }
            }
            let client = slot.as_ref().expect("present by construction");
            let first = op_for_job(client);
            let result = match first {
                Ok(v) => Ok(v),
                Err(_first_err) => {
                    // Rebuild and retry once.
                    match build_client(&config) {
                        Ok(new) => {
                            *slot = Some(new);
                            op(slot.as_ref().unwrap())
                        }
                        Err(e) => Err(format!("SMB reconnect failed: {e}")),
                    }
                }
            };
            let _ = reply_tx.send(result);
        });
        self.tx
            .send(job)
            .map_err(|_| "smb worker stopped".to_string())?;
        reply_rx
            .recv()
            .map_err(|_| "smb worker reply channel closed".to_string())?
    }
}

fn build_client(config: &SmbConfig) -> Result<SmbClient, String> {
    let creds = SmbCredentials::default()
        .server(&config.server)
        .share(format!("/{}", config.share))
        .username(&config.username)
        .password(&config.password)
        .workgroup(&config.workgroup);
    SmbClient::new(creds, SmbOptions::default())
        .map_err(|e| format!("SMB connect to {} failed: {e}", config.server))
}

impl Backend for SmbBackend {
    fn read_file(&self, path: &str) -> Result<String, String> {
        let rel = self.resolve(path)?;
        self.run(move |client| {
            let mut file = client
                .open_with(&rel, SmbOpenOptions::default().read(true))
                .map_err(|e| format!("read open '{rel}': {e}"))?;
            let mut out = String::new();
            file.read_to_string(&mut out)
                .map_err(|e| format!("read '{rel}': {e}"))?;
            Ok(out)
        })
    }

    fn write_file(&self, path: &str, content: &str) -> Result<(), String> {
        ensure_smb_parent(self, path)?;
        let rel = self.resolve(path)?;
        let content = content.to_string();
        self.run(move |client| {
            let mut file = client
                .open_with(
                    &rel,
                    SmbOpenOptions::default()
                        .write(true)
                        .create(true)
                        .truncate(true),
                )
                .map_err(|e| format!("write open '{rel}': {e}"))?;
            file.write_all(content.as_bytes())
                .map_err(|e| format!("write '{rel}': {e}"))?;
            Ok(())
        })
    }

    fn delete_file(&self, path: &str) -> Result<(), String> {
        let rel = self.resolve(path)?;
        self.run(move |client| {
            client.unlink(&rel).map_err(|e| format!("unlink '{rel}': {e}"))
        })
    }

    fn delete_directory(&self, path: &str) -> Result<(), String> {
        if !self.file_exists(path)? {
            return Ok(());
        }
        let entries = self.list_directory(path)?;
        for entry in entries {
            if self.list_directory(&entry).is_ok() {
                self.delete_directory(&entry)?;
            } else {
                self.delete_file(&entry)?;
            }
        }
        let rel = self.resolve(path)?;
        self.run(move |client| {
            client.rmdir(&rel).map_err(|e| format!("rmdir '{rel}': {e}"))
        })
    }

    fn file_exists(&self, path: &str) -> Result<bool, String> {
        let rel = self.resolve(path)?;
        self.run(move |client| Ok(client.stat(&rel).is_ok()))
    }

    fn list_directory(&self, path: &str) -> Result<Vec<String>, String> {
        let rel = self.resolve(path)?;
        let prefix = path.trim_end_matches('/').to_string();
        self.run(move |client| {
            let entries = client
                .list_dir(&rel)
                .map_err(|e| format!("list '{rel}': {e}"))?;
            let mut out: Vec<String> = entries
                .into_iter()
                .filter_map(|e| {
                    let name = e.name().to_string();
                    match e.get_type() {
                        SmbDirentType::File | SmbDirentType::Dir => {
                            if name == "." || name == ".." {
                                None
                            } else {
                                Some(format!("{prefix}/{name}"))
                            }
                        }
                        _ => None,
                    }
                })
                .collect();
            out.sort();
            Ok(out)
        })
    }

    fn verify_directory(&self, path: &str) -> Result<DirectoryStatus, String> {
        let rel = self.resolve(path)?;
        let readable = self
            .run(move |client| Ok(client.list_dir(&rel).is_ok()))
            .unwrap_or(false);
        if !readable {
            return Ok(DirectoryStatus {
                readable: false,
                writable: false,
            });
        }
        let probe = format!("{}/.nslnotes_write_test", path.trim_end_matches('/'));
        let writable = self
            .write_file(&probe, "test")
            .and_then(|_| self.delete_file(&probe))
            .is_ok();
        Ok(DirectoryStatus { readable, writable })
    }

    fn ensure_directory(&self, path: &str) -> Result<(), String> {
        if self.file_exists(path)? {
            return Ok(());
        }
        if let Some(parent) = Self::parent_of(path) {
            if parent != path {
                self.ensure_directory(&parent)?;
            }
        }
        let rel = self.resolve(path)?;
        self.run(move |client| {
            client
                .mkdir(&rel, pavao::SmbMode::from(0o755))
                .map_err(|e| format!("mkdir '{rel}': {e}"))
        })
    }

    fn copy_file(&self, src: &str, dst: &str) -> Result<(), String> {
        let content_bytes: Vec<u8> = {
            let rel = self.resolve(src)?;
            self.run(move |client| {
                let mut file = client
                    .open_with(&rel, SmbOpenOptions::default().read(true))
                    .map_err(|e| format!("copy read open '{rel}': {e}"))?;
                let mut buf = Vec::new();
                file.read_to_end(&mut buf)
                    .map_err(|e| format!("copy read '{rel}': {e}"))?;
                Ok(buf)
            })?
        };
        ensure_smb_parent(self, dst)?;
        let rel_dst = self.resolve(dst)?;
        self.run(move |client| {
            let mut file = client
                .open_with(
                    &rel_dst,
                    SmbOpenOptions::default()
                        .write(true)
                        .create(true)
                        .truncate(true),
                )
                .map_err(|e| format!("copy write open '{rel_dst}': {e}"))?;
            file.write_all(&content_bytes)
                .map_err(|e| format!("copy write '{rel_dst}': {e}"))?;
            Ok(())
        })
    }

    fn write_binary(&self, path: &str, base64_data: &str) -> Result<(), String> {
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(base64_data)
            .map_err(|e| format!("Failed to decode base64: {e}"))?;
        ensure_smb_parent(self, path)?;
        let rel = self.resolve(path)?;
        self.run(move |client| {
            let mut file = client
                .open_with(
                    &rel,
                    SmbOpenOptions::default()
                        .write(true)
                        .create(true)
                        .truncate(true),
                )
                .map_err(|e| format!("binary write open '{rel}': {e}"))?;
            file.write_all(&bytes)
                .map_err(|e| format!("binary write '{rel}': {e}"))?;
            Ok(())
        })
    }

    fn get_file_size(&self, path: &str) -> Result<u64, String> {
        let rel = self.resolve(path)?;
        self.run(move |client| {
            client
                .stat(&rel)
                .map(|s| s.size as u64)
                .map_err(|e| format!("stat '{rel}': {e}"))
        })
    }

    fn read_bytes(&self, path: &str) -> Result<Vec<u8>, String> {
        let rel = self.resolve(path)?;
        self.run(move |client| {
            let mut file = client
                .open_with(&rel, SmbOpenOptions::default().read(true))
                .map_err(|e| format!("read open '{rel}': {e}"))?;
            let mut buf = Vec::new();
            file.read_to_end(&mut buf)
                .map_err(|e| format!("read '{rel}': {e}"))?;
            Ok(buf)
        })
    }

    fn walk_for_backup(&self, root: &str) -> Result<Vec<BackupEntry>, String> {
        let rel_root = self.resolve(root)?;
        let root_prefix = root.trim_end_matches('/').to_string();
        self.run(move |client| {
            let mut out: Vec<BackupEntry> = Vec::new();
            // Include the root itself as a directory entry so the tar archive
            // has the top-level folder marker.
            out.push(BackupEntry::Dir {
                path: root_prefix.clone(),
            });
            // Walk pre-order with lexicographic ordering for reproducibility.
            let mut stack: Vec<(String, String)> =
                vec![(rel_root.clone(), root_prefix.clone())];
            while let Some((rel_dir, abs_prefix)) = stack.pop() {
                let mut entries = client
                    .list_dir(&rel_dir)
                    .map_err(|e| format!("list '{rel_dir}': {e}"))?;
                entries.sort_by(|a, b| a.name().cmp(b.name()));
                // Push children onto the stack in reverse so pre-order pop
                // visits them in sorted order.
                let mut child_dirs: Vec<(String, String)> = Vec::new();
                for e in entries {
                    let name = e.name().to_string();
                    if name == "." || name == ".." {
                        continue;
                    }
                    let child_rel = if rel_dir == "/" {
                        format!("/{name}")
                    } else {
                        format!("{}/{name}", rel_dir.trim_end_matches('/'))
                    };
                    let child_abs = format!("{abs_prefix}/{name}");
                    match e.get_type() {
                        SmbDirentType::Dir => {
                            out.push(BackupEntry::Dir {
                                path: child_abs.clone(),
                            });
                            child_dirs.push((child_rel, child_abs));
                        }
                        SmbDirentType::File => {
                            let size = client.stat(&child_rel).map(|s| s.size as u64).unwrap_or(0);
                            out.push(BackupEntry::File {
                                path: child_abs,
                                size,
                            });
                        }
                        SmbDirentType::Link => {
                            out.push(BackupEntry::Symlink { path: child_abs });
                        }
                        _ => {}
                    }
                }
                // Depth-first, lexicographic: push in reverse so last-sorted
                // ends up at the top of the stack and is visited first? No —
                // we want first-sorted visited first, so push in reverse:
                for child in child_dirs.into_iter().rev() {
                    stack.push(child);
                }
            }
            Ok(out)
        })
    }

    fn walk_meta(&self, root: &str) -> Result<Vec<super::FileMeta>, String> {
        // Whole walk runs inside one SMB worker job so we don't pay channel
        // round-trips per directory.
        let rel_root = self.resolve(root)?;
        let root_prefix = root.trim_end_matches('/').to_string();
        self.run(move |client| {
            let mut out: Vec<super::FileMeta> = Vec::new();
            // Each entry in the stack is (share-relative path, absolute path
            // prefix as exposed to callers).
            let mut stack: Vec<(String, String)> =
                vec![(rel_root.clone(), root_prefix.clone())];
            while let Some((rel_dir, abs_prefix)) = stack.pop() {
                let entries = match client.list_dir(&rel_dir) {
                    Ok(e) => e,
                    Err(_) => continue,
                };
                for e in entries {
                    let name = e.name().to_string();
                    if name == "." || name == ".." {
                        continue;
                    }
                    let child_rel = if rel_dir == "/" {
                        format!("/{name}")
                    } else {
                        format!("{}/{name}", rel_dir.trim_end_matches('/'))
                    };
                    let child_abs = format!("{abs_prefix}/{name}");
                    match e.get_type() {
                        SmbDirentType::Dir => {
                            stack.push((child_rel, child_abs));
                        }
                        SmbDirentType::File => {
                            if !(name.ends_with(".md") || name.ends_with(".yaml")) {
                                continue;
                            }
                            if let Ok(st) = client.stat(&child_rel) {
                                let mtime = st
                                    .modified
                                    .duration_since(std::time::UNIX_EPOCH)
                                    .map(|d| d.as_secs() as i64)
                                    .unwrap_or(0);
                                out.push(super::FileMeta {
                                    path: child_abs,
                                    size: st.size as u64,
                                    mtime,
                                });
                            }
                        }
                        _ => {}
                    }
                }
            }
            Ok(out)
        })
    }
}

/// Poll the SMB tree rooted at `path` and emit create/modify/delete events as
/// files change. Runs until `state.is_watching` is flipped to false.
pub fn start_polling_watcher(
    path: &str,
    poll_interval: Duration,
    state: Arc<Mutex<WatcherState>>,
    event_tx: Sender<FileChangeEvent>,
) -> Result<(), String> {
    {
        let mut s = state.lock().map_err(|e| e.to_string())?;
        if s.is_watching {
            return Err("Already watching a directory".into());
        }
        s.is_watching = true;
        s.watch_path = Some(path.to_string());
    }

    let root = path.to_string();
    let state_clone = Arc::clone(&state);
    thread::spawn(move || {
        let mut snapshot: HashMap<String, (u64, i64)> = HashMap::new();
        // First pass: seed the snapshot silently so we don't spam "create" for
        // every existing file on startup.
        if let Ok(initial) = crate::fs::registry().for_path(&root).and_then(|b| b.walk_meta(&root)) {
            for f in initial {
                snapshot.insert(f.path, (f.size, f.mtime));
            }
        }
        loop {
            thread::sleep(poll_interval);
            if let Ok(s) = state_clone.lock() {
                if !s.is_watching {
                    break;
                }
            }
            let current = match crate::fs::registry().for_path(&root).and_then(|b| b.walk_meta(&root)) {
                Ok(v) => v,
                Err(_) => continue,
            };
            let mut seen: HashMap<String, (u64, i64)> = HashMap::new();
            for f in current {
                let key = (f.size, f.mtime);
                let prev = snapshot.get(&f.path).copied();
                match prev {
                    None => {
                        let _ = event_tx.send(FileChangeEvent {
                            path: f.path.clone(),
                            change_type: FileChangeType::Create,
                        });
                    }
                    Some(p) if p != key => {
                        let _ = event_tx.send(FileChangeEvent {
                            path: f.path.clone(),
                            change_type: FileChangeType::Modify,
                        });
                    }
                    _ => {}
                }
                seen.insert(f.path, key);
            }
            for (gone_path, _) in snapshot.iter() {
                if !seen.contains_key(gone_path) {
                    let _ = event_tx.send(FileChangeEvent {
                        path: gone_path.clone(),
                        change_type: FileChangeType::Delete,
                    });
                }
            }
            snapshot = seen;
        }
    });

    Ok(())
}

fn ensure_smb_parent(be: &SmbBackend, path: &str) -> Result<(), String> {
    if let Some(parent) = SmbBackend::parent_of(path) {
        if parent != path && !parent.is_empty() {
            be.ensure_directory(&parent)?;
        }
    }
    Ok(())
}
