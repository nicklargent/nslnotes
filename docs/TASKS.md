# NslNotes Implementation Tasks

Tasks are ordered by dependency. Each references requirements (FR-*, NFR-*) and includes verification criteria.

---

## Phase 1: Foundation

### T1.1 Initialize Tauri + Vite + SolidJS project ✅
**Satisfies**: Design §2, §9 (folder structure)
**Dependencies**: None
**Acceptance**:
- [x] `npm create tauri-app` with SolidJS template runs successfully
- [x] `npm run tauri dev` starts dev server with hot reload
- [x] Project structure matches DESIGN.md §9

**Verify**: `npm run tauri dev` opens window, edits to App.tsx hot-reload

---

### T1.2 Configure TypeScript strict mode ✅
**Satisfies**: Design §2.2
**Dependencies**: T1.1
**Acceptance**:
- [x] `tsconfig.json` matches Design §2.2 exactly (strict, noUncheckedIndexedAccess, etc.)
- [x] Type errors caught at compile time

**Verify**: `npm run typecheck` passes with no errors

---

### T1.3 Set up Tailwind CSS ✅
**Satisfies**: Design §2.1
**Dependencies**: T1.1
**Acceptance**:
- [x] Tailwind configured with Vite
- [x] Utility classes work in components
- [x] Unused styles purged in production build

**Verify**: Add `class="text-blue-500"` to App.tsx, confirm styling

---

### T1.4 Set up ESLint + Prettier + Husky ✅
**Satisfies**: Design §2.4
**Dependencies**: T1.1
**Acceptance**:
- [x] ESLint with `@typescript-eslint` and `eslint-plugin-solid`
- [x] Prettier configured for consistent formatting
- [x] Pre-commit hook runs lint-staged

**Verify**: Intentional lint error blocks commit

---

### T1.5 Define core TypeScript interfaces ✅
**Satisfies**: Design §5.1–5.5
**Dependencies**: T1.2
**Acceptance**:
- [x] `src/types/entities.ts` with Note, Task, Doc, Entity
- [x] `src/types/topics.ts` with TopicRef, Topic, TopicDecoration
- [x] `src/types/inline.ts` with TodoState, TodoItem, WikiLink
- [x] `src/types/stores.ts` with IndexState, ContextState, EditorState
- [x] `src/types/task-groups.ts` with TaskGroup, GroupedTasks

**Verify**: Import types in a test file, TypeScript compiles

---

### T1.6 Implement runtime abstraction layer ✅
**Satisfies**: Design §3.4
**Dependencies**: T1.1, T1.5
**Acceptance**:
- [x] `src/lib/runtime.ts` with `isNative()` detection
- [x] Async `readFile`, `writeFile` methods
- [x] Uses Tauri `invoke` when native, HTTP fetch when web
- [x] Web fallback uses polling for file watching

**Verify**: Read/write file works in both `npm run dev` (web) and `npm run tauri dev` (native)

---

### T1.7 Implement Tauri file system commands ✅
**Satisfies**: Design §3.2, FR-FS-001, FR-FS-002
**Dependencies**: T1.1
**Acceptance**:
- [x] `src-tauri/src/commands.rs` with `read_file`, `write_file`, `list_directory`, `delete_file`
- [x] `verify_directory` command checks read/write permissions
- [x] `ensure_directory` creates subdirectories if missing
- [x] Commands registered in `lib.rs` (Tauri 2 architecture)

**Verify**: Call commands from frontend via invoke, confirm file operations work

---

### T1.8 Implement Tauri file watcher ✅
**Satisfies**: Design §3.3
**Dependencies**: T1.7
**Acceptance**:
- [x] `src-tauri/src/watcher.rs` uses `notify` crate
- [x] Watches configured root directory recursively
- [x] Emits `file-changed` event with path and type (create/modify/delete)
- [x] Debounces rapid changes (100ms)

**Verify**: Modify file externally, event received in frontend

---

### T1.9 Implement slug generation utility ✅
**Satisfies**: FR-FS-030, FR-FS-031
**Dependencies**: T1.5
**Acceptance**:
- [x] `src/lib/slug.ts` with `generateSlug(title: string): string`
- [x] Converts to lowercase, replaces spaces with hyphens
- [x] Removes special characters, collapses multiple hyphens
- [x] `generateUniqueSlug(title, directory)` appends `-2`, `-3` for collisions

**Verify**: Unit tests for edge cases: "Hello World!" → "hello-world", collision handling

---

### T1.10 Implement frontmatter parsing ✅
**Satisfies**: FR-FS-040–061
**Dependencies**: T1.5
**Acceptance**:
- [x] `src/lib/frontmatter.ts` with `parse(content: string): { frontmatter, body }`
- [x] `serialize(frontmatter, body): string` for writing
- [x] Validates required fields per entity type
- [x] Returns typed frontmatter matching entity schemas

**Verify**: Unit tests for valid/invalid frontmatter, round-trip parse→serialize

---

### T1.11 Implement date utilities ✅
**Satisfies**: FR-FS-020–023
**Dependencies**: None
**Acceptance**:
- [x] `src/lib/dates.ts` with ISO date functions
- [x] `toISODate(date: Date): string` returns YYYY-MM-DD
- [x] `parseISODate(str: string): Date | null` validates format
- [x] `isWithinDays(date, days)` for "THIS WEEK" logic
- [x] `getRelativeDays(date)` for overdue calculation

