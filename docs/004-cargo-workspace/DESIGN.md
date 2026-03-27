# 004: Cargo Workspace — Technical Design

**Version 1.0 — March 2026**
**Status: Pre-Development Design**

This document specifies the crate architecture, dependency graph, API contracts, and data flow for refactoring the Rust backend into independent Tauri and web server binaries.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Crate Architecture](#2-crate-architecture)
3. [Core Library API](#3-core-library-api)
4. [Tauri Binary Design](#4-tauri-binary-design)
5. [Web Server Design](#5-web-server-design)
6. [Frontend Integration](#6-frontend-integration)
7. [Build System](#7-build-system)
8. [Key Tradeoffs](#8-key-tradeoffs)

---

## 1. Executive Summary

The current single `src-tauri/` crate mixes Tauri-specific wrappers with pure business logic. This design extracts the pure logic into a shared library and creates two independent binaries that consume it.

### Dependency Graph

```
nslnotes-core (src-lib/)
  ├── serde, serde_json
  ├── notify, notify-debouncer-mini
  └── base64

nslnotes-tauri (src-tauri/)
  ├── nslnotes-core
  ├── tauri (v2, protocol-asset)
  ├── tauri-plugin-opener
  └── tauri-plugin-dialog

nslnotes-web (src-web/)
  ├── nslnotes-core
  ├── axum (0.8)
  ├── tokio (1, full)
  ├── tower-http (0.6, cors)
  ├── rust-embed (8, axum)
  └── clap (4, derive)
```

No dependency path exists between `nslnotes-tauri` and `nslnotes-web`.

---

## 2. Crate Architecture

### 2.1 Workspace Manifest (repo root `Cargo.toml`)

```toml
[workspace]
members = ["src-lib", "src-tauri", "src-web"]
resolver = "2"

[workspace.dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

Shared `serde` and `serde_json` versions declared at workspace level. Each member uses `{ workspace = true }`.

### 2.2 Core Library (`src-lib/`)

Module structure:
```
src-lib/src/
  lib.rs          # pub mod declarations, re-exports
  fs_ops.rs       # file system operations
  settings.rs     # AppSettings type and path-based persistence
  watcher.rs      # file watcher with channel-based event emission
```

### 2.3 Tauri Binary (`src-tauri/`)

Module structure (same files, rewritten contents):
```
src-tauri/src/
  main.rs         # entry point: nslnotes_lib::run()
  lib.rs          # Tauri builder, plugin registration, window hooks
  commands.rs     # #[tauri::command] wrappers delegating to core
  watcher.rs      # bridge: core channel → app.emit()
```

Retains `build.rs`, `tauri.conf.json`, `icons/`, `capabilities/`, `gen/`.

### 2.4 Web Server (`src-web/`)

Module structure:
```
src-web/src/
  main.rs         # CLI parsing, Axum router assembly, server start
  routes.rs       # /api/* HTTP handlers
  sse.rs          # SSE endpoint for file watcher events
```

---

## 3. Core Library API

### 3.1 `fs_ops` Module

Extracted from current `commands.rs`. All functions are synchronous (the current `async` is artificial — they do blocking `std::fs` calls).

```rust
// src-lib/src/fs_ops.rs

#[derive(Debug, Serialize, Deserialize)]
pub struct DirectoryStatus {
    pub readable: bool,
    pub writable: bool,
}

pub fn read_file(path: &str) -> Result<String, String>;
pub fn write_file(path: &str, content: &str) -> Result<(), String>;
pub fn delete_file(path: &str) -> Result<(), String>;
pub fn delete_directory(path: &str) -> Result<(), String>;
pub fn file_exists(path: &str) -> bool;
pub fn list_directory(path: &str) -> Result<Vec<String>, String>;
pub fn verify_directory(path: &str) -> Result<DirectoryStatus, String>;
pub fn ensure_directory(path: &str) -> Result<(), String>;
pub fn copy_file(src: &str, dst: &str) -> Result<(), String>;
pub fn write_binary(path: &str, base64_data: &str) -> Result<(), String>;
pub fn get_file_size(path: &str) -> Result<u64, String>;
```

### 3.2 `settings` Module

```rust
// src-lib/src/settings.rs

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

pub fn load_from_path(path: &Path) -> Result<AppSettings, String>;
pub fn save_to_path(path: &Path, settings: &AppSettings) -> Result<(), String>;
```

Path resolution is the caller's responsibility:
- Tauri calls `app.path().app_config_dir()` to get the path
- Web server uses CLI `--settings-path` flag

### 3.3 `watcher` Module

```rust
// src-lib/src/watcher.rs

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FileChangeType { Create, Modify, Delete }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileChangeEvent {
    pub path: String,
    #[serde(rename = "type")]
    pub change_type: FileChangeType,
}

pub struct WatcherState {
    pub is_watching: bool,
    pub watch_path: Option<String>,
}

/// Start watching a directory. Events are sent through the provided channel.
/// Spawns a background thread. The caller consumes the channel as needed
/// (Tauri: app.emit, Web: broadcast to SSE clients).
pub fn start_watching(
    path: &str,
    state: &Arc<Mutex<WatcherState>>,
    sender: std::sync::mpsc::Sender<FileChangeEvent>,
) -> Result<(), String>;

pub fn stop_watching(state: &Arc<Mutex<WatcherState>>) -> Result<(), String>;

pub fn get_watcher_status(state: &Arc<Mutex<WatcherState>>) -> Result<(bool, Option<String>), String>;
```

---

## 4. Tauri Binary Design

### 4.1 Command Wrappers (`commands.rs`)

Each `#[tauri::command]` is a thin wrapper. Pattern:

```rust
use nslnotes_core::fs_ops;

#[tauri::command]
pub async fn read_file(path: String) -> Result<String, String> {
    fs_ops::read_file(&path)
}
```

Settings commands resolve the config path first:

```rust
use nslnotes_core::settings;

#[tauri::command]
pub async fn load_settings(app: AppHandle) -> Result<AppSettings, String> {
    let path = get_settings_path(&app)?;
    settings::load_from_path(&path)
}
```

`get_settings_path` remains in the Tauri crate (uses `app.path().app_config_dir()`).

### 4.2 Watcher Bridge (`watcher.rs`)

```rust
#[tauri::command]
pub async fn start_watching(
    app: AppHandle,
    path: String,
    state: tauri::State<'_, Arc<Mutex<WatcherState>>>,
) -> Result<(), String> {
    let (sender, receiver) = std::sync::mpsc::channel();

    // Start core watcher (spawns its own thread)
    nslnotes_core::watcher::start_watching(&path, &state, sender)?;

    // Bridge thread: channel → Tauri events
    let app_clone = app.clone();
    std::thread::spawn(move || {
        while let Ok(event) = receiver.recv() {
            if let Err(e) = app_clone.emit("file-changed", &event) {
                eprintln!("Failed to emit event: {}", e);
            }
        }
    });

    Ok(())
}
```

### 4.3 `lib.rs` and `main.rs`

Structurally identical to current code. Changes:
- Imports `nslnotes_core::settings::AppSettings` instead of local type
- `load_settings_sync` / `save_settings_sync` call core functions with resolved path
- All command registrations remain the same

---

## 5. Web Server Design

### 5.1 Server Setup (`main.rs`)

```rust
use clap::Parser;

#[derive(Parser)]
#[command(name = "nslnotes-web", about = "NslNotes web server")]
struct Args {
    #[arg(long, default_value = "3000")]
    port: u16,

    #[arg(long)]
    notes_dir: Option<String>,

    #[arg(long, default_value = "~/.config/nslnotes/settings.json")]
    settings_path: Option<String>,
}
```

Creates shared `AppState` (settings path, watcher state, broadcast channel), builds Axum router, starts Tokio runtime.

### 5.2 Route Handlers (`routes.rs`)

Each handler extracts query params or JSON body, calls core, returns JSON response. Example:

```rust
async fn read_file(Query(params): Query<FilePathQuery>) -> impl IntoResponse {
    match nslnotes_core::fs_ops::read_file(&params.path) {
        Ok(content) => (StatusCode::OK, content).into_response(),
        Err(e) => (StatusCode::NOT_FOUND, Json(json!({"error": e}))).into_response(),
    }
}
```

The `/api/assets` handler reads binary files and sets `Content-Type` based on file extension (same MIME map as `vite-plugin-api.ts`).

Settings endpoints (`GET/PUT /api/settings`) call `nslnotes_core::settings::load_from_path` / `save_to_path` using the configured settings path from `AppState`.

### 5.3 SSE File Watcher (`sse.rs`)

Architecture:

```
Core watcher thread
    │ mpsc::Sender<FileChangeEvent>
    ▼
Bridge task (tokio::spawn)
    │ broadcast::Sender<FileChangeEvent>
    ▼
SSE client 1  ◄── broadcast::Receiver
SSE client 2  ◄── broadcast::Receiver
    ...
```

- `POST /api/watch/start`: creates mpsc channel, starts core watcher, spawns bridge task
- `POST /api/watch/stop`: calls core `stop_watching`
- `GET /api/watch/events`: returns `Sse<impl Stream>`, each event is `data: <JSON>\n\n`

Uses Axum's `axum::response::sse::Sse` with `tokio_stream`.

### 5.4 Static File Serving

```rust
#[derive(RustEmbed)]
#[folder = "../dist/"]
struct Assets;
```

Fallback handler after all `/api/*` routes. Serves `index.html` for any path not matching a static file (SPA fallback).

---

## 6. Frontend Integration

### 6.1 `runtime.ts` — SSE Watcher

Replace the polling placeholder (lines 342-364) with SSE:

```typescript
// Web mode startWatching
startWatching: async (dir: string): Promise<void> => {
    await fetch('/api/watch/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: dir }),
    });

    const eventSource = new EventSource('/api/watch/events');
    eventSource.onmessage = (event) => {
        const fileEvent: FileChangeEvent = JSON.parse(event.data);
        for (const callback of pollingState.callbacks) {
            callback(fileEvent);
        }
    };
    // Store eventSource for cleanup
},
```

### 6.2 `SettingsService.ts` — HTTP Settings

Replace localStorage (lines 70-84, 103-109) with fetch calls:

```typescript
// Web mode loadSettings
const res = await fetch('/api/settings');
if (res.ok) {
    const settings = await res.json();
    return { ...DEFAULT_SETTINGS, ...settings };
}

// Web mode saveSettings
await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
});
```

---

## 7. Build System

### 7.1 Cargo Lockfile

The workspace lockfile lives at the repo root (`Cargo.lock`). The existing `src-tauri/Cargo.lock` should be moved/copied to the root, then the old one deleted. Cargo will regenerate as needed.

### 7.2 Tauri CLI

The Tauri CLI (`@tauri-apps/cli` from npm) looks for `src-tauri/` by default. Since we keep that directory name and `tauri.conf.json` stays inside it, no CLI configuration changes are needed.

`tauri.conf.json` paths remain unchanged:
- `frontendDist`: `"../dist"` — correct, `src-tauri/` is one level below repo root
- `beforeDevCommand` / `beforeBuildCommand`: run from repo root by default

### 7.3 `package.json` Scripts

```json
{
  "web:build": "npm run build && cargo build --release -p nslnotes-web",
  "web:serve": "cargo run -p nslnotes-web"
}
```

Existing scripts unchanged: `dev`, `dev:web`, `build`, `tauri`.

### 7.4 `.gitignore`

Add to existing `.gitignore`:
```
/target/
```

The workspace `target/` directory is at the repo root. The old `src-tauri/target/` entry may already exist — keep both during transition.

### 7.5 `gen/` Directory

Tauri generates schema files in `src-tauri/gen/`. After the Cargo.toml restructure, run `npm run tauri dev` once to regenerate. The `$schema` path in `capabilities/default.json` (`"../gen/schemas/desktop-schema.json"`) should still resolve correctly since both files remain in `src-tauri/`.

---

## 8. Key Tradeoffs

| Decision | Rationale |
|----------|-----------|
| Synchronous core functions | Current code does blocking `std::fs` calls already. Axum handlers can use `spawn_blocking` if needed. Avoids forcing an async runtime on the core. |
| `mpsc` channel for watcher | Simple, works across threads. The bridge layer adapts to each binary's event system. |
| `rust-embed` for static files | Produces a single self-contained binary. No need to ship `dist/` separately. |
| Keep `vite-plugin-api.ts` | Allows frontend dev without compiling any Rust. Different concern than production serving. |
| Settings via HTTP in web mode | Replaces localStorage, which doesn't persist across browsers/devices. Matches the Tauri behavior of disk-based settings. |
| `clap` for web server CLI | Standard Rust CLI library. Minimal overhead, good ergonomics. |
