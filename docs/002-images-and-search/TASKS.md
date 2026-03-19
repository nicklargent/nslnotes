# 002: Images & Search — Implementation Tasks

Tasks are ordered by dependency. Each references requirements (SPEC §*) and design sections, and includes verification criteria.

---

## Phase 1: Backend + Runtime Foundation

### T1.1 Add base64 crate dependency
**Satisfies**: SPEC §2.6, Design §7.3
**Dependencies**: None
**Acceptance**:
- [ ] `base64 = "0.22"` added to `src-tauri/Cargo.toml` `[dependencies]`
- [ ] `cargo check` passes

**Verify**: `cargo check` in `src-tauri/` succeeds

---

### T1.2 Implement Tauri binary file commands
**Satisfies**: SPEC §2.6, Design §7.1
**Dependencies**: T1.1
**Acceptance**:
- [ ] `copy_file(src, dst)` in `commands.rs` — copies file, creates parent dirs
- [ ] `write_binary(path, base64_data)` in `commands.rs` — decodes base64 and writes bytes
- [ ] `get_file_size(path)` in `commands.rs` — returns file size in bytes
- [ ] All three commands handle missing parent directories gracefully

**Verify**: Call each command via `invoke` from frontend, confirm file operations work

---

### T1.3 Register new commands in lib.rs
**Satisfies**: Design §7.2
**Dependencies**: T1.2
**Acceptance**:
- [ ] `copy_file`, `write_binary`, `get_file_size` imported in `lib.rs`
- [ ] All three added to `tauri::generate_handler![]` macro

**Verify**: App compiles and starts without errors

---

### T1.4 Add runtime abstraction methods
**Satisfies**: SPEC §2.6, Design §7.4
**Dependencies**: T1.3
**Acceptance**:
- [ ] `runtime.copyFile(src, dst)` — invokes `copy_file` in Tauri, `POST /api/files/copy` in web
- [ ] `runtime.writeBinary(path, base64Data)` — invokes `write_binary` in Tauri, `PUT /api/files/binary` in web
- [ ] `runtime.getFileSize(path)` — invokes `get_file_size` in Tauri, `GET /api/files/size` in web

**Verify**: Round-trip write binary + read file works in both Tauri and web mode

---

### T1.5 Add Vite API plugin endpoints
**Satisfies**: SPEC §2.6, Design §7.5
**Dependencies**: None
**Acceptance**:
- [ ] `GET /api/assets?path={relative-path}` — serves image binary with correct `Content-Type`
- [ ] `POST /api/files/copy` — copies file from `src` to `dst`
- [ ] `PUT /api/files/binary` — writes base64-decoded data to `path`
- [ ] `GET /api/files/size?path={path}` — returns `{ size: number }`
- [ ] Path parameter for `/api/assets` is relative to notes root

**Verify**: `curl` each endpoint, confirm correct responses and file operations

---

## Phase 2: Search Data Model + Service

### T2.1 Create search type definitions
**Satisfies**: SPEC §1.2, Design §2, §4
**Dependencies**: None
**Acceptance**:
- [ ] `src/types/search.ts` with `SearchFilter` (`"all" | "notes" | "tasks" | "docs" | "images"`)
- [ ] `SearchResult` type with entity reference, matched line(s), highlight ranges
- [ ] `SearchState` type with query, filter, results array
- [ ] Types exported from `src/types/index.ts`

**Verify**: Types import cleanly, TypeScript compiles

---

### T2.2 Add search view type and store state
**Satisfies**: Design §4.1, §4.2
**Dependencies**: T2.1
**Acceptance**:
- [ ] `"search"` added to `ViewType` union in `src/types/stores.ts`
- [ ] `searchState: SearchState | null` added to `ContextState` in `src/types/stores.ts`
- [ ] `contextStore` initialized with `searchState: null`

**Verify**: Setting `activeView: "search"` type-checks; `searchState` accessible from store

---

### T2.3 Implement IndexService.search()
**Satisfies**: SPEC §1.2, §1.4, Design §3.1
**Dependencies**: T2.1
**Acceptance**:
- [ ] `IndexService.search(query, filter)` performs case-insensitive substring match
- [ ] Searches body content of notes, tasks, and docs
- [ ] Also matches entity titles, topic refs, and dates
- [ ] Returns `SearchResult[]` with entity reference, matched lines, highlight ranges
- [ ] Respects filter parameter to restrict entity types
- [ ] Minimum query length of 2 characters enforced
- [ ] Results ordered by date (reverse chronological)