**Verify**: Unit tests including edge cases (year boundaries, invalid dates)

---

### T1.12 Implement FileService ✅
**Satisfies**: Design §6.1, FR-FS-001, FR-FS-002, FR-FS-010–013
**Dependencies**: T1.6, T1.7, T1.8
**Acceptance**:
- [x] `src/services/FileService.ts` implements Design §6.1 interface
- [x] `read`, `write`, `delete`, `exists`, `list`, `stat` methods
- [x] `watch` subscribes to file change events
- [x] `verifyDirectory` and `ensureDirectory` for root setup

**Verify**: Integration test reads/writes files, watch triggers on external changes

---

### T1.13 Implement settings persistence ✅
**Satisfies**: FR-FS-001, FR-FS-002 (root directory config)
**Dependencies**: T1.7
**Acceptance**:
- [x] Settings stored in Tauri app config folder
- [x] `loadSettings()` returns `{ rootPath: string | null }`
- [x] `saveSettings(settings)` persists to config
- [x] Settings survive app restart

**Verify**: Set root path, restart app, path is remembered

---

### T1.14 Implement first-launch folder picker ✅
**Satisfies**: FR-FS-001, FR-FS-002
**Dependencies**: T1.13
**Acceptance**:
- [x] On first launch (no saved rootPath), native folder picker opens
- [x] Selected path validated for write permissions
- [x] If invalid, error shown, picker re-opens
- [x] On success, path saved and subdirectories created

**Verify**: Delete config, launch app, picker appears, select folder, app loads

---

## Phase 2: Index & Store

### T2.1 Create SolidJS stores ✅
**Satisfies**: Design §4.3
**Dependencies**: T1.5
**Acceptance**:
- [x] `src/stores/indexStore.ts` with notes, tasks, docs, topics Maps
- [x] `src/stores/contextStore.ts` with activeView, activeEntity, isHomeState
- [x] `src/stores/editorStore.ts` with activeFile, mode, isDirty
- [x] Exported from `src/stores/index.ts`

**Verify**: Import stores in component, reactivity works on update

---

### T2.2 Implement entity parsing from files ✅
**Satisfies**: FR-FS-040–061
**Dependencies**: T1.10, T1.5
**Acceptance**:
- [x] `parseNote(path, content)` returns Note or null (invalid)
- [x] `parseTask(path, content)` returns Task or null
- [x] `parseDoc(path, content)` returns Doc or null
- [x] Extracts all frontmatter fields, validates required ones

**Verify**: Unit tests for valid notes/tasks/docs, invalid files return null

---

### T2.3 Implement inline syntax parsing ✅
**Satisfies**: FR-ENT-040–043, Design §5.3
**Dependencies**: T1.5
**Acceptance**:
- [x] `src/lib/markdown.ts` with `parseTodos(content): TodoItem[]`
- [x] `parseWikilinks(content): WikiLink[]`
- [x] `parseTopicRefs(content): TopicRef[]`
- [x] Handles edge cases (escaped, in code blocks)

**Verify**: Unit tests for `- TODO foo`, `[[task:slug]]`, `#topic`, `@person`

---

### T2.4 Implement IndexService file enumeration ✅
**Satisfies**: NFR-010, NFR-011
**Dependencies**: T1.12, T2.2
**Acceptance**:
- [x] `buildIndex(rootPath)` reads all .md files in notes/, tasks/, docs/
- [x] Parses each file, filters invalid ones
- [x] Populates indexStore with Notes, Tasks, Docs Maps
- [x] Returns timing info for performance monitoring

**Verify**: Create test files, call buildIndex, stores populated correctly

---

### T2.5 Implement topic extraction and aggregation ✅
**Satisfies**: FR-ENT-030–033
**Dependencies**: T2.3, T2.4
**Acceptance**:
- [x] Extracts topics from frontmatter AND body content
- [x] Builds topics Map with references to all entities
- [x] Computes `isActive` based on 90-day rule + open tasks
- [x] Stores `lastUsed` date for sorting

**Verify**: Index files with topics, verify active/dormant classification

---

### T2.6 Implement topics.yaml parsing ✅
**Satisfies**: FR-FS-070, FR-FS-071
**Dependencies**: T1.12, T1.5
**Acceptance**:
- [x] `TopicService.loadTopicsYaml(path)` returns Map<TopicRef, TopicDecoration>
- [x] Handles missing file gracefully (returns empty map)
- [x] Validates id field has # or @ prefix
- [x] Merges with computed topics for display labels

**Verify**: Create topics.yaml with labels, verify getLabel returns decoration

---

### T2.7 Implement relevance computation ✅
**Satisfies**: FR-CTX-001–003
**Dependencies**: T2.5
**Acceptance**:
- [x] `src/lib/relevance.ts` with `computeRelevance(entity): Map<string, number>`
- [x] Shared topics contribute to score
- [x] Direct wikilinks contribute to score
- [x] No ML, fully deterministic

**Verify**: Unit test: entity A shares 2 topics with B → higher score than 1 shared

---

