# 004: Cargo Workspace — Implementation Tasks

Tasks are ordered by dependency. Each references SPEC and DESIGN sections and includes verification criteria.

---

## Phase 1: Core Library Extraction

### T1.1 Create workspace root Cargo.toml
**Satisfies**: SPEC §1, Design §2.1
**Dependencies**: None
**Acceptance**:
- [x] `Cargo.toml` at repo root defines workspace with members `["src-lib", "src-tauri", "src-web"]`
- [x] Workspace dependencies declared for `serde` and `serde_json`
- [x] `resolver = "2"` set

**Verify**: `cargo metadata --format-version 1` shows workspace members

---

### T1.2 Create `src-lib/` core library crate
**Satisfies**: SPEC §2, Design §2.2
**Dependencies**: T1.1
**Acceptance**:
- [x] `src-lib/Cargo.toml` created with `nslnotes-core` package name
- [x] Dependencies: `serde`, `serde_json` (workspace), `notify`, `notify-debouncer-mini`, `base64`
- [x] `src-lib/src/lib.rs` declares pub modules: `fs_ops`, `settings`, `watcher`

**Verify**: `cargo check -p nslnotes-core`

---

### T1.3 Extract file operations into `src-lib/src/fs_ops.rs`
**Satisfies**: SPEC §2.1, Design §3.1
**Dependencies**: T1.2
**Source**: `src-tauri/src/commands.rs` (lines 1-176)
**Acceptance**:
- [x] All 11 file ops extracted as plain `pub fn` (no `#[tauri::command]`, no `async`)
- [x] `ensure_parent_dir` extracted as private helper
- [x] `DirectoryStatus` struct moved here
- [x] No `tauri` dependency in function signatures or imports

**Verify**: `cargo check -p nslnotes-core`

---

### T1.4 Extract settings into `src-lib/src/settings.rs`
**Satisfies**: SPEC §2.2, Design §3.2
**Dependencies**: T1.2
**Source**: `src-tauri/src/commands.rs` (lines 8-37, 178-218)
**Acceptance**:
- [x] `AppSettings` struct moved here (with all serde renames)
- [x] `load_from_path(path: &Path) -> Result<AppSettings, String>` implemented
- [x] `save_to_path(path: &Path, settings: &AppSettings) -> Result<(), String>` implemented
- [x] No `tauri::AppHandle` anywhere in this module

**Verify**: `cargo check -p nslnotes-core`

---

### T1.5 Extract file watcher into `src-lib/src/watcher.rs`
**Satisfies**: SPEC §2.3, Design §3.3
**Dependencies**: T1.2
**Source**: `src-tauri/src/watcher.rs`
**Acceptance**:
- [x] `FileChangeType`, `FileChangeEvent`, `WatcherState` types moved here
- [x] `start_watching` takes `mpsc::Sender<FileChangeEvent>` instead of `AppHandle`
- [x] Watcher thread sends events through channel (not `app.emit`)
- [x] `stop_watching` and `get_watcher_status` are plain functions on `&Arc<Mutex<WatcherState>>`
- [x] Filters to `.md` and `.yaml` files preserved
- [x] 100ms debounce preserved
- [x] No `tauri` dependency

**Verify**: `cargo check -p nslnotes-core`

---

### T1.6 Verify core builds independently
**Satisfies**: SPEC §7
**Dependencies**: T1.3, T1.4, T1.5
**Acceptance**:
- [x] `cargo build -p nslnotes-core` succeeds
- [x] `cargo tree -p nslnotes-core` shows zero tauri or axum dependencies
- [x] No compiler warnings

**Verify**: `cargo build -p nslnotes-core && cargo tree -p nslnotes-core | grep -E "tauri|axum"`

---

## Phase 2: Tauri Binary Refactor

### T2.1 Update `src-tauri/Cargo.toml` for workspace
**Satisfies**: SPEC §3, Design §2.3
**Dependencies**: T1.6
**Acceptance**:
- [x] Package name set to `nslnotes-tauri`
- [x] `nslnotes-core = { path = "../src-lib" }` added to dependencies
- [x] `serde` and `serde_json` use `{ workspace = true }`
- [x] `notify`, `notify-debouncer-mini`, `base64` removed (provided by core)
- [x] `lib` section retained with `crate-type = ["staticlib", "cdylib", "rlib"]`
- [x] `build-dependencies` and Tauri plugin deps unchanged

**Verify**: `cargo check -p nslnotes-tauri`

---

