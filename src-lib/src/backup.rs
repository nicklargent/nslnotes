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

use flate2::Compression;
use flate2::write::GzEncoder;
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use tar::Builder;
use walkdir::WalkDir;

const EXCLUDED_DIR_NAMES: &[&str] = &[".git", "node_modules", ".Trash"];
const EXCLUDED_FILE_NAMES: &[&str] = &[".DS_Store", "Thumbs.db"];
const EXCLUDED_SUFFIXES: &[&str] = &[".tmp", ".swp"];

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
    let canonical = validate_and_canonicalize(sources)?;
    let prefixes = compute_prefixes(&canonical);
    stream_archive(&canonical, &prefixes, writer)
}

/// Write the backup archive to a file path atomically (via .tmp + rename).
pub fn create_backup(
    sources: &[BackupSource],
    output_path: &Path,
) -> Result<BackupStats, String> {
    if sources.is_empty() {
        return Err("No notebooks to back up".to_string());
    }
    let canonical = validate_and_canonicalize(sources)?;
    let prefixes = compute_prefixes(&canonical);

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

    for (_, src) in &canonical {
        if canon_output == *src || canon_output.starts_with(src) {
            return Err(format!(
                "Refusing to write backup inside notebook '{}' — choose a destination outside your notebooks",
                src.display()
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
    let stats = stream_archive(&canonical, &prefixes, file)?;

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
    canonical: &[(String, PathBuf)],
    prefixes: &[String],
    writer: W,
) -> Result<BackupStats, String> {
    let counted = CountingWriter::new(writer);
    let gz = GzEncoder::new(counted, Compression::default());
    let mut builder = Builder::new(gz);
    builder.follow_symlinks(false);

    let walk = walk_and_append(&mut builder, canonical, prefixes)?;

    let gz = builder
        .into_inner()
        .map_err(|e| format!("Failed to finalize tar stream: {}", e))?;
    let counted = gz
        .finish()
        .map_err(|e| format!("Failed to finalize gzip stream: {}", e))?;

    Ok(BackupStats {
        notebook_count: canonical.len() as u64,
        file_count: walk.file_count,
        bytes_written: counted.bytes_written(),
        skipped_symlinks: walk.skipped_symlinks,
    })
}

fn validate_and_canonicalize(
    sources: &[BackupSource],
) -> Result<Vec<(String, PathBuf)>, String> {
    let mut canonical: Vec<(String, PathBuf)> = Vec::with_capacity(sources.len());
    for src in sources {
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
        canonical.push((src.name.clone(), canon));
    }

    for i in 0..canonical.len() {
        for j in 0..canonical.len() {
            if i == j {
                continue;
            }
            let (_, a) = &canonical[i];
            let (_, b) = &canonical[j];
            if a == b || a.starts_with(b) {
                return Err(format!(
                    "Notebook paths overlap: '{}' is inside or equal to '{}'",
                    a.display(),
                    b.display()
                ));
            }
        }
    }

    Ok(canonical)
}

fn compute_prefixes(canonical: &[(String, PathBuf)]) -> Vec<String> {
    let mut prefixes: Vec<String> = Vec::with_capacity(canonical.len());
    for (i, (name, path)) in canonical.iter().enumerate() {
        let base = sanitize_name(name).unwrap_or_else(|| {
            path.file_name()
                .and_then(|n| n.to_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| format!("notebook_{}", i + 1))
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
    sources: &[(String, PathBuf)],
    prefixes: &[String],
) -> Result<WalkStats, String> {
    let mut stats = WalkStats {
        file_count: 0,
        skipped_symlinks: 0,
    };

    for ((_, src), prefix) in sources.iter().zip(prefixes.iter()) {
        let mut it = WalkDir::new(src).follow_links(false).into_iter();
        loop {
            let entry = match it.next() {
                None => break,
                Some(Err(e)) => return Err(format!("Walk error under '{}': {}", src.display(), e)),
                Some(Ok(e)) => e,
            };

            let ft = entry.file_type();
            let name = entry.file_name().to_string_lossy().into_owned();

            // Top-level entry: add the prefix dir itself.
            if entry.depth() == 0 {
                builder
                    .append_dir(Path::new(prefix), entry.path())
                    .map_err(|e| format!("Failed to add prefix dir '{}': {}", prefix, e))?;
                continue;
            }

            if ft.is_dir() && EXCLUDED_DIR_NAMES.contains(&name.as_str()) {
                it.skip_current_dir();
                continue;
            }
            if ft.is_file() {
                if EXCLUDED_FILE_NAMES.contains(&name.as_str()) {
                    continue;
                }
                if EXCLUDED_SUFFIXES.iter().any(|s| name.ends_with(s)) {
                    continue;
                }
            }
            if ft.is_symlink() {
                stats.skipped_symlinks += 1;
                continue;
            }

            let rel = entry
                .path()
                .strip_prefix(src)
                .map_err(|e| format!("Path walk invariant broken: {}", e))?;
            let archive_rel = Path::new(prefix).join(rel);

            if ft.is_dir() {
                builder
                    .append_dir(&archive_rel, entry.path())
                    .map_err(|e| {
                        format!("Failed to add dir '{}': {}", entry.path().display(), e)
                    })?;
            } else if ft.is_file() {
                let mut f = File::open(entry.path()).map_err(|e| {
                    format!("Failed to open '{}': {}", entry.path().display(), e)
                })?;
                builder.append_file(&archive_rel, &mut f).map_err(|e| {
                    format!("Failed to add file '{}': {}", entry.path().display(), e)
                })?;
                stats.file_count += 1;
            }
            // Other file types (fifo, device, socket) are silently skipped.
        }
    }

    Ok(stats)
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
