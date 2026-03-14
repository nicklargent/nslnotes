# NslNotes — Product Design Document

**Version 0.2 — March 2026**  
**Status: Pre-Development Design**

> A local-first, plain-text knowledge tool centered on time-ordered notes, first-class tasks, and a unified topic system — designed to replace daily LogSeq and Obsidian usage with a single opinionated workflow.

---

## Table of Contents

1. [Vision & Design Philosophy](#1-vision--design-philosophy)
2. [Entity Model](#2-entity-model)
3. [File Structure & Schemas](#3-file-structure--schemas)
4. [Editor Model](#4-editor-model)
5. [UI Layout](#5-ui-layout)
6. [Context-Aware Views](#6-context-aware-views)
7. [Navigation & Selection Model](#7-navigation--selection-model)
8. [Journal View](#8-journal-view)
9. [Key Interaction Flows](#9-key-interaction-flows)
10. [Wireframes](#10-wireframes)
11. [Future Considerations](#11-future-considerations)
- [Appendix: Complete Entity Reference](#appendix-complete-entity-reference)

---

## 1. Vision & Design Philosophy

NslNotes is a personal knowledge tool built around a single conviction: the daily note is the center of gravity for knowledge work, and everything else should orbit it naturally.

Most note-taking tools force a choice between the speed of an outliner and the richness of a document editor, between fluid capture and structured organization. NslNotes rejects that tradeoff. The outliner is the default input mode for time-anchored content. Markdown is the storage format. Topics are the organizational layer. All three coexist without friction.

### Core Principles

- **Plain text, always.** Every file is human-readable markdown with YAML frontmatter. The app can disappear and your data remains.
- **Time is the primary axis.** The journal is home. Everything has a date.
- **Capture first, structure later.** A TODO in a daily note is fine. Promote it to a task when it earns one — or create a task directly when you already know it deserves one.
- **Context without modes.** The layout never changes — shared topics and direct links bring related content forward without switching views.
- **Editor flexibility.** A single unified editor handles both structured capture (bullet lists, TODO tracking, block movement) and prose writing (headings, paragraphs, code blocks) without mode switching.
- **Nothing is hidden, nothing is mandatory.** Dormant topics stay accessible. Metadata is optional sugar.

> **Design Inspiration:** LogSeq's journal-first workflow and outliner speed, combined with Obsidian's plain markdown storage and linking model — rebuilt around a cleaner entity model and a permanently-visible task surface.

---

## 2. Entity Model

NslNotes has four first-class file entities and two lightweight supporting concepts. Every file entity is a markdown document with YAML frontmatter. Nothing more.

### 2.1 File Entities

#### Note

The fundamental unit of capture. Notes are time-anchored and live in the `notes/` directory. The default daily note is the `YYYY-MM-DD.md` file. Named notes (meetings, working sessions, any named context) add a slug to the filename and a title to the frontmatter. Both are the same entity type — there is no special meeting type.

```yaml
# notes/2026-03-09.md              <- default daily note
---
type: note
date: 2026-03-09
---

# notes/2026-03-09-design-review.md  <- named note
---
type: note
date: 2026-03-09
title: Design Review
topics: [#application-abc, #architecture-practice, @alice, @bob]
---
```

#### Task

A structured work item with its own file, due date, status, and full markdown body. Tasks can be created in two ways: promoted from a TODO inline in any note, or created directly via the `+` button in the right panel. Notes and docs may reference tasks via wikilinks, but no link is required — tasks stand on their own.

```yaml
# tasks/fix-auth-bug.md
---
type: task
status: open          # open | done | cancelled
due: 2026-03-15
created: 2026-03-09
topics: [#application-abc]
---

## Context
JWT validation is failing for refresh tokens issued before the March deploy.

- TODO Reproduce with test account
- TODO Check token expiry logic in AuthService
- DOING Write regression test
```

#### Doc

A standalone reference document. Docs are created explicitly via the sidebar `+` button or by promoting a section from a note. The editor supports both prose writing and structured bullet lists. Docs are listed alphabetically in the sidebar.

```yaml
# docs/deployment-runbook.md
---
type: doc
title: Deployment Runbook
created: 2026-03-09
topics: [#application-abc]
---

[freeform markdown content]
```

### 2.2 Supporting Concepts

#### Topics

Topics are the cross-cutting organizational layer. They come into existence organically — the first time `#application-abc` appears in any frontmatter or inline content, it exists. No registration required.

Topics use two prefixes:
- `#` prefix for subject/area topics: `#application-abc`, `#architecture-practice`, `#q1-planning`
- `@` prefix for people: `@alice`, `@bob`

Both prefixes are functionally identical under the hood. The distinction is purely presentational — `@` references render with person-oriented affordances (name display from `topics.yaml`, grouped separately in autocomplete) while `#` references render as subject chips. The underlying query and weighting behavior is identical.

A topic is considered **active** if it appears in any open task OR in any note or doc created or modified within the last 90 days. Otherwise it is **dormant** — still resolvable and linkable, just not surfaced in the sidebar or autocomplete by default.

#### topics.yaml — Optional Decoration

`topics.yaml` is a non-critical annotation file. The system never depends on it for operation. It exists solely to attach human-readable display labels and optional notes to topic IDs. Deleting it changes nothing functional.

```yaml
# topics.yaml
- id: "@alice"
  label: Alice Chen

- id: "@bob"
  label: Bob Martinez
  note: Solutions Architect at Acme

- id: "#application-abc"
  label: Application ABC
  note: Customer-facing portal, Java/React stack

- id: "#architecture-practice"
  label: Architecture Practice
```

Schema: `id`, `label`, `note`, `archived` (optional). `topics.yaml` is edited manually or via a lightweight settings UI. New topics referenced in files but absent from `topics.yaml` display their raw ID and work identically.

### 2.3 Todos vs Tasks

This distinction is intentional and important.

| Concept | Storage | Indexed? | Right Panel? | Lifecycle |
|---------|---------|----------|--------------|-----------|
| Todo | Inline in any note or task | No | No | Captured and completed in context |
| Task | Own file in `tasks/` | Yes | Yes | Promoted from todo OR created directly |

Todos use LogSeq-style prefix syntax. Three states cycle on click:

```
- TODO schedule meeting with matt
- DOING refactor the job queue runner
- DONE send Q1 report
```

`DOING` is a useful intermediate state — it signals active engagement without requiring task promotion. The natural promotion trigger: a TODO that has sat without reaching `DONE` after a couple of days has likely earned its own task file. This is always a user judgment, never automatic.

Todos also appear inside task files for sub-items, using the same `TODO/DOING/DONE` syntax. They are local to that task and not separately tracked.

---

## 3. File Structure & Schemas

### 3.1 Directory Layout

```
~/nslnotes/
  notes/
    2026-03-09.md
    2026-03-09-design-review.md
    2026-03-08.md
    2026-03-08-q1-planning.md
  tasks/
    fix-auth-bug.md
    update-api-docs.md
  docs/
    deployment-runbook.md
    api-architecture.md
  topics.yaml              <- optional, non-critical
```

### 3.2 Frontmatter Schemas

All fields are optional except `type`. Dates are ISO 8601. Topics are arrays of strings using `#` and `@` prefixes.

**Note Schema**
```yaml
type: note          # required
date: YYYY-MM-DD    # required
title: string       # optional — omit for default daily
topics: []          # optional array of #topic and @person refs
```

**Task Schema**
```yaml
type: task          # required
status: open        # required — open | done | cancelled
created: YYYY-MM-DD # required
due: YYYY-MM-DD     # optional
topics: []          # optional
```

**Doc Schema**
```yaml
type: doc           # required
title: string       # required
created: YYYY-MM-DD # required
topics: []          # optional
```

---

## 4. Editor Model

NslNotes uses a single unified editor built on TipTap/ProseMirror. It handles both structured bullet-list capture and rich prose writing without mode switching. On disk, content is standard markdown — no block IDs, no proprietary format.

### Keyboard Shortcuts

- **Tab / Shift-Tab** — indent and outdent list items
- **Alt+Up / Alt+Down** — move a list item and its children up or down within the same parent
- **Shift+Enter** — line break within a block (for multi-line content)
- **`/`** — opens command menu for promotion actions and formatting
- **`#`** — topic autocomplete
- **`@`** — person autocomplete

The editor supports headings, paragraphs, bullet and ordered lists, code blocks, bold, italic, and horizontal rules. Because storage is plain markdown, content can be selected and copied as clean formatted text. Pasting into Slack, email, or any other tool works without transformation.

---

## 5. UI Layout

### 5.1 Three-Column Layout

The application uses a persistent three-column layout. No column ever disappears or fundamentally changes its role. What changes is the ordering and emphasis of content within each column based on context.

```
┌─────────────────┬──────────────────────────────┬──────────────────┐
│   LEFT SIDEBAR  │        CENTER PANEL          │   RIGHT PANEL    │
│                 │                              │                  │
│  Today          │  [context-driven content]    │  [task list] [+] │
│                 │                              │                  │
│  Topics         │  Journal view, task detail,  │  Always shows    │
│  > #app-abc     │  doc view, or topic view     │  open tasks      │
│  > @alice       │                              │                  │
│  > #arch        │                              │                  │
│                 │                              │                  │
│  Docs      [+]  │                              │                  │
│  > App ABC      │                              │                  │
│  > Runbook      │                              │                  │
└─────────────────┴──────────────────────────────┴──────────────────┘
```

### 5.2 Left Sidebar

The sidebar contains three sections in fixed order:

- **Today button** — always pinned at top. Clicking resets to home state (see Section 7.1).
- **Topics** — lists all active topics (`#topics` and `@people`) ordered by most recently used. Related topics float to top based on center panel context (see Section 6).
- **Docs** — alphabetical list of all docs. A `+` button creates a new doc. Related docs float to top based on center panel context.

### 5.3 Right Panel — Permanent Task Surface

The right panel shows the complete open task list at all times. A `+` button at the top creates a new task directly without requiring promotion from a note. The panel never navigates away and never changes its fundamental role.

```
┌─ Open Tasks ──────────────────── [+] ┐
│                                      │
│  RELATED          <- context group   │
│  ▣ Fix auth bug            Thu  ●    │  <- highlighted (currently open)
│  ▣ API docs review         Fri       │
│                                      │
│  ·······························     │
│                                      │
│  OVERDUE                             │
│  ▣ Update onboarding        -2d      │
│                                      │
│  THIS WEEK                           │
│  ▣ Q1 review                Fri      │
│                                      │
│  LATER                               │
│  ▣ Refactor job queue                │
│  ▣ Write runbook                     │
└──────────────────────────────────────┘
```

Groups within the right panel:

- **RELATED** — tasks sharing topics with or directly linked from whatever is open in the center. Ephemeral, context-driven.
- **OVERDUE** — tasks with a due date in the past.
- **THIS WEEK** — tasks due within the next 7 days.
- **LATER** — open tasks without a due date, or due further out.

When a task is open in the center panel it receives a highlight indicator (`●`) in the right panel. The list does not scroll to track it — the user sees both the task detail and the full task list simultaneously.

Completing a task from either the center panel or the right panel marks it done. It fades and drops from the list.

---

## 6. Context-Aware Views

### 6.1 The Relevance Model

NslNotes uses a simple, deterministic relevance model. No machine learning, no fuzzy matching. Two signals contribute to relevance:

- **Shared topics** — any item sharing one or more `#topic` or `@person` references with the currently open content is related. More shared topics = higher position within the related group.
- **Direct links** — any item directly referenced via a wikilink (`[[task:fix-auth-bug]]`, `[[doc:runbook]]`) in the currently open content is treated as related regardless of shared topics.

Both signals are transparent and inspectable. The user always understands why something is surfaced because the connection — a shared topic chip or a visible wikilink — is present in both places.

### 6.2 Context Table

| Center Panel Shows | Left Sidebar | Right Panel |
|--------------------|--------------|-------------|
| Today (home state) | No weighting — natural order | All open tasks, standard grouping |
| A named note / meeting | Related topics float up | Related tasks in RELATED group |
| A task | Related topics float up | Full list, current task highlighted |
| A doc | Related topics float up | Related tasks in RELATED group |
| A topic/person view | That topic highlighted | Tasks with that topic in RELATED group |

### 6.3 Journal Scroll Behavior

The journal view presents a special case. Multiple days are visible simultaneously. The relevance signal is determined by:

- **Anchored on Today** (Today button was clicked): no weighting — home state.
- **Scrolled into the past**: the most visible date header drives relevance. As the user scrolls, the active date updates and the panels reweight accordingly.
- **Named note focused** (clicked into, being edited): that note's topics and links drive relevance rather than the day it belongs to.

---

## 7. Navigation & Selection Model

### 7.1 Today — The Home Button

The Today button is a reset, not merely navigation to the current date.

Clicking Today always:
- Opens today's default daily note (the `YYYY-MM-DD.md` file, never a named note)
- Clears all relevance weighting — left and right panels return to natural sort order
- Returns the journal scroll position to the top if it had drifted

Today is an escape hatch. Wherever you have navigated, whatever context has accumulated, Today returns you to a clean predictable state.

> **Lazy Daily Creation:** Today's default daily note is not written to disk until the first keystroke. The journal always renders an editable surface for today at the top, but the `.md` file is not created until content exists. This prevents the accumulation of empty date files.

### 7.2 Navigation Targets

| Action | Center Panel | Context Weighting |
|--------|-------------|-------------------|
| Click Today | Today's daily note | Cleared — home state |
| Click topic/person in sidebar | Topic view (aggregated) | That topic |
| Click doc in sidebar | Doc in editor | Doc's topics + links |
| Click task in right panel | Task detail view | Task's topics + links |
| Click wikilink in content | Linked entity | Linked entity's topics + links |
| Scroll journal to past date | Journal (date highlighted) | That date's topics + links |
| Click named note in journal | That note focused | That note's topics + links |

### 7.3 Topic and Person Views

Clicking any topic or person — in the sidebar, in a wikilink, or inline in content — opens an aggregated view in the center panel. The view is generated from the index, not stored. Both `#topics` and `@people` open the same style of view:

- All notes referencing this topic/person, reverse chronological
- All docs referencing this topic/person

If a doc exists whose `topics` field includes this topic ID, it is shown prominently at the top of the view with an inline content preview. This emerges naturally from the data — no special designation is required.

The right panel simultaneously narrows to tasks tagged with that topic or directly linked from the view content, making it easy to see all active work in an area at a glance.

---

## 8. Journal View

### 8.1 Structure

The journal is an infinite reverse-chronological scroll. Today is always at the top. Past days load on demand as the user scrolls.

```
┌──────────────────────────────────────────────────────┐
│  March 9, 2026                          [+ New Note] │  <- sticky date header
│                                                      │
│  - TODO review PR from @alice                        │
│  - DOING auth refactor                               │
│  - DONE deploy to staging                            │
│  - Noticed caching issue on [[task:fix-auth-bug]]    │
│                                                      │
│  ┌─ Design Review ───────────────────────────────┐   │
│  │  @alice, @bob  ·  #application-abc            │   │
│  │                                               │   │
│  │  - Agreed on new component structure          │   │
│  │  - TODO update the API contract spec          │   │
│  └───────────────────────────────────────────────┘   │
│                                                      │
│  March 8, 2026                          [+ New Note] │
│  ...                                                 │
└──────────────────────────────────────────────────────┘
```

### 8.2 Named Notes in the Journal

Named notes appear as inset cards within their date. They show their title, people chips, and topic chips as a header, then their full editable content. Both the daily note and any named notes for a date are fully editable inline.

The `+ New Note` button on each date header opens the note creation prompt: title (optional), topics, people. If title is omitted, content is appended to the day's default daily note. If a title is provided, a new named note file is created and appears as a card in the journal.

---

## 9. Key Interaction Flows

### 9.1 Promote TODO to Task

For a TODO that has grown beyond a same-day reminder into something requiring tracked context.

1. User has a TODO line in any note: `- TODO fix the auth bug`
2. Right-click the line or open the `/` command menu
3. Select **Promote to Task**
4. A slug is auto-generated from the text (`fix-auth-bug`)
5. `tasks/fix-auth-bug.md` is created with frontmatter: `type`, `status: open`, `created` date, and any topics already present in the source note
6. The original TODO line becomes a wikilink reference: `- [[task:fix-auth-bug]]`
7. The task opens in the center panel immediately to add context, due date, topics, and sub-todos
8. The task appears in the right panel

### 9.2 Create Task Directly

For when you already know something deserves a task without going through a daily note first.

1. Click the `+` button in the right panel header
2. Prompt: title, optional due date, optional topics
3. `tasks/slug.md` is created and opens in the center panel
4. Task appears in right panel immediately

### 9.3 Promote Note Section to Doc

For content that has grown beyond a note and deserves standalone reference status.

1. Right-click a parent bullet or use `/` command: **Promote to Doc**
2. Prompt for title
3. Content (the bullet and all its children) moves to `docs/slug.md`
4. Original location is replaced with a wikilink: `[[doc:deployment-runbook]]`
5. Doc opens in center panel in editor

### 9.4 Create New Named Note

For capturing a meeting or any named working session.

1. Click `+ New Note` in the journal date header
2. Prompt: title (optional), topics, people
3. If no title: content goes into today's default daily note
4. If title provided: new file `notes/YYYY-MM-DD-slug.md` is created, note card appears in journal, cursor placed in body

### 9.5 Create New Doc

1. Click `+` in the Docs section of the left sidebar
2. Prompt for title and optional topics
3. File created as `docs/slug.md`, opens in editor
4. Appears alphabetically in Docs sidebar section

### 9.6 Inline Topic and Person Linking

`#` and `@` references work anywhere in note or doc body content, with autocomplete:

- Type `#` — autocomplete shows active topics, most recently used first
- Type `@` — autocomplete shows people, drawing from `topics.yaml` `@` entries and existing usage
- Select an existing topic or continue typing to create a new one — no registration step

```
- Discussed caching strategy with @alice for #application-abc
- This connects to the broader #architecture-practice initiative
```

---

## 10. Wireframes

### 10.1 Home State — Journal View

```
┌───────────────┬──────────────────────────────────────┬────────────────────┐
│ Today  ←home  │  March 9, 2026              [+ Note] │  Open Tasks   [+]  │
│               │                                      │                    │
│ Topics        │  - TODO review PR from @alice        │  OVERDUE           │
│ #app-abc      │  - DOING auth refactor               │  ▣ Update docs -2d │
│ @alice        │  - DONE deploy to staging            │                    │
│ #arch         │  - [[task:fix-auth-bug]] update      │  THIS WEEK         │
│ @bob          │                                      │  ▣ Fix auth    Thu │
│ #q1           │  ┌─ Design Review ────────────────┐  │  ▣ Q1 review   Fri │
│               │  │ @alice @bob · #app-abc         │  │                    │
│ Docs      [+] │  │ - Aligned on component arch    │  │  LATER             │
│ App ABC       │  │ - TODO update API contract     │  │  ▣ Refactor queue  │
│ Runbook       │  └────────────────────────────────┘  │  ▣ Write runbook   │
│               │                                      │                    │
│               │  March 8, 2026              [+ Note] │                    │
└───────────────┴──────────────────────────────────────┴────────────────────┘
  No weighting        Today anchored, home state            Full list visible
```

### 10.2 Task Detail View

```
┌───────────────┬──────────────────────────────────────┬────────────────────┐
│ Today         │  Fix Auth Bug               [done]   │  Open Tasks   [+]  │
│               │  Due: Thu Mar 12 · #app-abc          │                    │
│ Topics        │                                      │  RELATED           │
│ #app-abc  ←   │                                      │  ▣ Fix auth ●  Thu │  <- highlight
│ @alice    ←   │  ## Context                          │  ▣ API docs    Fri │
│ #arch         │  JWT validation failing for refresh  │                    │
│               │  tokens before March deploy.         │  ···············   │
│ Docs      [+] │                                      │  OVERDUE           │
│ App ABC   ←   │  - TODO Reproduce with test account  │  ▣ Update docs -2d │
│ Runbook       │  - DOING Check expiry in AuthService │                    │
│               │  - TODO Write regression test        │  THIS WEEK         │
│               │                                      │  ▣ Q1 review   Fri │
│               │                                      │                    │
│               │                                      │  LATER             │
└───────────────┴──────────────────────────────────────┴────────────────────┘
  ← = floated up   Task in editor                              Full list
```

### 10.3 Topic / Person View

```
┌───────────────┬──────────────────────────────────────┬────────────────────┐
│ Today         │  #application-abc                    │  Open Tasks   [+]  │
│               │                                      │                    │
│ Topics        │  📄 Application ABC                  │  RELATED           │
│ #app-abc  ●   │  Customer-facing portal...           │  ▣ Fix auth    Thu │
│ @alice        │  [inline doc preview — click to open]│  ▣ API docs    Fri │
│ #arch         │                                      │  ▣ Q1 review   Fri │
│               │  ── Notes ────────────────────────── │                    │
│ Docs      [+] │  Mar 9  Design Review  @alice @bob   │  ···············   │
│ App ABC   ●   │  Mar 7  Daily mention                │  LATER             │
│ Runbook       │  Mar 4  API Planning session         │  ▣ Refactor queue  │
│               │                                      │                    │
│               │  ── Docs ─────────────────────────── │                    │
│               │  Deployment Runbook                  │                    │
│               │  API Architecture                    │                    │
└───────────────┴──────────────────────────────────────┴────────────────────┘
  ● = active        Generated view. @alice opens identical layout.  Filtered
```

---

## 11. Future Considerations

Explicitly out of scope for the initial build but natural extensions:

### Native macOS App
- The local web server architecture is chosen specifically to preserve this path
- Tauri wraps the same web UI as a native app with near-zero rework
- File access, tray icon, and global keyboard shortcuts would be the main additions

### Calendar / Outlook Integration
- Auto-populate named notes from calendar events (title, attendees, time)
- The frontmatter schema already supports this — only the creation flow changes

### Stale TODO Nudges
- Surface unchecked TODOs older than N days as a gentle reminder to promote or dismiss
- Could appear as a count badge on Today or as a section in the right panel

### Search
- Full-text search across all files as a first pass
- AI-assisted search via local Ollama as a natural extension
- Claude Code on the nslnotes folder is a valid interim approach for complex queries

### Completed Tasks Archive
- A simple view of done/cancelled tasks, filterable by topic or date range

---

## Appendix: Complete Entity Reference

| Entity | Storage | Has File | Right Panel When Focused |
|--------|---------|----------|--------------------------|
| Note (daily) | `notes/YYYY-MM-DD.md` | Yes | All open tasks (unweighted) |
| Note (named) | `notes/YYYY-MM-DD-slug.md` | Yes | Related tasks (topic + link weighted) |
| Task | `tasks/slug.md` | Yes | Full list, this task highlighted |
| Doc | `docs/slug.md` | Yes | Related tasks (topic + link weighted) |
| #topic view | Generated | No | Tasks with that topic |
| @person view | Generated | No | Tasks referencing them |
| Todo | Inline in any file | No | — |
