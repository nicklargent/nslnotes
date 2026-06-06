# UI Functional Interactions Catalog

Comprehensive inventory of every testable user interaction, organized by feature area. Each item is a discrete testable interaction.

---

## 1. Global Keyboard Shortcuts

Source: `src/App.tsx` — capture-phase `keydown` listener on `document`

- [ ] `Ctrl+F` / `Cmd+F` opens the find bar (prevents native browser find)
- [ ] `Escape` closes the find bar when it is open
- [ ] `Ctrl+N` / `Cmd+N` opens the quick capture modal
- [ ] `Ctrl+K` / `Cmd+K` navigates to search view
- [ ] `Ctrl+=` / `Cmd+=` increases font size (max 24px)
- [ ] `Ctrl+-` / `Cmd+-` decreases font size (min 12px)
- [ ] `?` toggles the keyboard shortcuts modal (skipped when focus is in input/textarea/tiptap)
- [ ] Font size change is debounce-saved to settings (500ms)
- [ ] Shortcuts use capture phase so they fire before editor key handlers

---

## 2. Layout & Resize

Source: `src/components/layout/Layout.tsx`, `ResizeHandle.tsx`

- [ ] Left resize handle: mousedown starts drag, mousemove resizes, mouseup ends
- [ ] Right resize handle: same drag behavior for right panel
- [ ] During drag: `user-select: none` applied, cursor forced to `col-resize`
- [ ] Left column clamped to 160–400px
- [ ] Right column clamped to 180–480px
- [ ] Column widths debounce-saved to settings on resize end (500ms)
- [ ] Resize handle hover: `bg-gray-200` → `hover:bg-blue-300` transition
- [ ] Resize handle active: `active:bg-blue-400`

---

## 3. Left Sidebar

Source: `src/components/layout/LeftSidebar.tsx`, `src/components/sidebar/`

### Navigation Buttons
- [ ] Today button navigates journal to today's date
- [ ] Search button opens search view
- [ ] Quick capture button opens quick capture modal
- [ ] Create doc button starts doc draft
- [ ] Switch folder button opens native folder picker (Tauri only, hidden in web mode)

### Calendar Picker (`CalendarPicker.tsx`)
- [ ] Calendar button toggles picker open/closed (positioned from button rect)
- [ ] Prev/next month buttons navigate months
- [ ] Day cell click selects date and closes picker
- [ ] Today cell highlighted with `bg-blue-100 font-semibold`
- [ ] Days with notes show a blue dot indicator
- [ ] Monday-based week grid (Mo–Su)
- [ ] Click outside picker closes it
- [ ] `Escape` closes picker

### Font Size Controls
- [ ] A- button decreases font size by 1px (min 12px)
- [ ] A+ button increases font size by 1px (max 24px)
- [ ] Changes debounce-saved (500ms)

### Dark Mode
- [ ] Dark mode toggle button switches theme
- [ ] Preference debounce-saved (500ms)

### Linux Custom Titlebar (`NotebookTabBar.tsx`, `src-tauri/src/lib.rs`)
- [ ] Linux native build only: KDE/GNOME native window decorations are disabled (`set_decorations(false)` in setup hook)
- [ ] The top bar acts as the window drag region (`data-tauri-drag-region`); empty bar areas and the logo can be used to drag the window, with WM-managed snap-to-edge / double-click-to-maximize behavior
- [ ] Three window controls render at the right end (after dark mode toggle), separated by a vertical divider: Minimize, Maximize/Restore (icon swaps based on state), Close
- [ ] Close button shows red hover background to match KDE convention
- [ ] Maximize icon updates reactively via `onResized` listener
- [ ] Not rendered on macOS or Windows native, or in any web mode
- [ ] Not covered by E2E tests (Playwright runs against web mode where titlebar is hidden)

### Backup Button (`NotebookTabBar.tsx`)
- [ ] Button disabled when no notebooks are registered or a switch is in flight
- [ ] In the Tauri app: click opens a native save dialog with default filename `nslnotes-backup-<YYYY-MM-DDTHH-MM>.tar.gz`
- [ ] In the web app (`npm run web:serve`): click triggers a browser download with the same default filename; the server streams the archive via `POST /api/backup`
- [ ] Cancelling the Tauri save dialog is a no-op (no toast, no file written)
- [ ] "Creating backup…" info toast appears before the archive operation
- [ ] Button icon spins and the button is disabled for the full duration of the archive (archiving a real notebook can take 30–45s)
- [ ] On success, a toast reports notebook count, file count, archive size, and any skipped symlinks
- [ ] On failure, an error toast surfaces the reason; no `.tar.gz.tmp` file is left behind in native mode
- [ ] Archive contains one top-level folder per notebook, named after the notebook's display name (disambiguated with `_2`, `_3`, … on collision)
- [ ] Excludes `.git/`, `node_modules/`, `.Trash/`, `.DS_Store`, `Thumbs.db`, `*.tmp`, `*.swp`
- [ ] Symlinks are not followed and not archived; count reported in success toast
- [ ] Native mode refuses to write the backup inside any notebook folder
- [ ] Not available via the Vite dev server (`npm run dev:web`) — use the Rust web server for browser-mode backups
- [ ] Not covered by E2E tests (depends on native dialogs + Rust backend)