### T2.8 Implement task grouping logic ✅
**Satisfies**: FR-UI-032, FR-UI-033, Design §5.5
**Dependencies**: T2.4, T2.7, T1.11
**Acceptance**:
- [x] `IndexService.getGroupedTasks(context)` returns GroupedTasks
- [x] RELATED: tasks with relevance > 0 when not home state
- [x] OVERDUE: due date < today
- [x] THIS_WEEK: due within 7 days
- [x] LATER: no due or beyond 7 days
- [x] Home state: no RELATED section

**Verify**: Create tasks with various due dates, verify grouping

---

### T2.9 Implement file change handling ✅
**Satisfies**: NFR-011
**Dependencies**: T1.12, T2.4
**Acceptance**:
- [x] `IndexService.invalidate(path)` re-parses single file
- [x] Updates relevant store entries
- [x] Recomputes affected topic aggregations
- [x] FileService watch triggers invalidate

**Verify**: Modify file externally, UI updates without manual refresh

---

### T2.10 Implement wikilink resolution ✅
**Satisfies**: FR-NAV-040, FR-NAV-041
**Dependencies**: T2.3, T2.4
**Acceptance**:
- [x] `IndexService.resolveWikilink(link): Entity | null`
- [x] Resolves `[[task:slug]]`, `[[doc:slug]]`, `[[note:YYYY-MM-DD]]`, `[[note:YYYY-MM-DD-slug]]`
- [x] Returns null for broken links

**Verify**: Unit tests for valid/invalid wikilinks

---

## Phase 3: Core UI Shell

### T3.1 Implement three-column Layout component ✅
**Satisfies**: FR-UI-001, FR-UI-002
**Dependencies**: T1.3, T2.1
**Acceptance**:
- [x] `src/components/layout/Layout.tsx` with CSS Grid
- [x] Three columns: left sidebar, center panel, right panel
- [x] Columns never collapse or hide
- [x] Responsive within desktop sizes (no mobile for v1)

**Verify**: Layout visible, resize window, columns remain

---

### T3.2 Implement LeftSidebar shell ✅
**Satisfies**: FR-UI-010–012
**Dependencies**: T3.1
**Acceptance**:
- [x] `LeftSidebar.tsx` with Today button, Topics section, Docs section
- [x] Section headers visible
- [x] Placeholder content for lists

**Verify**: All three sections visible in left sidebar

---

### T3.3 Implement TodayButton ✅
**Satisfies**: FR-UI-010, FR-NAV-001–003
**Dependencies**: T3.2
**Acceptance**:
- [x] Styled as primary action button
- [x] Pinned at top, always visible
- [x] Click triggers navigation to home state (connected later)

**Verify**: Button visible, click logs action (navigation wired in T3.9)

---

### T3.4 Implement TopicsList component ✅
**Satisfies**: FR-UI-011
**Dependencies**: T3.2, T2.5
**Acceptance**:
- [x] Renders active topics from indexStore
- [x] Sorted by most recently used (default)
- [x] TopicItem shows label (from topics.yaml or raw ref)
- [x] Distinguishes # topics from @ people visually

**Verify**: Add files with topics, list populates sorted by recency

---

### T3.5 Implement DocsList component ✅
**Satisfies**: FR-UI-012
**Dependencies**: T3.2, T2.4
**Acceptance**:
- [x] Renders all docs from indexStore
- [x] Sorted alphabetically by title (case-insensitive)
- [x] + button visible for creating new docs
- [x] DocItem shows title

**Verify**: Add doc files, list populates alphabetically

---

### T3.6 Implement CenterPanel shell ✅
**Satisfies**: FR-UI-020, FR-UI-021
**Dependencies**: T3.1, T2.1
**Acceptance**:
- [x] `CenterPanel.tsx` switches content based on contextStore.activeView
- [x] Supports 'journal', 'task', 'doc', 'topic' views
- [x] Shows placeholder for each view type

**Verify**: Manually set activeView in store, panel content changes

---

### T3.7 Implement RightPanel with TaskList ✅
**Satisfies**: FR-UI-030–034
**Dependencies**: T3.1, T2.8
**Acceptance**:
- [x] `RightPanel.tsx` with "Open Tasks" header
- [x] + button for creating tasks
- [x] TaskGroups component renders RELATED, OVERDUE, THIS_WEEK, LATER sections
- [x] RELATED hidden when isHomeState = true
- [x] TaskItem shows title, due date display

**Verify**: Add task files, list populates with correct grouping

---

### T3.8 Implement task highlight indicator ✅
**Satisfies**: FR-UI-034
**Dependencies**: T3.7
**Acceptance**:
- [x] When contextStore.activeEntity is a task, that task highlighted in list
- [x] Visual indicator (background, dot, or border)
- [x] Does not auto-scroll to highlighted task

**Verify**: Navigate to task in center, right panel highlights it

---

### T3.9 Implement NavigationService ✅
**Satisfies**: Design §6.5, FR-NAV-001–003
**Dependencies**: T2.1, T2.7
**Acceptance**:
- [x] `goHome()` sets activeView='journal', clears relevance, resets scroll
- [x] `navigateTo(entity)` sets activeView and activeEntity
- [x] `navigateToTopic(ref)` sets activeView='topic' and activeTopic
- [x] `updateRelevance()` computes and applies weights to stores
- [x] `clearRelevance()` resets all weights

