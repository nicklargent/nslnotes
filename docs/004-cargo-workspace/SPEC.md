# 004: Cargo Workspace — Independent Tauri & Web Binaries

## Overview

Refactor the Rust backend from a single `src-tauri/` crate into a Cargo workspace with three crates: a shared core library (`src-lib`), a Tauri desktop binary (`src-tauri`), and an Axum web server binary (`src-web`). Each binary can be built independently — building the web server requires zero Tauri dependencies, and vice versa.

The Vite dev server (`npm run dev:web`) remains for fast frontend iteration without compiling Rust.

---

## Motivation

1. **No production web server exists.** Web mode only works via the Vite dev server plugin, which duplicates all file operations in Node.js and cannot be deployed.
2. **Dependency coupling.** A user who only wants the web server must install all Tauri dependencies (and vice versa).
3. **Code duplication.** File operations are implemented twice — once in Rust (`commands.rs`) and once in Node.js (`vite-plugin-api.ts`). The web server eliminates the need for the Node.js implementation in production.

---

## 1. Workspace Layout

The workspace root `Cargo.toml` lives at the repository root. Three member crates:

| Crate | Directory | Purpose |
|-------|-----------|---------|
| `nslnotes-core` | `src-lib/` | Shared library: file ops, settings, file watcher |
| `nslnotes-tauri` | `src-tauri/` | Tauri desktop app (thin wrappers around core) |
| `nslnotes-web` | `src-web/` | Axum web server (HTTP API + SSE + static files) |

```
Cargo.toml              # workspace root
src-lib/                # shared core library
  src/
    lib.rs
    fs_ops.rs
    settings.rs
    watcher.rs
src-tauri/              # tauri binary (existing directory, refactored)
  tauri.conf.json
  build.rs
  icons/
  capabilities/
  src/
    main.rs
    lib.rs
    commands.rs
    watcher.rs
src-web/                # axum web server (new)
  src/
    main.rs
    routes.rs
    sse.rs
```

---

## 2. Core Library (`nslnotes-core`)

### 2.1 File Operations

All file operations extracted as plain synchronous functions (no Tauri dependency):

- `read_file(path) -> Result<String, String>`
- `write_file(path, content) -> Result<(), String>`
- `delete_file(path) -> Result<(), String>`
- `delete_directory(path) -> Result<(), String>`
- `file_exists(path) -> bool`
- `list_directory(path) -> Result<Vec<String>, String>`
- `verify_directory(path) -> Result<DirectoryStatus, String>`
- `ensure_directory(path) -> Result<(), String>`
- `copy_file(src, dst) -> Result<(), String>`
- `write_binary(path, base64_data) -> Result<(), String>`
- `get_file_size(path) -> Result<u64, String>`

### 2.2 Settings

`AppSettings` struct with path-based persistence (no `AppHandle`):

- `load_from_path(path: &Path) -> Result<AppSettings, String>`
- `save_to_path(path: &Path, settings: &AppSettings) -> Result<(), String>`

Each binary resolves the settings path independently:
- Tauri: `app.path().app_config_dir()`
- Web: CLI flag `--settings-path` (default `~/.config/nslnotes/settings.json`)

### 2.3 File Watcher

Channel-based event emission instead of Tauri's `app.emit()`:

- `start_watching(path, state, sender: mpsc::Sender<FileChangeEvent>) -> Result<(), String>`
- `stop_watching(state)`
- `get_watcher_status(state) -> (bool, Option<String>)`

Shared types: `FileChangeType`, `FileChangeEvent`, `WatcherState`.

Each binary consumes the channel differently:
- Tauri: bridge thread reads channel, calls `app.emit("file-changed", ...)`
- Web: bridge task reads channel, forwards to `tokio::sync::broadcast`, SSE clients subscribe

---

## 3. Tauri Binary (`nslnotes-tauri`)

Thin wrappers around core. All `#[tauri::command]` functions delegate to `nslnotes_core`. The Tauri builder setup (window restore/save, plugin registration) stays here.

No behavioral changes — the desktop app works identically to today.

---

## 4. Web Server (`nslnotes-web`)

### 4.1 CLI

```
nslnotes-web [OPTIONS]

Options:
  --port <PORT>              Listen port [default: 3000]
  --notes-dir <PATH>         Notes root directory (can also be set via settings)
  --settings-path <PATH>     Settings file path [default: ~/.config/nslnotes/settings.json]
```

### 4.2 HTTP API

Matches the existing `/api/*` URL structure used by `vite-plugin-api.ts` and `runtime.ts`:

| Route | Method | Operation |
|-------|--------|-----------|
| `/api/files?path=` | GET | Read file |
| `/api/files` | PUT | Write file |
| `/api/files?path=` | DELETE | Delete file |
| `/api/files/rmdir?path=` | DELETE | Delete directory |
| `/api/files/exists?path=` | GET | Check file exists |
| `/api/files/list?path=` | GET | List directory |
| `/api/files/verify?path=` | GET | Verify directory access |
| `/api/files/mkdir` | POST | Create directory |
| `/api/files/copy` | POST | Copy file |
| `/api/files/binary` | PUT | Write base64 binary |
| `/api/files/size?path=` | GET | File size |
| `/api/assets?path=` | GET | Serve image with MIME type |
| `/api/settings` | GET | Load settings |
| `/api/settings` | PUT | Save settings |

### 4.3 File Watcher (SSE)

| Route | Method | Operation |
|-------|--------|-----------|
| `/api/watch/start` | POST | Start watching directory |
| `/api/watch/stop` | POST | Stop watching |
| `/api/watch/events` | GET | SSE stream of `FileChangeEvent` |

Events are JSON: `{"path": "/home/user/notes/2026-03-25.md", "type": "modify"}`

### 4.4 Static File Serving

The built frontend (`dist/`) is embedded at compile time via `rust-embed`. All non-`/api/` requests serve the SPA (with `index.html` fallback for client-side routing).

---

## 5. Frontend Changes

### 5.1 File Watcher (SSE)

`runtime.ts` web mode watcher replaces the polling placeholder with:
- `POST /api/watch/start` to begin watching
- `EventSource('/api/watch/events')` for real-time events
- `POST /api/watch/stop` on teardown

### 5.2 Settings Persistence

`SettingsService.ts` web mode replaces `localStorage` with:
- `GET /api/settings` for load
- `PUT /api/settings` for save

Settings now persist to disk in web mode.

---

## 6. Build & Run Commands

| Command | What it does |
|---------|-------------|
| `npm run tauri dev` | Desktop app (unchanged) |
| `npm run tauri build` | Production desktop binary (unchanged) |
| `npm run dev:web` | Frontend dev with Vite HMR + Node.js API (unchanged) |
| `cargo build -p nslnotes-web` | Build web server binary |
| `cargo run -p nslnotes-web` | Run web server (requires `npm run build` first for `dist/`) |
| `npm run web:build` | Build frontend + web server in one step |

---

## 7. Independence Requirement

- `cargo build -p nslnotes-core` — compiles with zero Tauri and zero Axum deps
- `cargo build -p nslnotes-tauri` — compiles with Tauri deps, no Axum/Tokio
- `cargo build -p nslnotes-web` — compiles with Axum/Tokio, no Tauri
- A user cloning the repo for web-only use never needs Tauri system deps installed