### Topics List (`TopicsList.tsx`, `TopicItem.tsx`)
- [ ] Collapsed view shows top 5 topics
- [ ] "Show all (N)" button expands to full alphabetical list
- [ ] Back button collapses expanded view
- [ ] Topic click navigates to topic view
- [ ] Topic icon: `#` (blue-500) for topics, `@` (purple-500) for people
- [ ] Open task count badge shown (hidden if 0)
- [ ] Edit icon appears on hover
- [ ] Edit icon click starts inline label editing (stopPropagation)
- [ ] Edit input: Enter commits, Escape cancels, blur commits
- [ ] Input auto-focused and text selected on edit start

### Docs List (`DocsList.tsx`)
- [ ] Pinned docs shown first (alphabetical), then recent docs (alphabetical)
- [ ] Max 10 visible (pinned + recent) unless expanded
- [ ] "Show all" button expands full list; back button collapses
- [ ] `+` button starts doc draft creation
- [ ] Doc click navigates to doc view
- [ ] Active doc highlighted
- [ ] Every doc row has a pin toggle (filled star icon, shared `StarIcon`): amber/filled and always visible when pinned; gray outline on row hover otherwise; click toggles `pinned` frontmatter (`stopPropagation`, no navigation) — same behavior as the task-list pin toggle

### Section Expand/Collapse
- [ ] Topics section header toggles expand/collapse
- [ ] People section header toggles expand/collapse
- [ ] Docs section header toggles expand/collapse

---

## 4. Journal View

Source: `src/components/journal/JournalView.tsx`, `MonthBar.tsx`, `DateHeader.tsx`, `DailyNote.tsx`, `NamedNoteCard.tsx`

### Month Bar (`MonthBar.tsx`)
- [ ] Month pills displayed reverse-chronologically (current leftmost)
- [ ] Year labels group month pills
- [ ] Click month pill navigates to that month
- [ ] Selected month pill: `bg-blue-100 text-blue-700`
- [ ] Auto-scrolls selected month into view (`scrollIntoView` smooth, inline center)
- [ ] Vertical mouse wheel converts to horizontal scroll (non-passive wheel listener, `deltaY` → `scrollLeft`)

### Month Navigation
- [ ] Prev month button navigates to previous month
- [ ] Next month button navigates to next month
- [ ] Top/bottom buffer zones show 5 closest dates from adjacent months (opacity-60)

### Date Headers (`DateHeader.tsx`)
- [ ] Today: "Today — [long date]"
- [ ] Yesterday: "Yesterday — [long date]"
- [ ] Last 7 days: "[Weekday] — [long date]"
- [ ] Older: "[Long date]"
- [ ] "+ New Note" button appears on date header hover (opacity transition)
- [ ] Click "+ New Note" creates a named note on that date

### Daily Note (`DailyNote.tsx`)
- [ ] First keystroke lazily creates the daily note file on disk
- [ ] Subsequent edits debounce-saved (300ms)
- [ ] `onCleanup` flushes pending saves
- [ ] Delete button visible on hover
- [ ] Delete click opens confirm modal; confirm deletes entity
- [ ] Raw mode toggle switches between TipTap and raw markdown textarea
- [ ] Raw→rendered: flushes raw save, re-reads file, parses frontmatter
- [ ] Rendered→raw: flushes TipTap save first

### Named Note Card (`NamedNoteCard.tsx`)
- [ ] Collapsed card: border, rounded corners, preview excerpt
- [ ] Click card focuses it (`setFocusedNoteSlug`) and pushes navigation history
- [ ] Focused card: blue background/border, expanded editor
- [ ] Background click (outside any card) blurs focused note
- [ ] Title click starts inline edit; save updates frontmatter
- [ ] Topics area click starts inline edit; save updates frontmatter
- [ ] Delete button visible on hover or when focused
- [ ] Delete click opens confirm modal; confirm deletes
- [ ] Raw mode toggle visible on hover or when focused
- [ ] 300ms debounce save on content update
- [ ] `onCleanup` flushes pending save

### Scroll & Intersection
- [ ] IntersectionObserver tracks visible date headers (threshold: 0)
- [ ] Anchor date updated to topmost visible date header
- [ ] Auto-scroll to pending date via `scrollIntoView({ block: "start" })`
- [ ] Scroll retry up to 3 times with `requestAnimationFrame`
- [ ] Today button while already on journal resets to today and scrolls to top

### Highlight Animation
- [ ] Navigation to entity triggers flash highlight on target card
- [ ] 150ms delay before flash starts, 1500ms duration (`animate-flash`)

### Draft Note Card
- [ ] Draft input appears at target date
- [ ] Commit creates note, focuses it, sets autofocus
- [ ] Cancel clears draft

---

## 5. Editor (TipTap)

Source: `src/components/editor/ProseEditor.tsx`, `Editor.tsx`

### Text Editing
- [ ] Text input into TipTap editor
- [ ] Bold formatting (`Ctrl+B`)
- [ ] Italic formatting (`Ctrl+I`)
- [ ] Strikethrough formatting
- [ ] Inline code formatting
- [ ] Heading levels 1–3
- [ ] Bullet list creation
- [ ] Ordered list creation
- [ ] Code block creation
- [ ] Horizontal rule insertion