**Verify**: Call navigation methods, verify store updates

---

### T3.10 Wire up sidebar navigation clicks ✅
**Satisfies**: FR-NAV-010–011, FR-NAV-020, FR-NAV-030
**Dependencies**: T3.3, T3.4, T3.5, T3.7, T3.9
**Acceptance**:
- [x] Today button calls goHome()
- [x] Topic/person item click calls navigateToTopic()
- [x] Doc item click calls navigateTo()
- [x] Task item click calls navigateTo()
- [x] Context weighting updates on each navigation

**Verify**: Click each item type, center panel and relevance update

---

### T3.11 Implement context-based sidebar reordering ✅
**Satisfies**: FR-CTX-010–014
**Dependencies**: T3.4, T3.5, T3.9
**Acceptance**:
- [x] When not home state, related topics float to top of TopicsList
- [x] Related docs float to top of DocsList
- [x] Home state shows natural order (most recent)

**Verify**: Navigate to entity with topics, sidebar reorders; click Today, resets

---

## Phase 4: Journal View

### T4.1 Implement JournalView component structure ✅
**Satisfies**: FR-UI-021
**Dependencies**: T3.6
**Acceptance**:
- [x] `JournalView.tsx` renders scrollable list of dates
- [x] Today's date at top
- [x] Dates in reverse chronological order going down

**Verify**: Journal view shows today, scroll down reveals past dates

---

### T4.2 Implement DateHeader component ✅
**Satisfies**: FR-UI-021, FR-CTX-020–021
**Dependencies**: T4.1
**Acceptance**:
- [x] Sticky header with date display
- [x] + New Note button on each date header
- [x] Date format: human readable (e.g., "March 10, 2026" or "Today")

**Verify**: Scroll journal, date headers stick at top as expected

---

### T4.3 Implement DailyNote rendering ✅
**Satisfies**: FR-ENT-001
**Dependencies**: T4.1, T2.4
**Acceptance**:
- [x] If daily note exists, renders content
- [x] If no file, renders empty editable area
- [x] No file created until first keystroke (deferred to T4.5)

**Verify**: Navigate to date with no file, empty area shown, no file on disk

---

### T4.4 Implement NamedNoteCard rendering ✅
**Satisfies**: FR-ENT-003
**Dependencies**: T4.1, T2.4
**Acceptance**:
- [x] Named notes for a date render as cards below daily note
- [x] Card shows title and preview/excerpt
- [x] Multiple named notes for same date all visible

**Verify**: Create named note file, card appears in journal

---

### T4.5 Implement lazy daily note creation ✅
**Satisfies**: FR-ENT-002
**Dependencies**: T4.3, T1.12, T1.10
**Acceptance**:
- [x] First keystroke in empty daily note creates file
- [x] File has valid frontmatter (type: note, date)
- [x] Subsequent keystrokes update existing file

**Verify**: Type in empty daily, file appears in notes/ with correct frontmatter

---

### T4.6 Implement journal scroll context updates ✅
**Satisfies**: FR-CTX-020–022
**Dependencies**: T4.1, T3.9
**Acceptance**:
- [x] Scroll position tracked via intersection observer
- [x] Most visible date header updates journalAnchorDate
- [x] Relevance weights update based on visible date's content
- [x] Today anchor = home state (no weighting)

**Verify**: Scroll to past date, sidebar reorders; scroll back to today, resets

---

### T4.7 Implement named note focus handling ✅
**Satisfies**: FR-CTX-022
**Dependencies**: T4.4, T3.9
**Acceptance**:
- [x] Clicking into named note card updates context to that note
- [x] Relevance weights based on note's topics/links
- [x] Clicking outside returns to date-based or home state

**Verify**: Click named note, sidebar reflects note's topics; click outside, resets

---

### T4.8 Implement CreateNoteModal ✅
**Satisfies**: FR-INT-030–032
**Dependencies**: T4.2
**Acceptance**:
- [x] Modal with title field (optional), topics field (optional)
- [x] Confirm and cancel buttons
- [x] If title empty → cursor placed in daily note (no file created)
- [x] If title provided → named note file created

**Verify**: Open modal from + button, create named note, file created and card appears

---

## Phase 5: Editor Integration

### T5.1 Set up TipTap with SolidJS ✅
**Satisfies**: Design §2.1, §4.1
**Dependencies**: T1.1
**Acceptance**:
- [x] TipTap installed and configured
- [x] SolidJS-compatible wrapper component
- [x] Basic text editing works

**Verify**: Type in editor, content updates

---

### T5.2 Implement Editor mode wrapper ✅
**Satisfies**: FR-ED-001
**Dependencies**: T5.1, T2.1
**Acceptance**:
- [x] `Editor.tsx` switches between OutlinerEditor and ProseEditor
- [x] Mode toggle button in toolbar
- [x] Content preserved on mode switch

**Verify**: Toggle mode, content intact

---

### T5.3 Implement ProseEditor ✅
**Satisfies**: FR-ED-020, FR-ED-021
**Dependencies**: T5.1
**Acceptance**:
- [x] TipTap with standard prose schema (headings, paragraphs, lists, code)
- [x] Markdown rendering (bold, italic, links)
- [x] Command menu on `/` key