**Verify**: Search for known content returns correct results; filter restricts by type; short queries return empty

---

### T2.4 Implement NavigationService.goToSearch()
**Satisfies**: SPEC §1.1, Design §3.2
**Dependencies**: T2.2
**Acceptance**:
- [ ] `NavigationService.goToSearch(query?, filter?)` sets `activeView: "search"`
- [ ] Populates `searchState` with provided query/filter or defaults
- [ ] Clears relevance context (search is a neutral view)

**Verify**: Call `goToSearch()`, store reflects search view state

---

## Phase 3: Search UI

### T3.1 Create SearchView component
**Satisfies**: SPEC §1.1, §1.2, Design §5.2
**Dependencies**: T2.3, T2.4
**Acceptance**:
- [ ] `src/components/search/SearchView.tsx` with search input, auto-focused on mount
- [ ] Filter tabs: All | Notes | Tasks | Docs | Images
- [ ] Input debounced at ~200ms before triggering search
- [ ] Results rendered as list with entity type badge, title/date, highlighted snippet
- [ ] Clicking a result calls `NavigationService.navigateTo(entity)`
- [ ] Escape calls `NavigationService.goHome()`
- [ ] Empty state shown when no results

**Verify**: Type query, results appear after debounce; click result to navigate; Escape returns to journal

---

### T3.2 Add SearchView routing to CenterPanel
**Satisfies**: Design §5.6
**Dependencies**: T3.1
**Acceptance**:
- [ ] `<Match when={props.activeView === "search"}>` added to `CenterPanel.tsx`
- [ ] Renders `SearchView` component

**Verify**: Set `activeView` to `"search"`, SearchView renders in center panel

---

### T3.3 Add Search button to LeftSidebar
**Satisfies**: SPEC §1.1, Design §5.5
**Dependencies**: T2.4
**Acceptance**:
- [ ] Subtle Search button added below TodayButton in `LeftSidebar.tsx`
- [ ] Click calls `NavigationService.goToSearch()`
- [ ] Visually consistent with TodayButton style

**Verify**: Button visible in sidebar; click opens search view

---

### T3.4 Add Cmd/Ctrl+K global shortcut
**Satisfies**: SPEC §1.1, Design §5.7
**Dependencies**: T2.4
**Acceptance**:
- [ ] `Cmd/Ctrl+K` keydown handler added to `App.tsx`
- [ ] Calls `NavigationService.goToSearch()`
- [ ] Prevents default browser behavior
- [ ] Works from any view

**Verify**: Press Cmd+K from journal view, search opens; press from doc view, search opens

---

## Phase 4: Image Storage + Ingestion

### T4.1 Create image type definitions
**Satisfies**: SPEC §2.1, §2.2, Design §2
**Dependencies**: None
**Acceptance**:
- [ ] `src/types/images.ts` with `ImageRef` (alt, relativePath, width?)
- [ ] `ImageFile` type (path, filename, entityPath, size, isOrphan)
- [ ] `ImageMimeType` and MIME constants for PNG, JPEG, GIF, WebP
- [ ] Types exported from `src/types/index.ts`

**Verify**: Types import cleanly, TypeScript compiles

---

### T4.2 Implement ImageService core methods
**Satisfies**: SPEC §2.1, §2.3, Design §3.3
**Dependencies**: T4.1, T1.4
**Acceptance**:
- [ ] `src/services/ImageService.ts` created
- [ ] `getAssetsDir(entityPath)` returns `{entitySlug}.assets/` path
- [ ] `generateImageFilename(source, mimeType)` returns `{prefix}-{unix-timestamp}.{ext}`
- [ ] Prefix is slugified original filename for drag-drop, `clipboard` for paste
- [ ] `resolveImageUrl(relativePath, entityPath, rootPath)` returns renderable URL
- [ ] Uses `convertFileSrc` in Tauri mode, `/api/assets?path=` in web mode

**Verify**: Generate filenames for paste and drop; resolve URLs in both modes

---

### T4.3 Implement image ingestion flows
**Satisfies**: SPEC §2.3, Design §3.3
**Dependencies**: T4.2
**Acceptance**:
- [ ] `ImageService.ingestFromClipboard(entityPath, base64, mimeType)` — writes to `.assets/`, returns markdown string
- [ ] `ImageService.ingestFromDrop(entityPath, filename, base64, mimeType)` — writes to `.assets/`, returns markdown string
- [ ] Both create `.assets/` folder on first use
- [ ] Non-image MIME types silently ignored
- [ ] Returns relative markdown path: `![alt](./slug.assets/img.png)`

