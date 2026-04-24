// Streaming .tar.gz backup of one or more notebook root directories.
//
// Two entry points share the same archiving logic:
//   * `create_backup(sources, output_path)` — writes to a file atomically via
//     a .tmp sibling + rename. Used by the Tauri command, which also picks the
//     destination via a native save dialog.
//   * `create_backup_to_writer(sources, writer)` — streams into any Write sink.
//     Used by the axum web handler to pipe the archive directly to the HTTP
//     response so the browser triggers a download.
//
// Each source becomes a top-level folder in the archive, named after the
// notebook's (sanitized) display name — disambiguated with _2, _3, … on
// collision.
//
// Exclusions (not user-configurable in this MVP):
//   .git, node_modules, .Trash         (directory names, descendants pruned)
//   .DS_Store, Thumbs.db               (file names)
//   *.tmp, *.swp                       (suffixes)
// Symlinks are not followed and not archived — they are counted and reported
// via BackupStats.skipped_symlinks so the user knows they exist but were left out.

use crate::fs::{registry, BackupEntry};
use flate2::Compression;
use flate2::write::GzEncoder;
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use tar::{Builder, EntryType, Header};

const EXCLUDED_DIR_NAMES: &[&str] = &[".git", "node_modules", ".Trash"];
const EXCLUDED_FILE_NAMES: &[&str] = &[".DS_Store", "Thumbs.db"];
const EXCLUDED_SUFFIXES: &[&str] = &[".tmp", ".swp"];

use crate::smb_url::is_smb_url as is_smb;

/// Path-system-agnostic basename: last `/` or `\\` segment.
fn basename(path: &str) -> &str {
    path.rsplit(|c| c == '/' || c == '\\').next().unwrap_or(path)
}

/// Return `path` with leading `prefix` stripped, then any leading separators.
/// Errors if `path` does not start with `prefix`.
fn strip_root<'a>(path: &'a str, prefix: &str) -> Result<&'a str, String> {
    let rel = path
        .strip_prefix(prefix)
        .ok_or_else(|| format!("path '{}' is not under root '{}'", path, prefix))?;
    Ok(rel.trim_start_matches(|c| c == '/' || c == '\\'))
}

#[derive(Debug, Serialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub struct BackupStats {
    pub notebook_count: u64,
    pub file_count: u64,
    pub bytes_written: u64,
    pub skipped_symlinks: u64,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BackupSource {
    pub name: String,
    pub path: String,
}

/// Stream the backup archive into an arbitrary writer. Validates sources but
/// does not touch the filesystem beyond reading from the source trees.
pub fn create_backup_to_writer<W: Write>(
    sources: &[BackupSource],
    writer: W,
) -> Result<BackupStats, String> {
    if sources.is_empty() {
        return Err("No notebooks to back up".to_string());
    }
    let resolved = validate_sources(sources)?;
    let prefixes = compute_prefixes(&resolved);
    stream_archive(&resolved, &prefixes, writer)
}