**Verify**: Type markdown, formatting renders correctly

---

### T5.4 Implement OutlinerEditor block structure ✅
**Satisfies**: FR-ED-010
**Dependencies**: T5.1
**Acceptance**:
- [x] Content rendered as navigable block tree
- [x] Each list item is selectable block
- [x] Indentation levels visually distinct
- [x] Collapse/expand affordance for blocks with children

**Verify**: Open note with nested lists, blocks render correctly

---

### T5.5 Implement outliner indent/outdent ✅
**Satisfies**: FR-ED-011, FR-ED-012
**Dependencies**: T5.4
**Acceptance**:
- [x] Tab indents current block and children
- [x] Shift+Tab outdents
- [x] Cannot outdent past root level
- [x] Markdown list syntax updated on disk

**Verify**: Press Tab/Shift+Tab, block moves, file updated

---

### T5.6 Implement outliner block movement ✅
**Satisfies**: FR-ED-013, FR-ED-014
**Dependencies**: T5.4
**Acceptance**:
- [x] Alt+Up moves block up within siblings
- [x] Alt+Down moves block down
- [x] Cannot move past first/last sibling
- [x] Children move with parent

**Verify**: Press Alt+Up/Down, block reorders

---

### T5.7 Implement outliner Enter/Shift+Enter ✅
**Satisfies**: FR-ED-015, FR-ED-016
**Dependencies**: T5.4
**Acceptance**:
- [x] Enter creates new block at same indentation
- [x] Shift+Enter inserts line break within block
- [x] Cursor moves appropriately

**Verify**: Press Enter, new block; Shift+Enter, line break in same block

---

### T5.8 Implement CommandMenu ✅
**Satisfies**: FR-ED-017, FR-ED-021
**Dependencies**: T5.3, T5.4
**Acceptance**:
- [x] Opens on `/` key at cursor position
- [x] Dismissible with Escape
- [x] Includes: Promote to Task, Promote to Doc, formatting, wikilink, topic
- [x] Items filterable by typing

**Verify**: Type `/`, menu appears, select action

---

### T5.9 Implement TODO rendering ✅
**Satisfies**: FR-ENT-040–042
**Dependencies**: T5.4, T2.3
**Acceptance**:
- [x] `- TODO` renders with unchecked indicator
- [x] `- DOING` renders with in-progress indicator
- [x] `- DONE` renders with completed indicator (strikethrough/checkmark)

**Verify**: Create todos in note, visual indicators appear

---

### T5.10 Implement TODO state cycling ✅
**Satisfies**: FR-ENT-043
**Dependencies**: T5.9
**Acceptance**:
- [x] Click todo checkbox cycles: TODO → DOING → DONE → TODO
- [x] Prefix text in file updated
- [x] Change persisted to disk

**Verify**: Click todo, state cycles, file updated

---

### T5.11 Implement default editor modes ✅
**Satisfies**: FR-ED-002–004
**Dependencies**: T5.2
**Acceptance**:
- [x] Notes open in Outliner mode
- [x] Tasks open in Outliner mode
- [x] Docs open in Prose mode
- [x] Mode resets on each file open

**Verify**: Open note (outliner), open doc (prose), reopen note (outliner again)

---

### T5.12 Implement debounced auto-save ✅
**Satisfies**: Design §4.3 (pendingSave)
**Dependencies**: T5.2, T1.12
**Acceptance**:
- [x] Changes trigger save after 300ms debounce
- [x] isDirty flag tracks unsaved changes
- [x] Save clears isDirty and pendingSave

**Verify**: Edit, wait 300ms, file saved; edit rapidly, only saves once after pause

---

### T5.13 Integrate editor into JournalView ✅
**Satisfies**: FR-UI-021
**Dependencies**: T5.2, T4.3
**Acceptance**:
- [x] DailyNote uses Editor component
- [x] NamedNoteCard can expand to inline edit
- [x] Edits persist to files

**Verify**: Edit daily note in journal, content saved

---

### T5.14 Implement TaskDetailView ✅
**Satisfies**: FR-NAV-030
**Dependencies**: T5.2, T3.6
**Acceptance**:
- [x] Opens task in center panel with Editor
- [x] Shows task metadata (status, due, topics)
- [x] Defaults to Outliner mode
- [x] Status change buttons (mark done, cancel)

**Verify**: Click task in right panel, detail view opens, can edit

---

### T5.15 Implement DocView ✅
**Satisfies**: FR-NAV-020
**Dependencies**: T5.2, T3.6
**Acceptance**:
- [x] Opens doc in center panel with Editor
- [x] Shows doc title and topics
- [x] Defaults to Prose mode

**Verify**: Click doc in sidebar, doc opens in prose mode

---

### T5.16 Implement TopicView ✅
**Satisfies**: FR-NAV-010–014
**Dependencies**: T3.6, T2.5
**Acceptance**:
- [x] Shows topic label and note (from topics.yaml)
- [x] Lists notes referencing topic (reverse chronological)
- [x] Lists docs referencing topic (alphabetical)
- [x] If doc has topic in frontmatter, shows at top with preview

