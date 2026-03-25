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
- [ ] Pinned docs show pin indicator

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
- [ ] Click outside closes bubble menu
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
- [ ] Available commands: Extract, H1, H2, H3, Bullet list, Ordered list, Code block, Bold, Italic, Divider

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

### Lists
- [ ] `Tab` indents list item
- [ ] `Shift+Tab` outdents list item
- [ ] `Alt+Up` reorders list item up (if supported by extension)
- [ ] `Alt+Down` reorders list item down (if supported by extension)

### TODO Checkbox (`TodoCheckbox.tsx`)
- [ ] Click cycles state: TODO → DOING → DONE → TODO
- [ ] Additional states: WAITING, LATER
- [ ] Click: `preventDefault`, `stopPropagation`, fires `onCycle`
- [ ] Unicode icons: ☐ (TODO), ▣ (DOING), ⊡ (WAITING), ▢ (LATER), ☑ (DONE)
- [ ] Colors: gray-400 (TODO), blue-500 (DOING), amber-500 (WAITING), purple-500 (LATER), green-500 (DONE)

### Wikilinks (InlineDecorations)
- [ ] Wikilink renders as inline widget when cursor is not inside it
- [ ] `Cmd+Click` / `Ctrl+Click` on wikilink navigates to target entity
- [ ] Wikilink drag sets WIKILINK_MIME data for drag-drop

### Markdown Links (InlineDecorations)
- [ ] Markdown links render as inline decoration
- [ ] `Cmd+Click` / `Ctrl+Click` opens link in browser
- [ ] Native `<a>` clicks captured and prevented (capture-phase DOM listener on container)

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

---

## 6. Content Promotion (Extract)

Source: `src/components/editor/Editor.tsx`, `PromoteConfirmBar.tsx`

- [ ] Select text → click Extract in bubble menu (or `/` command menu) → starts promote flow
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

## 7. Doc View

Source: `src/components/docs/DocView.tsx`

- [ ] Title: inline editable (`EditableText`), click to edit, Enter/blur saves, Escape cancels
- [ ] Wikilink slug displayed (copyable code block)
- [ ] Topics: inline editable (`EditableTopics`), click to edit, comma/space-separated, autocomplete
- [ ] Created date displayed (read-only)
- [ ] Pin button toggles `pinned` frontmatter field
- [ ] Pin visual: amber + filled star when pinned; gray + outline star when unpinned
- [ ] Raw mode toggle (same behavior as notes/tasks)
- [ ] Delete button (red) opens confirm modal; confirm deletes entity
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
- [ ] Open task: "Mark Done" button (green), "Cancel" button (gray)
- [ ] Done/cancelled task: "Reopen" button (blue)
- [ ] Status change updates frontmatter
- [ ] Raw mode toggle
- [ ] Delete button (red) opens confirm modal; confirm deletes
- [ ] Editor content debounce-saved (300ms)
- [ ] `onCleanup` flushes pending save
- [ ] Autofocus on editor when created from draft (`consumeAutofocus()`)

---

## 9. Task List (Right Panel)

Source: `src/components/layout/RightPanel.tsx`, `src/components/tasks/TaskItem.tsx`, `TaskGroup.tsx`, `ClosedTaskItem.tsx`

### Panel Controls
- [ ] Open/Closed toggle switches between active and closed task lists
- [ ] `+` button starts task draft creation

### Open Task Item (`TaskItem.tsx`)
- [ ] Checkbox click: 600ms delay before marking done (visual feedback: `bg-green-50` opacity-60)
- [ ] Checkbox mousedown: `stopPropagation` prevents task click
- [ ] Cancel button (X) visible on hover; click marks as cancelled (visual: `bg-gray-50` opacity-60)
- [ ] Cancel button click: `stopPropagation`
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
- [ ] Shortcuts grouped by category: Navigation, Editor, Command Menu
- [ ] `Escape` closes modal (preventDefault)
- [ ] `?` closes modal (preventDefault)
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
| Editor UI | `BubbleMenu.tsx`, `CommandMenu.tsx`, `TopicAutocomplete.tsx`, `FindBar.tsx`, `TodoCheckbox.tsx`, `RawEditor.tsx`, `RawModeToggle.tsx` |
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