/// Write the backup archive to a file path atomically (via .tmp + rename).
pub fn create_backup(
    sources: &[BackupSource],
    output_path: &Path,
) -> Result<BackupStats, String> {
    if sources.is_empty() {
        return Err("No notebooks to back up".to_string());
    }
    let resolved = validate_sources(sources)?;
    let prefixes = compute_prefixes(&resolved);

    // The output file may not yet exist; validate against its *parent*.
    let output_parent = output_path
        .parent()
        .ok_or_else(|| format!("Output path has no parent: {}", output_path.display()))?;
    fs::create_dir_all(output_parent).map_err(|e| {
        format!(
            "Failed to create output directory '{}': {}",
            output_parent.display(),
            e
        )
    })?;
    let canon_parent = output_parent
        .canonicalize()
        .map_err(|e| format!("Failed to resolve output directory: {}", e))?;
    let output_file_name = output_path
        .file_name()
        .ok_or_else(|| "Output path must include a file name".to_string())?;
    let canon_output = canon_parent.join(output_file_name);
    let canon_output_str = canon_output.to_string_lossy().into_owned();

    for src in &resolved {
        // The output file is on the local filesystem; only local sources can
        // contain it. SMB sources are in a different namespace and trivially
        // safe.
        if src.is_smb {
            continue;
        }
        if canon_output_str == src.root
            || canon_output_str.starts_with(&format!("{}/", src.root))
        {
            return Err(format!(
                "Refusing to write backup inside notebook '{}' — choose a destination outside your notebooks",
                src.root
            ));
        }
    }

    // Write to a .tmp sibling, rename on success. Guard removes the tmp file
    // on any early return.
    let tmp_path = {
        let mut p = output_path.to_path_buf();
        let fname = p
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| "backup.tar.gz".to_string());
        p.set_file_name(format!("{}.tmp", fname));
        p
    };

    struct TmpGuard {
        path: PathBuf,
        armed: bool,
    }
    impl Drop for TmpGuard {
        fn drop(&mut self) {
            if self.armed {
                let _ = fs::remove_file(&self.path);
            }
        }
    }
    let mut guard = TmpGuard {
        path: tmp_path.clone(),
        armed: true,
    };

    let file = File::create(&tmp_path)
        .map_err(|e| format!("Failed to create archive '{}': {}", tmp_path.display(), e))?;
    let stats = stream_archive(&resolved, &prefixes, file)?;

    fs::rename(&tmp_path, output_path).map_err(|e| {
        format!(
            "Failed to move backup into place '{}': {}",
            output_path.display(),
            e
        )
    })?;
    guard.armed = false;

    Ok(stats)
}

fn stream_archive<W: Write>(
    sources: &[ResolvedSource],
    prefixes: &[String],
    writer: W,
) -> Result<BackupStats, String> {
    let counted = CountingWriter::new(writer);
    let gz = GzEncoder::new(counted, Compression::default());
    let mut builder = Builder::new(gz);
    builder.follow_symlinks(false);

    let walk = walk_and_append(&mut builder, sources, prefixes)?;

    let gz = builder
        .into_inner()
        .map_err(|e| format!("Failed to finalize tar stream: {}", e))?;
    let counted = gz
        .finish()
        .map_err(|e| format!("Failed to finalize gzip stream: {}", e))?;

    Ok(BackupStats {
        notebook_count: sources.len() as u64,
        file_count: walk.file_count,
        bytes_written: counted.bytes_written(),
        skipped_symlinks: walk.skipped_symlinks,
    })
}

/// Resolved notebook source. `root` is the path the backend accepts (canonical
/// local path, or the original `smb://...` URL). `raw` is what the caller gave
/// us; kept for error messages.
struct ResolvedSource {
    name: String,
    root: String,
    is_smb: bool,
}

fn validate_sources(sources: &[BackupSource]) -> Result<Vec<ResolvedSource>, String> {
    let mut resolved: Vec<ResolvedSource> = Vec::with_capacity(sources.len());
    for src in sources {
        if is_smb(&src.path) {
            // For SMB the URL prefix has to match a registered backend;
            // verify_directory checks that + that the share is reachable.
            let backend = registry()
                .for_path(&src.path)
                .map_err(|e| format!("Notebook '{}': {}", src.name, e))?;
            let status = backend
                .verify_directory(&src.path)
                .map_err(|e| format!("Notebook '{}': {}", src.name, e))?;
            if !status.readable {
                return Err(format!(
                    "Notebook '{}' is not readable: {}",
                    src.name, src.path
                ));
            }
            resolved.push(ResolvedSource {
                name: src.name.clone(),
                root: src.path.trim_end_matches('/').to_string(),
                is_smb: true,
            });
        } else {
            let p = Path::new(&src.path);
            if !p.exists() {
                return Err(format!("Notebook path does not exist: {}", src.path));
            }
            if !p.is_dir() {
                return Err(format!("Notebook path is not a directory: {}", src.path));
            }
            let canon = p
                .canonicalize()
                .map_err(|e| format!("Failed to resolve '{}': {}", src.path, e))?;
            resolved.push(ResolvedSource {
                name: src.name.clone(),
                root: canon.to_string_lossy().into_owned(),
                is_smb: false,
            });
        }
    }

    // Overlap check. Paths from different path families (local vs smb://)
    // can never overlap; skip comparing them.
    for i in 0..resolved.len() {
        for j in 0..resolved.len() {
            if i == j {
                continue;
            }
            let a = &resolved[i];
            let b = &resolved[j];
            if a.is_smb != b.is_smb {
                continue;
            }
            let prefix = format!("{}/", b.root);
            if a.root == b.root || a.root.starts_with(&prefix) {
                return Err(format!(
                    "Notebook paths overlap: '{}' is inside or equal to '{}'",
                    a.root, b.root
                ));
            }
        }
    }

    Ok(resolved)
}