**Verify**: Navigate to topic, view shows all references

---

## Phase 6: Entity Workflows

### T6.1 Implement EntityService createDailyNote ✅
**Satisfies**: FR-ENT-001, FR-ENT-002
**Dependencies**: T1.12, T1.10, T1.11
**Acceptance**:
- [x] Creates `notes/YYYY-MM-DD.md` with valid frontmatter
- [x] Returns existing note if already present
- [x] File appears in indexStore

**Verify**: Call createDailyNote, file created, indexed

---

### T6.2 Implement EntityService createNamedNote ✅
**Satisfies**: FR-ENT-003, FR-ENT-004
**Dependencies**: T1.12, T1.9, T1.10
**Acceptance**:
- [x] Creates `notes/YYYY-MM-DD-slug.md`
- [x] Frontmatter includes type, date, title, topics (if provided)
- [x] Slug generated from title, collisions handled

**Verify**: Call createNamedNote with topics, file created with correct frontmatter

---

### T6.3 Implement EntityService createTask ✅
**Satisfies**: FR-ENT-010, FR-INT-010, FR-INT-011
**Dependencies**: T1.12, T1.9, T1.10
**Acceptance**:
- [x] Creates `tasks/slug.md`
- [x] Frontmatter includes type: task, status: open, created, due (opt), topics (opt)
- [x] Task appears in right panel

**Verify**: Create task via API, file created, appears in task list

---

### T6.4 Implement CreateTaskModal ✅
**Satisfies**: FR-INT-010, FR-INT-011
**Dependencies**: T6.3, T3.7
**Acceptance**:
- [x] Modal with title (required), due date, topics fields
- [x] Confirm creates task and opens in center panel
- [x] Cancel closes modal, no changes

**Verify**: Click + in right panel, fill modal, task created and opened

---

### T6.5 Implement task status updates ✅
**Satisfies**: FR-ENT-011–013
**Dependencies**: T6.3, T5.14
**Acceptance**:
- [x] `updateTaskStatus(path, status)` updates frontmatter
- [x] UI shows visual feedback on status change
- [x] Done/cancelled tasks briefly visible, then removed from list
- [x] Task file remains with updated status

**Verify**: Mark task done, brief animation, task disappears from list, file status = done

---

### T6.6 Implement EntityService createDoc ✅
**Satisfies**: FR-ENT-020, FR-INT-040, FR-INT-041
**Dependencies**: T1.12, T1.9, T1.10
**Acceptance**:
- [x] Creates `docs/slug.md`
- [x] Frontmatter includes type: doc, title, created, topics (opt)
- [x] Doc appears in sidebar alphabetically

**Verify**: Create doc, file created, appears in DocsList

---

### T6.7 Implement CreateDocModal ✅
**Satisfies**: FR-INT-040, FR-INT-041
**Dependencies**: T6.6, T3.5
**Acceptance**:
- [x] Modal with title (required), topics fields
- [x] Confirm creates doc and opens in center panel (Prose mode)
- [x] Cancel closes modal

**Verify**: Click + in Docs section, fill modal, doc created and opened

---

### T6.8 Implement promoteToTask ✅
**Satisfies**: FR-INT-001–004
**Dependencies**: T6.3, T2.3, T5.8
**Acceptance**:
- [x] Selected from command menu on TODO line
- [x] Creates task file with slug from TODO text
- [x] Inherits topics from source note
- [x] Replaces original line with `- [[task:slug]]`
- [x] Opens task in center panel

**Verify**: Select TODO, promote, task created, wikilink replaces TODO

---

### T6.9 Implement promoteToDoc ✅
**Satisfies**: FR-INT-020–024
**Dependencies**: T6.6, T5.8
**Acceptance**:
- [x] Selected from command menu on parent bullet
- [x] Prompts for title
- [x] Prompts to select topics from source note
- [x] Creates doc with promoted content
- [x] Replaces original content with `[[doc:slug]]`
- [x] Opens doc in center panel (Prose mode)

**Verify**: Select section, promote, doc created with content, wikilink replaces original

---

### T6.10 Implement topic/person autocomplete ✅
**Satisfies**: FR-INT-050–053
**Dependencies**: T2.5, T5.1
**Acceptance**:
- [x] Typing `#` shows active topics, filtered as user types
- [x] Typing `@` shows active people
- [x] Selecting inserts full reference
- [x] Continuing to type without selection creates new topic

**Verify**: Type `#pro`, suggestions appear, select one, inserted

---

### T6.11 Implement wikilink navigation ✅
**Satisfies**: FR-NAV-040, FR-NAV-041
**Dependencies**: T2.10, T3.9
**Acceptance**:
- [x] Clicking wikilink navigates to target
- [x] `[[task:slug]]` → TaskDetailView
- [x] `[[doc:slug]]` → DocView
- [x] `[[note:YYYY-MM-DD]]` → journal date
- [x] Broken links styled distinctly, click shows tooltip

**Verify**: Click wikilink, navigates; create broken link, styled differently

---

### T6.12 Implement wikilink rendering ✅
**Satisfies**: FR-NAV-040, FR-NAV-041
**Dependencies**: T5.3, T5.4
**Acceptance**:
- [x] Wikilinks render as clickable inline elements
- [x] Show entity title if exists, raw link if broken
- [x] Broken links have distinct styling

