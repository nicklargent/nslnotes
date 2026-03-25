# NslNotes

## Architecture
- **Runtime**: Tauri (Rust backend) + SolidJS frontend
- **Editor**: TipTap (ProseMirror)
- **Styling**: Tailwind CSS v4
- **Build**: Vite
- **Data**: Plain markdown files with YAML frontmatter, no database
- **Layout**: Fixed three-column (sidebar, center, right panel)

## Key Paths
- `src/lib/runtime.ts` — Tauri/web abstraction layer
- `src/services/` — all business logic (FileService, IndexService, EntityService, etc.)
- `src/stores/` — SolidJS reactive stores (index, context, editor)
- `src/components/` — UI organized by feature area
- `src-tauri/src/` — Rust backend (commands.rs, watcher.rs)

## Web Mode
- `npm run dev:web` — runs in browser with Vite API plugin for file ops
- `npm run tauri dev` — runs as native Tauri app

## Specs
- `docs/PRD.md` — product vision
- `docs/001-initial/` — original build specs (requirements, design, tasks)
- Future features: `docs/NNN-feature-name/SPEC.md`

## Conventions
- TypeScript strict mode, no `any`
- Services never accessed directly by components — use stores/hooks
- Files are source of truth, index rebuilt from disk
- All entity CRUD goes through EntityService

## UI Interactions & E2E Tests
- `docs/UI-INTERACTIONS.md` — catalog of all UI interactions
- `tests/e2e/` — Playwright E2E test suite (run with `PLAYWRIGHT_CHROMIUM_PATH=/run/current-system/sw/bin/chromium npx playwright test`)
- When adding or changing a UI interaction, update `docs/UI-INTERACTIONS.md` and add/update corresponding E2E tests in `tests/e2e/`
- Shared test infrastructure: `tests/e2e/fixtures/` (markdown builders, test data), `tests/e2e/helpers/` (app setup, selectors, editor helpers, assertions)
