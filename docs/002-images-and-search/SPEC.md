# 002: Images & Search

## Overview

NslNotes gains two capabilities — **full-text search** and **image support** — surfaced through a single new UI element: a Search view in the center panel. Images are browsable as a tab within search, avoiding a separate UI surface.

---

## Part 1: Search

### 1.1 Activation & UI

- A subtle **Search** button appears below the Today button in the left sidebar.
- **Keyboard shortcut**: `Cmd/Ctrl+K` opens search from anywhere.
- Clicking the button or using the shortcut sets `activeView: "search"` — the center panel renders `SearchView`.
- Search input at the top, auto-focused on entry.
- Filter tabs below the input: **All** | **Notes** | **Tasks** | **Docs** | **Images**
- Pressing Escape or clicking Today returns to the journal view.

### 1.2 Search Behavior

- **Full-text search**: searches body content of all notes, tasks, and docs.
- **Metadata search**: also matches entity titles, topic refs, dates, and image alt text.
- Results appear as the user types (debounced ~200 ms).
- Minimum query length: **2 characters** (except the Images tab, which shows all images with an empty query).
- Results are grouped by date (reverse chronological) and show:
  - Entity type badge (note / task / doc)
  - Entity title or date
  - Matching line(s) with the search term highlighted
- Clicking a result navigates to that entity.

### 1.3 Images Tab

- When the **Images** filter is active, the center panel shows an image gallery instead of text results.
- The search input still works — it filters images by filename, alt text, or parent entity name.
- An empty query shows **all** images, grouped chronologically.
- Layout: grid of thumbnail cards, grouped by date.
- Each card displays:
  - Thumbnail
  - Filename
  - Parent entity link
  - Orphan badge (if applicable)
- Magnify icon overlay on hover (see §2.5 Image Preview).
- Delete button shown on orphaned images only.

### 1.4 Index Requirements

- `IndexService` needs a **full-text search method** — simple substring / regex match is sufficient for v1; no search engine required.
- Search runs against the in-memory index (all content is already loaded).
- Image reference tracking is added to the index (see Part 2).

---

## Part 2: Images

### 2.1 Storage Model

Images are stored in per-entity `.assets/` subfolders named after the entity file:

```
notes/2026-03-18.assets/clipboard-1742313600.png
tasks/fix-bug.assets/diagram-1742313612.jpg
docs/runbook.assets/screenshot-1742313620.png
```

**Naming convention**: `{prefix}-{unix-timestamp}.{ext}`

| Source          | Prefix                        |
|-----------------|-------------------------------|
| Drag-drop       | Slugified original filename   |
| Clipboard paste | `clipboard`                   |

**Markdown paths** are relative to the entity's parent directory:

```markdown
![alt](./2026-03-18.assets/img.png)
```

When an entity is deleted, its `.assets/` folder becomes orphaned and is surfaced in the Images tab.

### 2.2 Markdown Syntax

Standard image:

```markdown
![alt](./slug.assets/img.png)
```

With explicit width (height auto-proportional):

```markdown
![alt](./slug.assets/img.png){width=400}
```

Only `width` is supported; height scales proportionally.

**Implementation note**: This syntax is non-standard markdown (Pandoc/kramdown attribute syntax). The project uses a custom regex-based markdown↔HTML converter (`ProseEditor.tsx`: `htmlFromMarkdown` / `markdownFromHtml`), so support requires:

- `htmlFromMarkdown`: regex to convert `![alt](src){width=N}` → `<img src="src" alt="alt" width="N">`
- `markdownFromHtml`: in DOM walker, convert `<img width="N">` → `![alt](src){width=N}`
- TipTap Image extension handles `<img>` with `width` attribute natively, so no ProseMirror schema changes needed for the attribute itself.

### 2.3 Ingestion Flows

- **Drag-drop**: image file from OS → copy to entity's `.assets/` → insert markdown at drop position.
- **Clipboard paste** (`Ctrl+V`): image data from clipboard → write binary to `.assets/` → insert markdown at cursor.
- Both flows create the `.assets/` folder on first use.
- Non-image files are silently ignored.
- **Supported types**: PNG, JPEG, GIF, WebP.

### 2.4 Image Reference Tracking