**Verify**: Ingest test image, file appears in correct `.assets/` directory, markdown string is valid

---

### T4.4 Add TipTap Image extension to ProseEditor
**Satisfies**: SPEC §2.5, Design §6.1
**Dependencies**: None
**Acceptance**:
- [ ] `@tiptap/extension-image` installed
- [ ] Image extension added to ProseEditor extensions array
- [ ] Configured with `inline: false`, `allowBase64: false`
- [ ] `<img>` elements render in editor

**Verify**: Insert `<img>` HTML into editor, image renders

---

### T4.5 Add image markdown round-trip
**Satisfies**: SPEC §2.2, Design §6.2
**Dependencies**: T4.4, T4.2
**Acceptance**:
- [ ] `htmlFromMarkdown`: regex converts `![alt](src){width=N}` → `<img src="resolved" alt="alt" width="N">`
- [ ] Image regex runs before link regex to avoid `![...]()` being consumed as `[...]()` link
- [ ] `markdownFromHtml`: DOM walker converts `<img>` → `![alt](relativeSrc){width=N}`
- [ ] Relative paths resolved via `ImageService.resolveImageUrl` for display
- [ ] Resolved URLs converted back to relative paths on save via `unresolveImageSrc`

**Verify**: Write markdown with `![alt](path){width=400}`, renders as sized image; save, markdown preserved

---

### T4.6 Add entityPath/rootPath props to editor components
**Satisfies**: Design §6.3
**Dependencies**: T4.5
**Acceptance**:
- [ ] `entityPath` and `rootPath` props added to `ProseEditor` interface
- [ ] Props threaded from `DailyNote.tsx`, `NamedNoteCard.tsx`, `TaskDetail.tsx`, `DocView.tsx`
- [ ] Props used by image regex in `htmlFromMarkdown`/`markdownFromHtml`

**Verify**: Open a note, doc, and task — no prop-related errors in console

---

### T4.7 Implement clipboard paste handler
**Satisfies**: SPEC §2.3, Design §6.4
**Dependencies**: T4.3, T4.6
**Acceptance**:
- [ ] `handlePaste` in ProseEditor detects image MIME types in clipboard
- [ ] Reads image as base64 via FileReader
- [ ] Calls `ImageService.ingestFromClipboard` to write file
- [ ] Inserts image node at cursor position via TipTap chain
- [ ] Text paste still works normally when no image in clipboard

**Verify**: Copy image to clipboard, paste in editor — image file created in `.assets/`, renders inline

---

### T4.8 Extend drop handler for image files
**Satisfies**: SPEC §2.3, Design §6.5
**Dependencies**: T4.3, T4.6
**Acceptance**:
- [ ] Existing `handleDrop` in ProseEditor extended to detect image files in `dataTransfer`
- [ ] Reads image as base64, calls `ImageService.ingestFromDrop`
- [ ] Inserts image at drop coordinates via `view.posAtCoords`
- [ ] Existing wikilink drop behavior preserved
- [ ] Non-image files silently ignored

**Verify**: Drag image file from OS into editor — image file created in `.assets/`, renders at drop position

---

## Phase 5: Image Resize

### T5.1 Create ImageResizePlugin
**Satisfies**: SPEC §2.5, Design §6.6
**Dependencies**: T4.5
**Acceptance**:
- [ ] `src/components/editor/ImageResizePlugin.ts` — ProseMirror plugin
- [ ] Clicking an image shows blue border (2px solid) and bottom-right drag handle (8x8)
- [ ] Clicking outside deselects the image
- [ ] Only one image can be selected at a time

**Verify**: Click image in editor, blue border and handle appear; click elsewhere, deselects

---

### T5.2 Implement drag-to-resize behavior
**Satisfies**: SPEC §2.5, Design §6.6
**Dependencies**: T5.1
**Acceptance**:
- [ ] Mousedown on handle starts resize tracking
- [ ] Mousemove updates image width style in real time
- [ ] Width constrained: min 50px, max content container width
- [ ] Height scales proportionally (CSS aspect-ratio preserved)
- [ ] Mouseup dispatches ProseMirror transaction setting node `width` attribute

