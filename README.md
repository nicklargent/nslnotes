# NslNotes

A local-first, plain-text knowledge tool centered on time-ordered notes, first-class tasks, and a unified topic system. Built to replace daily LogSeq and Obsidian usage with a single opinionated workflow.

## Overview

NslNotes is a personal knowledge tool where the daily note is the center of gravity. Everything else — tasks, docs, topics, people — orbits it naturally.

- **Plain text, always.** Every file is human-readable markdown with YAML frontmatter. No database, no lock-in.
- **Time is the primary axis.** The journal is home. An infinite reverse-chronological scroll with today at the top.
- **Capture first, structure later.** Inline TODOs can be promoted to full task files when they earn it.
- **Context without modes.** A fixed three-column layout (sidebar, editor, task panel) with shared topics surfacing related content automatically.

### Entity Model

| Entity | Storage | Description |
|--------|---------|-------------|
| Note | `notes/YYYY-MM-DD.md` | Daily notes and named notes (meetings, sessions) |
| Task | `tasks/slug.md` | Structured work items with status, due date, topics |
| Doc | `docs/slug.md` | Standalone reference documents |
| Topic | Inline `#topic` / `@person` | Cross-cutting organizational layer, no registration needed |

## Tech Stack

- **Runtime**: [Tauri v2](https://v2.tauri.app/) (Rust backend) + [SolidJS](https://www.solidjs.com/) frontend
- **Editor**: [TipTap](https://tiptap.dev/) (ProseMirror)
- **Styling**: Tailwind CSS v4
- **Build**: Vite
- **Testing**: Vitest (unit), Playwright (e2e)

## Prerequisites

### With Nix (recommended)

The project includes a Nix flake that provides the complete development environment — Rust toolchain, Node.js, Tauri system dependencies (GTK, WebKit, etc.), and Playwright browsers. No manual dependency installation needed.

```bash
# Enter the dev shell (or use direnv)
nix develop

# Install frontend dependencies
npm install

# Run as native desktop app
npm run tauri dev
```

### Without Nix

- [Node.js](https://nodejs.org/) (v20+)
- [Rust](https://www.rust-lang.org/tools/install) (stable)
- Tauri v2 system dependencies — see the [Tauri prerequisites guide](https://v2.tauri.app/start/prerequisites/)

## Getting Started

```bash
# Install dependencies
npm install

# Run as native desktop app
npm run tauri dev

# Run in browser (web mode)
npm run dev:web
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run tauri dev` | Run as native Tauri desktop app |
| `npm run dev:web` | Run in browser with Vite API plugin |
| `npm run build` | Build frontend for production |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run lint` | Lint source files |
| `npm run lint:fix` | Lint and auto-fix |
| `npm run format` | Format source files with Prettier |
| `npm run test` | Run unit tests (Vitest) |
| `npm run test:watch` | Run unit tests in watch mode |
| `npm run test:e2e` | Run end-to-end tests (Playwright) |

## Data Directory

NslNotes reads and writes plain markdown files from a user-selected directory:

```
~/nslnotes/
  notes/          # Daily and named notes
  tasks/          # Task files
  docs/           # Reference documents
  topics.yaml     # Optional topic labels and metadata
```

All files use YAML frontmatter for metadata. The app rebuilds its index from disk — the files are always the source of truth.

## License

MIT