### Bubble Menu (`BubbleMenu.tsx`)
- [ ] Appears above text selection (centered horizontally)
- [ ] Animated entrance (`animate-bubble-up`)
- [ ] Bold button toggles bold (active: `bg-blue-100`)
- [ ] Italic button toggles italic
- [ ] Strikethrough button toggles strike
- [ ] Code button toggles code
- [ ] H1/H2/H3 buttons toggle heading levels
- [ ] Extract button triggers promote flow and closes menu
- [ ] Click outside the editor closes bubble menu (in-editor clicks are governed by selection state, not click-outside)
- [ ] Triple-click to select a line keeps the menu visible and re-centers above the line
- [ ] Selection ending at the start of the next line is positioned above the visible selection (uses `coordsAtPos(to, -1)` to keep end coords on the selected line)
- [ ] Repositions when the selection changes while the menu is open
- [ ] `Escape` closes bubble menu (capture phase)
- [ ] 200ms blur delay allows click-through to bubble menu buttons

### Command Menu (`CommandMenu.tsx`)
- [ ] `/` keystroke opens command menu at cursor position (+24px below)
- [ ] Filter narrows commands as user types after `/` (case-insensitive on label/description)
- [ ] `ArrowDown` increments selection (max = commands.length - 1)
- [ ] `ArrowUp` decrements selection (min = 0)
- [ ] `Enter` or `Tab` selects current command
- [ ] `Escape` closes menu
- [ ] Mouse enter on item updates selection
- [ ] Click item selects command
- [ ] Click outside closes menu
- [ ] Menu closes on: cursor moves before `/`, space/newline inserted, no matches
- [ ] Filter reset sets selection back to 0
- [ ] Available commands: Extract, H1, H2, H3, Bullet list, Ordered list, Code block, Bold, Italic, Divider, Table, Task List

### Topic Autocomplete (`TopicAutocomplete.tsx`)
- [ ] `#` at word boundary opens topic autocomplete
- [ ] `@` at word boundary opens person autocomplete
- [ ] Max 8 suggestions displayed
- [ ] Filter by partial ref or label match (case-insensitive)
- [ ] Exact matches excluded from suggestions
- [ ] `ArrowDown`/`ArrowUp` navigate suggestions
- [ ] `Enter` or `Tab` selects current suggestion (preventDefault, stopPropagation)
- [ ] `Escape` closes without selecting
- [ ] `Space` closes autocomplete
- [ ] Mouse enter updates selection
- [ ] Click suggestion selects it
- [ ] Click outside closes autocomplete
- [ ] Autocomplete closes on: cursor moves before trigger, space/newline inserted

### Wikilink Autocomplete (`WikilinkAutocomplete.tsx`)
- [ ] `[[` triggers wikilink autocomplete popup
- [ ] Shows open tasks, docs, and named notes
- [ ] Type prefix support: `[[task:` filters to tasks only, `[[doc:` to docs, `[[note:` to notes
- [ ] Fuzzy matching: case-insensitive substring match on title and slug
- [ ] Colored type badges (task/doc/note) before each suggestion title
- [ ] `ArrowDown`/`ArrowUp` navigate suggestions
- [ ] `Enter` or `Tab` selects current suggestion and inserts `[[type:slug]] `
- [ ] `Escape` closes without selecting
- [ ] Click outside closes autocomplete
- [ ] Spaces allowed in filter (unlike topic autocomplete)
- [ ] Autocomplete closes on: cursor moves before `[[`, newline or `]` inserted
- [ ] Max 10 suggestions, wider popup (`w-72`)
- [ ] Mutual exclusion with topic autocomplete

### Lists
- [ ] `Tab` indents list item
- [ ] `Shift+Tab` outdents list item
- [ ] `Alt+Up` reorders list item up (if supported by extension)
- [ ] `Alt+Down` reorders list item down (if supported by extension)