**Verify**: Drag handle, image resizes smoothly; release, width persists in node attributes

---

### T5.3 Wire resize to markdown persistence
**Satisfies**: SPEC §2.2, Design §6.6
**Dependencies**: T5.2
**Acceptance**:
- [ ] Width attribute change triggers editor `onUpdate` → auto-save
- [ ] `markdownFromHtml` serializes `<img width="N">` as `![alt](path){width=N}`
- [ ] `htmlFromMarkdown` parses `{width=N}` back to `<img width="N">`
- [ ] Plugin registered in ProseEditor extensions

**Verify**: Resize image → save → reload → image retains width; check markdown file has `{width=N}`

---

## Phase 6: Image Index + Search Images Tab

### T6.1 Add image index state to stores
**Satisfies**: SPEC §2.4, Design §4.1
**Dependencies**: T4.1
**Acceptance**:
- [ ] `imageFiles: Map<string, ImageFile>` added to `IndexState`
- [ ] `entityToImages: Map<string, string[]>` added (entity path → image paths)
- [ ] `imageToEntities: Map<string, string[]>` added (image path → entity paths)
- [ ] `indexStore` initialized with empty Maps

**Verify**: Store fields accessible, type-check passes

---

### T6.2 Implement image reference parsing
**Satisfies**: SPEC §2.4, Design §3.1
**Dependencies**: T6.1
**Acceptance**:
- [ ] `IndexService.parseImageRefs(entityPath, content)` extracts `![alt](path)` references
- [ ] Uses canonical regex: `/!\[([^\]]*)\]\(([^)]+)\)(?:\{width=(\d+)\})?/g`
- [ ] Returns array of `ImageRef` with alt, relativePath, optional width
- [ ] Resolves relative paths to absolute paths for index

**Verify**: Parse markdown with image refs, correct paths extracted

---

### T6.3 Implement asset directory scanning
**Satisfies**: SPEC §2.4, Design §3.1
**Dependencies**: T6.1
**Acceptance**:
- [ ] `IndexService.scanAssetDirectories(rootPath)` enumerates all `.assets/` dirs in notes/, tasks/, docs/
- [ ] Lists all image files (PNG, JPEG, GIF, WebP) in each `.assets/` dir
- [ ] Returns `ImageFile[]` with path, filename, parent entity path, size

**Verify**: Create `.assets/` dirs with images, scan finds them all

---

### T6.4 Implement buildImageIndex
**Satisfies**: SPEC §2.4, Design §3.1
**Dependencies**: T6.2, T6.3
**Acceptance**:
- [ ] `IndexService.buildImageIndex(rootPath)` called at end of `buildIndex`
- [ ] Populates `imageFiles`, `entityToImages`, `imageToEntities` Maps
- [ ] Detects orphans: files in `.assets/` not referenced by parent entity markdown
- [ ] Sets `isOrphan` flag on `ImageFile` entries
- [ ] Also called from `_rebuildFresh`

**Verify**: Add images to entities, some referenced, some not — orphans correctly detected

---

### T6.5 Implement IndexService.searchImages()
**Satisfies**: SPEC §1.3, Design §3.1
**Dependencies**: T6.4
**Acceptance**:
- [ ] `IndexService.searchImages(query)` filters image files
- [ ] Matches against filename, alt text, and parent entity name
- [ ] Empty query returns all images
- [ ] Results grouped chronologically

**Verify**: Search for image filename, correct results returned; empty query returns all

---

### T6.6 Implement ImageService.deleteImage()
**Satisfies**: SPEC §1.3
**Dependencies**: T6.4
**Acceptance**:
- [ ] `ImageService.deleteImage(imagePath, rootPath)` deletes file from disk
- [ ] Updates image index (removes from maps)
- [ ] Only callable on orphaned images (guard check)

**Verify**: Delete orphaned image, file removed, index updated

---

### T6.7 Create ImageGrid component
**Satisfies**: SPEC §1.3, Design §5.3
**Dependencies**: T6.5
**Acceptance**:
- [ ] `src/components/search/ImageGrid.tsx` — CSS grid of thumbnail cards
- [ ] Each card shows: thumbnail (CSS-scaled), filename, parent entity link
- [ ] Orphan badge on unreferenced images
- [ ] Delete button shown only on orphaned images
- [ ] Cards grouped by date
- [ ] Clicking parent entity link navigates to that entity

**Verify**: Images tab shows grid of images; orphans badged; delete button on orphans only