**Verify**: Type wikilink, renders as link; broken link styled red

---

## Phase 7: Polish & Performance

### T7.1 Implement virtual scrolling for journal ✅
**Satisfies**: Performance targets
**Dependencies**: T4.1
**Acceptance**:
- [x] Only visible dates rendered in DOM
- [x] Smooth scroll with recycled elements
- [x] Handles 1000+ dates without lag

**Verify**: Create 1000 daily notes, scroll smoothly

---

### T7.2 Implement index caching ✅
**Satisfies**: Design Appendix A (index caching)
**Dependencies**: T2.4
**Acceptance**:
- [x] Index serialized to disk on build
- [x] Cached index loaded on startup if valid
- [x] Cache invalidated when files modified

**Verify**: Start app, fast load; modify file externally, cache invalidated

---

### T7.3 Implement off-thread parsing ✅
**Satisfies**: Performance targets
**Dependencies**: T2.2, T2.3
**Acceptance**:
- [x] YAML/markdown parsing in Web Worker
- [x] Main thread stays responsive during index build
- [x] Worker pool for parallel file parsing

**Verify**: Build index of 500 files, main thread responsive

---

### T7.4 Add error boundary and user feedback ✅
**Satisfies**: NFR (robustness)
**Dependencies**: T3.1
**Acceptance**:
- [x] Error boundary catches component errors
- [x] User-friendly error messages displayed
- [x] Toast notifications for save success/failure
- [x] File access errors handled gracefully

**Verify**: Force error, boundary catches, toast shows

---

### T7.5 Implement loading states ✅
**Satisfies**: UX polish
**Dependencies**: T3.1
**Acceptance**:
- [x] Loading indicator during index build
- [x] Skeleton UI for lists while loading
- [x] Optimistic updates for user actions

**Verify**: Clear cache, start app, loading indicator appears

---

### T7.6 Add keyboard shortcuts reference ✅
**Satisfies**: UX polish
**Dependencies**: T5.5, T5.6
**Acceptance**:
- [x] Help modal listing all shortcuts
- [x] Accessible via keyboard (e.g., ?)
- [x] Shortcuts documented

**Verify**: Press ?, help modal appears with shortcuts

---

### T7.7 Performance profiling and optimization ✅
**Satisfies**: Performance targets
**Dependencies**: All prior tasks
**Acceptance**:
- [x] Cold start < 2 seconds
- [x] Keystroke latency < 16ms
- [x] File save latency < 100ms
- [x] Index rebuild (1000 files) < 3 seconds
- [x] Memory < 200MB typical

**Verify**: Performance tests pass all targets

---

### T7.8 Add unit test suite ✅
**Satisfies**: Testing strategy
**Dependencies**: T1.4
**Acceptance**:
- [x] Vitest configured with SolidJS support
- [x] Unit tests for: slug generation, frontmatter parsing, date utilities, relevance computation, task grouping, wikilink resolution, inline parsing
- [x] Tests run in CI

**Verify**: `npm test` passes, coverage > 80% for lib/

---

### T7.9 Add E2E test suite ✅
**Satisfies**: Testing strategy
**Dependencies**: T7.8
**Acceptance**:
- [x] Playwright configured
- [x] Tests for: journal navigation, task CRUD, doc CRUD, promotion flows, navigation between views
- [x] Tests run in CI

**Verify**: `npm run test:e2e` passes

---

## Summary

| Phase | Tasks | Count | Focus |
|-------|-------|-------|-------|
| 1. Foundation | T1.1–T1.14 | 14 | Project setup, types, file operations |
| 2. Index & Store | T2.1–T2.10 | 10 | Reactive state, indexing, relevance |
| 3. Core UI Shell | T3.1–T3.11 | 11 | Three-column layout, navigation |
| 4. Journal View | T4.1–T4.8 | 8 | Scrollable journal, date headers |
| 5. Editor | T5.1–T5.16 | 16 | TipTap, outliner, prose, views |
| 6. Workflows | T6.1–T6.12 | 12 | CRUD, promotion, autocomplete |
| 7. Polish | T7.1–T7.9 | 9 | Performance, testing, UX |

**Total: 80 tasks**

---

## Dependency Graph