### T2.2 Rewrite `src-tauri/src/commands.rs` as thin wrappers
**Satisfies**: SPEC §3, Design §4.1
**Dependencies**: T2.1
**Acceptance**:
- [x] Each `#[tauri::command]` delegates to `nslnotes_core::fs_ops::*`
- [x] `load_settings` and `save_settings` resolve path via `get_settings_path(&app)` then call core
- [x] `get_settings_path` stays in this module (uses `AppHandle`)
- [x] `AppSettings` imported from `nslnotes_core::settings`
- [x] `DirectoryStatus` imported from `nslnotes_core::fs_ops`

**Verify**: `cargo check -p nslnotes-tauri`

---

### T2.3 Rewrite `src-tauri/src/watcher.rs` as Tauri bridge
**Satisfies**: SPEC §3, Design §4.2
**Dependencies**: T2.1
**Acceptance**:
- [x] `start_watching` creates `mpsc::channel`, passes sender to `nslnotes_core::watcher::start_watching`
- [x] Bridge thread reads receiver and calls `app.emit("file-changed", &event)`
- [x] `stop_watching` and `get_watcher_status` delegate to core functions
- [x] `WatcherState` imported from core

**Verify**: `cargo check -p nslnotes-tauri`

---

### T2.4 Update `src-tauri/src/lib.rs`
**Satisfies**: SPEC §3, Design §4.3
**Dependencies**: T2.2, T2.3
**Acceptance**:
- [x] Imports `nslnotes_core::settings::AppSettings` (not local type)
- [x] `load_settings_sync` calls `nslnotes_core::settings::load_from_path` with resolved path
- [x] `save_settings_sync` calls `nslnotes_core::settings::save_to_path` with resolved path
- [x] All command handler registrations preserved
- [x] Window setup/close hooks work with core settings functions

**Verify**: `cargo check -p nslnotes-tauri`

---

### T2.5 Move Cargo.lock to workspace root
**Satisfies**: Design §7.1
**Dependencies**: T2.1
**Acceptance**:
- [x] `src-tauri/Cargo.lock` moved to repo root `Cargo.lock`
- [x] Old lockfile removed
- [x] `cargo check` resolves dependencies correctly

**Verify**: `cargo check` from repo root

---

### T2.6 Update `.gitignore`
**Satisfies**: Design §7.4
**Dependencies**: T2.1
**Acceptance**:
- [x] `/target/` added to `.gitignore` (workspace target dir at repo root)

**Verify**: `git status` does not show `target/` as untracked

---

### T2.7 Verify Tauri app works end-to-end
**Satisfies**: SPEC §3, SPEC §7
**Dependencies**: T2.4, T2.5, T2.6
**Acceptance**:
- [x] `npm run tauri dev` starts the app
- [x] File operations (create, read, edit, delete notes) work
- [x] File watcher detects external changes
- [x] Settings persist across restart
- [x] Window size restore works
- [x] `cargo tree -p nslnotes-tauri | grep axum` returns nothing

**Verify**: Manual testing of desktop app

---

## Phase 3: Web Server

### T3.1 Create `src-web/` crate with Cargo.toml
**Satisfies**: SPEC §4, Design §2.4
**Dependencies**: T1.6
**Acceptance**:
- [x] `src-web/Cargo.toml` with package name `nslnotes-web`
- [x] Dependencies: `nslnotes-core` (path), `axum`, `tokio`, `tower-http` (cors), `rust-embed` (axum feature), `clap` (derive feature), `serde`/`serde_json` (workspace)
- [x] Binary crate (no lib section)

**Verify**: `cargo check -p nslnotes-web` (with empty main.rs)

---

### T3.2 Implement CLI and server skeleton (`main.rs`)
**Satisfies**: SPEC §4.1, Design §5.1
**Dependencies**: T3.1
**Acceptance**:
- [x] `--port` (default 3000), `--notes-dir`, `--settings-path` flags via clap
- [x] Creates `AppState` (settings path, watcher state, broadcast channel)
- [x] Assembles Axum router with placeholder routes
- [x] Starts Tokio runtime and binds to configured port
- [x] Prints startup message with URL

**Verify**: `cargo run -p nslnotes-web -- --port 4000` starts and responds to requests

---

### T3.3 Implement file API routes (`routes.rs`)
**Satisfies**: SPEC §4.2, Design §5.2
**Dependencies**: T3.2
**Reference**: `vite-plugin-api.ts` for URL structure and behavior
**Acceptance**:
- [x] All 12 file endpoints implemented (see SPEC §4.2 table)
- [x] Query params match existing format (`?path=`)
- [x] JSON request/response bodies match existing format
- [x] Error responses use `{"error": "message"}` format
- [x] `/api/assets` serves binary files with correct MIME types

**Verify**: `curl` each endpoint against a test notes directory

---

### T3.4 Implement settings API routes
**Satisfies**: SPEC §4.2 (settings rows), Design §5.2
**Dependencies**: T3.2
**Acceptance**:
- [x] `GET /api/settings` returns current settings JSON
- [x] `PUT /api/settings` accepts settings JSON and persists to disk
- [x] Uses configured `--settings-path`
- [x] Returns default settings if file doesn't exist yet