---

### T6.8 Wire Images tab in SearchView
**Satisfies**: SPEC §1.3, Design §5.2
**Dependencies**: T6.7, T3.1
**Acceptance**:
- [ ] When Images filter tab is active, SearchView renders ImageGrid instead of result list
- [ ] Search input filters images by filename, alt text, parent entity name
- [ ] Empty query shows all images in grid

**Verify**: Click Images tab, grid appears; type query, images filter; clear query, all images shown

---

## Phase 7: Image Preview + Polish

### T7.1 Create ImagePreview modal component
**Satisfies**: SPEC §2.5, Design §5.4
**Dependencies**: None
**Acceptance**:
- [ ] `src/components/shared/ImagePreview.tsx` — modal overlay
- [ ] Shows image at native resolution (no scaling)
- [ ] Dismissed by clicking outside, pressing Escape, or clicking close button
- [ ] No gallery navigation (single image only)

**Verify**: Open preview, image at full resolution; Escape/click-outside closes

---

### T7.2 Mount ImagePreview globally in App.tsx
**Satisfies**: Design §5.7
**Dependencies**: T7.1
**Acceptance**:
- [ ] Preview signal (reactive) added to App.tsx
- [ ] `ImagePreview` component mounted at App level
- [ ] Signal controls which image path (if any) is being previewed

**Verify**: Set preview signal, modal opens; clear signal, modal closes

---

### T7.3 Add magnify icon overlay on images in editor
**Satisfies**: SPEC §2.5
**Dependencies**: T7.2, T4.5
**Acceptance**:
- [ ] On hover over image in editor, small magnify icon appears in top-right corner
- [ ] Clicking magnify icon opens ImagePreview modal with that image
- [ ] Icon does not interfere with image selection or resize

**Verify**: Hover image in editor, magnify icon appears; click it, preview opens at native size

---

### T7.4 Add magnify icon overlay on ImageGrid cards
**Satisfies**: SPEC §1.3
**Dependencies**: T7.2, T6.7
**Acceptance**:
- [ ] On hover over ImageGrid card, magnify icon appears
- [ ] Clicking magnify icon opens ImagePreview for that image
- [ ] Does not conflict with card click (parent entity navigation)

**Verify**: Hover image card in grid, magnify icon; click it, preview opens

---

### T7.5 Implement image copying for content promotion
**Satisfies**: SPEC Edge Cases, Design §3.3
**Dependencies**: T4.3
**Acceptance**:
- [ ] `ImageService.copyImagesForPromotion(sourceEntityPath, targetEntityPath, markdown)` implemented
- [ ] Copies all referenced images from source `.assets/` to target `.assets/`
- [ ] Rewrites relative paths in the promoted markdown to point to new location
- [ ] Source images left in place (not moved)
- [ ] Integrated into `EntityService.promoteToTask()` and `EntityService.promoteToDoc()`

**Verify**: Promote note with image → new entity has copied image in its `.assets/`; source image unchanged

---

### T7.6 Add loading states and error handling for image operations
**Satisfies**: UX polish
**Dependencies**: T4.7, T4.8
**Acceptance**:
- [ ] Loading indicator shown during image ingestion (paste/drop)
- [ ] Error toast on failed image write
- [ ] Graceful handling of broken image paths in editor (placeholder shown)

**Verify**: Paste large image, loading indicator appears; simulate write failure, error toast shown

---

## Summary

| Phase | Tasks | Count | Focus |
|-------|-------|-------|-------|
| 1. Backend + Runtime | T1.1–T1.5 | 5 | Tauri commands, runtime methods, web API |
| 2. Search Data | T2.1–T2.4 | 4 | Search types, IndexService.search(), navigation |
| 3. Search UI | T3.1–T3.4 | 4 | SearchView, CenterPanel routing, sidebar, shortcut |
| 4. Image Storage | T4.1–T4.8 | 8 | Types, ImageService, TipTap Image, paste/drop |
| 5. Image Resize | T5.1–T5.3 | 3 | ProseMirror resize plugin, width persistence |
| 6. Image Index | T6.1–T6.8 | 8 | Asset scanning, orphan detection, image grid |
| 7. Preview + Polish | T7.1–T7.6 | 6 | Preview modal, magnify overlay, promotion, UX |

**Total: 38 tasks**

---

## Dependency Graph