- `IndexService` parses `![...](...)` references from entity bodies during indexing.
- Maintains a bidirectional map: entity → images, image → entities.
- **Orphan** = a file in `.assets/` that is not referenced by the parent entity's markdown.
- Orphans are surfaced in the Images tab with a badge. They are **not** auto-deleted.

### 2.5 Editor Rendering, Resize & Preview

- TipTap Image extension renders images from markdown.
- Clicking an image shows a blue border and a bottom-right drag handle.
- Dragging the handle resizes width (min 50 px, max content width); height scales proportionally.
- On release, the `{width=N}` attribute is updated (or added) in the markdown source.
- **Tauri mode**: `convertFileSrc` converts local file paths to asset URLs.
- **Web mode**: `GET /api/assets?path={relative-path}` serves binary files (e.g. `GET /api/assets?path=notes/2026-03-18.assets/img.png`).

**Image preview** (global — applies everywhere images appear: editor, search grid, right panel):

- On hover, a small magnify icon appears in the top-right corner of the image.
- Clicking the magnify icon opens a modal overlay showing the image at native resolution.
- The overlay is dismissed by clicking outside, pressing Escape, or clicking a close button.
- No gallery navigation (prev/next) — single image preview only.

### 2.6 Backend Changes

New Tauri commands:

| Command | Signature |
|---------|-----------|
| `copy_file` | `(src: string, dst: string) → void` |
| `write_binary` | `(path: string, base64: string) → void` |
| `get_file_size` | `(path: string) → number` |

- `runtime.ts` gains matching abstraction methods: `copyFile`, `writeBinary`, `getFileSize`.
- Vite API plugin gains matching endpoints plus `GET /api/assets?path={relative-path}` for serving image binaries in web mode. The `path` parameter is relative to the notes root (e.g. `notes/2026-03-18.assets/img.png`). Response sets appropriate `Content-Type` header based on file extension.
- File watcher: **no changes needed**.

---

## Part 3: Edge Cases & Scope

### Edge Cases

| Scenario | Behavior |
|----------|----------|
| Entity deleted | `.assets/` folder orphaned; surfaced in Images tab |
| Same image in two entities | Copied to each entity's `.assets/` (no dedup) |
| Image deleted externally | Broken image in editor; detected on next index rebuild |
| Very large images | CSS scaling only; no thumbnail generation |
| Content promoted (promoteToTask / promoteToDoc) | If promoted content contains image references, copy referenced images from the source entity's `.assets/` to the new entity's `.assets/` folder and rewrite the relative paths in the promoted markdown. Source images are left in place (the source entity still references them unless the user manually removes that text). |

### Out of Scope

- Video, PDF, and non-image attachments
- Remote URL image embedding
- Image editing (crop, rotate)
- Fuzzy or ranked search (v1 is simple substring match)
- Search history or saved searches
- OCR / image content search
- Cross-entity image sharing

---

## Files to Create or Modify

| File | Changes |
|------|---------|
| `src/types/stores.ts` | Add `"search"` to `ViewType` union |
| `src/components/layout/CenterPanel.tsx` | Route to `SearchView` |
| `src/components/layout/Sidebar.tsx` | Add Search button below Today |
| `src/services/IndexService.ts` | Full-text search method, image ref parsing, orphan detection |
| `src/services/NavigationService.ts` | `goToSearch()` method |
| `src/services/EntityService.ts` | `promoteToTask` / `promoteToDoc`: copy referenced images to new entity's `.assets/` and rewrite paths |
| `src/components/editor/ProseEditor.tsx` | Image paste/drop handlers, TipTap Image extension, resize, markdown round-trip |
| `src-tauri/src/commands.rs` | `copy_file`, `write_binary`, `get_file_size` commands |
| `src/lib/runtime.ts` | `copyFile`, `writeBinary`, `getFileSize` methods |
| **New**: `src/components/search/SearchView.tsx` | Search UI with input, tabs, results list |
| **New**: `src/components/search/ImageGrid.tsx` | Image gallery grid for the Images tab |
| **New**: `src/components/shared/ImagePreview.tsx` | Magnify-icon overlay + native-size modal (used by editor, search grid, right panel) |