**Verify**: `curl GET/PUT /api/settings` round-trips correctly

---

### T3.5 Implement SSE file watcher (`sse.rs`)
**Satisfies**: SPEC §4.3, Design §5.3
**Dependencies**: T3.2
**Acceptance**:
- [x] `POST /api/watch/start` starts core watcher, bridge task forwards to broadcast channel
- [x] `POST /api/watch/stop` stops watcher
- [x] `GET /api/watch/events` returns SSE stream
- [x] Events are JSON `{"path": "...", "type": "modify"}`
- [x] Multiple SSE clients receive same events

**Verify**: Start watcher, open SSE in browser/curl, modify a .md file, see event

---

### T3.6 Implement static file serving
**Satisfies**: SPEC §4.4, Design §5.4
**Dependencies**: T3.2
**Acceptance**:
- [x] `rust-embed` embeds `../dist/` directory
- [x] Non-`/api/` requests serve embedded static files
- [x] Unknown paths fall back to `index.html` (SPA routing)
- [x] Correct `Content-Type` headers for JS, CSS, HTML, etc.

**Verify**: `npm run build && cargo run -p nslnotes-web`, open browser to `http://localhost:3000`

---

### T3.7 Verify web server builds independently
**Satisfies**: SPEC §7
**Dependencies**: T3.3, T3.4, T3.5, T3.6
**Acceptance**:
- [x] `cargo build -p nslnotes-web` succeeds
- [x] `cargo tree -p nslnotes-web | grep tauri` returns nothing
- [x] Single binary serves both API and frontend

**Verify**: `cargo build -p nslnotes-web && cargo tree -p nslnotes-web | grep tauri`

---

## Phase 4: Frontend Integration

### T4.1 Update `runtime.ts` watcher for SSE
**Satisfies**: SPEC §5.1, Design §6.1
**Dependencies**: T3.5
**Source**: `src/lib/runtime.ts` (lines 248-365)
**Acceptance**:
- [x] Web mode `startWatching` sends `POST /api/watch/start` then opens `EventSource`
- [x] Web mode `stopWatching` closes `EventSource` and sends `POST /api/watch/stop`
- [x] Web mode `watchFiles` wires SSE events to callbacks (replaces `setInterval` placeholder)
- [x] Native mode behavior unchanged
- [x] EventSource stored for cleanup

**Verify**: Run web server, open app in browser, edit a .md file externally, see UI update

---

### T4.2 Update `SettingsService.ts` for HTTP settings
**Satisfies**: SPEC §5.2, Design §6.2
**Dependencies**: T3.4
**Source**: `src/services/SettingsService.ts` (lines 56-110)
**Acceptance**:
- [x] Web mode `loadSettings` calls `GET /api/settings` (replaces localStorage read)
- [x] Web mode `saveSettings` calls `PUT /api/settings` (replaces localStorage write)
- [x] Native mode behavior unchanged
- [x] Fallback to defaults on error

**Verify**: Run web server, change settings in UI, restart server, settings persisted

---

## Phase 5: Build Scripts & Cleanup

### T5.1 Add web build scripts to `package.json`
**Satisfies**: SPEC §6, Design §7.3
**Dependencies**: T3.7
**Acceptance**:
- [x] `"web:build"` script: `"npm run build && cargo build --release -p nslnotes-web"`
- [x] `"web:serve"` script: `"cargo run -p nslnotes-web"`

**Verify**: `npm run web:build` produces binary, `npm run web:serve` starts server

---

### T5.2 Delete old `src-tauri/src/` remnants
**Satisfies**: Cleanup
**Dependencies**: T2.7
**Acceptance**:
- [x] No orphaned files in `src-tauri/src/` from pre-refactor
- [x] All source files reflect the new wrapper pattern

**Verify**: `git diff --stat` shows clean migration

---

### T5.3 End-to-end verification
**Satisfies**: SPEC §6, SPEC §7
**Dependencies**: T4.1, T4.2, T5.1
**Acceptance**:
- [x] `cargo build -p nslnotes-core` — no tauri, no axum deps
- [x] `cargo build -p nslnotes-tauri` — no axum deps
- [x] `cargo build -p nslnotes-web` — no tauri deps
- [x] `npm run tauri dev` — desktop app fully functional
- [x] `npm run web:build && npm run web:serve` — web app fully functional
- [x] `npm run dev:web` — Vite frontend dev still works
- [x] File watcher events arrive via SSE in web mode
- [x] Settings persist to disk in web mode

**Verify**: Run all three modes, test file CRUD, watcher, and settings in each
