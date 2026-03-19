# 002: Images & Search — Technical Design

**Version 1.0 — March 2026**
**Status: Pre-Development Design**

This document specifies data models, API contracts, component architecture, and implementation phases for adding full-text search and image support to NslNotes.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Data Model Changes](#2-data-model-changes)
3. [Service Layer API Contracts](#3-service-layer-api-contracts)
4. [Store Changes](#4-store-changes)
5. [Component Architecture](#5-component-architecture)
6. [Editor Integration](#6-editor-integration)
7. [Backend Changes](#7-backend-changes)
8. [Key Tradeoffs](#8-key-tradeoffs)
9. [Implementation Phases](#9-implementation-phases)
10. [File Manifest](#10-file-manifest)

---

## 1. Executive Summary

This increment adds two capabilities — **full-text search** and **image support** — surfaced through a single new center panel view. Images are browsable as a tab within search, avoiding a separate UI surface.

### Key Constraints

| Constraint | Implication |
|------------|-------------|
| No search engine | Substring match against in-memory index only |
| No thumbnails | CSS scaling only; images served at full resolution |
| No database for image refs | Bidirectional maps rebuilt from markdown + disk on each index |
| Per-entity `.assets/` folders | Images stored alongside their entity, not in a shared directory |
| Relative markdown paths | `![alt](./slug.assets/img.png)` — portable across machines |
| Custom markdown converter | Image syntax added to existing regex-based `htmlFromMarkdown` / DOM-based `markdownFromHtml` |

### Performance Targets

| Metric | Target |
|--------|--------|
| Search results (2000 entities) | < 250ms |
| Paste-to-visible (image) | < 500ms |
| Image index rebuild | < 500ms (piggybacks on entity index) |
| Search UI render (100 results) | < 100ms |

---

## 2. Data Model Changes

### 2.1 ViewType Extension

```typescript
// src/types/stores.ts — modification

type ViewType = "journal" | "task" | "doc" | "topic" | "search";
```

### 2.2 Image Types

```typescript
// src/types/images.ts — new file

/** MIME types supported for image ingestion */
type ImageMimeType = "image/png" | "image/jpeg" | "image/gif" | "image/webp";

/** File extension mapped from MIME type */
const MIME_TO_EXT: Record<ImageMimeType, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

/** Extension to MIME type mapping (for Content-Type headers) */
const EXT_TO_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

/**
 * Image reference parsed from markdown content.
 * Extracted from `![alt](path){width=N}` syntax.
 */
interface ImageRef {
  /** Alt text */
  alt: string;
  /** Relative path as written in markdown (e.g. `./slug.assets/img.png`) */
  relativePath: string;
  /** Absolute path on disk (resolved from entity location) */
  absolutePath: string;
  /** Optional explicit width in pixels */
  width: number | null;
}

/**
 * Image file discovered on disk in a `.assets/` directory.
 */
interface ImageFile {
  /** Absolute path to the image file */
  path: string;
  /** Filename (e.g. `clipboard-1742313600.png`) */
  filename: string;
  /** Parent entity path (e.g. `/root/notes/2026-03-18.md`), null if orphaned */
  entityPath: string | null;
  /** Entity type derived from directory, null if orphaned */
  entityType: "note" | "task" | "doc" | null;
  /** Entity display name (title or date) */
  entityName: string | null;
  /** Whether this image is referenced in its parent entity's markdown */
  isReferenced: boolean;
  /** File modification date (from directory listing order / index time) */
  indexedAt: Date;
}
```

### 2.3 Search Types

```typescript
// src/types/search.ts — new file

/**
 * Filter for which entity types to include in search results.
 */
type SearchFilter = "all" | "notes" | "tasks" | "docs" | "images";

/**
 * A single search result with match context.
 */
interface SearchResult {
  /** The matched entity */
  entity: Entity;
  /** What part of the entity matched */
  matchType: "title" | "content" | "topic" | "date";
  /** Matched line(s) with surrounding context */
  snippet: string | null;
  /** Character offsets of matches within snippet for highlighting */
  matchRanges: Array<{ start: number; end: number }>;
}

/**
 * Current search UI state.
 * Stored in contextStore when activeView === "search".
 */
interface SearchState {
  /** Current query string */
  query: string;
  /** Active filter tab */
  filter: SearchFilter;
}
```

### 2.4 IndexState Additions

```typescript
// src/types/stores.ts — additions to IndexState

interface IndexState {
  // ... existing fields ...

  /** All discovered image files indexed by absolute path */
  imageFiles: Map<string, ImageFile>;
  /** Entity path → set of image absolute paths referenced in its markdown */
  entityToImages: Map<string, Set<string>>;
  /** Image absolute path → set of entity paths that reference it */
  imageToEntities: Map<string, Set<string>>;
}
```

### 2.5 ContextState Additions

```typescript
// src/types/stores.ts — additions to ContextState

interface ContextState {
  // ... existing fields ...

  /** Search state when activeView === "search", null otherwise */
  searchState: SearchState | null;
}
```

### 2.6 Type Exports

```typescript
// src/types/index.ts — additions

export type { ImageMimeType, ImageRef, ImageFile } from "./images";
export { MIME_TO_EXT, EXT_TO_MIME } from "./images";

export type { SearchFilter, SearchResult, SearchState } from "./search";
```

---

## 3. Service Layer API Contracts

All services follow the existing pattern: object literals with methods, never classes.

### 3.1 IndexService Additions

```typescript
// src/services/IndexService.ts — additions

export const IndexService = {
  // ... existing methods ...

  /**
   * Full-text search across all entities.
   * Case-insensitive substring match against title, content, topics, and dates.
   * Returns results grouped by date, reverse chronological.
   *
   * @param query - Search string (minimum 2 characters)
   * @param filter - Entity type filter ("all" | "notes" | "tasks" | "docs")
   * @returns Matching results with snippets and highlight ranges
   */
  search: (query: string, filter: SearchFilter): SearchResult[] => {
    // Implementation: iterate all entities in index store,
    // test query as case-insensitive substring against:
    //   1. entity.title / entity.date (for notes)
    //   2. entity.content
    //   3. entity.topics (joined)
    // For each match, extract snippet: the matching line ± 1 line context
    // Compute matchRanges for the query occurrences within the snippet
    // Sort by entity date, reverse chronological
  },

  /**
   * Search images by filename, alt text, or parent entity name.
   * With empty query, returns all images.
   *
   * @param query - Search string (empty returns all)
   * @returns Matching ImageFile entries, reverse chronological
   */
  searchImages: (query: string): ImageFile[] => {
    // Filter imageFiles map by case-insensitive substring match on:
    //   - filename
    //   - alt text (from entityToImages → parse refs)
    //   - entityName
  },

  /**
   * Parse image references from markdown content.
   * Matches `![alt](path)` and `![alt](path){width=N}` syntax.
   *
   * @param entityPath - Absolute path to the entity file
   * @param content - Markdown content to parse
   * @returns Array of parsed image references
   */
  parseImageRefs: (entityPath: string, content: string): ImageRef[] => {
    // Regex: /!\[([^\]]*)\]\(([^)]+)\)(?:\{width=(\d+)\})?/g
    // For each match:
    //   alt = group 1
    //   relativePath = group 2
    //   width = group 3 (parsed to number) or null
    //   absolutePath = resolve relativePath from dirname(entityPath)
  },

  /**
   * Scan all .assets/ directories to discover image files on disk.
   *
   * @param rootPath - Root notes directory
   * @returns Map of absolute path → ImageFile
   */
  scanAssetDirectories: async (rootPath: string): Promise<Map<string, ImageFile>> => {
    // For each entity directory (notes/, tasks/, docs/):
    //   List entries via FileService.list
    //   Filter for entries ending in ".assets" (directories)
    //   For each .assets/ dir, list image files (png, jpg, gif, webp)
    //   Derive parent entity path from .assets/ dir name
    //   Check if parent entity exists in index
  },

  /**
   * Build bidirectional image index from parsed entities and disk scan.
   * Called during buildIndex after entities are loaded.
   *
   * @param rootPath - Root notes directory
   */
  buildImageIndex: async (rootPath: string): Promise<void> => {
    // 1. scanAssetDirectories → imageFiles map
    // 2. For each entity in index, parseImageRefs → entityToImages map
    // 3. Invert entityToImages → imageToEntities map
    // 4. Mark each ImageFile.isReferenced based on imageToEntities
    // 5. Update indexStore with all three maps
  },
};
```

### 3.2 NavigationService Addition

```typescript
// src/services/NavigationService.ts — addition

export const NavigationService = {
  // ... existing methods ...

  /**
   * Navigate to the search view.
   * Optionally pre-fills query and filter.
   *
   * @param query - Initial search query (default: "")
   * @param filter - Initial filter tab (default: "all")
   */
  goToSearch: (query?: string, filter?: SearchFilter): void => {
    setContextStore({
      activeView: "search",
      activeEntity: null,
      activeTopic: null,
      isHomeState: false,
      draft: null,
      searchState: {
        query: query ?? "",
        filter: filter ?? "all",
      },
    });
  },
};
```

### 3.3 ImageService (New)

```typescript
// src/services/ImageService.ts — new file

import { runtime } from "../lib/runtime";
import { FileService } from "./FileService";
import { IndexService } from "./IndexService";
import type { ImageMimeType } from "../types/images";
import { MIME_TO_EXT } from "../types/images";

/**
 * ImageService handles image file operations: ingestion, deletion, and URL resolution.
 */
export const ImageService = {
  /**
   * Generate a filename for a new image.
   * Format: {prefix}-{unix-timestamp}.{ext}
   *
   * @param prefix - "clipboard" for paste, slugified original name for drop
   * @param mimeType - Image MIME type
   * @returns Generated filename (e.g. "clipboard-1742313600.png")
   */
  generateImageFilename: (prefix: string, mimeType: ImageMimeType): string => {
    const ext = MIME_TO_EXT[mimeType];
    const timestamp = Math.floor(Date.now() / 1000);
    return `${prefix}-${timestamp}.${ext}`;
  },

  /**
   * Derive the .assets/ directory path for an entity.
   *
   * @param entityPath - Absolute path to the entity file
   * @returns Absolute path to the entity's .assets/ directory
   */
  getAssetsDir: (entityPath: string): string => {
    // /root/notes/2026-03-18.md → /root/notes/2026-03-18.assets
    const dir = entityPath.substring(0, entityPath.lastIndexOf("/"));
    const slug = entityPath
      .substring(entityPath.lastIndexOf("/") + 1)
      .replace(/\.md$/, "");
    return `${dir}/${slug}.assets`;
  },

  /**
   * Ingest an image from clipboard paste.
   * Writes binary data to the entity's .assets/ directory and returns
   * the markdown syntax to insert.
   *
   * @param entityPath - Absolute path to the entity file
   * @param base64 - Base64-encoded image data
   * @param mimeType - Image MIME type
   * @returns Markdown image syntax (e.g. "![](./slug.assets/clipboard-123.png)")
   */
  ingestFromClipboard: async (
    entityPath: string,
    base64: string,
    mimeType: ImageMimeType
  ): Promise<string> => {
    const assetsDir = ImageService.getAssetsDir(entityPath);
    await runtime.ensureDirectory(assetsDir);

    const filename = ImageService.generateImageFilename("clipboard", mimeType);
    const imagePath = `${assetsDir}/${filename}`;
    await runtime.writeBinary(imagePath, base64);

    const slug = entityPath
      .substring(entityPath.lastIndexOf("/") + 1)
      .replace(/\.md$/, "");
    return `![](${slug}.assets/${filename})`;
  },

  /**
   * Ingest an image from drag-and-drop.
   * Copies the file to the entity's .assets/ directory and returns
   * the markdown syntax to insert.
   *
   * @param entityPath - Absolute path to the entity file
   * @param originalFilename - Original filename (slugified for prefix)
   * @param base64 - Base64-encoded image data
   * @param mimeType - Image MIME type
   * @returns Markdown image syntax
   */
  ingestFromDrop: async (
    entityPath: string,
    originalFilename: string,
    base64: string,
    mimeType: ImageMimeType
  ): Promise<string> => {
    const assetsDir = ImageService.getAssetsDir(entityPath);
    await runtime.ensureDirectory(assetsDir);

    // Slugify original filename (strip extension, lowercase, replace spaces)
    const nameWithoutExt = originalFilename.replace(/\.[^.]+$/, "");
    const prefix = nameWithoutExt.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const filename = ImageService.generateImageFilename(prefix, mimeType);
    const imagePath = `${assetsDir}/${filename}`;
    await runtime.writeBinary(imagePath, base64);

    const slug = entityPath
      .substring(entityPath.lastIndexOf("/") + 1)
      .replace(/\.md$/, "");
    return `![](${slug}.assets/${filename})`;
  },

  /**
   * Delete an orphaned image file and rebuild the image index.
   *
   * @param imagePath - Absolute path to the image file
   * @param rootPath - Root notes directory (for index rebuild)
   */
  deleteImage: async (imagePath: string, rootPath: string): Promise<void> => {
    await runtime.deleteFile(imagePath);
    // Rebuild image index to reflect deletion
    await IndexService.buildImageIndex(rootPath);
  },

  /**
   * Resolve an absolute image path to a URL suitable for rendering.
   * In Tauri mode, uses convertFileSrc for asset protocol.
   * In web mode, uses /api/assets?path=... endpoint.
   *
   * @param absolutePath - Absolute path to the image file
   * @param rootPath - Root notes directory (for computing relative path in web mode)
   * @returns URL string for use in <img src>
   */
  resolveImageUrl: (absolutePath: string, rootPath: string): string => {
    if (runtime.isNative()) {
      // Tauri v2: convertFileSrc converts local path to asset:// protocol URL
      const { convertFileSrc } = await import("@tauri-apps/api/core");
      return convertFileSrc(absolutePath);
    }
    // Web mode: serve via API endpoint
    const relativePath = absolutePath.startsWith(rootPath)
      ? absolutePath.slice(rootPath.length + 1)
      : absolutePath;
    return `/api/assets?path=${encodeURIComponent(relativePath)}`;
  },

  /**
   * Copy images referenced in content from one entity's .assets/ to another's.
   * Used when promoting notes to tasks/docs.
   * Rewrites image paths in the content to point to the new location.
   *
   * @param content - Markdown content containing image references
   * @param sourceEntityPath - Source entity's absolute path
   * @param destEntityPath - Destination entity's absolute path
   * @returns Content with rewritten image paths
   */
  copyImagesForPromotion: async (
    content: string,
    sourceEntityPath: string,
    destEntityPath: string
  ): Promise<string> => {
    const refs = IndexService.parseImageRefs(sourceEntityPath, content);
    if (refs.length === 0) return content;

    const destAssetsDir = ImageService.getAssetsDir(destEntityPath);
    await runtime.ensureDirectory(destAssetsDir);

    let result = content;
    const destSlug = destEntityPath
      .substring(destEntityPath.lastIndexOf("/") + 1)
      .replace(/\.md$/, "");

    for (const ref of refs) {
      const filename = ref.absolutePath.substring(
        ref.absolutePath.lastIndexOf("/") + 1
      );
      const destImagePath = `${destAssetsDir}/${filename}`;
      await runtime.copyFile(ref.absolutePath, destImagePath);

      // Rewrite the path in content
      const newRelativePath = `${destSlug}.assets/${filename}`;
      result = result.replace(ref.relativePath, newRelativePath);
    }

    return result;
  },
};
```

### 3.4 EntityService Modifications

```typescript
// src/services/EntityService.ts — modifications to existing methods

export const EntityService = {
  // ... existing methods ...

  /**
   * promoteToTask and promoteToDoc gain image copying.
   * Before writing the new entity, call ImageService.copyImagesForPromotion
   * to copy referenced images and rewrite paths.
   */
  promoteToTask: async (params: PromoteTaskParams): Promise<Task> => {
    // ... existing logic to extract content ...
    // NEW: Copy images before writing
    const contentWithImages = await ImageService.copyImagesForPromotion(
      extractedContent,
      params.sourcePath,
      newTaskPath
    );
    // ... write task file with contentWithImages ...
  },

  promoteToDoc: async (params: PromoteDocParams): Promise<Doc> => {
    // ... existing logic to extract content ...
    // NEW: Copy images before writing
    const contentWithImages = await ImageService.copyImagesForPromotion(
      extractedContent,
      params.sourcePath,
      newDocPath
    );
    // ... write doc file with contentWithImages ...
  },
};
```

---

## 4. Store Changes

### 4.1 Index Store

```typescript
// src/stores/indexStore.ts — additions to initial state

export const [indexStore, setIndexStore] = createStore<IndexState>({
  // ... existing fields ...
  imageFiles: new Map(),
  entityToImages: new Map(),
  imageToEntities: new Map(),
});
```

### 4.2 Context Store

```typescript
// src/stores/contextStore.ts — addition to initial state

export const [contextStore, setContextStore] = createStore<ContextState>({
  // ... existing fields ...
  searchState: null,
});
```

---

## 5. Component Architecture

### 5.1 Updated Component Tree

```
App
├── Layout
│   ├── LeftSidebar
│   │   ├── TodayButton
│   │   ├── SearchButton ← NEW
│   │   ├── TopicsList
│   │   └── DocsList
│   │
│   ├── CenterPanel
│   │   ├── JournalView
│   │   ├── TaskDetail
│   │   ├── DocView
│   │   ├── TopicView
│   │   ├── DraftView
│   │   └── SearchView ← NEW
│   │       ├── SearchInput
│   │       ├── FilterTabs (All | Notes | Tasks | Docs | Images)
│   │       ├── SearchResultsList (when filter ≠ images)
│   │       │   └── SearchResultItem (repeated)
│   │       └── ImageGrid (when filter = images)
│   │           └── ImageCard (repeated)
│   │
│   └── RightPanel
│
├── ImagePreview ← NEW (global modal, mounted at App level)
└── Modals
```

### 5.2 SearchView

```typescript
// src/components/search/SearchView.tsx — new file

interface SearchViewProps {}

/**
 * Search view rendered in center panel when activeView === "search".
 *
 * - Auto-focused input at top
 * - Filter tabs: All | Notes | Tasks | Docs | Images
 * - Debounced search (200ms) with minimum 2 characters (except Images tab)
 * - Results list or image grid depending on active filter
 * - Escape returns to journal view (NavigationService.goHome)
 */
export function SearchView(props: SearchViewProps) {
  // Read initial state from contextStore.searchState
  // createSignal for local query and filter
  // createEffect to debounce query → IndexService.search()
  // Escape keydown handler → NavigationService.goHome()
}
```

### 5.3 ImageGrid

```typescript
// src/components/search/ImageGrid.tsx — new file

interface ImageGridProps {
  images: ImageFile[];
  onPreview: (imagePath: string) => void;
  onDelete: (imagePath: string) => void;
  onEntityClick: (entityPath: string) => void;
}

/**
 * CSS grid of image thumbnail cards for the Images tab in search.
 *
 * - Grid layout: `grid-cols-[repeat(auto-fill,minmax(180px,1fr))]`
 * - Each card shows: thumbnail, filename, parent entity link, orphan badge
 * - Magnify icon overlay on hover → triggers onPreview
 * - Delete button on orphaned images only
 * - Grouped by date (reverse chronological)
 */
export function ImageGrid(props: ImageGridProps) {}
```

### 5.4 ImagePreview

```typescript
// src/components/shared/ImagePreview.tsx — new file

interface ImagePreviewProps {
  /** Absolute path of image to preview, null when hidden */
  imagePath: string | null;
  /** Root path for URL resolution */
  rootPath: string;
  /** Called to dismiss the preview */
  onClose: () => void;
}

/**
 * Global modal overlay for native-resolution image preview.
 *
 * - Overlay: `fixed inset-0 z-50 bg-black/70` (matches existing modal pattern)
 * - Image centered, native resolution, max constrained to viewport
 * - Dismiss: click outside, Escape key, close button
 * - No gallery navigation (single image only per spec)
 * - Mounted at App level, shared by editor, search grid, and right panel
 */
export function ImagePreview(props: ImagePreviewProps) {}
```

### 5.5 SearchButton

```typescript
// Added to LeftSidebar between TodayButton and TopicsList

/**
 * Search button in left sidebar.
 * Shows search icon + "Search" label + Cmd/Ctrl+K hint.
 * Clicking calls NavigationService.goToSearch().
 */
// Rendered inline in LeftSidebar, not a separate file
// Style matches TodayButton: subtle, full-width, text-left
```

### 5.6 CenterPanel Routing

```typescript
// src/components/layout/CenterPanel.tsx — addition

<Match when={props.activeView === "search"}>
  <SearchView />
</Match>
```

### 5.7 App.tsx Global Shortcut

```typescript
// src/App.tsx — addition

// Global Cmd/Ctrl+K handler
onMount(() => {
  const handler = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      NavigationService.goToSearch();
    }
  };
  document.addEventListener("keydown", handler);
  onCleanup(() => document.removeEventListener("keydown", handler));
});

// Mount ImagePreview at App level
// <ImagePreview imagePath={previewImage()} rootPath={rootPath()} onClose={...} />
```

---

## 6. Editor Integration

### 6.1 TipTap Image Extension

Install `@tiptap/extension-image` and add to the editor's extension array:

```typescript
// In ProseEditor.tsx extensions array
import Image from "@tiptap/extension-image";

Image.configure({
  inline: false,
  allowBase64: false,
  HTMLAttributes: {
    class: "prose-image",
  },
}),
```

The Image extension handles `<img>` elements natively and supports the `width` attribute through its schema.

### 6.2 Markdown Round-Trip

#### htmlFromMarkdown Addition

Image regex must run **before** the markdown link regex `[text](url)` to avoid `![alt](path)` being consumed as a link.

```typescript
// Insert BEFORE the [text](url) → <a> line in htmlFromMarkdown

// Images: ![alt](src){width=N} or ![alt](src)
.replace(
  /!\[([^\]]*)\]\(([^)]+)\)(?:\{width=(\d+)\})?/g,
  (_match, alt, src, width) => {
    const resolvedSrc = resolveImageSrc(src, entityPath, rootPath);
    const widthAttr = width ? ` width="${width}"` : "";
    return `<img src="${resolvedSrc}" alt="${alt}"${widthAttr}>`;
  }
)
```

Where `resolveImageSrc` converts the relative path to a renderable URL via `ImageService.resolveImageUrl`.

#### markdownFromHtml Addition

```typescript
// In nodeToMarkdown, handle <img> elements in the switch on tag name

case "img": {
  const src = el.getAttribute("src") ?? "";
  const alt = el.getAttribute("alt") ?? "";
  const width = el.getAttribute("width");
  // Convert resolved URL back to relative path
  const relativeSrc = unresolveImageSrc(src, entityPath, rootPath);
  const widthSuffix = width ? `{width=${width}}` : "";
  result += `![${alt}](${relativeSrc})${widthSuffix}`;
  break;
}
```

#### Image Reference Regex

The canonical regex for parsing image references from markdown:

```
/!\[([^\]]*)\]\(([^)]+)\)(?:\{width=(\d+)\})?/g
```

- Group 1: alt text
- Group 2: relative path
- Group 3: width (optional)

### 6.3 ProseEditor Props Changes

```typescript
interface ProseEditorProps {
  // ... existing props ...

  /** Absolute path of the entity being edited (for image path resolution) */
  entityPath?: string | undefined;
  /** Root notes directory path (for image URL resolution) */
  rootPath?: string | undefined;
}
```

These props are threaded through from the parent editor components (DailyNote, NamedNoteCard, TaskDetail, DocView) which already have access to entity paths.

### 6.4 Paste Handler

```typescript
// In ProseEditor.tsx, add to editor configuration

editorProps: {
  handlePaste: (view, event) => {
    const items = event.clipboardData?.items;
    if (!items) return false;

    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        event.preventDefault();
        const mimeType = item.type as ImageMimeType;
        const file = item.getAsFile();
        if (!file || !props.entityPath) return true;

        // Read as base64, ingest, insert markdown
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = (reader.result as string).split(",")[1]!;
          const markdown = await ImageService.ingestFromClipboard(
            props.entityPath!,
            base64,
            mimeType
          );
          // Insert image node at cursor position
          editor.chain().focus().setImage({
            src: ImageService.resolveImageUrl(/* ... */),
            alt: "",
          }).run();
        };
        reader.readAsDataURL(file);
        return true;
      }
    }
    return false;
  },
}
```

### 6.5 Drop Handler Extension

The existing `handleDrop` in ProseEditor handles wikilink drops. Extend it to also handle image file drops:

```typescript
handleDrop: (view, event, _slice, moved) => {
  if (moved) return false;

  // Existing: handle wikilink drops
  const wikilink = event.dataTransfer?.getData(WIKILINK_MIME);
  if (wikilink) { /* ... existing logic ... */ }

  // NEW: handle image file drops
  const files = event.dataTransfer?.files;
  if (files && files.length > 0 && props.entityPath) {
    for (const file of Array.from(files)) {
      if (file.type.startsWith("image/")) {
        event.preventDefault();
        // Read as base64, ingest, insert at drop position
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = (reader.result as string).split(",")[1]!;
          const markdown = await ImageService.ingestFromDrop(
            props.entityPath!,
            file.name,
            base64,
            file.type as ImageMimeType
          );
          // Insert image at drop coordinates
          const coords = view.posAtCoords({
            left: event.clientX,
            top: event.clientY,
          });
          if (coords) {
            // Insert markdown, which will be converted on next render
          }
        };
        reader.readAsDataURL(file);
        return true;
      }
    }
  }
  return false;
},
```

### 6.6 Image Resize Plugin

```typescript
// src/components/editor/ImageResizePlugin.ts — new file

/**
 * ProseMirror plugin for drag-to-resize images.
 *
 * Behavior:
 * - Clicking an image shows a blue border (2px solid blue-500)
 *   and a bottom-right drag handle (8x8 square)
 * - Mousedown on handle → track mouse movement
 * - Constrain width: min 50px, max container width
 * - On mouseup: update the image node's width attribute
 * - Width change triggers onUpdate → markdownFromHtml persists {width=N}
 *
 * Implementation: ProseMirror Plugin with decorations for the resize handle,
 * and a NodeView for selected image styling.
 */
```

The plugin creates a `Plugin` that:
1. Tracks which image node (if any) is selected
2. Adds decorations for the selection border and resize handle
3. Listens for mousedown on the handle to start resize tracking
4. On mousemove during resize, updates the image element's width style
5. On mouseup, dispatches a transaction setting the node's `width` attribute

---

## 7. Backend Changes

### 7.1 Tauri Commands

```rust
// src-tauri/src/commands.rs — new commands

use base64::Engine as _;
use base64::engine::general_purpose::STANDARD;

/// Copy a file from src to dst, creating parent directories if needed
#[tauri::command]
pub async fn copy_file(src: String, dst: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&dst).parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory: {}", e))?;
        }
    }
    fs::copy(&src, &dst)
        .map_err(|e| format!("Failed to copy '{}' to '{}': {}", src, dst, e))?;
    Ok(())
}

/// Write binary data (base64-encoded) to a file
#[tauri::command]
pub async fn write_binary(path: String, base64_data: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory: {}", e))?;
        }
    }
    let bytes = STANDARD
        .decode(&base64_data)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;
    fs::write(&path, bytes)
        .map_err(|e| format!("Failed to write binary file '{}': {}", path, e))
}

/// Get file size in bytes
#[tauri::command]
pub async fn get_file_size(path: String) -> Result<u64, String> {
    let metadata = fs::metadata(&path)
        .map_err(|e| format!("Failed to get file size '{}': {}", path, e))?;
    Ok(metadata.len())
}
```

### 7.2 lib.rs Registration

```rust
// src-tauri/src/lib.rs — additions

use commands::{
    // ... existing imports ...
    copy_file, write_binary, get_file_size,
};

// In generate_handler! macro:
tauri::generate_handler![
    // ... existing handlers ...
    copy_file,
    write_binary,
    get_file_size
]
```

### 7.3 Cargo.toml Dependency

```toml
# src-tauri/Cargo.toml — addition to [dependencies]
base64 = "0.22"
```

### 7.4 Runtime Additions

```typescript
// src/lib/runtime.ts — new methods

export const runtime = {
  // ... existing methods ...

  /**
   * Copy a file from src to dst
   */
  copyFile: async (src: string, dst: string): Promise<void> => {
    if (runtime.isNative()) {
      return invoke("copy_file", { src, dst });
    }
    const res = await fetch("/api/files/copy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ src, dst }),
    });
    if (!res.ok) {
      throw new Error(`Failed to copy file: ${src} → ${dst}`);
    }
  },

  /**
   * Write binary data (base64-encoded) to a file
   */
  writeBinary: async (path: string, base64Data: string): Promise<void> => {
    if (runtime.isNative()) {
      return invoke("write_binary", { path, base64Data });
    }
    const res = await fetch("/api/files/binary", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, base64: base64Data }),
    });
    if (!res.ok) {
      throw new Error(`Failed to write binary file: ${path}`);
    }
  },

  /**
   * Get file size in bytes
   */
  getFileSize: async (path: string): Promise<number> => {
    if (runtime.isNative()) {
      return invoke<number>("get_file_size", { path });
    }
    const res = await fetch(`/api/files/size?path=${encodeURIComponent(path)}`);
    if (!res.ok) {
      throw new Error(`Failed to get file size: ${path}`);
    }
    const data = (await res.json()) as { size: number };
    return data.size;
  },
};
```

### 7.5 Vite API Plugin Additions

```typescript
// vite-plugin-api.ts — new endpoints

// GET /api/assets?path={relative-path}
// Serves image binary with appropriate Content-Type header.
// Path is relative to the notes root (e.g. "notes/2026-03-18.assets/img.png").
if (pathname === "/api/assets" && req.method === "GET") {
  const relativePath = getQueryParam(url, "path");
  if (!relativePath) return sendError(res, "Missing path parameter", 400);
  const rootPath = /* resolved from settings or env */;
  const absolutePath = path.join(rootPath, relativePath);
  if (!fs.existsSync(absolutePath)) return sendError(res, "Not found", 404);
  const ext = path.extname(absolutePath).slice(1).toLowerCase();
  const mimeType = EXT_TO_MIME[ext] ?? "application/octet-stream";
  const data = fs.readFileSync(absolutePath);
  res.writeHead(200, { "Content-Type": mimeType });
  res.end(data);
}

// POST /api/files/copy  { src, dst }
// Copy a file from src to dst
if (pathname === "/api/files/copy" && req.method === "POST") {
  const body = JSON.parse(await parseBody(req));
  fs.mkdirSync(path.dirname(body.dst), { recursive: true });
  fs.copyFileSync(body.src, body.dst);
  sendJson(res, { ok: true });
}

// PUT /api/files/binary  { path, base64 }
// Write base64-decoded binary data to a file
if (pathname === "/api/files/binary" && req.method === "PUT") {
  const body = JSON.parse(await parseBody(req));
  fs.mkdirSync(path.dirname(body.path), { recursive: true });
  const buffer = Buffer.from(body.base64, "base64");
  fs.writeFileSync(body.path, buffer);
  sendJson(res, { ok: true });
}

// GET /api/files/size?path={path}
// Get file size in bytes
if (pathname === "/api/files/size" && req.method === "GET") {
  const filePath = getQueryParam(url, "path");
  if (!filePath) return sendError(res, "Missing path parameter", 400);
  const stat = fs.statSync(filePath);
  sendJson(res, { size: stat.size });
}
```

---

## 8. Key Tradeoffs

| Decision | Option A | Option B | Choice | Rationale |
|----------|----------|----------|--------|-----------|
| Search engine | In-memory substring | Lunr.js / MiniSearch | **In-memory** | Spec mandates simple search; index is already loaded; substring match is O(n) but sufficient for <5000 entities |
| Image storage | Per-entity `.assets/` | Shared `/images/` dir | **Per-entity** | Spec mandates; keeps images co-located with entity; simplifies orphan detection |
| Image resize UX | Drag handle on selected image | Width input field | **Drag handle** | Spec mandates; more intuitive for visual content |
| Image URL resolution | Tauri asset protocol + API fallback | Embedded base64 in HTML | **Protocol/API** | Base64 bloats editor state and HTML; protocol URLs are lightweight |
| Markdown image syntax | Standard `![alt](path)` | Custom `{{image path}}` | **Standard + `{width=N}`** | Pandoc/kramdown attribute syntax is familiar; custom converter already exists |
| Orphan handling | Auto-delete on entity delete | Surface in UI, manual delete | **Surface in UI** | Spec mandates; prevents accidental data loss |
| Image in search | Separate Images view | Tab within Search view | **Tab within Search** | Spec mandates; avoids additional navigation surface |

---

## 9. Implementation Phases

### Phase 1: Backend + Runtime Foundation

**Goal**: Tauri commands, runtime methods, and web API endpoints for binary file operations.

**Tasks**:
- Add `base64` crate to `Cargo.toml`
- Implement `copy_file`, `write_binary`, `get_file_size` in `commands.rs`
- Register new commands in `lib.rs`
- Add `copyFile`, `writeBinary`, `getFileSize` to `runtime.ts`
- Add `GET /api/assets`, `POST /api/files/copy`, `PUT /api/files/binary`, `GET /api/files/size` to `vite-plugin-api.ts`
- Test: round-trip write_binary + read_file for a test PNG in both Tauri and web mode

**Exit Criteria**: Can write a base64 PNG to disk via runtime, read it back, and serve it via `/api/assets` in web mode.

**Dependencies**: None.

### Phase 2: Search Data Model + Service

**Goal**: Search types, IndexService.search(), and NavigationService.goToSearch().

**Tasks**:
- Create `src/types/search.ts` with `SearchFilter`, `SearchResult`, `SearchState`
- Add `"search"` to `ViewType` union in `stores.ts`
- Add `searchState: null` to `ContextState` in `stores.ts` and `contextStore.ts`
- Implement `IndexService.search(query, filter)` — substring match across entities
- Implement `NavigationService.goToSearch(query?, filter?)`
- Export new types from `src/types/index.ts`
- Test: search returns correct results for title, content, and topic matches

**Exit Criteria**: `IndexService.search("test", "all")` returns matching entities with snippets and highlight ranges.

**Dependencies**: None (can run in parallel with Phase 1).

### Phase 3: Search UI

**Goal**: SearchView component, CenterPanel routing, sidebar button, Cmd/Ctrl+K shortcut.

**Tasks**:
- Create `src/components/search/SearchView.tsx` with input, filter tabs, debounced search, result list
- Add `<Match when={props.activeView === "search"}>` to `CenterPanel.tsx`
- Add SearchButton between TodayButton and TopicsList in `LeftSidebar.tsx`
- Add `Cmd/Ctrl+K` global keydown handler in `App.tsx`
- Style search results: entity type badge, title/date, highlighted snippet
- Clicking a result calls `NavigationService.navigateTo(entity)`
- Escape from search calls `NavigationService.goHome()`

**Exit Criteria**: Can open search via Cmd+K, type a query, see debounced results, click to navigate, Escape to dismiss.

**Dependencies**: Phase 2 (search service).

### Phase 4: Image Storage + Ingestion

**Goal**: ImageService, paste/drop handlers, TipTap Image extension, markdown round-trip.

**Tasks**:
- Create `src/types/images.ts` with `ImageRef`, `ImageFile`, MIME constants
- Create `src/services/ImageService.ts` with `generateImageFilename`, `getAssetsDir`, `ingestFromClipboard`, `ingestFromDrop`, `resolveImageUrl`
- Install `@tiptap/extension-image`, add to ProseEditor extension array
- Add image regex to `htmlFromMarkdown` (before link regex)
- Add `<img>` handling to `markdownFromHtml` DOM walker
- Add `entityPath` and `rootPath` props to ProseEditor
- Thread `entityPath`/`rootPath` from DailyNote, NamedNoteCard, TaskDetail, DocView
- Implement clipboard paste handler in ProseEditor
- Extend existing drop handler for image files
- Test: paste an image in a note → file appears in `.assets/` → image renders in editor → round-trips through save/reload

**Exit Criteria**: Can paste and drop images into any entity editor; images render correctly; markdown round-trip preserves `![alt](path)` syntax.

**Dependencies**: Phase 1 (runtime binary operations).

### Phase 5: Image Resize

**Goal**: Drag-to-resize images with `{width=N}` persistence.

**Tasks**:
- Create `src/components/editor/ImageResizePlugin.ts` as ProseMirror plugin
- Selected image shows blue border (2px) and bottom-right drag handle (8x8)
- Mousedown on handle → track mouse → constrain width (min 50, max container)
- On mouseup → update image node `width` attribute → triggers save
- `markdownFromHtml` already handles `<img width="N">` → `{width=N}` from Phase 4
- `htmlFromMarkdown` already parses `{width=N}` from Phase 4
- Add `ImageResizePlugin` to ProseEditor extensions
- Test: resize an image → save → reload → image retains width

**Exit Criteria**: Images are resizable by drag; width persists in markdown as `{width=N}` and survives editor round-trips.

**Dependencies**: Phase 4 (image rendering in editor).

### Phase 6: Image Index + Search Images Tab

**Goal**: Asset directory scanning, bidirectional index maps, orphan detection, image gallery grid.

**Tasks**:
- Add `imageFiles`, `entityToImages`, `imageToEntities` to `IndexState` and `indexStore`
- Implement `IndexService.parseImageRefs(entityPath, content)`
- Implement `IndexService.scanAssetDirectories(rootPath)` — enumerate `.assets/` dirs
- Implement `IndexService.buildImageIndex(rootPath)` — called at end of `buildIndex`
- Implement `IndexService.searchImages(query)` — filter image files
- Call `buildImageIndex` from `buildIndex` and `_rebuildFresh`
- Implement `ImageService.deleteImage(imagePath, rootPath)` for orphan cleanup
- Create `src/components/search/ImageGrid.tsx` — CSS grid of thumbnail cards
- Wire Images tab in SearchView to show ImageGrid instead of result list
- Show orphan badges on unreferenced images
- Show delete button on orphaned images
- Test: add images to entities → Images tab shows all images; delete entity → image shows as orphaned

**Exit Criteria**: Images tab displays all images; orphans are badged; deleting an orphan removes the file and updates the index.

**Dependencies**: Phase 4 (image types and service), Phase 3 (search UI).

### Phase 7: Image Preview + Polish

**Goal**: Global image preview modal, magnify icon overlay, promote image copying.

**Tasks**:
- Create `src/components/shared/ImagePreview.tsx` — modal overlay with native-res image
- Add preview signal to App.tsx; mount ImagePreview component
- Add magnify icon overlay on image hover in editor (CSS + event handler)
- Add magnify icon overlay on ImageGrid cards
- Click magnify icon → open preview; Escape/click-outside → close
- Implement `ImageService.copyImagesForPromotion` in EntityService.promoteToTask/promoteToDoc
- Test: hover image in editor → magnify icon; click → preview at native size; promote note with image → new entity has copied image
- Polish: loading states for image ingestion, error handling for failed writes

**Exit Criteria**: Image preview works in editor and search grid; promoting content with images copies files correctly; no broken image states.

**Dependencies**: Phase 6 (image grid), Phase 4 (image rendering).

### Phase Dependency Graph

```
Phase 1 (Backend) ──────────────────────────┐
                                             ├── Phase 4 (Image Storage)
Phase 2 (Search Data) ──┐                   │         │
                         ├── Phase 3 (Search UI)      │
                         │         │                   │
                         │         ├── Phase 6 (Image Index) ── Phase 7 (Preview + Polish)
                         │                             │
                         │                   Phase 5 (Resize)
                         │
Phases 1 & 2 can run in parallel
Phases 4 & 5 are sequential
Phases 3 & 4 can run in parallel (merge at Phase 6)
```

---

## 10. File Manifest

### New Files (7)

| File | Purpose |
|------|---------|
| `src/types/images.ts` | ImageRef, ImageFile, MIME type constants |
| `src/types/search.ts` | SearchFilter, SearchResult, SearchState |
| `src/services/ImageService.ts` | Image ingestion, deletion, URL resolution, promotion copying |
| `src/components/search/SearchView.tsx` | Search UI: input, filter tabs, results list |
| `src/components/search/ImageGrid.tsx` | Image gallery grid for Images tab |
| `src/components/shared/ImagePreview.tsx` | Global modal for native-resolution image preview |
| `src/components/editor/ImageResizePlugin.ts` | ProseMirror plugin for drag-to-resize images |

### Modified Files (~18)

| File | Changes |
|------|---------|
| `src/types/stores.ts` | Add `"search"` to ViewType, add `searchState` to ContextState, add image maps to IndexState |
| `src/types/index.ts` | Export new image and search types |
| `src/stores/indexStore.ts` | Add initial empty Maps for image index fields |
| `src/stores/contextStore.ts` | Add `searchState: null` to initial state |
| `src/services/IndexService.ts` | Add `search()`, `searchImages()`, `parseImageRefs()`, `scanAssetDirectories()`, `buildImageIndex()` |
| `src/services/NavigationService.ts` | Add `goToSearch()` method |
| `src/services/EntityService.ts` | Add image copying in `promoteToTask()` and `promoteToDoc()` |
| `src/components/layout/CenterPanel.tsx` | Add `<Match>` for `"search"` view |
| `src/components/layout/LeftSidebar.tsx` | Add SearchButton between TodayButton and scrollable sections |
| `src/components/editor/ProseEditor.tsx` | Add Image extension, image regex in htmlFromMarkdown/markdownFromHtml, paste/drop handlers, entityPath/rootPath props |
| `src/components/journal/DailyNote.tsx` | Pass entityPath and rootPath to ProseEditor |
| `src/components/journal/NamedNoteCard.tsx` | Pass entityPath and rootPath to ProseEditor |
| `src/components/tasks/TaskDetail.tsx` | Pass entityPath and rootPath to ProseEditor |
| `src/components/docs/DocView.tsx` | Pass entityPath and rootPath to ProseEditor |
| `src/App.tsx` | Add Cmd/Ctrl+K handler, mount ImagePreview |
| `src/lib/runtime.ts` | Add `copyFile`, `writeBinary`, `getFileSize` methods |
| `src-tauri/src/commands.rs` | Add `copy_file`, `write_binary`, `get_file_size` commands |
| `src-tauri/src/lib.rs` | Register new commands in `generate_handler![]` |
| `src-tauri/Cargo.toml` | Add `base64 = "0.22"` dependency |
| `vite-plugin-api.ts` | Add `/api/assets`, `/api/files/copy`, `/api/files/binary`, `/api/files/size` endpoints |

---

## Appendix A: SPEC Coverage Matrix

| SPEC Section | Design Section | Phase |
|--------------|----------------|-------|
| §1.1 Search activation & UI | §5.2 SearchView, §5.5 SearchButton, §5.7 App shortcut | 3 |
| §1.2 Search behavior | §3.1 IndexService.search() | 2, 3 |
| §1.3 Images tab | §5.3 ImageGrid, §3.1 IndexService.searchImages() | 6 |
| §1.4 Index requirements | §3.1 IndexService additions | 2, 6 |
| §2.1 Storage model | §3.3 ImageService.getAssetsDir/generateImageFilename | 4 |
| §2.2 Markdown syntax | §6.2 htmlFromMarkdown/markdownFromHtml additions | 4 |
| §2.3 Ingestion flows | §6.4 Paste handler, §6.5 Drop handler | 4 |
| §2.4 Image reference tracking | §3.1 parseImageRefs/buildImageIndex | 6 |
| §2.5 Editor rendering, resize & preview | §6.1 Image extension, §6.6 Resize plugin, §5.4 ImagePreview | 4, 5, 7 |
| §2.6 Backend changes | §7.1–7.5 Tauri commands, runtime, vite plugin | 1 |
| Edge: entity deleted | §3.1 buildImageIndex orphan detection | 6 |
| Edge: content promoted | §3.3 ImageService.copyImagesForPromotion, §3.4 EntityService mods | 7 |