### Code Blocks (`CodeBlockView.ts`)
- [ ] Fenced code block (```` ``` ````) renders with line numbers, copy button, and a language selector dropdown
- [ ] Click copy button: copies block contents to clipboard, swaps icon to check for ~1.5s
- [ ] Language dropdown: change updates the node's `language` attr (re-highlights)
- [ ] `ArrowDown` at the last line of a code block moves cursor to whatever follows in the parent. If the code block is the last child of a list item, cursor jumps OUT of the list item to the first valid next-sibling — does NOT synthesize a fresh paragraph after the code block (the upstream `exitOnArrowDown` default would, which historically appeared as a transient blank line during navigation)

### Tables
- [ ] `/table` slash command inserts a 3x3 table with header row
- [ ] `Tab` in table navigates to next cell
- [ ] `Shift+Tab` in table navigates to previous cell
- [ ] `Ctrl+Shift+Enter` / `Cmd+Shift+Enter` in table inserts paragraph after table and moves cursor there
- [ ] Table toolbar appears above table when cursor is in a cell without text selection
- [ ] Table toolbar: "+Col←" adds column before current
- [ ] Table toolbar: "+Col→" adds column after current
- [ ] Table toolbar: "−Col" deletes current column
- [ ] Table toolbar: "+Row↑" adds row above current
- [ ] Table toolbar: "+Row↓" adds row below current
- [ ] Table toolbar: "−Row" deletes current row
- [ ] Table toolbar: "¶↑" inserts paragraph before table
- [ ] Table toolbar: "¶↓" inserts paragraph after table
- [ ] Table toolbar: "Delete" removes entire table
- [ ] Selected cells highlighted with tinted background (`.selectedCell` class)
- [ ] Column resize: drag cell border to resize column width
- [ ] Resize handle appears as colored bar on hover over cell border

### Task List (Markdown Checkboxes)
- [ ] `/tasklist` slash command toggles task list on current block
- [ ] `- [ ]` in markdown renders as unchecked checkbox
- [ ] `- [x]` in markdown renders as checked checkbox with strikethrough text
- [ ] Clicking checkbox toggles checked state
- [ ] Nested task items supported
- [ ] Coexists with custom TODO system (TODO/DOING/WAITING/LATER/DONE)

### TODO Markers (`TodoMarker.ts`)
- [ ] Implemented as a TipTap inline atom node (`todoMarker`) with a `state` attribute, not text-with-decorations. Selecting/copying a TODO line yields the keyword as text, not the unicode glyph.
- [ ] Click cycles state: TODO → DOING → DONE → TODO. WAITING and LATER both jump to DONE.
- [ ] Click target is the entire `span[data-todo]` wrapper — both the glyph and the keyword label cycle when clicked
- [ ] Cycling mutates the node's `state` attr via `setNodeMarkup` (single transaction, undo-friendly)
- [ ] Unicode icons rendered by the NodeView: ☐ (TODO), ▣ (DOING), ⊡ (WAITING), ⊟ (LATER), ☑ (DONE)
- [ ] CSS classes: `.todo-marker.todo-open` (TODO), `.todo-doing`, `.todo-waiting`, `.todo-later`, `.todo-done` — applied to both the glyph span and the label span
- [ ] Colors via CSS variables: `--color-todo-open` (gray), `--color-todo-doing` (blue), `--color-todo-waiting` (amber), `--color-todo-later` (purple), `--color-todo-done` (green)
- [ ] Markers render in both bulleted list items (`- TODO foo`) and standalone paragraphs (`TODO foo`); skipped inside headings, table cells, blockquotes
- [ ] Typing `TODO ` (or other keyword + space) at the start of a paragraph or list item triggers an InputRule that replaces the keyword with the schema node + a space. PasteRule does the same for pasted markdown.
- [ ] DONE state: a `strike` mark is applied to the rest of the current line (until the next hardBreak); removed when the state leaves DONE. Strike is scoped to the line — sibling lines in the same paragraph aren't affected.

### Wikilinks (InlineDecorations)
- [ ] Wikilink renders as inline widget when cursor is not inside it
- [ ] `Cmd+Click` / `Ctrl+Click` on wikilink navigates to target entity
- [ ] Wikilink drag sets WIKILINK_MIME data for drag-drop

### Markdown Links (InlineDecorations)
- [ ] Markdown links render as inline decoration
- [ ] `Cmd+Click` / `Ctrl+Click` opens link in browser
- [ ] Native `<a>` clicks captured and prevented (capture-phase DOM listener on container)
- [ ] Paste a URL with no selection: inserts `[url](url)` with the label portion selected so the user can immediately type a label
- [ ] Paste a URL with text selected: replaces the selection with `[<selected text>](url)` and leaves the label portion selected
- [ ] Paste a URL while the cursor is inside an existing markdown link: inserts the raw URL (no nested link)

### Copy / Paste (markdown round-trip)
- [ ] Copy serializes the selection to markdown onto the clipboard (`clipboardTextSerializer`)
- [ ] A selection contained within a single block (e.g. part of one bullet line) copies just the inline text, without the block marker (`- `, `#`, `> `, …); a selection spanning multiple blocks keeps the full markdown structure (bullets, nesting)
- [ ] Paste of plain-text markdown (no usable `text/html` on the clipboard — e.g. an internal copy under webkit2gtk, or a markdown snippet from elsewhere) is parsed back into real nodes via `parseMarkdown`, so a bulleted/ordered/task list round-trips as a real nested list rather than literal hyphen text
- [ ] Rich HTML pastes (clipboard carries `text/html`) flow through ProseMirror's default DOM parsing, then `transformPasted` normalizes them: the parsed slice is run through a markdown round trip and, if it would survive unchanged, inserted verbatim (no behaviour change); if it would NOT survive (e.g. an Outlook table with a line break or block content in a cell), the savable form is inserted instead so the editor immediately shows exactly what will persist — no silent loss on the next reload
- [ ] Paste inside a code block is left as literal text (not markdown-parsed)

### Save Integrity Check (`pmMarkdown/roundTrip.ts`, `saveIntegrity.ts`)
Background safety net (approach A) complementing paste normalization. After edits settle (~800 ms idle, off the typing path), the live doc is run through a markdown round trip (`serialize → parse`) and compared, ignoring blank-line cosmetics. If the content would lose data on a save/reload (something the serializer cannot represent), the user is warned **before** the loss is realized.
- [ ] Editing a note with content that round-trips cleanly shows only the normal `Saving…` status — no warning. The comparison ignores benign normalizations markdown applies by design — blank-line gaps, paragraph-break vs. hard-break (interchangeable under markdown-it `breaks: true`), leading/trailing whitespace trimmed at paragraph/heading edges (e.g. a trailing space at end of line, a leading space in a bullet; `codeBlock` whitespace is preserved), and adjacent same-type lists (which markdown reflows into one — e.g. a blank line splitting a list mid-edit) — so ordinary edits never false-positive; calibrated against the full notes corpus (0 false positives)
- [ ] When the current content would not survive a save/reload, an amber warning toast appears (longer-lived than status toasts) and the per-note save-status text is replaced by a persistent `⚠ Save may be incomplete — review this note` indicator (DocView, TaskDetail, DailyNote, NamedNoteCard)
- [ ] The warning only re-toasts on ok↔warning transitions, not on every keystroke; the inline indicator clears when a later check passes or when switching to another note
- [ ] In practice paste normalization (`transformPasted`) prevents the common case, so this backstop fires mainly for non-paste edits or future serializer gaps

### Image Handling
- [ ] Image paste: converts to base64, inserts as `<img>`, auto-saves to disk
- [ ] Image drop: same base64 conversion and insertion
- [ ] Image resize: drag corners via `ImageResizePlugin`
- [ ] Image magnify: click magnify button via `ImageMagnifyPlugin` opens preview modal

### Wikilink Drag-Drop into Editor
- [ ] Drop with WIKILINK_MIME type inserts `[[...]]` reference at drop position

### Find Bar (`FindBar.tsx`)
- [ ] Opens via `Ctrl+F` (global shortcut)
- [ ] Input auto-focused on open
- [ ] Typing updates query and highlights matches via `FindHighlightPlugin`
- [ ] Shows "N of M" match counter
- [ ] Shows "No results" if query present but no matches
- [ ] Next button (`Enter`) advances to next match
- [ ] Previous button (`Shift+Enter`) goes to previous match
- [ ] Next/prev disabled when totalMatches === 0
- [ ] Close button closes find bar
- [ ] `Escape` closes find bar (global handler)

### Raw Mode (`RawEditor.tsx`, `RawModeToggle.tsx`)
- [ ] Toggle button switches between TipTap and raw markdown textarea
- [ ] Active state: `bg-blue-100 text-blue-600`; inactive: `text-gray-400`
- [ ] Title: "Switch to editor" or "View source"
- [ ] Raw textarea: monospace, spellcheck disabled, resize-y
- [ ] 300ms debounce save on raw input
- [ ] `onCleanup` flushes pending saves
- [ ] Path change flushes pending save before loading new content
- [ ] `Tab` with no selection (or single-line selection) inserts 2 spaces at cursor
- [ ] `Shift+Tab` with no selection removes leading 2 spaces (or single tab) from current line
- [ ] `Tab` with selection spanning multiple lines indents every touched line by 2 spaces and preserves the selection
- [ ] `Shift+Tab` with selection spanning multiple lines outdents every touched line (strips leading 2 spaces or tab where present) and preserves the selection

---

## 6. Content Promotion (Extract)

Source: `src/components/editor/Editor.tsx`, `PromoteConfirmBar.tsx`

- [ ] Select text → click Extract in bubble menu (or `/` command menu) → starts promote flow
- [ ] Selection that crosses a newline (multi-line) extracts exactly the highlighted span; title is the first selected line (with leading `#`/`-`/`*`/`>`/`N.` markers stripped)
- [ ] Cursor-only or single-line selection falls back to block auto-detect (enclosing list item, heading section, or paragraph)
- [ ] `PromoteHighlightPlugin` marks selected range with decoration
- [ ] Confirm bar appears below highlighted range (`animate-bubble-up`, max-width 448px)
- [ ] Slug input field accepts text
- [ ] Topic chip toggle buttons add/remove topics (selected: `bg-blue-100`, unselected: `bg-gray-100`)
- [ ] "Task" button (blue-600) promotes to task
- [ ] "Doc" button (indigo-600) promotes to doc
- [ ] "Note" button (emerald-600) promotes to note
- [ ] Promote creates entity, copies images if needed, replaces selected range with wikilink
- [ ] Close button (×) cancels promote
- [ ] `Escape` cancels promote
- [ ] `Enter` in slug input does not commit (no-op)

---

## 6.5. Rename / Convert

Source: `src/components/buttons/RenameConvertButton.tsx`, `src/components/modals/RenameConvertModal.tsx`, `src/services/RenameService.ts`

- [ ] Pencil icon button rendered next to the trash icon on doc, task, and named-note views (hidden on daily notes — `note.isDaily === true`)
- [ ] Click opens "Rename / Convert" modal
- [ ] Type radio: Task / Doc / Note (defaults to current type)
- [ ] Slug input (defaults to current slug; for notes, the part after the date prefix)
- [ ] Date input (only when type = Note; defaults to current date for notes, today otherwise)
- [ ] Live preview shows target file path; if backlinks exist, shows count of inbound references that will be updated
- [ ] Action button label: "Rename" when type unchanged, "Convert" when changing type
- [ ] Submit moves the file to its new location, rewrites all `[[type:slug]]` references in other files (skipping fenced code blocks), and navigates to the new entity
- [ ] Source-type-only frontmatter is stashed under `_<sourceType>` (e.g. `_task: { status, due }`) so a round-trip restores the original
- [ ] Slug collision returns "An entity already exists at that location" without deleting the source
- [ ] Cancel / Escape / click-outside dismisses without changes

---

## 7. Doc View

Source: `src/components/docs/DocView.tsx`

- [ ] Title: inline editable (`EditableText`), click to edit, Enter/blur saves, Escape cancels
- [ ] Wikilink slug displayed (copyable code block)
- [ ] Topics: inline editable (`EditableTopics`), click to edit, comma/space-separated, autocomplete
- [ ] Title row: title + slug on left; Raw-mode toggle + Delete trash icon right-aligned
- [ ] Topics row: topics on left; Created date right-aligned (read-only)
- [ ] Action row: Pin button (left)
- [ ] Pin button toggles `pinned` frontmatter field
- [ ] Pin visual: amber + filled star when pinned; gray + outline star when unpinned
- [ ] Raw mode toggle (same behavior/placement as tasks)
- [ ] Delete trash icon (gray, red on hover) opens confirm modal; confirm deletes entity
- [ ] Editor content debounce-saved (300ms)
- [ ] `onCleanup` flushes pending save
- [ ] Mode switch flushes saves before toggling

---

## 8. Task Detail

Source: `src/components/tasks/TaskDetail.tsx`

- [ ] Title: inline editable (`EditableText`)
- [ ] Topics: inline editable (`EditableTopics`)
- [ ] Due date: inline editable (`EditableDate`) with native date picker
- [ ] Wikilink slug displayed
- [ ] Status badge: color-coded (blue=open, green=done, gray=cancelled)
- [ ] Title row: title + slug on left; Raw-mode toggle + Delete trash icon right-aligned
- [ ] Topics row: topics on left; Created date right-aligned (read-only)
- [ ] Status/action row: status pill + Due date on left; status change buttons right-aligned
- [ ] Pin toggle button (amber when pinned, gray otherwise) sets/clears `pinned` frontmatter; available regardless of status
- [ ] Open task: "Mark Done" button (green), "Cancel" button (gray)
- [ ] Done/cancelled task: "Reopen" button (blue)
- [ ] Status change updates frontmatter
- [ ] Raw mode toggle (same behavior/placement as docs)
- [ ] Delete trash icon (gray, red on hover) opens confirm modal; confirm deletes
- [ ] Editor content debounce-saved (300ms)
- [ ] `onCleanup` flushes pending save
- [ ] Autofocus on editor when created from draft (`consumeAutofocus()`)

---

## 9. Task List (Right Panel)

Source: `src/components/layout/RightPanel.tsx`, `src/components/tasks/TaskItem.tsx`, `TaskGroup.tsx`, `ClosedTaskItem.tsx`

### Panel Controls
- [ ] Open / Pinned / Closed filter tabs switch between active, pinned-focus, and closed task lists (active tab highlighted)
- [ ] `+` button starts task draft creation (always visible, regardless of active filter)
- [ ] Pinned view: open tasks with `pinned: true`, grouped by due date; empty-state message when none are pinned

### Open Task Item (`TaskItem.tsx`)
- [ ] Checkbox click: 600ms delay before marking done (visual feedback: `bg-green-50` opacity-60)
- [ ] Checkbox mousedown: `stopPropagation` prevents task click
- [ ] Pin toggle button: amber/filled and always visible when pinned; gray outline on row hover otherwise; click toggles `pinned` frontmatter (`stopPropagation`)
- [ ] Title click navigates to task detail
- [ ] Due date shown on right if present
- [ ] Draggable: `onDragStart` sets WIKILINK_MIME data

### Closed Task Item (`ClosedTaskItem.tsx`)
- [ ] Status indicator: ✓ (green-400 if done) or ✕ (red-300 if cancelled)
- [ ] Title shown with strikethrough, muted color
- [ ] Reopen button visible on hover; click sets status to "open" (stopPropagation)
- [ ] Draggable: same WIKILINK_MIME drag data

### Task Groups (`TaskGroup.tsx`)
- [ ] Section header with label (uppercase, small caps)
- [ ] Only renders if group has tasks
- [ ] Task click within group navigates to task detail

---

## 10. Topic / Person View

Source: `src/components/topics/TopicView.tsx`

- [ ] Topic label displayed as h1
- [ ] Kind badge: "Topic" or "Person" with reference count
- [ ] Optional note text displayed

### Pinned Doc Section
- [ ] Blue-highlighted button showing pinned doc
- [ ] Click navigates to doc
- [ ] Preview excerpt (first 3 lines)

### Open Tasks Section
- [ ] List of related open tasks
- [ ] Click task navigates to task detail
- [ ] Context lines shown (lines containing topic ref, max 3, stripped of markdown)
- [ ] Due date shown if present

### Closed Tasks Section
- [ ] List of related tasks with status `done` or `cancelled`, shown below Open Tasks
- [ ] Section appears only when at least one closed task matches
- [ ] Title rendered with strikethrough + muted color (`line-through text-gray-400 dark:text-gray-500`)
- [ ] Click task navigates to task detail
- [ ] Context lines shown
- [ ] Due date intentionally not shown (closed)

### Notes Section
- [ ] Reverse chronological order
- [ ] Click note navigates to note
- [ ] Shows date and title (or "Daily note" if unnamed)
- [ ] Context lines shown

### Docs Section
- [ ] Alphabetical order by title
- [ ] Click doc navigates to doc view
- [ ] Context lines shown

---

## 11. Search View

Source: `src/components/search/SearchView.tsx`

- [ ] Query input auto-focused on mount
- [ ] Typing updates query; search fires after 200ms debounce
- [ ] Minimum 2 characters to trigger search
- [ ] `Escape` in input navigates home
- [ ] Filter tabs: All / Notes / Tasks / Docs / Images
- [ ] Click tab sets active filter (active: `bg-blue-100 text-blue-700`)
- [ ] "Images" filter shows image grid instead of text results
- [ ] Result click navigates to entity
- [ ] Result shows type badge (color-coded), title, date, first matched line
- [ ] Closed task results render the title with strikethrough + muted color (`line-through text-gray-400 dark:text-gray-500`)
- [ ] Results divided by `border-gray-100`

---

## 12. Draft Creation

Source: `src/components/draft/DraftView.tsx`

- [ ] Title input auto-focused on mount
- [ ] Placeholder: "Document title..." (doc) or "Task title..." (task)
- [ ] `Enter` commits (creates entity, navigates to it, sets autofocus flag)
- [ ] `Escape` (capture-phase global listener) cancels draft if not yet committed
- [ ] Blur on input auto-commits if title is non-empty
- [ ] Empty title on commit is rejected (no-op)
- [ ] Error on creation resets committed flag for retry

### Task Template Slash Menu (task drafts only)
- [ ] Hint "· Type / for templates" appears in the help line under the title for `type === "task"` drafts
- [ ] Typing `/` while editing the title opens an inline slash menu below the title input (`[data-slash-menu]`)
- [ ] Menu lists existing templates (sorted by display name) plus a "Manage templates…" entry at the bottom
- [ ] Characters typed after `/` filter the template list by display-name substring match (case-insensitive)
- [ ] A space after `/`, backspacing past the `/`, or moving the caret before the `/` closes the menu
- [ ] ArrowUp / ArrowDown moves the highlighted item; Enter or Tab selects it
- [ ] Escape closes the menu without cancelling the draft (a second Escape cancels)
- [ ] Click on a menu item selects it; click outside (other than on the input itself) closes the menu
- [ ] Selecting a template strips the `/<filter>` token from the title and shows a "Template: <name> ✕" chip below the input
- [ ] Chip's ✕ button (aria-label "Clear template") clears the applied template
- [ ] On commit, the applied template's body is used as the new task's content
- [ ] Selecting "Manage templates…" cancels the draft and navigates to the templates view
- [ ] Slash menu is not rendered for doc drafts

---

## 12.5. Templates

Source: `src/components/templates/TemplatesView.tsx`, `src/services/TemplateService.ts`

Storage: markdown files at `${rootPath}/.templates/tasks/<slug>.md`. Filename slug is the template id; display name is derived from it (`meeting-prep` → "Meeting prep"). Templates are not entities — they're loaded into `indexStore.templates` separately and never appear in the main task/note/doc lists, search, or topics.

- [ ] Reached only via the "Manage templates…" entry in the new-task slash menu (no sidebar/header button)
- [ ] Header shows "Templates" title, "+ New template" button, and a back-to-home link
- [ ] Empty state shows "No templates yet…" placeholder
- [ ] Each template row shows display name and a 1-line content preview
- [ ] Hovering a template row reveals Edit/Delete actions
- [ ] Clicking a row (or its Edit action) opens the inline editor for that template
- [ ] "+ New template" opens a blank inline editor
- [ ] Editor pane has a name input, a TipTap editor (reused from doc editing), and explicit Save/Cancel buttons
- [ ] Templates do NOT auto-save on keystroke — only Save commits
- [ ] Saving a renamed template moves the file on disk to the new slug
- [ ] Delete prompts a confirmation modal; deleting does not affect tasks already created from the template
- [ ] File watcher events under `.templates/` are routed to `IndexService.invalidateTemplates`, so templates stay in sync if files are edited externally

---

## 13. Modals

### Confirm Delete Modal (`ConfirmDeleteModal.tsx`)
- [ ] Fixed overlay with `black/40` backdrop
- [ ] Centered dialog
- [ ] Cancel button closes modal
- [ ] Delete button confirms deletion
- [ ] Click on backdrop (outside dialog) closes modal

### Keyboard Shortcuts Modal (`KeyboardShortcutsModal.tsx`)
- [ ] Fixed overlay with `black/40` backdrop
- [ ] Centered, max-width lg
- [ ] Shortcuts grouped by category: Global, Editor
- [ ] `Escape` closes modal (preventDefault)
- [ ] `?` toggles modal (handled by global shortcut in capture phase)
- [ ] Click on backdrop closes modal
- [ ] Keyboard keys shown as `kbd` elements

---

## 14. Navigation & History

Source: `src/App.tsx`, `src/services/NavigationService.ts`

- [ ] Browser back/forward traverses entity view history
- [ ] Entity focus (e.g., click card in journal) pushes to history
- [ ] Entity navigate (e.g., click task in sidebar) pushes to history
- [ ] Home state restoration on back to initial state
- [ ] Today button while on journal resets to home state

---

## 15. Backlinks

Source: `src/components/layout/RightPanel.tsx`

- [ ] Backlinks section shown in right panel for non-note entities (docs, tasks, topics)
- [ ] Each backlink shows source entity info
- [ ] Click backlink navigates to source entity
- [ ] Backlink whose source is a closed task renders the source title with strikethrough + muted color (`line-through text-gray-400 dark:text-gray-500`)

---

## 16. Image Preview

Source: `src/components/shared/ImagePreview.tsx`

- [ ] Opens from magnify button on images in editor
- [ ] Fixed overlay with `black/70` backdrop
- [ ] Image centered (max 90vh height, 90vw width)
- [ ] Close button (top-right, semi-transparent background)
- [ ] `Escape` closes preview (capture phase, preventDefault, stopPropagation)
- [ ] Click backdrop (outside image) closes preview
- [ ] Click on image does not close (stopPropagation)

---

## 17. Quick Capture

Source: `src/App.tsx` (modal trigger)

- [ ] `Ctrl+N` / `Cmd+N` opens modal
- [ ] Text input for quick note content
- [ ] `Enter` saves note
- [ ] `Shift+Enter` inserts newline
- [ ] `Escape` closes without saving

---

## 18. Metadata Editing Components

Source: `src/components/metadata/`

### EditableText (`EditableText.tsx`)
- [ ] Click span starts edit mode
- [ ] Hover shows underline decoration (`hover:underline hover:decoration-gray-300`)
- [ ] Input shows blue border focus ring
- [ ] `Enter` saves if changed and non-empty
- [ ] `Escape` cancels edit
- [ ] Blur saves if changed and non-empty
- [ ] Unchanged value on blur does not trigger save

### EditableDate (`EditableDate.tsx`)
- [ ] Click label starts edit mode
- [ ] Native `type="date"` input with date picker
- [ ] `onChange` saves immediately
- [ ] `Escape` cancels edit
- [ ] Blur saves if changed
- [ ] Shows "No due date" when empty

### EditableTopics (`EditableTopics.tsx`)
- [ ] Click chip area or "+ Add topics" starts edit mode
- [ ] Comma/space-separated input (e.g., `#topic1, @person`)
- [ ] Auto-prefix `#` if missing on plain words
- [ ] Validation: `/^[#@][a-z0-9-]+$/i`
- [ ] `#` or `@` during edit triggers autocomplete at cursor position
- [ ] Autocomplete suggestion click replaces current token
- [ ] Cursor repositioned after inserted ref
- [ ] `Enter` saves
- [ ] `Escape` cancels
- [ ] Blur saves (blocked while autocomplete is open)

---

## Source File Reference

| Area | Files |
|------|-------|
| Global shortcuts | `src/App.tsx` |
| Layout & resize | `src/components/layout/Layout.tsx`, `ResizeHandle.tsx` |
| Left sidebar | `src/components/layout/LeftSidebar.tsx` |
| Calendar | `src/components/sidebar/CalendarPicker.tsx` |
| Topics/Docs lists | `src/components/sidebar/TopicsList.tsx`, `TopicItem.tsx`, `DocsList.tsx` |
| Journal | `src/components/journal/JournalView.tsx`, `MonthBar.tsx`, `DateHeader.tsx`, `DailyNote.tsx`, `NamedNoteCard.tsx` |
| Editor core | `src/components/editor/ProseEditor.tsx`, `Editor.tsx` |
| Editor UI | `BubbleMenu.tsx`, `CommandMenu.tsx`, `TopicAutocomplete.tsx`, `WikilinkAutocomplete.tsx`, `TableToolbar.tsx`, `FindBar.tsx`, `TodoCheckbox.tsx`, `RawEditor.tsx`, `RawModeToggle.tsx` |
| Promote | `src/components/editor/PromoteConfirmBar.tsx` |
| Docs | `src/components/docs/DocView.tsx` |
| Tasks | `src/components/tasks/TaskItem.tsx`, `TaskDetail.tsx`, `TaskGroup.tsx`, `ClosedTaskItem.tsx` |
| Topics | `src/components/topics/TopicView.tsx` |
| Search | `src/components/search/SearchView.tsx` |
| Drafts | `src/components/draft/DraftView.tsx` |
| Metadata | `src/components/metadata/EditableText.tsx`, `EditableDate.tsx`, `EditableTopics.tsx` |
| Modals | `src/components/modals/ConfirmDeleteModal.tsx`, `KeyboardShortcutsModal.tsx` |
| Image preview | `src/components/shared/ImagePreview.tsx` |
| Right panel | `src/components/layout/RightPanel.tsx` |