```
Phase 1 (Backend + Runtime)
├── T1.1 (base64 crate)
│   └── T1.2 (Tauri commands)
│       └── T1.3 (lib.rs registration)
│           └── T1.4 (runtime.ts methods)
└── T1.5 (Vite API endpoints)

Phase 2 (Search Data) — parallel with Phase 1
├── T2.1 (Search types)
│   ├── T2.2 (Store state)
│   │   └── T2.4 (NavigationService.goToSearch)
│   └── T2.3 (IndexService.search)

Phase 3 (Search UI) ← Phase 2
├── T3.1 (SearchView) ← T2.3, T2.4
├── T3.2 (CenterPanel routing) ← T3.1
├── T3.3 (Sidebar search button) ← T2.4
└── T3.4 (Cmd/Ctrl+K shortcut) ← T2.4

Phase 4 (Image Storage) ← Phase 1
├── T4.1 (Image types)
├── T4.2 (ImageService core) ← T4.1, T1.4
│   └── T4.3 (Ingestion flows) ← T4.2
├── T4.4 (TipTap Image extension)
├── T4.5 (Markdown round-trip) ← T4.4, T4.2
│   └── T4.6 (Editor props) ← T4.5
│       ├── T4.7 (Paste handler) ← T4.3, T4.6
│       └── T4.8 (Drop handler) ← T4.3, T4.6

Phase 5 (Image Resize) ← Phase 4
├── T5.1 (ImageResizePlugin) ← T4.5
│   └── T5.2 (Drag-to-resize) ← T5.1
│       └── T5.3 (Width persistence) ← T5.2

Phase 6 (Image Index) ← Phase 4, Phase 3
├── T6.1 (Store state) ← T4.1
├── T6.2 (Image ref parsing) ← T6.1
├── T6.3 (Asset dir scanning) ← T6.1
├── T6.4 (buildImageIndex) ← T6.2, T6.3
│   └── T6.5 (searchImages) ← T6.4
│       └── T6.7 (ImageGrid) ← T6.5
│           └── T6.8 (Wire Images tab) ← T6.7, T3.1
├── T6.6 (deleteImage) ← T6.4

Phase 7 (Preview + Polish) ← Phase 6, Phase 4
├── T7.1 (ImagePreview component)
│   └── T7.2 (Mount in App.tsx) ← T7.1
│       ├── T7.3 (Editor magnify) ← T7.2, T4.5
│       └── T7.4 (Grid magnify) ← T7.2, T6.7
├── T7.5 (Promotion image copy) ← T4.3
└── T7.6 (Loading/error UX) ← T4.7, T4.8
```

---

## Parallel Execution Opportunities

**Phase 1 & 2:**
- Phases 1 and 2 can run entirely in parallel (no cross-dependencies)

**Phase 3 & 4:**
- Phases 3 and 4 can run in parallel after their respective prerequisites (merge at Phase 6)
- Within Phase 4: T4.1 and T4.4 can run in parallel

**Phase 5:**
- Can start as soon as Phase 4 (specifically T4.5) completes

**Phase 6:**
- T6.1, T6.2, T6.3 can run in parallel after T4.1
- T6.6 and T6.5 can run in parallel after T6.4

**Phase 7:**
- T7.1 has no dependencies, can start early
- T7.5 only needs T4.3, can start as soon as Phase 4 completes

---

## SPEC Coverage Cross-Reference

| SPEC Section | Tasks | Phase |
|--------------|-------|-------|
| §1.1 Search activation & UI | T2.4, T3.1, T3.3, T3.4 | 2, 3 |
| §1.2 Search behavior | T2.1, T2.3, T3.1 | 2, 3 |
| §1.3 Images tab | T6.5, T6.7, T6.8, T7.4 | 6, 7 |
| §1.4 Index requirements | T2.3, T6.4 | 2, 6 |
| §2.1 Storage model | T4.1, T4.2 | 4 |
| §2.2 Markdown syntax | T4.5, T5.3 | 4, 5 |
| §2.3 Ingestion flows | T4.3, T4.7, T4.8 | 4 |
| §2.4 Image reference tracking | T6.2, T6.3, T6.4 | 6 |
| §2.5 Editor rendering, resize & preview | T4.4, T4.5, T5.1–T5.3, T7.1–T7.4 | 4, 5, 7 |
| §2.6 Backend changes | T1.1–T1.5 | 1 |
| Edge: entity deleted → orphan | T6.4 | 6 |
| Edge: content promoted → image copy | T7.5 | 7 |
