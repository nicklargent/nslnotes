# NslNotes — EARS Requirements Specification

**Version 1.0 — March 2026**
**Derived from PRD v0.2**

This document specifies functional and non-functional requirements using the Easy Approach to Requirements Syntax (EARS). Each requirement includes acceptance criteria for verification.

---

## Table of Contents

1. [File Storage & Data Model](#1-file-storage--data-model-fr-fs)
2. [Entity Behaviors](#2-entity-behaviors-fr-ent)
3. [Editor Model](#3-editor-model-fr-ed)
4. [UI Layout](#4-ui-layout-fr-ui)
5. [Context & Relevance](#5-context--relevance-fr-ctx)
6. [Navigation](#6-navigation-fr-nav)
7. [Interaction Flows](#7-interaction-flows-fr-int)
8. [Non-Functional Requirements](#8-non-functional-requirements-nfr)

---

## 1. File Storage & Data Model (FR-FS)

### 1.1 Root Directory Configuration

**FR-FS-001** The system shall allow the user to configure the root storage directory path.

_Acceptance Criteria:_
- [ ] User can specify a custom root directory path during initial setup
- [ ] The configured path persists across application restarts
- [ ] The system validates that the specified path is writable
- [ ] The system creates required subdirectories if they do not exist

---

**FR-FS-002** When the application starts, the system shall verify the configured root directory exists and is accessible.

_Acceptance Criteria:_
- [ ] Application checks read/write permissions on startup
- [ ] Application displays an error message if directory is inaccessible
- [ ] Application provides option to reconfigure the path if inaccessible

---

### 1.2 Directory Structure

**FR-FS-010** The system shall maintain a `notes/` subdirectory within the root directory for all note files.

_Acceptance Criteria:_
- [ ] Directory is created if it does not exist
- [ ] All note files (daily and named) are stored in this directory
- [ ] No subdirectories are created within `notes/`

---

**FR-FS-011** The system shall maintain a `tasks/` subdirectory within the root directory for all task files.

_Acceptance Criteria:_
- [ ] Directory is created if it does not exist
- [ ] All task files are stored in this directory
- [ ] No subdirectories are created within `tasks/`

---

**FR-FS-012** The system shall maintain a `docs/` subdirectory within the root directory for all document files.

_Acceptance Criteria:_
- [ ] Directory is created if it does not exist
- [ ] All doc files are stored in this directory
- [ ] No subdirectories are created within `docs/`

---

**FR-FS-013** The system shall support an optional `topics.yaml` file in the root directory for topic decoration.

_Acceptance Criteria:_
- [ ] System operates identically whether or not `topics.yaml` exists
- [ ] File is not created automatically by the system
- [ ] System reads the file on startup and monitors for changes

---

### 1.3 File Naming Conventions

**FR-FS-020** The system shall name daily note files using the pattern `YYYY-MM-DD.md`.

_Acceptance Criteria:_
- [ ] Date format follows ISO 8601 (four-digit year, two-digit month, two-digit day)
- [ ] Leading zeros are always present (e.g., `2026-03-09.md`, not `2026-3-9.md`)
- [ ] File is stored in the `notes/` directory

---

**FR-FS-021** The system shall name named note files using the pattern `YYYY-MM-DD-slug.md`.

_Acceptance Criteria:_
- [ ] Date prefix follows ISO 8601 format
- [ ] Slug is separated from date by a single hyphen
- [ ] Slug follows kebab-case convention (lowercase, hyphens between words)
- [ ] File is stored in the `notes/` directory

---

**FR-FS-022** The system shall name task files using the pattern `slug.md`.

_Acceptance Criteria:_
- [ ] Slug is auto-generated from the task title
- [ ] Slug follows kebab-case convention
- [ ] File is stored in the `tasks/` directory

---

**FR-FS-023** The system shall name doc files using the pattern `slug.md`.

_Acceptance Criteria:_
- [ ] Slug is auto-generated from the doc title
- [ ] Slug follows kebab-case convention
- [ ] File is stored in the `docs/` directory

---

### 1.4 Slug Generation

**FR-FS-030** When generating a slug from a title, the system shall convert the title to kebab-case.

_Acceptance Criteria:_
- [ ] All characters are converted to lowercase
- [ ] Spaces are replaced with hyphens
- [ ] Special characters are removed
- [ ] Multiple consecutive hyphens are collapsed to a single hyphen
- [ ] Leading and trailing hyphens are removed

---

**FR-FS-031** When a generated slug would collide with an existing file, the system shall append an incrementing number suffix.

_Acceptance Criteria:_
- [ ] First collision appends `-2` (e.g., `fix-auth-bug-2.md`)
- [ ] Subsequent collisions increment the number (`-3`, `-4`, etc.)
- [ ] The original file without a suffix is never modified
- [ ] Number suffix is separated from slug by a hyphen

---

### 1.5 Frontmatter Schemas

**FR-FS-040** The system shall require note files to contain YAML frontmatter with `type: note` and `date: YYYY-MM-DD` fields.

_Acceptance Criteria:_
- [ ] Files without `type: note` are not recognized as notes
- [ ] Files without a valid `date` field are not recognized as notes
- [ ] Date follows ISO 8601 format
- [ ] Frontmatter is delimited by `---` markers

---

**FR-FS-041** The system shall support an optional `title` field in note frontmatter for named notes.

_Acceptance Criteria:_
- [ ] Daily notes (no slug in filename) have no `title` field
- [ ] Named notes have a `title` field matching the human-readable title
- [ ] Title field is a string value

---

**FR-FS-042** The system shall support an optional `topics` array field in note frontmatter.

_Acceptance Criteria:_
- [ ] Topics array contains string values with `#` or `@` prefixes
- [ ] Empty array or omitted field is valid
- [ ] Array uses YAML list syntax

---

**FR-FS-050** The system shall require task files to contain YAML frontmatter with `type: task`, `status`, and `created` fields.

_Acceptance Criteria:_
- [ ] `type` must be `task`
- [ ] `status` must be one of: `open`, `done`, `cancelled`
- [ ] `created` must be a valid ISO 8601 date
- [ ] Files missing required fields are not recognized as tasks

---

**FR-FS-051** The system shall support an optional `due` date field in task frontmatter.

_Acceptance Criteria:_
- [ ] Due date follows ISO 8601 format
- [ ] Field may be omitted for tasks without a due date
- [ ] Invalid date formats are rejected

---

**FR-FS-052** The system shall support an optional `topics` array field in task frontmatter.

_Acceptance Criteria:_
- [ ] Topics array contains string values with `#` or `@` prefixes
- [ ] Empty array or omitted field is valid

---

**FR-FS-060** The system shall require doc files to contain YAML frontmatter with `type: doc`, `title`, and `created` fields.

_Acceptance Criteria:_
- [ ] `type` must be `doc`
- [ ] `title` must be a non-empty string
- [ ] `created` must be a valid ISO 8601 date
- [ ] Files missing required fields are not recognized as docs

---

**FR-FS-061** The system shall support an optional `topics` array field in doc frontmatter.

_Acceptance Criteria:_
- [ ] Topics array contains string values with `#` or `@` prefixes
- [ ] Empty array or omitted field is valid

---

### 1.6 topics.yaml Schema

**FR-FS-070** The system shall parse `topics.yaml` entries with `id`, `label`, `note`, and `archived` fields.

_Acceptance Criteria:_
- [ ] `id` is required and must include `#` or `@` prefix
- [ ] `label` is optional; provides human-readable display name
- [ ] `note` is optional; provides descriptive text
- [ ] `archived` is optional; boolean value (out of scope for v1 display logic)

---

**FR-FS-071** When a topic referenced in files is not present in `topics.yaml`, the system shall display its raw ID.

_Acceptance Criteria:_
- [ ] Topic functions identically to topics with entries in `topics.yaml`
- [ ] Raw ID (e.g., `#architecture-practice`) is displayed as the label
- [ ] No error or warning is generated

---

---

## 2. Entity Behaviors (FR-ENT)

### 2.1 Note Behaviors

**FR-ENT-001** When the user navigates to today's date with no existing daily note file, the system shall render an editable surface without creating a file on disk.

_Acceptance Criteria:_
- [ ] Journal view shows editable area for today
- [ ] No file exists at `notes/YYYY-MM-DD.md` until first keystroke
- [ ] Editable surface is indistinguishable from existing notes

---

**FR-ENT-002** When the user types the first character in a new daily note, the system shall create the `notes/YYYY-MM-DD.md` file on disk.

_Acceptance Criteria:_
- [ ] File is created immediately upon first keystroke
- [ ] File contains valid frontmatter with `type: note` and `date` fields
- [ ] Subsequent keystrokes update the existing file

---

**FR-ENT-003** When the user creates a named note with a title, the system shall create a file at `notes/YYYY-MM-DD-slug.md`.

_Acceptance Criteria:_
- [ ] Slug is generated from the provided title
- [ ] Frontmatter includes `type: note`, `date`, and `title` fields
- [ ] File is created immediately upon confirmation

---

**FR-ENT-004** When a named note is created with topics or people, the system shall populate the `topics` array in frontmatter.

_Acceptance Criteria:_
- [ ] Topics and people specified at creation are saved to frontmatter
- [ ] Array format matches schema (`[#topic, @person]`)
- [ ] Empty array is not written if no topics are specified

---

### 2.2 Task Behaviors

**FR-ENT-010** When the user creates a task directly, the system shall create a file at `tasks/slug.md` with required frontmatter.

_Acceptance Criteria:_
- [ ] File contains `type: task`, `status: open`, and `created` date
- [ ] Slug is generated from the task title
- [ ] Optional `due` and `topics` fields are included if provided

---

**FR-ENT-011** When a task is marked as done, the system shall update the `status` field to `done` in the file.

_Acceptance Criteria:_
- [ ] Frontmatter `status` value changes from `open` to `done`
- [ ] File content is preserved
- [ ] Change is persisted to disk immediately

---

**FR-ENT-012** When a task is cancelled, the system shall update the `status` field to `cancelled` in the file.

_Acceptance Criteria:_
- [ ] Frontmatter `status` value changes from `open` to `cancelled`
- [ ] File content is preserved
- [ ] Change is persisted to disk immediately

---

**FR-ENT-013** When a task is marked done or cancelled in the UI, the system shall display the task briefly before removing it from the open tasks list.

_Acceptance Criteria:_
- [ ] Visual feedback indicates the task state change
- [ ] Task remains visible for a brief delay (approximately 1-2 seconds)
- [ ] Task is then removed from the open tasks list
- [ ] Task file remains on disk with updated status

---

**FR-ENT-014** The system shall display tasks with status `open` in the right panel task list.

_Acceptance Criteria:_
- [ ] Tasks with `status: done` are not displayed
- [ ] Tasks with `status: cancelled` are not displayed
- [ ] Only files with `type: task` are included

---

### 2.3 Doc Behaviors

**FR-ENT-020** When the user creates a doc, the system shall create a file at `docs/slug.md` with required frontmatter.

_Acceptance Criteria:_
- [ ] File contains `type: doc`, `title`, and `created` date
- [ ] Slug is generated from the doc title
- [ ] Optional `topics` field is included if provided

---

**FR-ENT-021** The system shall display docs alphabetically by title in the left sidebar Docs section.

_Acceptance Criteria:_
- [ ] Sort is case-insensitive alphabetical
- [ ] All files with `type: doc` are included
- [ ] Sort order updates when docs are added or renamed

---

### 2.4 Topic Behaviors

**FR-ENT-030** When a `#topic` or `@person` reference appears for the first time in any frontmatter or inline content, the system shall recognize it as an existing topic.

_Acceptance Criteria:_
- [ ] No explicit registration or creation step is required
- [ ] Topic is immediately available for autocomplete
- [ ] Topic appears in sidebar if it meets active criteria

---

**FR-ENT-031** The system shall consider a topic active if it appears in any open task OR in any note or doc created or modified within the last 90 days.

_Acceptance Criteria:_
- [ ] 90-day threshold is fixed (not configurable)
- [ ] "Modified" refers to file modification timestamp
- [ ] Open task association makes topic active regardless of recency
- [ ] Active topics appear in the sidebar Topics section

---

**FR-ENT-032** When a topic does not meet active criteria, the system shall classify it as dormant.

_Acceptance Criteria:_
- [ ] Dormant topics do not appear in the default sidebar Topics list
- [ ] Dormant topics do not appear in default autocomplete suggestions
- [ ] Dormant topics remain searchable and filterable
- [ ] Dormant topics are fully functional when referenced directly

---

**FR-ENT-033** The system shall treat `#` prefixed topics and `@` prefixed people identically for query and weighting behavior.

_Acceptance Criteria:_
- [ ] Both prefixes use the same relevance algorithm
- [ ] Both prefixes support the same operations (linking, filtering, viewing)
- [ ] Only presentation differs (rendering style, autocomplete grouping)

---

### 2.5 Todo Inline Syntax

**FR-ENT-040** The system shall recognize `- TODO` prefix as an incomplete todo item.

_Acceptance Criteria:_
- [ ] Recognition works in any note, task, or doc body content
- [ ] Prefix must be at the start of a list item (after `- `)
- [ ] Recognized items render with unchecked visual indicator

---

**FR-ENT-041** The system shall recognize `- DOING` prefix as an in-progress todo item.

_Acceptance Criteria:_
- [ ] Recognition works in any note, task, or doc body content
- [ ] Prefix must be at the start of a list item
- [ ] Recognized items render with in-progress visual indicator

---

**FR-ENT-042** The system shall recognize `- DONE` prefix as a completed todo item.

_Acceptance Criteria:_
- [ ] Recognition works in any note, task, or doc body content
- [ ] Prefix must be at the start of a list item
- [ ] Recognized items render with completed visual indicator (strikethrough or checkmark)

---

**FR-ENT-043** When the user clicks a todo item, the system shall cycle its state: TODO → DOING → DONE → TODO.

_Acceptance Criteria:_
- [ ] Click toggles to next state in cycle
- [ ] Prefix text in file is updated (`TODO` → `DOING` → `DONE` → `TODO`)
- [ ] Change is persisted to disk

---

---

## 3. Editor Model (FR-ED)

### 3.1 Editor Modes

**FR-ED-001** The system shall provide two editor modes: Outliner and Prose.

_Acceptance Criteria:_
- [ ] Both modes are available for all editable file types
- [ ] Mode toggle is visible in the editor toolbar
- [ ] Mode selection is persisted per editing session

---

**FR-ED-002** When a note file is opened, the system shall default to Outliner mode.

_Acceptance Criteria:_
- [ ] Both daily and named notes open in Outliner mode
- [ ] Previous mode selection is not persisted across file opens
- [ ] User can toggle to Prose mode after opening

---

**FR-ED-003** When a task file is opened, the system shall default to Outliner mode.

_Acceptance Criteria:_
- [ ] Task opens in Outliner mode regardless of previous mode selection
- [ ] User can toggle to Prose mode after opening

---

**FR-ED-004** When a doc file is opened, the system shall default to Prose mode.

_Acceptance Criteria:_
- [ ] Doc opens in Prose mode regardless of previous mode selection
- [ ] User can toggle to Outliner mode after opening

---

**FR-ED-005** When the user toggles editor mode, the system shall switch modes without content loss.

_Acceptance Criteria:_
- [ ] All content is preserved when switching modes
- [ ] Formatting is preserved (indentation, headers, lists)
- [ ] Switch is instantaneous with no processing delay

---

### 3.2 Outliner Mode Behaviors

**FR-ED-010** While in Outliner mode, the system shall render content as a navigable block tree.

_Acceptance Criteria:_
- [ ] Each list item is a selectable block
- [ ] Indentation levels are visually distinct
- [ ] Blocks with children show collapse/expand affordance

---

**FR-ED-011** While in Outliner mode, when the user presses Tab, the system shall indent the current block and its children.

_Acceptance Criteria:_
- [ ] Block moves one indentation level deeper
- [ ] All child blocks maintain relative indentation
- [ ] Markdown list syntax is updated on disk

---

**FR-ED-012** While in Outliner mode, when the user presses Shift+Tab, the system shall outdent the current block and its children.

_Acceptance Criteria:_
- [ ] Block moves one indentation level shallower
- [ ] Cannot outdent beyond root level
- [ ] All child blocks maintain relative indentation

---

**FR-ED-013** While in Outliner mode, when the user presses Alt+Up, the system shall move the current block and its children up within the same parent.

_Acceptance Criteria:_
- [ ] Block swaps position with preceding sibling
- [ ] Cannot move past first sibling position
- [ ] All child blocks move with the parent

---

**FR-ED-014** While in Outliner mode, when the user presses Alt+Down, the system shall move the current block and its children down within the same parent.

_Acceptance Criteria:_
- [ ] Block swaps position with following sibling
- [ ] Cannot move past last sibling position
- [ ] All child blocks move with the parent

---

**FR-ED-015** While in Outliner mode, when the user presses Enter, the system shall create a new block at the same indentation level.

_Acceptance Criteria:_
- [ ] New block appears below current block
- [ ] Cursor moves to new block
- [ ] New block inherits parent context but not content

---

**FR-ED-016** While in Outliner mode, when the user presses Shift+Enter, the system shall insert a line break within the current block.

_Acceptance Criteria:_
- [ ] Content remains in same block
- [ ] Multi-line content is supported within a single block
- [ ] Does not create a new list item

---

**FR-ED-017** While in Outliner mode, when the user types `/`, the system shall open the command menu.

_Acceptance Criteria:_
- [ ] Menu appears at cursor position
- [ ] Menu includes promotion actions (Promote to Task, Promote to Doc)
- [ ] Menu includes formatting options
- [ ] Menu is dismissible with Escape

---

### 3.3 Prose Mode Behaviors

**FR-ED-020** While in Prose mode, the system shall render content as formatted markdown with headings, paragraphs, and blocks.

_Acceptance Criteria:_
- [ ] Markdown headings render with appropriate typography
- [ ] Paragraphs flow naturally
- [ ] Code blocks, tables, and lists render correctly

---

**FR-ED-021** While in Prose mode, when the user types `/`, the system shall open the command menu.

_Acceptance Criteria:_
- [ ] Menu appears at cursor position
- [ ] Menu includes formatting options
- [ ] Menu includes wikilink, topic, and person insertion
- [ ] Menu is dismissible with Escape

---

---

## 4. UI Layout (FR-UI)

### 4.1 Three-Column Layout

**FR-UI-001** The system shall display a persistent three-column layout.

_Acceptance Criteria:_
- [ ] Left sidebar, center panel, and right panel are always visible
- [ ] No column can be hidden or collapsed
- [ ] Layout is consistent across all application states

---

**FR-UI-002** The system shall maintain column roles: left sidebar for navigation, center panel for content, right panel for tasks.

_Acceptance Criteria:_
- [ ] Column purposes do not change based on content
- [ ] Content within columns may change, but column function remains

---

### 4.2 Left Sidebar

**FR-UI-010** The system shall display a "Today" button pinned at the top of the left sidebar.

_Acceptance Criteria:_
- [ ] Button is always visible regardless of scroll position
- [ ] Button is visually distinct as the primary navigation action
- [ ] Button label is "Today"

---

**FR-UI-011** The system shall display a Topics section in the left sidebar below the Today button.

_Acceptance Criteria:_
- [ ] Section header is "Topics"
- [ ] Active topics and people are listed
- [ ] List is ordered by most recently used by default

---

**FR-UI-012** The system shall display a Docs section in the left sidebar below the Topics section.

_Acceptance Criteria:_
- [ ] Section header is "Docs"
- [ ] All docs are listed alphabetically by title
- [ ] A `+` button is visible to create new docs

---

### 4.3 Center Panel

**FR-UI-020** The system shall display one of the following content types in the center panel: Journal view, Task detail, Doc view, or Topic/Person view.

_Acceptance Criteria:_
- [ ] Only one content type is displayed at a time
- [ ] Content changes based on navigation actions
- [ ] Content is always editable where applicable

---

**FR-UI-021** The system shall display the Journal view in the center panel when in home state.

_Acceptance Criteria:_
- [ ] Journal view shows today's date at the top
- [ ] Journal view is the default state after clicking Today
- [ ] Journal view is scrollable to past dates

---

### 4.4 Right Panel

**FR-UI-030** The system shall display the open tasks list in the right panel at all times.

_Acceptance Criteria:_
- [ ] Panel header is "Open Tasks" or similar
- [ ] List shows all tasks with `status: open`
- [ ] Panel never navigates away or changes its role

---

**FR-UI-031** The system shall display a `+` button in the right panel header to create new tasks.

_Acceptance Criteria:_
- [ ] Button is always visible
- [ ] Button opens task creation modal dialog when clicked
- [ ] Button is labeled with `+` or "New Task"

---

**FR-UI-032** The system shall group tasks in the right panel into RELATED, OVERDUE, THIS WEEK, and LATER sections.

_Acceptance Criteria:_
- [ ] RELATED: Tasks sharing topics with or linked from center panel content
- [ ] OVERDUE: Tasks with due date in the past
- [ ] THIS WEEK: Tasks due within rolling 7 days from today
- [ ] LATER: Tasks with no due date or due date beyond 7 days

---

**FR-UI-033** While the center panel displays home state (Today view with no weighting), the system shall not display a RELATED section in the right panel.

_Acceptance Criteria:_
- [ ] RELATED section is omitted entirely in home state
- [ ] Tasks are grouped only in OVERDUE, THIS WEEK, and LATER
- [ ] Standard sort order applies

---

**FR-UI-034** When a task is open in the center panel, the system shall display a highlight indicator on that task in the right panel list.

_Acceptance Criteria:_
- [ ] Currently-open task is visually distinguished (highlight, dot, or similar)
- [ ] List does not auto-scroll to the highlighted task
- [ ] Highlight updates when navigating to a different task

---

---

## 5. Context & Relevance (FR-CTX)

### 5.1 Relevance Model

**FR-CTX-001** The system shall determine relevance using shared topics and direct links only.

_Acceptance Criteria:_
- [ ] No machine learning or fuzzy matching is used
- [ ] Only `#topic` and `@person` references contribute to topic relevance
- [ ] Only wikilinks contribute to direct link relevance
- [ ] Relevance is deterministic and reproducible

---

**FR-CTX-002** When items share one or more `#topic` or `@person` references with the currently open content, the system shall consider them related.

_Acceptance Criteria:_
- [ ] Items with more shared topics rank higher in related groups
- [ ] Both frontmatter and inline topic references are considered
- [ ] Related items float to top of their respective sections

---

**FR-CTX-003** When an item is directly referenced via a wikilink in the currently open content, the system shall consider it related regardless of shared topics.

_Acceptance Criteria:_
- [ ] Wikilinks of all formats are recognized (`[[task:slug]]`, `[[doc:slug]]`, `[[note:YYYY-MM-DD]]`, `[[note:YYYY-MM-DD-slug]]`)
- [ ] Linked items appear in RELATED section
- [ ] Link-based relevance does not require topic overlap

---

### 5.2 Context Weighting by View

**FR-CTX-010** While the center panel displays today's daily note in home state, the system shall apply no relevance weighting.

_Acceptance Criteria:_
- [ ] Left sidebar shows topics in natural order (most recently used)
- [ ] Right panel shows standard task grouping without RELATED section
- [ ] No items are floated or reordered by relevance

---

**FR-CTX-011** While the center panel displays a named note, the system shall weight related content by that note's topics and links.

_Acceptance Criteria:_
- [ ] Related topics float to top of Topics section in left sidebar
- [ ] Related docs float to top of Docs section in left sidebar
- [ ] Related tasks appear in RELATED group in right panel

---

**FR-CTX-012** While the center panel displays a task, the system shall weight related content by that task's topics and links.

_Acceptance Criteria:_
- [ ] Related topics float to top of Topics section
- [ ] Related docs float to top of Docs section
- [ ] Current task is highlighted in right panel; full list is visible

---

**FR-CTX-013** While the center panel displays a doc, the system shall weight related content by that doc's topics and links.

_Acceptance Criteria:_
- [ ] Related topics float to top of Topics section
- [ ] Related tasks appear in RELATED group in right panel

---

**FR-CTX-014** While the center panel displays a topic or person view, the system shall weight content by that topic.

_Acceptance Criteria:_
- [ ] Selected topic is highlighted in Topics section
- [ ] Tasks with that topic appear in RELATED group
- [ ] Related docs (those referencing the topic) float to top

---

### 5.3 Journal Scroll Behavior

**FR-CTX-020** While the journal is anchored on Today, the system shall apply no relevance weighting.

_Acceptance Criteria:_
- [ ] Home state weighting (none) applies
- [ ] Scrolling up from today does not change weighting
- [ ] Clicking Today resets to this state

---

**FR-CTX-021** While the user scrolls the journal into past dates, the system shall update relevance weighting based on the most visible date header.

_Acceptance Criteria:_
- [ ] Active date updates as user scrolls
- [ ] Panels reweight according to that date's content
- [ ] Weighting updates dynamically during scroll

---

**FR-CTX-022** When the user clicks into or edits a named note in the journal, the system shall weight relevance by that note's topics and links rather than the day's topics.

_Acceptance Criteria:_
- [ ] Named note focus overrides date-based weighting
- [ ] Weighting reflects the specific note's topics and links
- [ ] Clicking outside the note returns to date-based or home state weighting

---

---

## 6. Navigation (FR-NAV)

### 6.1 Today Button

**FR-NAV-001** When the user clicks the Today button, the system shall navigate the center panel to today's daily note.

_Acceptance Criteria:_
- [ ] Center panel displays journal view with today at top
- [ ] The `YYYY-MM-DD.md` file is targeted, not any named notes
- [ ] If file does not exist, editable surface is rendered without creating file

---

**FR-NAV-002** When the user clicks the Today button, the system shall clear all relevance weighting.

_Acceptance Criteria:_
- [ ] Left sidebar returns to natural sort order
- [ ] Right panel returns to standard grouping (no RELATED section)
- [ ] All context from previous navigation is cleared

---

**FR-NAV-003** When the user clicks the Today button, the system shall reset journal scroll position to the top.

_Acceptance Criteria:_
- [ ] Today's date is visible at the top of the journal
- [ ] Any scroll offset into past dates is cleared
- [ ] Scroll position matches initial home state

---

### 6.2 Topic and Person Navigation

**FR-NAV-010** When the user clicks a topic or person in the sidebar, the system shall display a topic view in the center panel.

_Acceptance Criteria:_
- [ ] Center panel shows aggregated view for that topic/person
- [ ] View is generated from the index, not stored as a file
- [ ] Relevance weighting updates to that topic

---

**FR-NAV-011** When the user clicks a topic or person inline in content, the system shall display a topic view in the center panel.

_Acceptance Criteria:_
- [ ] Clicking `#topic` or `@person` anywhere opens the topic view
- [ ] Behavior is identical to clicking in sidebar

---

**FR-NAV-012** The system shall display the topic view with all notes referencing that topic in reverse chronological order.

_Acceptance Criteria:_
- [ ] Notes are sorted newest first
- [ ] Both daily and named notes are included
- [ ] Each note shows date and title (if named)

---

**FR-NAV-013** The system shall display the topic view with all docs referencing that topic.

_Acceptance Criteria:_
- [ ] Docs are listed below notes
- [ ] Docs are sorted alphabetically by title

---

**FR-NAV-014** When a doc exists with the viewed topic in its `topics` field, the system shall display it prominently at the top of the topic view with an inline content preview.

_Acceptance Criteria:_
- [ ] Doc with matching topic appears at top
- [ ] Preview shows initial content or excerpt
- [ ] Clicking the preview opens the full doc

---

### 6.3 Document Navigation

**FR-NAV-020** When the user clicks a doc in the sidebar, the system shall display the doc in the center panel.

_Acceptance Criteria:_
- [ ] Doc opens in Prose mode by default
- [ ] Relevance weighting updates to that doc's topics and links
- [ ] Doc is fully editable

---

### 6.4 Task Navigation

**FR-NAV-030** When the user clicks a task in the right panel, the system shall display the task detail in the center panel.

_Acceptance Criteria:_
- [ ] Task opens in Outliner mode by default
- [ ] Task is highlighted in the right panel list
- [ ] Relevance weighting updates to that task's topics and links

---

### 6.5 Wikilink Navigation

**FR-NAV-040** When the user clicks a wikilink, the system shall navigate to the linked entity.

_Acceptance Criteria:_
- [ ] `[[task:slug]]` opens the task detail view
- [ ] `[[doc:slug]]` opens the doc view
- [ ] `[[note:YYYY-MM-DD]]` navigates to that daily note in journal
- [ ] `[[note:YYYY-MM-DD-slug]]` navigates to that named note in journal

---

**FR-NAV-041** If a wikilink references a non-existent entity, the system shall indicate the broken link visually.

_Acceptance Criteria:_
- [ ] Broken link has distinct visual styling (e.g., red, strikethrough)
- [ ] Clicking a broken link does not navigate
- [ ] Tooltip or message indicates entity not found

---

---

## 7. Interaction Flows (FR-INT)

### 7.1 Promote TODO to Task

**FR-INT-001** When the user selects "Promote to Task" on a TODO line, the system shall create a new task file with auto-generated slug.

_Acceptance Criteria:_
- [ ] Slug is generated from the TODO text
- [ ] File is created at `tasks/slug.md`
- [ ] Collision handling appends number suffix if needed

---

**FR-INT-002** When promoting a TODO to a task, the system shall populate the task frontmatter with required fields and inherited topics.

_Acceptance Criteria:_
- [ ] `type: task` is set
- [ ] `status: open` is set
- [ ] `created` is set to today's date
- [ ] Topics from the source note are copied to the task's `topics` field

---

**FR-INT-003** When a TODO is promoted to a task, the system shall replace the original TODO line with a wikilink to the new task.

_Acceptance Criteria:_
- [ ] Original line becomes `- [[task:slug]]`
- [ ] Wikilink is functional and navigable
- [ ] No text content is lost (title becomes task title)

---

**FR-INT-004** When a TODO is promoted to a task, the system shall open the new task in the center panel immediately.

_Acceptance Criteria:_
- [ ] Task detail view is displayed
- [ ] User can add context, due date, and additional topics
- [ ] Task appears in right panel

---

### 7.2 Create Task Directly

**FR-INT-010** When the user clicks the `+` button in the right panel, the system shall display a modal dialog for task creation.

_Acceptance Criteria:_
- [ ] Modal includes title field (required)
- [ ] Modal includes due date field (optional)
- [ ] Modal includes topics field (optional)
- [ ] Modal has confirm and cancel actions

---

**FR-INT-011** When the user confirms task creation in the modal, the system shall create the task file and open it in the center panel.

_Acceptance Criteria:_
- [ ] File is created at `tasks/slug.md`
- [ ] Frontmatter is populated with provided values
- [ ] Task opens in center panel
- [ ] Task appears in right panel

---

### 7.3 Promote Section to Doc

**FR-INT-020** When the user selects "Promote to Doc" on a parent bullet, the system shall prompt for a doc title.

_Acceptance Criteria:_
- [ ] Prompt appears with title input field
- [ ] Prompt has confirm and cancel actions
- [ ] Title is required to proceed

---

**FR-INT-021** When the user provides a title for doc promotion, the system shall prompt the user to select which topics from the source note to inherit.

_Acceptance Criteria:_
- [ ] Source note's topics are displayed as selectable options
- [ ] User can select zero or more topics
- [ ] User can proceed without selecting any topics

---

**FR-INT-022** When doc promotion is confirmed, the system shall create a doc file with the selected content and topics.

_Acceptance Criteria:_
- [ ] File is created at `docs/slug.md`
- [ ] Content includes the promoted bullet and all its children
- [ ] Selected topics are added to doc frontmatter
- [ ] `type: doc`, `title`, and `created` are set in frontmatter

---

**FR-INT-023** When a section is promoted to a doc, the system shall replace the original content with a wikilink.

_Acceptance Criteria:_
- [ ] Original bullet and children are removed
- [ ] Wikilink `[[doc:slug]]` is inserted in their place
- [ ] Wikilink is functional and navigable

---

**FR-INT-024** When a section is promoted to a doc, the system shall open the new doc in the center panel in Prose mode.

_Acceptance Criteria:_
- [ ] Doc opens in Prose mode by default
- [ ] User can toggle to Outliner mode
- [ ] Doc appears in left sidebar Docs list

---

### 7.4 Create Named Note

**FR-INT-030** When the user clicks `+ New Note` on a date header in the journal, the system shall prompt for note details.

_Acceptance Criteria:_
- [ ] Prompt includes title field (optional)
- [ ] Prompt includes topics field (optional)
- [ ] Prompt includes people field (optional)
- [ ] Prompt has confirm and cancel actions

---

**FR-INT-031** When the user confirms note creation without a title, the system shall place the cursor in the daily note for that date.

_Acceptance Criteria:_
- [ ] No new file is created
- [ ] Cursor is placed in the daily note content area
- [ ] If daily note file doesn't exist, it follows lazy creation rules

---

**FR-INT-032** When the user confirms note creation with a title, the system shall create a named note file.

_Acceptance Criteria:_
- [ ] File is created at `notes/YYYY-MM-DD-slug.md`
- [ ] Frontmatter includes `type: note`, `date`, `title`, and topics (if provided)
- [ ] Note appears as a card in the journal for that date
- [ ] Cursor is placed in the note body

---

### 7.5 Create Doc

**FR-INT-040** When the user clicks the `+` button in the Docs sidebar section, the system shall prompt for doc details.

_Acceptance Criteria:_
- [ ] Prompt includes title field (required)
- [ ] Prompt includes topics field (optional)
- [ ] Prompt has confirm and cancel actions

---

**FR-INT-041** When the user confirms doc creation, the system shall create the doc file and open it in the center panel.

_Acceptance Criteria:_
- [ ] File is created at `docs/slug.md`
- [ ] Frontmatter is populated with `type: doc`, `title`, `created`, and topics
- [ ] Doc opens in Prose mode by default
- [ ] Doc appears alphabetically in Docs sidebar section

---

### 7.6 Inline Topic and Person Linking

**FR-INT-050** When the user types `#` in body content, the system shall display autocomplete suggestions for topics.

_Acceptance Criteria:_
- [ ] Autocomplete appears after `#` is typed
- [ ] Active topics are shown, ordered by most recently used
- [ ] Typing further characters filters the list
- [ ] Dormant topics are not shown by default

---

**FR-INT-051** When the user types `@` in body content, the system shall display autocomplete suggestions for people.

_Acceptance Criteria:_
- [ ] Autocomplete appears after `@` is typed
- [ ] People (topics with `@` prefix) are shown
- [ ] Display uses labels from `topics.yaml` if available
- [ ] Typing further characters filters the list

---

**FR-INT-052** When the user selects an autocomplete suggestion, the system shall insert the topic or person reference.

_Acceptance Criteria:_
- [ ] Full reference (e.g., `#project-alpha`) is inserted
- [ ] Autocomplete closes
- [ ] Reference is immediately recognized and styled

---

**FR-INT-053** When the user continues typing after `#` or `@` without selecting a suggestion, the system shall allow creation of a new topic.

_Acceptance Criteria:_
- [ ] User can type a new topic ID and press space/enter
- [ ] New topic is created implicitly (no registration required)
- [ ] New topic becomes available for autocomplete in future uses

---

---

## 8. Non-Functional Requirements (NFR)

### 8.1 Plain Text Storage

**NFR-001** The system shall store all user content as plain markdown files with YAML frontmatter.

_Acceptance Criteria:_
- [ ] All files are human-readable in any text editor
- [ ] No proprietary or binary formats are used for content
- [ ] Frontmatter follows standard YAML syntax

---

**NFR-002** The system shall not use block IDs or proprietary identifiers in file content.

_Acceptance Criteria:_
- [ ] Outliner operates on indentation, not UUIDs
- [ ] Copied content is clean markdown without hidden metadata
- [ ] Content is portable to other markdown tools

---

### 8.2 No Database Dependency

**NFR-010** The system shall operate without a database; files are the source of truth.

_Acceptance Criteria:_
- [ ] No SQLite, IndexedDB, or other database is required
- [ ] All data can be recovered from the file system
- [ ] Deleting non-essential caches does not lose data

---

**NFR-011** The system shall rebuild all indexes from files on startup.

_Acceptance Criteria:_
- [ ] Index reflects current file system state
- [ ] Externally-modified files are detected and indexed
- [ ] Index inconsistencies are resolved by re-reading files

---

### 8.3 Local-First Operation

**NFR-020** The system shall function fully offline without any network connectivity.

_Acceptance Criteria:_
- [ ] All features work without internet access
- [ ] No data is sent to external servers
- [ ] Application starts without network check

---

### 8.4 Data Portability

**NFR-030** If the application is uninstalled, all user data shall remain accessible in the file system.

_Acceptance Criteria:_
- [ ] Files remain in the configured root directory
- [ ] Files can be read and edited by other tools
- [ ] No application-specific encoding prevents access

---

**NFR-031** The system shall not require `topics.yaml` for basic operation.

_Acceptance Criteria:_
- [ ] All features work without `topics.yaml`
- [ ] Topics display their raw ID if not decorated
- [ ] File is optional enhancement only

---

---

## Appendix A: Wikilink Format Reference

| Entity Type | Wikilink Format |
|-------------|-----------------|
| Task | `[[task:slug]]` |
| Doc | `[[doc:slug]]` |
| Daily Note | `[[note:YYYY-MM-DD]]` |
| Named Note | `[[note:YYYY-MM-DD-slug]]` |

---

## Appendix B: Task Grouping Logic

| Group | Criteria |
|-------|----------|
| RELATED | Tasks sharing topics with OR directly linked from center panel content |
| OVERDUE | Tasks with `due` date before today |
| THIS WEEK | Tasks with `due` date within rolling 7 days from today |
| LATER | Tasks with no `due` date OR `due` date beyond 7 days |

Note: RELATED section is only displayed when center panel has active context (not in home state).

---

## Appendix C: Clarifications Applied

This document incorporates the following clarifications:

| Topic | Decision |
|-------|----------|
| Storage path | Configurable by user, not hardcoded |
| Slug collisions | Append incrementing number (e.g., `-2`, `-3`) |
| Editor mode toggle | Resets to default for file type on each open |
| Active topic threshold | Fixed at 90 days |
| Note wikilinks | Both `[[note:YYYY-MM-DD]]` and `[[note:YYYY-MM-DD-slug]]` supported |
| Doc topic inheritance | User prompted to select from source note's topics |
| Dormant topics | Hidden from default list, remain searchable/filterable |
| Task completion | Brief visual delay before removal from list |
| THIS WEEK grouping | Rolling 7 days from today |
| Topic archiving | Out of scope for v1 |
| Task creation UI | Modal dialog |
