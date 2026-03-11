# NslNotes — Technical Design Document

**Version 1.0 — March 2026**
**Status: Pre-Development Design**

This document specifies the recommended technology stack, system architecture, data models, API contracts, and implementation strategy for NslNotes.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Recommended Stack](#2-recommended-stack)
3. [Backend/Runtime Architecture](#3-backendruntime-architecture)
4. [System Architecture](#4-system-architecture)
5. [Data Models](#5-data-models)
6. [API Contracts](#6-api-contracts)
7. [Key Tradeoffs](#7-key-tradeoffs)
8. [Implementation Phases](#8-implementation-phases)
9. [Folder Structure](#9-folder-structure)

---

## 1. Executive Summary

NslNotes is a local-first, plain-text knowledge tool built around time-ordered notes, first-class tasks, and a unified topic system. This design prioritizes:

- **Performance**: No virtual DOM overhead, native runtime, efficient editor
- **Data Ownership**: Plain markdown files, no database, files are the source of truth
- **Developer Experience**: Type-safe TypeScript, modern tooling, fast iteration
- **Future-Proofing**: Tauri provides native distribution path without architectural changes

### Key Constraints (from PRD)

| Constraint | Implication |
|------------|-------------|
| Plain text storage | All persistence is markdown + YAML frontmatter |
| No database | Index rebuilt from files; cache for speed only |
| No block IDs | Outliner operates on indentation, not UUIDs |
| Fixed three-column layout | UI never collapses or hides panels |
| Deterministic relevance | Shared topics + direct links only, no ML |

### Performance Targets

| Metric | Target |
|--------|--------|
| Cold start | < 2 seconds to interactive |
| File save latency | < 100ms perceived |
| Keystroke latency | < 16ms (60fps) |
| Index rebuild (1000 files) | < 3 seconds |
| Memory footprint | < 200MB typical |

---

## 2. Recommended Stack

### 2.1 Core Technologies

| Layer | Technology | Rationale |
|-------|------------|-----------|
| **UI Framework** | SolidJS | Fine-grained reactivity without virtual DOM; signals update only affected DOM nodes |
| **Editor** | TipTap (ProseMirror) | Proven editor framework with extensible schema; transaction-based updates |
| **Styling** | Tailwind CSS | Utility-first CSS; consistent design tokens; purged unused styles |
| **Build Tool** | Vite | Fast HMR; native ESM; Rollup-based production builds |
| **Language** | TypeScript (strict) | Full type safety with `strict: true` and `noUncheckedIndexedAccess: true` |
| **Runtime** | Tauri | Rust backend with webview; 3MB binary vs 150MB Electron |

### 2.2 TypeScript Configuration

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "noPropertyAccessFromIndexSignature": true,
    "moduleResolution": "bundler",
    "module": "ESNext",
    "target": "ESNext",
    "jsx": "preserve",
    "jsxImportSource": "solid-js"
  }
}
```

### 2.3 Supporting Libraries

| Purpose | Library | Notes |
|---------|---------|-------|
| YAML parsing | `yaml` | Parse frontmatter; serialize on save |
| Markdown parsing | `mdast-util-from-markdown` | AST for outliner block operations |
| Date handling | `date-fns` | Lightweight, tree-shakeable date utilities |
| Slug generation | `slugify` | Consistent kebab-case conversion |
| State management | SolidJS stores | Built-in reactive stores; no external state library needed |
| Icons | `lucide-solid` | Consistent icon set, tree-shakeable |
| Testing | `vitest` + `@solidjs/testing-library` | Vite-native testing with Solid support |

### 2.4 Development Tools

| Tool | Purpose |
|------|---------|
| ESLint | Code quality with `@typescript-eslint` and `eslint-plugin-solid` |
| Prettier | Consistent formatting |
| Husky + lint-staged | Pre-commit hooks |
| Playwright | E2E testing |
| Tauri CLI | Development server, packaging, code signing |

---

## 3. Backend/Runtime Architecture

### 3.1 Tauri Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Tauri Process                           │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                     Rust Backend                          │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │  │
│  │  │ File System │  │ File Watch  │  │ IPC Commands    │   │  │
│  │  │ Operations  │  │ (notify-rs) │  │ (tauri::command)│   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘   │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │ IPC                               │
│  ┌───────────────────────────┴───────────────────────────────┐  │
│  │                      Webview (WKWebView / WebView2)       │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │                  SolidJS Application                 │  │  │
│  │  │  ┌──────────┐  ┌──────────┐  ┌──────────┐          │  │  │
│  │  │  │ UI Layer │  │ Services │  │  Stores  │          │  │  │
│  │  │  └──────────┘  └──────────┘  └──────────┘          │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 IPC Command Interface

Tauri commands provide typed communication between frontend and Rust backend.

```rust
// src-tauri/src/commands.rs

#[tauri::command]
async fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn write_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn list_directory(path: String) -> Result<Vec<FileEntry>, String> {
    // Returns file names with metadata
}

#[tauri::command]
async fn watch_directory(path: String) -> Result<(), String> {
    // Sets up file watcher, emits events to frontend
}
```

### 3.3 File Watching Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                    File Watch Flow                           │
└─────────────────────────────────────────────────────────────┘

  Rust Backend (notify-rs)          Frontend (SolidJS)
  ─────────────────────────         ──────────────────────────
          │                                    │
          │  watch ~/nslnotes/**/*.md          │
          ├────────────────────────────────────▶ subscribe to events
          │                                    │
     [file modified]                           │
          │                                    │
          │  emit("file-changed", {path, type})│
          ├────────────────────────────────────▶ IndexService.invalidate(path)
          │                                    │
          │                                    ├──▶ re-parse file
          │                                    ├──▶ update index store
          │                                    └──▶ trigger UI reactivity
```

### 3.4 Web Fallback Mode

For development without Tauri, the application can run in browser mode with a local dev server providing file access via HTTP API.

```typescript
// src/lib/runtime.ts

export const runtime = {
  isNative: () => '__TAURI__' in window,

  readFile: async (path: string): Promise<string> => {
    if (runtime.isNative()) {
      return invoke<string>('read_file', { path });
    }
    const res = await fetch(`/api/files?path=${encodeURIComponent(path)}`);
    return res.text();
  },

  writeFile: async (path: string, content: string): Promise<void> => {
    if (runtime.isNative()) {
      return invoke('write_file', { path, content });
    }
    await fetch('/api/files', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content }),
    });
  },
};
```

---

## 4. System Architecture

### 4.1 Component Hierarchy

```
App
├── Layout (three-column grid)
│   ├── LeftSidebar
│   │   ├── TodayButton
│   │   ├── TopicsList
│   │   │   └── TopicItem (repeated)
│   │   └── DocsList
│   │       ├── CreateDocButton
│   │       └── DocItem (repeated)
│   │
│   ├── CenterPanel
│   │   ├── JournalView
│   │   │   ├── DateHeader (sticky, repeated per day)
│   │   │   ├── DailyNoteEditor
│   │   │   └── NamedNoteCard (repeated)
│   │   ├── TaskDetailView
│   │   ├── DocView
│   │   └── TopicView
│   │
│   └── RightPanel
│       ├── TaskListHeader
│       │   └── CreateTaskButton
│       └── TaskGroups
│           ├── RelatedGroup (conditional)
│           ├── OverdueGroup
│           ├── ThisWeekGroup
│           └── LaterGroup
│
├── Editor (shared)
│   ├── OutlinerEditor
│   │   ├── BlockTree
│   │   ├── BlockNode (recursive)
│   │   └── CommandMenu
│   └── ProseEditor
│       └── TipTapEditor
│
└── Modals
    ├── CreateTaskModal
    ├── CreateNoteModal
    ├── CreateDocModal
    └── PromotionModal
```

### 4.2 Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        Data Flow Architecture                    │
└─────────────────────────────────────────────────────────────────┘

  ┌─────────────┐        ┌─────────────┐        ┌─────────────┐
  │   File      │        │   Index     │        │   Context   │
  │   System    │───────▶│   Store     │───────▶│   Store     │
  │   (Source)  │        │   (Cache)   │        │   (View)    │
  └─────────────┘        └─────────────┘        └─────────────┘
         │                      │                      │
         │                      │                      │
         ▼                      ▼                      ▼
  ┌─────────────┐        ┌─────────────┐        ┌─────────────┐
  │ FileService │        │IndexService │        │ Navigation  │
  │             │        │             │        │ Service     │
  └─────────────┘        └─────────────┘        └─────────────┘
         │                      │                      │
         │                      │                      │
         └──────────────────────┴──────────────────────┘
                                │
                                ▼
                        ┌─────────────┐
                        │    UI       │
                        │ Components  │
                        └─────────────┘
```

### 4.3 Store Architecture

SolidJS stores provide reactive state management without external libraries.

```typescript
// src/stores/index.ts

import { createStore } from 'solid-js/store';

// Index store: cached file metadata and relationships
export const [indexStore, setIndexStore] = createStore<IndexState>({
  notes: new Map(),
  tasks: new Map(),
  docs: new Map(),
  topics: new Map(),
  topicsYaml: new Map(),
  lastIndexed: null,
});

// Context store: current view state and relevance
export const [contextStore, setContextStore] = createStore<ContextState>({
  activeView: 'journal',
  activeEntity: null,
  relevanceWeights: new Map(),
  isHomeState: true,
});

// Editor store: current editing state
export const [editorStore, setEditorStore] = createStore<EditorState>({
  activeFile: null,
  mode: 'outliner',
  isDirty: false,
  pendingSave: null,
});
```

### 4.4 Service Layer

Services encapsulate all business logic and file operations. Components never access files directly.

```
┌───────────────────────────────────────────────────────────────┐
│                       Service Layer                           │
├───────────────────┬───────────────────┬───────────────────────┤
│   FileService     │   IndexService    │   NavigationService   │
│                   │                   │                       │
│ • read/write      │ • build index     │ • navigate to entity  │
│ • watch changes   │ • query entities  │ • manage context      │
│ • validate paths  │ • compute topics  │ • handle wikilinks    │
│ • manage dirs     │ • track activity  │ • reset home state    │
├───────────────────┼───────────────────┼───────────────────────┤
│   EntityService   │   EditorService   │   TopicService        │
│                   │                   │                       │
│ • create note     │ • mode switching  │ • active/dormant calc │
│ • create task     │ • save with delay │ • autocomplete        │
│ • create doc      │ • format content  │ • topic views         │
│ • promote content │ • handle todos    │ • topics.yaml merge   │
└───────────────────┴───────────────────┴───────────────────────┘
```

---

## 5. Data Models

### 5.1 Core Entity Types

```typescript
// src/types/entities.ts

/**
 * Base fields shared by all file entities
 */
interface BaseEntity {
  /** Absolute path to file */
  path: string;
  /** File slug (filename without extension) */
  slug: string;
  /** Topics referenced in frontmatter */
  topics: TopicRef[];
  /** Raw frontmatter as parsed */
  frontmatter: Record<string, unknown>;
  /** Body content (markdown) */
  content: string;
  /** File modification timestamp */
  modifiedAt: Date;
}

/**
 * Note entity (daily or named)
 */
interface Note extends BaseEntity {
  type: 'note';
  /** ISO date string YYYY-MM-DD */
  date: string;
  /** Human-readable title (null for daily notes) */
  title: string | null;
  /** Whether this is a daily note (no title/slug suffix) */
  isDaily: boolean;
}

/**
 * Task entity
 */
interface Task extends BaseEntity {
  type: 'task';
  /** Current status */
  status: 'open' | 'done' | 'cancelled';
  /** ISO date when task was created */
  created: string;
  /** Optional ISO due date */
  due: string | null;
  /** Title extracted from first line or slug */
  title: string;
}

/**
 * Doc entity
 */
interface Doc extends BaseEntity {
  type: 'doc';
  /** Human-readable title (required) */
  title: string;
  /** ISO date when doc was created */
  created: string;
}

/**
 * Union type for all entities
 */
type Entity = Note | Task | Doc;
```

### 5.2 Topic Types

```typescript
// src/types/topics.ts

/**
 * Topic reference as it appears in content
 * Includes the prefix (# or @)
 */
type TopicRef = `#${string}` | `@${string}`;

/**
 * Topic ID without prefix
 */
type TopicId = string;

/**
 * Computed topic state
 */
interface Topic {
  /** Full reference including prefix */
  ref: TopicRef;
  /** ID without prefix */
  id: TopicId;
  /** Whether this is a person (@) or subject (#) */
  kind: 'topic' | 'person';
  /** Display label from topics.yaml or raw ref */
  label: string;
  /** Optional note from topics.yaml */
  note: string | null;
  /** Whether topic meets active criteria */
  isActive: boolean;
  /** Files referencing this topic */
  references: EntityReference[];
  /** Open tasks with this topic */
  openTaskCount: number;
  /** Most recent reference date */
  lastUsed: Date | null;
}

/**
 * Entry from topics.yaml
 */
interface TopicDecoration {
  id: TopicRef;
  label?: string;
  note?: string;
  archived?: boolean;
}

/**
 * Reference to an entity from a topic
 */
interface EntityReference {
  type: 'note' | 'task' | 'doc';
  path: string;
  slug: string;
  title: string | null;
  date: string | null;
}
```

### 5.3 Inline Syntax Types

```typescript
// src/types/inline.ts

/**
 * TODO item states (LogSeq-style)
 */
type TodoState = 'TODO' | 'DOING' | 'DONE';

/**
 * Parsed TODO item
 */
interface TodoItem {
  /** Full line content */
  line: string;
  /** Line number (0-indexed) */
  lineNumber: number;
  /** Current state */
  state: TodoState;
  /** Content after the state prefix */
  text: string;
  /** Indentation level */
  indent: number;
}

/**
 * Wikilink reference
 */
interface WikiLink {
  /** Full match including brackets */
  raw: string;
  /** Entity type */
  type: 'task' | 'doc' | 'note';
  /** Target slug or date */
  target: string;
  /** Whether target exists */
  isValid: boolean;
}
```

### 5.4 Store State Types

```typescript
// src/types/stores.ts

/**
 * Index store state
 */
interface IndexState {
  /** All notes indexed by path */
  notes: Map<string, Note>;
  /** All tasks indexed by path */
  tasks: Map<string, Task>;
  /** All docs indexed by path */
  docs: Map<string, Doc>;
  /** Computed topics with references */
  topics: Map<TopicRef, Topic>;
  /** Parsed topics.yaml entries */
  topicsYaml: Map<TopicRef, TopicDecoration>;
  /** Last full index timestamp */
  lastIndexed: Date | null;
}

/**
 * View types for center panel
 */
type ViewType = 'journal' | 'task' | 'doc' | 'topic';

/**
 * Context store state
 */
interface ContextState {
  /** Current view in center panel */
  activeView: ViewType;
  /** Currently focused entity (if any) */
  activeEntity: Entity | null;
  /** Active topic/person (for topic views) */
  activeTopic: TopicRef | null;
  /** Computed relevance weights for UI ordering */
  relevanceWeights: Map<string, number>;
  /** Whether in home state (no weighting) */
  isHomeState: boolean;
  /** Journal scroll anchor date */
  journalAnchorDate: string | null;
}

/**
 * Editor mode
 */
type EditorMode = 'outliner' | 'prose';

/**
 * Editor store state
 */
interface EditorState {
  /** Currently open file path */
  activeFile: string | null;
  /** Current editor mode */
  mode: EditorMode;
  /** Whether content has unsaved changes */
  isDirty: boolean;
  /** Pending debounced save timeout */
  pendingSave: number | null;
}
```

### 5.5 Task Grouping Types

```typescript
// src/types/task-groups.ts

/**
 * Task group names as displayed in right panel
 */
type TaskGroup = 'RELATED' | 'OVERDUE' | 'THIS_WEEK' | 'LATER';

/**
 * Grouped tasks for right panel display
 */
interface GroupedTasks {
  related: Task[];      // Shown only when not in home state
  overdue: Task[];
  thisWeek: Task[];
  later: Task[];
}

/**
 * Task display item with computed properties
 */
interface TaskDisplay extends Task {
  /** Which group this task belongs to */
  group: TaskGroup;
  /** Relevance score for sorting within RELATED */
  relevanceScore: number;
  /** Days until/since due date */
  daysRelative: number | null;
  /** Formatted due date display */
  dueDisplay: string | null;
  /** Whether this task is currently open in center panel */
  isHighlighted: boolean;
}
```

---

## 6. API Contracts

### 6.1 FileService

```typescript
// src/services/FileService.ts

interface FileService {
  /**
   * Read file content from disk
   * @throws if file doesn't exist or is inaccessible
   */
  read(path: string): Promise<string>;

  /**
   * Write content to file, creating parent directories if needed
   */
  write(path: string, content: string): Promise<void>;

  /**
   * Delete a file
   * @throws if file doesn't exist
   */
  delete(path: string): Promise<void>;

  /**
   * Check if file exists
   */
  exists(path: string): Promise<boolean>;

  /**
   * List files in directory matching pattern
   */
  list(dir: string, pattern?: string): Promise<FileEntry[]>;

  /**
   * Get file metadata
   */
  stat(path: string): Promise<FileStat>;

  /**
   * Watch directory for changes
   * Returns unsubscribe function
   */
  watch(
    path: string,
    callback: (event: FileChangeEvent) => void
  ): () => void;

  /**
   * Verify directory is accessible and writable
   */
  verifyDirectory(path: string): Promise<DirectoryStatus>;

  /**
   * Ensure directory exists, creating if necessary
   */
  ensureDirectory(path: string): Promise<void>;
}

interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

interface FileStat {
  size: number;
  modifiedAt: Date;
  createdAt: Date;
}

interface FileChangeEvent {
  type: 'create' | 'modify' | 'delete' | 'rename';
  path: string;
  oldPath?: string; // For rename events
}

interface DirectoryStatus {
  exists: boolean;
  readable: boolean;
  writable: boolean;
}
```

### 6.2 IndexService

```typescript
// src/services/IndexService.ts

interface IndexService {
  /**
   * Build full index from file system
   * Called on startup and after external changes
   */
  buildIndex(rootPath: string): Promise<void>;

  /**
   * Invalidate and re-index a single file
   */
  invalidate(path: string): Promise<void>;

  /**
   * Get all notes, optionally filtered
   */
  getNotes(filter?: NoteFilter): Note[];

  /**
   * Get notes for a specific date
   */
  getNotesForDate(date: string): Note[];

  /**
   * Get all open tasks
   */
  getOpenTasks(): Task[];

  /**
   * Get tasks grouped for right panel display
   */
  getGroupedTasks(context: ContextState): GroupedTasks;

  /**
   * Get all docs sorted alphabetically
   */
  getDocs(): Doc[];

  /**
   * Get active topics sorted by recency
   */
  getActiveTopics(): Topic[];

  /**
   * Get all items referencing a topic
   */
  getTopicReferences(ref: TopicRef): EntityReference[];

  /**
   * Search across all entities
   */
  search(query: string, options?: SearchOptions): SearchResult[];

  /**
   * Resolve a wikilink to its target entity
   */
  resolveWikilink(link: WikiLink): Entity | null;

  /**
   * Compute relevance weights for current context
   */
  computeRelevance(entity: Entity): Map<string, number>;
}

interface NoteFilter {
  date?: string;
  topics?: TopicRef[];
  isDaily?: boolean;
}

interface SearchOptions {
  types?: ('note' | 'task' | 'doc')[];
  limit?: number;
}

interface SearchResult {
  entity: Entity;
  matchType: 'title' | 'content' | 'topic';
  snippet?: string;
}
```

### 6.3 EntityService

```typescript
// src/services/EntityService.ts

interface EntityService {
  // === Note Operations ===

  /**
   * Create a daily note for given date
   * Returns existing note if already present
   */
  createDailyNote(date: string): Promise<Note>;

  /**
   * Create a named note
   */
  createNamedNote(params: CreateNoteParams): Promise<Note>;

  // === Task Operations ===

  /**
   * Create a task directly
   */
  createTask(params: CreateTaskParams): Promise<Task>;

  /**
   * Promote a TODO line to a task
   */
  promoteToTask(params: PromoteTaskParams): Promise<Task>;

  /**
   * Update task status
   */
  updateTaskStatus(
    path: string,
    status: 'open' | 'done' | 'cancelled'
  ): Promise<Task>;

  // === Doc Operations ===

  /**
   * Create a new doc
   */
  createDoc(params: CreateDocParams): Promise<Doc>;

  /**
   * Promote a note section to a doc
   */
  promoteToDoc(params: PromoteDocParams): Promise<Doc>;

  // === Shared Operations ===

  /**
   * Update entity topics in frontmatter
   */
  updateTopics(path: string, topics: TopicRef[]): Promise<Entity>;

  /**
   * Generate unique slug from title
   */
  generateSlug(title: string, directory: string): Promise<string>;
}

interface CreateNoteParams {
  date: string;
  title: string;
  topics?: TopicRef[];
}

interface CreateTaskParams {
  title: string;
  due?: string;
  topics?: TopicRef[];
  content?: string;
}

interface PromoteTaskParams {
  sourcePath: string;
  lineNumber: number;
  todoText: string;
}

interface CreateDocParams {
  title: string;
  topics?: TopicRef[];
  content?: string;
}

interface PromoteDocParams {
  sourcePath: string;
  startLine: number;
  endLine: number;
  title: string;
  topics?: TopicRef[];
}
```

### 6.4 EditorCommands

```typescript
// src/services/EditorCommands.ts

interface EditorCommands {
  // === Mode Management ===

  /**
   * Get default editor mode for entity type
   */
  getDefaultMode(type: 'note' | 'task' | 'doc'): EditorMode;

  /**
   * Toggle between outliner and prose modes
   */
  toggleMode(): void;

  // === Content Operations ===

  /**
   * Save current content (debounced)
   */
  save(): Promise<void>;

  /**
   * Force immediate save
   */
  saveImmediate(): Promise<void>;

  // === Outliner Operations ===

  /**
   * Indent current block and children
   */
  indent(): void;

  /**
   * Outdent current block and children
   */
  outdent(): void;

  /**
   * Move block up within siblings
   */
  moveUp(): void;

  /**
   * Move block down within siblings
   */
  moveDown(): void;

  /**
   * Create new block at same level
   */
  newBlock(): void;

  /**
   * Insert line break within block
   */
  lineBreak(): void;

  // === TODO Operations ===

  /**
   * Cycle TODO state: TODO -> DOING -> DONE -> TODO
   */
  cycleTodoState(lineNumber: number): void;

  /**
   * Get all TODO items in current document
   */
  getTodos(): TodoItem[];

  // === Command Menu ===

  /**
   * Open command menu at cursor
   */
  openCommandMenu(): void;

  /**
   * Execute command menu action
   */
  executeCommand(command: CommandMenuAction): Promise<void>;
}

type CommandMenuAction =
  | { type: 'promote-to-task' }
  | { type: 'promote-to-doc' }
  | { type: 'insert-wikilink'; target: string }
  | { type: 'insert-topic'; ref: TopicRef }
  | { type: 'format'; style: 'bold' | 'italic' | 'code' };
```

### 6.5 NavigationService

```typescript
// src/services/NavigationService.ts

interface NavigationService {
  /**
   * Navigate to home state (Today button)
   */
  goHome(): void;

  /**
   * Navigate to a specific entity
   */
  navigateTo(entity: Entity): void;

  /**
   * Navigate to topic/person view
   */
  navigateToTopic(ref: TopicRef): void;

  /**
   * Navigate to a date in the journal
   */
  navigateToDate(date: string): void;

  /**
   * Handle wikilink click
   */
  handleWikilink(link: WikiLink): void;

  /**
   * Get current context state
   */
  getContext(): ContextState;

  /**
   * Update relevance weights for current context
   */
  updateRelevance(): void;

  /**
   * Clear all context weighting (home state)
   */
  clearRelevance(): void;

  /**
   * Handle journal scroll - update anchor date
   */
  handleJournalScroll(visibleDate: string): void;

  /**
   * Focus on named note (changes relevance context)
   */
  focusNamedNote(note: Note): void;
}
```

### 6.6 TopicService

```typescript
// src/services/TopicService.ts

interface TopicService {
  /**
   * Parse topics.yaml file
   */
  loadTopicsYaml(path: string): Promise<Map<TopicRef, TopicDecoration>>;

  /**
   * Get display label for topic
   */
  getLabel(ref: TopicRef): string;

  /**
   * Get autocomplete suggestions for # prefix
   */
  getTopicSuggestions(prefix: string): Topic[];

  /**
   * Get autocomplete suggestions for @ prefix
   */
  getPersonSuggestions(prefix: string): Topic[];

  /**
   * Check if topic is active (90 day rule + open tasks)
   */
  isActive(ref: TopicRef): boolean;

  /**
   * Get all entities referencing a topic
   */
  getReferences(ref: TopicRef): {
    notes: Note[];
    tasks: Task[];
    docs: Doc[];
  };

  /**
   * Parse topic references from content
   */
  parseTopics(content: string): TopicRef[];

  /**
   * Validate topic ref format
   */
  isValidRef(ref: string): ref is TopicRef;
}
```

---

## 7. Key Tradeoffs

### 7.1 SolidJS vs React

| Consideration | SolidJS | React |
|---------------|---------|-------|
| **Performance** | No virtual DOM; signals update only affected DOM | Virtual DOM diff on every render |
| **Bundle size** | ~7KB | ~40KB (React + ReactDOM) |
| **Learning curve** | Similar to React but different mental model | Industry standard, more resources |
| **Ecosystem** | Growing, smaller | Massive ecosystem |
| **Decision** | **SolidJS chosen** — performance critical for LogSeq-replacement goal |

**Rationale**: The primary goal is to avoid LogSeq's sluggishness. SolidJS's fine-grained reactivity means typing in the outliner won't trigger unnecessary re-renders of the task list or sidebar.

### 7.2 TipTap vs Other Editors

| Editor | Pros | Cons |
|--------|------|------|
| **TipTap** | ProseMirror foundation, extensible, good TypeScript support | Learning curve for extensions |
| CodeMirror | Excellent for code, proven | Less suited for prose/outliner hybrid |
| Lexical | Facebook-backed, modular | Younger, React-focused |
| Slate | Flexible, React-native | Performance concerns with large docs |
| **Decision** | **TipTap chosen** — best balance of extensibility and prose/outliner support |

**Rationale**: TipTap provides both prose and outliner capabilities through schema customization. The ProseMirror foundation is battle-tested and transaction-based updates align with our performance goals.

### 7.3 Tauri vs Electron

| Consideration | Tauri | Electron |
|---------------|-------|----------|
| **Binary size** | ~3MB | ~150MB |
| **Memory usage** | System webview | Bundled Chromium |
| **File access** | Native Rust | Node.js |
| **Platform parity** | WebView differences possible | Consistent Chromium |
| **Decision** | **Tauri chosen** — resource efficiency aligns with local-first philosophy |

**Rationale**: A knowledge tool that runs all day shouldn't consume significant resources. Tauri's Rust backend also provides faster file operations for index building.

### 7.4 No Database vs SQLite

| Consideration | Files Only | SQLite |
|---------------|------------|--------|
| **Data portability** | Perfect — files are the data | Requires export |
| **Query performance** | Requires in-memory index | Native queries |
| **Conflict resolution** | External tools (git, etc.) work | Merge complexity |
| **Complexity** | Index rebuild logic needed | ORM/query layer needed |
| **Decision** | **Files only** — PRD mandates plain text as source of truth |

**Rationale**: The core value proposition is that files are readable without the app. SQLite would create a dependency that undermines this.

### 7.5 YAML Frontmatter vs Other Formats

| Format | Pros | Cons |
|--------|------|------|
| **YAML** | Human-readable, widely supported | Indentation sensitive |
| TOML | Less ambiguous syntax | Less common in markdown tools |
| JSON | Universal parsing | Verbose, less readable |
| **Decision** | **YAML** — industry standard for markdown frontmatter (Obsidian, Jekyll, Hugo) |

---

## 8. Implementation Phases

### Phase 1: Foundation

**Goal**: Basic file operations and data model

- Set up Tauri project structure
- Implement `FileService` with read/write/watch
- Define TypeScript interfaces for all entities
- Implement frontmatter parsing (gray-matter or custom)
- Build basic `IndexService` for file enumeration
- Unit tests for parsing and slug generation

**Exit Criteria**: Can read/write/watch markdown files with valid frontmatter parsing

### Phase 2: Index & Store

**Goal**: Reactive state management with file-backed index

- Implement SolidJS stores for index, context, editor state
- Build full `IndexService` with topic extraction
- Parse inline syntax (todos, wikilinks, topic refs)
- Implement relevance computation
- Add topics.yaml support
- Cache index to disk, load cached first on startup

**Exit Criteria**: Index builds from files, stores react to file changes

### Phase 3: Core UI Shell

**Goal**: Three-column layout with navigation

- Implement `Layout` component with three-column grid
- Build `LeftSidebar` with Today button, topics list, docs list
- Build `RightPanel` with task groups (RELATED, OVERDUE, THIS_WEEK, LATER)
- Implement `NavigationService` and context switching
- Add basic `JournalView` placeholder
- Wire up click handlers for navigation

**Exit Criteria**: Can navigate between views, sidebar reorders based on context

### Phase 4: Journal View

**Goal**: Scrollable journal with date headers and inline editing

- Implement infinite scroll with date anchoring
- Build `DateHeader` with sticky behavior
- Render daily notes inline with basic textarea
- Add named note cards within dates
- Implement lazy daily note creation (first keystroke)
- Add `+ New Note` button with creation modal

**Exit Criteria**: Can view and create notes in journal, scroll triggers context changes

### Phase 5: Editor Integration

**Goal**: Full TipTap editor with outliner and prose modes

- Integrate TipTap with custom schema
- Implement `OutlinerEditor` with block operations (indent, outdent, move)
- Implement `ProseEditor` with standard formatting
- Build mode toggle with content preservation
- Add TODO state cycling (click to toggle)
- Implement command menu (`/` trigger)
- Add debounced auto-save (300ms)

**Exit Criteria**: Can edit notes/tasks/docs in both modes with full keyboard support

### Phase 6: Entity Workflows

**Goal**: Complete CRUD for all entity types

- Implement `EntityService` for create/update operations
- Build promote-to-task flow with wikilink replacement
- Build promote-to-doc flow with topic selection
- Implement direct task creation modal
- Implement direct doc creation modal
- Add task status updates (done/cancelled)
- Build topic/person autocomplete

**Exit Criteria**: All promotion and creation flows work end-to-end

### Phase 7: Polish & Performance

**Goal**: Production-ready quality

- Implement virtual scrolling for large journals
- Add Web Workers for off-thread YAML/markdown parsing
- Build error handling and user feedback
- Add keyboard shortcuts reference
- Implement broken wikilink styling
- Add loading states and optimistic updates
- Performance profiling and optimization
- E2E test suite with Playwright

**Exit Criteria**: App is responsive with 1000+ files, all edge cases handled

---

## 9. Folder Structure

```
nslnotes/
├── src/
│   ├── index.tsx                 # App entry point
│   ├── App.tsx                   # Root component with Layout
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Layout.tsx        # Three-column grid
│   │   │   ├── LeftSidebar.tsx
│   │   │   ├── CenterPanel.tsx
│   │   │   └── RightPanel.tsx
│   │   │
│   │   ├── sidebar/
│   │   │   ├── TodayButton.tsx
│   │   │   ├── TopicsList.tsx
│   │   │   ├── TopicItem.tsx
│   │   │   ├── DocsList.tsx
│   │   │   └── DocItem.tsx
│   │   │
│   │   ├── journal/
│   │   │   ├── JournalView.tsx
│   │   │   ├── DateHeader.tsx
│   │   │   ├── DailyNote.tsx
│   │   │   └── NamedNoteCard.tsx
│   │   │
│   │   ├── tasks/
│   │   │   ├── TaskList.tsx
│   │   │   ├── TaskGroup.tsx
│   │   │   ├── TaskItem.tsx
│   │   │   └── TaskDetail.tsx
│   │   │
│   │   ├── docs/
│   │   │   └── DocView.tsx
│   │   │
│   │   ├── topics/
│   │   │   └── TopicView.tsx
│   │   │
│   │   ├── editor/
│   │   │   ├── Editor.tsx        # Mode-switching wrapper
│   │   │   ├── OutlinerEditor.tsx
│   │   │   ├── ProseEditor.tsx
│   │   │   ├── BlockNode.tsx
│   │   │   ├── CommandMenu.tsx
│   │   │   └── TodoCheckbox.tsx
│   │   │
│   │   └── modals/
│   │       ├── CreateTaskModal.tsx
│   │       ├── CreateNoteModal.tsx
│   │       ├── CreateDocModal.tsx
│   │       └── PromotionModal.tsx
│   │
│   ├── services/
│   │   ├── FileService.ts
│   │   ├── IndexService.ts
│   │   ├── EntityService.ts
│   │   ├── EditorCommands.ts
│   │   ├── NavigationService.ts
│   │   └── TopicService.ts
│   │
│   ├── stores/
│   │   ├── index.ts              # Store exports
│   │   ├── indexStore.ts
│   │   ├── contextStore.ts
│   │   └── editorStore.ts
│   │
│   ├── types/
│   │   ├── entities.ts
│   │   ├── topics.ts
│   │   ├── inline.ts
│   │   ├── stores.ts
│   │   └── task-groups.ts
│   │
│   ├── lib/
│   │   ├── runtime.ts            # Tauri/web abstraction
│   │   ├── frontmatter.ts        # YAML parsing
│   │   ├── markdown.ts           # Markdown utilities
│   │   ├── slug.ts               # Slug generation
│   │   ├── dates.ts              # Date utilities
│   │   └── relevance.ts          # Relevance computation
│   │
│   ├── hooks/
│   │   ├── useEntity.ts
│   │   ├── useEditor.ts
│   │   ├── useNavigation.ts
│   │   └── useAutocomplete.ts
│   │
│   └── styles/
│       ├── index.css             # Tailwind imports
│       ├── editor.css            # TipTap overrides
│       └── themes.css            # Color tokens (future)
│
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       ├── main.rs
│       ├── commands.rs           # IPC commands
│       └── watcher.rs            # File system watcher
│
├── tests/
│   ├── unit/
│   │   ├── frontmatter.test.ts
│   │   ├── slug.test.ts
│   │   ├── relevance.test.ts
│   │   └── index.test.ts
│   │
│   └── e2e/
│       ├── journal.spec.ts
│       ├── tasks.spec.ts
│       ├── navigation.spec.ts
│       └── editor.spec.ts
│
├── docs/
│   ├── PRD.md
│   ├── REQUIREMENTS.md
│   └── DESIGN.md                 # This document
│
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
├── eslint.config.js
└── CLAUDE.md
```

---

## Appendix A: Performance Techniques Summary

| Technique | Implementation | Benefit |
|-----------|----------------|---------|
| No virtual DOM | SolidJS signals | Keystrokes don't re-render task list |
| Native runtime | Tauri webview | 3MB binary, system memory only |
| Transaction-based editor | TipTap/ProseMirror | No full doc re-render on edit |
| Index caching | Serialize to disk | Fast cold starts |
| Virtual scrolling | Window-based rendering | Handle 1000+ dates |
| Debounced saves | 300ms delay | Reduce disk writes |
| Off-thread parsing | Web Workers | Main thread stays responsive |
| Lazy daily notes | Create on first keystroke | No empty file accumulation |

---

## Appendix B: API Coverage Matrix

This matrix maps API contracts to REQUIREMENTS acceptance criteria:

| Requirement | API Method |
|-------------|------------|
| FR-FS-001 (root directory) | `FileService.verifyDirectory`, `ensureDirectory` |
| FR-FS-020-023 (file naming) | `EntityService.generateSlug` |
| FR-FS-030-031 (slug generation) | `EntityService.generateSlug` |
| FR-ENT-001-004 (notes) | `EntityService.createDailyNote`, `createNamedNote` |
| FR-ENT-010-014 (tasks) | `EntityService.createTask`, `updateTaskStatus` |
| FR-ENT-020-021 (docs) | `EntityService.createDoc` |
| FR-ENT-030-033 (topics) | `TopicService.*`, `IndexService.getActiveTopics` |
| FR-ENT-040-043 (todos) | `EditorCommands.cycleTodoState`, `getTodos` |
| FR-ED-001-005 (editor modes) | `EditorCommands.toggleMode`, `getDefaultMode` |
| FR-ED-010-017 (outliner) | `EditorCommands.indent`, `outdent`, `moveUp`, `moveDown` |
| FR-UI-030-034 (task groups) | `IndexService.getGroupedTasks` |
| FR-CTX-001-003 (relevance) | `IndexService.computeRelevance`, `NavigationService.updateRelevance` |
| FR-NAV-001-003 (Today) | `NavigationService.goHome` |
| FR-NAV-010-014 (topics) | `NavigationService.navigateToTopic` |
| FR-NAV-040-041 (wikilinks) | `NavigationService.handleWikilink`, `IndexService.resolveWikilink` |
| FR-INT-001-004 (promote task) | `EntityService.promoteToTask` |
| FR-INT-020-024 (promote doc) | `EntityService.promoteToDoc` |
| FR-INT-050-053 (autocomplete) | `TopicService.getTopicSuggestions`, `getPersonSuggestions` |