fn compute_prefixes(sources: &[ResolvedSource]) -> Vec<String> {
    let mut prefixes: Vec<String> = Vec::with_capacity(sources.len());
    for (i, src) in sources.iter().enumerate() {
        let base = sanitize_name(&src.name).unwrap_or_else(|| {
            let b = basename(&src.root);
            if b.is_empty() {
                format!("notebook_{}", i + 1)
            } else {
                b.to_string()
            }
        });
        let mut candidate = base.clone();
        let mut suffix = 2u32;
        while prefixes.iter().any(|p| p == &candidate) {
            candidate = format!("{}_{}", base, suffix);
            suffix += 1;
        }
        prefixes.push(candidate);
    }
    prefixes
}

struct WalkStats {
    file_count: u64,
    skipped_symlinks: u64,
}

fn walk_and_append<W: Write>(
    builder: &mut Builder<W>,
    sources: &[ResolvedSource],
    prefixes: &[String],
) -> Result<WalkStats, String> {
    let mut stats = WalkStats {
        file_count: 0,
        skipped_symlinks: 0,
    };

    for (src, prefix) in sources.iter().zip(prefixes.iter()) {
        let backend = registry()
            .for_path(&src.root)
            .map_err(|e| format!("Backup '{}': {}", src.name, e))?;
        let entries = backend
            .walk_for_backup(&src.root)
            .map_err(|e| format!("Walk under '{}': {}", src.root, e))?;

        // Pruned directory prefixes (ending in `/`) — any descendant is skipped.
        let mut skipped_prefixes: Vec<String> = Vec::new();

        // Top-level prefix dir is always present so the archive has the
        // notebook folder marker even if the tree is empty.
        append_dir_entry(builder, prefix)
            .map_err(|e| format!("Failed to add prefix dir '{}': {}", prefix, e))?;

        for e in entries {
            match e {
                BackupEntry::Dir { path } => {
                    // The root itself is already added above; skip to avoid a
                    // duplicate entry.
                    if path == src.root {
                        continue;
                    }
                    if skipped_prefixes.iter().any(|p| path.starts_with(p)) {
                        continue;
                    }
                    let name = basename(&path);
                    if EXCLUDED_DIR_NAMES.contains(&name) {
                        skipped_prefixes.push(format!("{}/", path));
                        continue;
                    }
                    let rel = strip_root(&path, &src.root)?;
                    let archive_path = join_archive(prefix, rel);
                    append_dir_entry(builder, &archive_path).map_err(|e| {
                        format!("Failed to add dir '{}': {}", path, e)
                    })?;
                }
                BackupEntry::File { path, size } => {
                    if skipped_prefixes.iter().any(|p| path.starts_with(p)) {
                        continue;
                    }
                    let name = basename(&path);
                    if EXCLUDED_FILE_NAMES.contains(&name) {
                        continue;
                    }
                    if EXCLUDED_SUFFIXES.iter().any(|s| name.ends_with(s)) {
                        continue;
                    }
                    let bytes = backend
                        .read_bytes(&path)
                        .map_err(|e| format!("Read '{}': {}", path, e))?;
                    let effective_size = if size > 0 { size } else { bytes.len() as u64 };
                    let rel = strip_root(&path, &src.root)?;
                    let archive_path = join_archive(prefix, rel);
                    append_file_entry(builder, &archive_path, &bytes, effective_size)
                        .map_err(|e| format!("Failed to add file '{}': {}", path, e))?;
                    stats.file_count += 1;
                }
                BackupEntry::Symlink { path: _ } => {
                    stats.skipped_symlinks += 1;
                }
            }
        }
    }

    Ok(stats)
}

