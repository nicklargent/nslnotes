# Complete 004 Cargo Workspace — Remaining Tasks

## Context
The cargo workspace refactor is nearly complete. All 3 modes (Tauri, web server, Vite dev) have been manually tested and work. The settings path was just unified across all modes. What remains are a few unchecked acceptance criteria in TASKS.md.

## Remaining Unchecked Items

### Already passing (just need checkboxes ticked)
- **T1.6** `No compiler warnings` — verified, `cargo build -p nslnotes-core` produces zero warnings
- **T3.7** `cargo tree -p nslnotes-web | grep tauri returns nothing` — verified, no tauri deps
- **T2.7** All manual testing items — user confirmed all 3 modes work
- **T5.3** Manual testing items (`npm run tauri dev`, `web:build && web:serve`, `dev:web`, SSE watcher, settings persist) — user confirmed

### Needs a small code fix
- **T3.3** `Error responses use {"error": "message"} format` — currently `err_response()` in `src-web/src/routes.rs:57` returns plain text. Should return JSON to match `vite-plugin-api.ts`'s `sendError()` format.

## Changes

### 1. Fix `src-web/src/routes.rs` — JSON error responses
Change `err_response` from:
```rust
fn err_response(status: StatusCode, msg: String) -> Response {
    (status, msg).into_response()
}
```
To:
```rust
fn err_response(status: StatusCode, msg: String) -> Response {
    (status, Json(serde_json::json!({"error": msg}))).into_response()
}
```
Ensure `Json` is imported from `axum::Json`.

### 2. Update `docs/004-cargo-workspace/TASKS.md` — check off completed items
- T1.6: `[x] No compiler warnings`
- T2.2: Update acceptance text to reflect settings path unification (no longer uses `get_settings_path(&app)`)
- T2.7: Check all items
- T3.3: Check error format item
- T3.7: Check tauri tree item
- T5.3: Check all items

## Verification
- `cargo build -p nslnotes-web` — still compiles
- `cargo build -p nslnotes-core` — still compiles
- `cargo build -p nslnotes-tauri` — still compiles