```
Phase 1 (Foundation)
├── T1.1 (Tauri+Vite+SolidJS)
│   ├── T1.2 (TypeScript strict) → T1.5 (Core types)
│   ├── T1.3 (Tailwind)
│   ├── T1.4 (ESLint+Prettier)
│   ├── T1.6 (Runtime abstraction) ──┐
│   └── T1.7 (Tauri FS commands) ───┼── T1.12 (FileService)
│       └── T1.8 (File watcher) ────┘       │
│       └── T1.13 (Settings) → T1.14 (Folder picker)
├── T1.9 (Slug generation) ← T1.5
├── T1.10 (Frontmatter) ← T1.5
└── T1.11 (Date utilities)

Phase 2 (Index & Store)
├── T2.1 (SolidJS stores) ← T1.5
├── T2.2 (Entity parsing) ← T1.10, T1.5
├── T2.3 (Inline parsing) ← T1.5
├── T2.4 (IndexService) ← T1.12, T2.2
│   └── T2.5 (Topic aggregation) ← T2.3
│       └── T2.7 (Relevance)
│           └── T2.8 (Task grouping) ← T1.11
├── T2.6 (topics.yaml) ← T1.12, T1.5
├── T2.9 (Change handling) ← T1.12, T2.4
└── T2.10 (Wikilink resolution) ← T2.3, T2.4

Phase 3 (Core UI)
├── T3.1 (Layout) ← T1.3, T2.1
│   ├── T3.2 (LeftSidebar)
│   │   ├── T3.3 (TodayButton)
│   │   ├── T3.4 (TopicsList) ← T2.5
│   │   └── T3.5 (DocsList) ← T2.4
│   ├── T3.6 (CenterPanel) ← T2.1
│   └── T3.7 (RightPanel) ← T2.8
│       └── T3.8 (Task highlight)
├── T3.9 (NavigationService) ← T2.1, T2.7
├── T3.10 (Wire navigation) ← T3.3-T3.7, T3.9
└── T3.11 (Sidebar reorder) ← T3.4, T3.5, T3.9

Phase 4 (Journal)
├── T4.1 (JournalView) ← T3.6
│   ├── T4.2 (DateHeader)
│   ├── T4.3 (DailyNote) ← T2.4
│   ├── T4.4 (NamedNoteCard) ← T2.4
│   └── T4.6 (Scroll context) ← T3.9
├── T4.5 (Lazy creation) ← T4.3, T1.12, T1.10
├── T4.7 (Named note focus) ← T4.4, T3.9
└── T4.8 (CreateNoteModal) ← T4.2

Phase 5 (Editor)
├── T5.1 (TipTap setup) ← T1.1
│   ├── T5.2 (Editor wrapper) ← T2.1
│   │   ├── T5.3 (ProseEditor)
│   │   └── T5.4 (OutlinerEditor)
│   │       ├── T5.5 (Indent/outdent)
│   │       ├── T5.6 (Block movement)
│   │       ├── T5.7 (Enter/Shift+Enter)
│   │       └── T5.9 (TODO rendering) ← T2.3
│   │           └── T5.10 (TODO cycling)
│   └── T5.8 (CommandMenu) ← T5.3, T5.4
├── T5.11 (Default modes) ← T5.2
├── T5.12 (Auto-save) ← T5.2, T1.12
├── T5.13 (Journal integration) ← T5.2, T4.3
├── T5.14 (TaskDetailView) ← T5.2, T3.6
├── T5.15 (DocView) ← T5.2, T3.6
└── T5.16 (TopicView) ← T3.6, T2.5

Phase 6 (Workflows)
├── T6.1 (createDailyNote) ← T1.12, T1.10, T1.11
├── T6.2 (createNamedNote) ← T1.12, T1.9, T1.10
├── T6.3 (createTask) ← T1.12, T1.9, T1.10
│   ├── T6.4 (CreateTaskModal) ← T3.7
│   └── T6.5 (Status updates) ← T5.14
├── T6.6 (createDoc) ← T1.12, T1.9, T1.10
│   └── T6.7 (CreateDocModal) ← T3.5
├── T6.8 (promoteToTask) ← T6.3, T2.3, T5.8
├── T6.9 (promoteToDoc) ← T6.6, T5.8
├── T6.10 (Topic autocomplete) ← T2.5, T5.1
├── T6.11 (Wikilink navigation) ← T2.10, T3.9
└── T6.12 (Wikilink rendering) ← T5.3, T5.4

Phase 7 (Polish)
├── T7.1 (Virtual scrolling) ← T4.1
├── T7.2 (Index caching) ← T2.4
├── T7.3 (Off-thread parsing) ← T2.2, T2.3
├── T7.4 (Error boundary) ← T3.1
├── T7.5 (Loading states) ← T3.1
├── T7.6 (Keyboard shortcuts) ← T5.5, T5.6
├── T7.7 (Performance) ← All
├── T7.8 (Unit tests) ← T1.4
└── T7.9 (E2E tests) ← T7.8
```

---

## Parallel Execution Opportunities

Within each phase, some tasks can be executed in parallel:

**Phase 1:**
- Parallel: T1.9, T1.10, T1.11 (after T1.5)
- Parallel: T1.7, T1.13 (after T1.1)

**Phase 2:**
- Parallel: T2.1, T2.2, T2.3, T2.6 (after their deps)

**Phase 3:**
- Parallel: T3.2, T3.6, T3.7 (after T3.1)
- Parallel: T3.4, T3.5 (after T3.2)

**Phase 4:**
- Parallel: T4.2, T4.3, T4.4, T4.6 (after T4.1)

**Phase 5:**
- Parallel: T5.3, T5.4 (after T5.2)
- Parallel: T5.5, T5.6, T5.7, T5.9 (after T5.4)
- Parallel: T5.14, T5.15, T5.16 (after their deps)

**Phase 6:**
- Parallel: T6.1, T6.2, T6.3, T6.6 (after their deps)
- Parallel: T6.4, T6.5 (after T6.3)

**Phase 7:**
- Parallel: T7.1, T7.2, T7.3, T7.4, T7.5 (after their deps)