/// Join an archive prefix (sanitized notebook name) with a relative path,
/// using `/` regardless of host OS for a consistent archive.
fn join_archive(prefix: &str, rel: &str) -> String {
    if rel.is_empty() {
        prefix.to_string()
    } else {
        // Normalize Windows separators in case any sneak in from a local path.
        let norm: String = rel.chars().map(|c| if c == '\\' { '/' } else { c }).collect();
        format!("{}/{}", prefix, norm)
    }
}

fn append_dir_entry<W: Write>(
    builder: &mut Builder<W>,
    archive_path: &str,
) -> io::Result<()> {
    let mut header = Header::new_gnu();
    header.set_size(0);
    header.set_mode(0o755);
    header.set_entry_type(EntryType::Directory);
    header.set_mtime(0);
    header.set_cksum();
    builder.append_data(&mut header, archive_path, io::empty())
}

fn append_file_entry<W: Write>(
    builder: &mut Builder<W>,
    archive_path: &str,
    bytes: &[u8],
    size: u64,
) -> io::Result<()> {
    let mut header = Header::new_gnu();
    header.set_size(size);
    header.set_mode(0o644);
    header.set_entry_type(EntryType::Regular);
    header.set_mtime(0);
    header.set_cksum();
    builder.append_data(&mut header, archive_path, bytes)
}

fn sanitize_name(name: &str) -> Option<String> {
    let mut out = String::with_capacity(name.len());
    let mut last_was_sep = false;
    for c in name.chars() {
        let replaced = match c {
            '/' | '\\' | '\0' => '_',
            c if c.is_control() => '_',
            c => c,
        };
        if replaced == '_' {
            if !last_was_sep {
                out.push('_');
                last_was_sep = true;
            }
        } else {
            out.push(replaced);
            last_was_sep = false;
        }
    }
    let trimmed: String = out
        .trim_matches(|c: char| c.is_whitespace() || c == '_')
        .to_string();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

struct CountingWriter<W: Write> {
    inner: W,
    count: u64,
}

impl<W: Write> CountingWriter<W> {
    fn new(inner: W) -> Self {
        Self { inner, count: 0 }
    }
    fn bytes_written(&self) -> u64 {
        self.count
    }
}

impl<W: Write> Write for CountingWriter<W> {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        let n = self.inner.write(buf)?;
        self.count += n as u64;
        Ok(n)
    }
    fn flush(&mut self) -> io::Result<()> {
        self.inner.flush()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use flate2::read::GzDecoder;
    use std::collections::BTreeSet;
    use std::io::Read;
    use tar::Archive;
    use tempfile::TempDir;

    fn write(path: &Path, contents: &str) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(path, contents).unwrap();
    }

    fn archive_entries(archive: &Path) -> BTreeSet<String> {
        let f = File::open(archive).unwrap();
        let gz = GzDecoder::new(f);
        let mut a = Archive::new(gz);
        let mut names = BTreeSet::new();
        for e in a.entries().unwrap() {
            let e = e.unwrap();
            names.insert(e.path().unwrap().to_string_lossy().into_owned());
        }
        names
    }

    fn archive_entries_from_bytes(bytes: &[u8]) -> BTreeSet<String> {
        let gz = GzDecoder::new(bytes);
        let mut a = Archive::new(gz);
        let mut names = BTreeSet::new();
        for e in a.entries().unwrap() {
            let e = e.unwrap();
            names.insert(e.path().unwrap().to_string_lossy().into_owned());
        }
        names
    }

    fn read_from_archive(archive: &Path, entry_path: &str) -> Option<String> {
        let f = File::open(archive).unwrap();
        let gz = GzDecoder::new(f);
        let mut a = Archive::new(gz);
        for e in a.entries().unwrap() {
            let mut e = e.unwrap();
            if e.path().unwrap().to_string_lossy() == entry_path {
                let mut s = String::new();
                e.read_to_string(&mut s).unwrap();
                return Some(s);
            }
        }
        None
    }

    #[test]
    fn single_notebook_round_trip() {
        let td = TempDir::new().unwrap();
        let nb = td.path().join("nb");
        write(&nb.join("notes/a.md"), "hello");
        write(&nb.join("tasks/b.md"), "world");
        write(&nb.join("docs/c.md"), "!");

        let out = td.path().join("out.tar.gz");
        let sources = vec![BackupSource {
            name: "Work".into(),
            path: nb.to_string_lossy().into_owned(),
        }];
        let stats = create_backup(&sources, &out).unwrap();
        assert_eq!(stats.notebook_count, 1);
        assert_eq!(stats.file_count, 3);
        assert_eq!(stats.skipped_symlinks, 0);
        assert!(stats.bytes_written > 0);
        assert!(out.exists());

        let names = archive_entries(&out);
        assert!(names.contains("Work/notes/a.md"));
        assert!(names.contains("Work/tasks/b.md"));
        assert!(names.contains("Work/docs/c.md"));
        assert_eq!(
            read_from_archive(&out, "Work/notes/a.md").as_deref(),
            Some("hello")
        );
    }

    #[test]
    fn writer_variant_round_trip() {
        let td = TempDir::new().unwrap();
        let nb = td.path().join("nb");
        write(&nb.join("notes/a.md"), "hello-stream");

        let sources = vec![BackupSource {
            name: "Work".into(),
            path: nb.to_string_lossy().into_owned(),
        }];
        let mut buf: Vec<u8> = Vec::new();
        let stats = create_backup_to_writer(&sources, &mut buf).unwrap();
        assert_eq!(stats.notebook_count, 1);
        assert_eq!(stats.file_count, 1);
        assert_eq!(stats.bytes_written as usize, buf.len());

        let names = archive_entries_from_bytes(&buf);
        assert!(names.contains("Work/notes/a.md"));
    }

    #[test]
    fn multi_notebook_round_trip() {
        let td = TempDir::new().unwrap();
        let nb1 = td.path().join("nb1");
        let nb2 = td.path().join("nb2");
        write(&nb1.join("notes/x.md"), "one");
        write(&nb2.join("notes/y.md"), "two");

        let out = td.path().join("out.tar.gz");
        let sources = vec![
            BackupSource {
                name: "Work".into(),
                path: nb1.to_string_lossy().into_owned(),
            },
            BackupSource {
                name: "Home".into(),
                path: nb2.to_string_lossy().into_owned(),
            },
        ];
        let stats = create_backup(&sources, &out).unwrap();
        assert_eq!(stats.notebook_count, 2);
        assert_eq!(stats.file_count, 2);

        let names = archive_entries(&out);
        assert!(names.contains("Work/notes/x.md"));
        assert!(names.contains("Home/notes/y.md"));
    }

    #[test]
    fn name_collision_is_disambiguated() {
        let td = TempDir::new().unwrap();
        let a = td.path().join("a");
        let b = td.path().join("b");
        write(&a.join("f.md"), "a");
        write(&b.join("f.md"), "b");

        let out = td.path().join("out.tar.gz");
        let sources = vec![
            BackupSource {
                name: "Work".into(),
                path: a.to_string_lossy().into_owned(),
            },
            BackupSource {
                name: "Work".into(),
                path: b.to_string_lossy().into_owned(),
            },
        ];
        create_backup(&sources, &out).unwrap();

        let names = archive_entries(&out);
        assert!(names.contains("Work/f.md"));
        assert!(names.contains("Work_2/f.md"));
    }

    #[test]
    fn excludes_git_and_ds_store() {
        let td = TempDir::new().unwrap();
        let nb = td.path().join("nb");
        write(&nb.join("notes/keep.md"), "keep");
        write(&nb.join(".git/HEAD"), "ref: refs/heads/main");
        write(&nb.join("notes/.DS_Store"), "junk");
        write(&nb.join("notes/draft.tmp"), "junk");

        let out = td.path().join("out.tar.gz");
        let sources = vec![BackupSource {
            name: "nb".into(),
            path: nb.to_string_lossy().into_owned(),
        }];
        create_backup(&sources, &out).unwrap();

        let names = archive_entries(&out);
        assert!(names.contains("nb/notes/keep.md"));
        assert!(!names.iter().any(|n| n.contains(".git")));
        assert!(!names.iter().any(|n| n.contains(".DS_Store")));
        assert!(!names.iter().any(|n| n.ends_with("draft.tmp")));
    }

    #[test]
    #[cfg(unix)]
    fn symlinks_are_skipped_and_counted() {
        let td = TempDir::new().unwrap();
        let nb = td.path().join("nb");
        write(&nb.join("real.md"), "real");
        std::os::unix::fs::symlink(nb.join("real.md"), nb.join("link.md")).unwrap();

        let out = td.path().join("out.tar.gz");
        let sources = vec![BackupSource {
            name: "nb".into(),
            path: nb.to_string_lossy().into_owned(),
        }];
        let stats = create_backup(&sources, &out).unwrap();
        assert_eq!(stats.skipped_symlinks, 1);

        let names = archive_entries(&out);
        assert!(names.contains("nb/real.md"));
        assert!(!names.iter().any(|n| n.ends_with("link.md")));
    }

    #[test]
    fn rejects_output_inside_source() {
        let td = TempDir::new().unwrap();
        let nb = td.path().join("nb");
        write(&nb.join("f.md"), "x");
        let out = nb.join("backup.tar.gz");
        let sources = vec![BackupSource {
            name: "nb".into(),
            path: nb.to_string_lossy().into_owned(),
        }];
        let err = create_backup(&sources, &out).unwrap_err();
        assert!(err.contains("inside notebook"), "got: {err}");
        assert!(!out.exists());
        assert!(!nb.join("backup.tar.gz.tmp").exists());
    }

    #[test]
    fn rejects_nested_sources() {
        let td = TempDir::new().unwrap();
        let outer = td.path().join("outer");
        let inner = outer.join("inner");
        write(&outer.join("a.md"), "a");
        write(&inner.join("b.md"), "b");

        let out = td.path().join("out.tar.gz");
        let sources = vec![
            BackupSource {
                name: "outer".into(),
                path: outer.to_string_lossy().into_owned(),
            },
            BackupSource {
                name: "inner".into(),
                path: inner.to_string_lossy().into_owned(),
            },
        ];
        let err = create_backup(&sources, &out).unwrap_err();
        assert!(err.contains("overlap"), "got: {err}");
    }

    #[test]
    fn rejects_empty_sources() {
        let td = TempDir::new().unwrap();
        let out = td.path().join("out.tar.gz");
        let err = create_backup(&[], &out).unwrap_err();
        assert!(err.contains("No notebooks"), "got: {err}");

        let mut buf: Vec<u8> = Vec::new();
        let err = create_backup_to_writer(&[], &mut buf).unwrap_err();
        assert!(err.contains("No notebooks"), "got: {err}");
    }

    #[test]
    fn no_tmp_file_left_on_success() {
        let td = TempDir::new().unwrap();
        let nb = td.path().join("nb");
        write(&nb.join("f.md"), "x");
        let out = td.path().join("out.tar.gz");
        let sources = vec![BackupSource {
            name: "nb".into(),
            path: nb.to_string_lossy().into_owned(),
        }];
        create_backup(&sources, &out).unwrap();
        assert!(out.exists());
        assert!(!td.path().join("out.tar.gz.tmp").exists());
    }

    #[test]
    fn no_tmp_file_left_on_failure() {
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let td = TempDir::new().unwrap();
            let nb = td.path().join("nb");
            write(&nb.join("secret.md"), "x");
            let mut perms = fs::metadata(&nb).unwrap().permissions();
            perms.set_mode(0o000);
            fs::set_permissions(&nb, perms).unwrap();

            let out = td.path().join("out.tar.gz");
            let sources = vec![BackupSource {
                name: "nb".into(),
                path: nb.to_string_lossy().into_owned(),
            }];
            let result = create_backup(&sources, &out);

            let mut perms = fs::metadata(&nb).unwrap().permissions();
            perms.set_mode(0o755);
            fs::set_permissions(&nb, perms).unwrap();

            let tmp = td.path().join("out.tar.gz.tmp");
            assert!(!tmp.exists(), "tmp file leaked");

            if result.is_err() {
                assert!(!out.exists(), "final file should not exist on failure");
            }
        }
    }

    #[test]
    fn sanitize_name_handles_slashes_and_empty() {
        assert_eq!(sanitize_name("hello").as_deref(), Some("hello"));
        assert_eq!(sanitize_name("a/b\\c").as_deref(), Some("a_b_c"));
        assert_eq!(sanitize_name("  ").as_deref(), None);
        assert_eq!(sanitize_name("///").as_deref(), None);
        assert_eq!(sanitize_name("  Work  ").as_deref(), Some("Work"));
    }
}
