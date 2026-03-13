# NslNotes UI Test Checklist

Use `[ ]` → `[x]` for pass, `[!]` for broken. Add notes inline after any item.

---

## 1. First Launch & Setup

- [ ] **1.a** On first launch (no config), native folder picker appears
- [ ] **1.b** Selecting an invalid/unwritable folder shows error, picker re-opens
- [ ] **1.c** Selecting valid folder creates `notes/`, `tasks/`, `docs/` subdirectories
- [ ] **1.d** Restarting app remembers the selected folder

## 2. Three-Column Layout

- [ ] **2.a** Left sidebar, center panel, and right panel all visible
- [ ] **2.b** Columns never collapse or hide on window resize
- [ ] **2.c** Layout remains consistent across all views

## 3. Left Sidebar

- [ ] **3.a** "Today" button pinned at top, always visible
- [ ] **3.b** Topics section shows active topics sorted by most recently used
- [ ] **3.c** `#topics` and `@people` are visually distinguished
- [ ] **3.d** Docs section shows all docs alphabetically (case-insensitive)
- [ ] **3.e** `+` button visible in Docs section header

## 4. Journal View (Center Panel - Home State)

- [ ] **4.a** Today's date shown at top
- [ ] **4.b** Dates in reverse chronological order scrolling down
- [ ] **4.c** Date headers are sticky while scrolling
- [ ] **4.d** Each date header has a `+ New Note` button
- [ ] **4.e** Empty daily note shows editable area (no file on disk yet)
- [ ] **4.f** First keystroke in empty daily note creates `notes/YYYY-MM-DD.md` with valid frontmatter
- [ ] **4.g** Named notes for a date render as cards below daily note
- [ ] **4.h** Virtual scrolling handles many dates smoothly

## 5. Journal Scroll & Context

- [ ] **5.a** Scrolling to past dates updates relevance weighting
- [ ] **5.b** Related topics/docs float to top of sidebar when scrolled to a date with content
- [ ] **5.c** Scrolling back to today (or clicking Today) resets all weighting
- [ ] **5.d** Clicking into a named note card updates context to that note's topics
- [ ] **5.e** Clicking outside named note returns to date-based/home state

## 6. Named Note Creation

- [ ] **6.a** `+ New Note` on date header opens modal
- [ ] **6.b** Modal has title (optional) and topics fields
- [ ] **6.c** Confirming without title places cursor in daily note
- [ ] **6.d** Confirming with title creates `notes/YYYY-MM-DD-slug.md` with frontmatter
- [ ] **6.e** New named note card appears in journal for that date

## 7. Right Panel - Task List

- [ ] **7.a** "Open Tasks" header visible
- [ ] **7.b** `+` button for creating tasks
- [ ] **7.c** Tasks grouped into OVERDUE, THIS WEEK, LATER sections (home state)
- [ ] **7.d** RELATED section appears when viewing non-home content
- [ ] **7.e** RELATED section hidden in home state
- [ ] **7.f** Currently-open task highlighted in list
- [ ] **7.g** Done/cancelled tasks not shown

## 8. Task Creation

- [ ] **8.a** `+` button opens modal with title (required), due date, topics fields
- [ ] **8.b** Confirm creates `tasks/slug.md` with proper frontmatter
- [ ] **8.c** New task opens in center panel
- [ ] **8.d** New task appears in right panel in correct group

## 9. Task Detail View

- [ ] **9.a** Clicking task in right panel opens it in center panel (Outliner mode)
- [ ] **9.b** Task metadata visible (status, due, topics)
- [ ] **9.c** Mark done / cancel buttons work
- [ ] **9.d** Status change shows brief visual feedback, then task removed from open list
- [ ] **9.e** Task file updated on disk with new status

## 10. Doc Creation

- [ ] **10.a** `+` in Docs section opens modal with title (required), topics
- [ ] **10.b** Confirm creates `docs/slug.md` with proper frontmatter
- [ ] **10.c** Doc opens in center panel in Prose mode
- [ ] **10.d** Doc appears alphabetically in sidebar

## 11. Doc View

- [ ] **11.a** Clicking doc in sidebar opens it in center panel (Prose mode)
- [ ] **11.b** Doc is fully editable
- [ ] **11.c** Relevance weighting updates to doc's topics

## 12. Topic/Person View

- [ ] **12.a** Clicking topic/person in sidebar opens topic view in center
- [ ] **12.b** Shows topic label and note (from topics.yaml if present)
- [ ] **12.c** Lists notes referencing topic (reverse chronological)
- [ ] **12.d** Lists docs referencing topic (alphabetical)
- [ ] **12.e** If a doc has the topic in frontmatter, it shows at top with preview
- [ ] **12.f** Related tasks appear in RELATED group in right panel

## 13. Editor - Outliner Mode (Notes & Tasks)

- [ ] **13.a** Content renders as navigable block tree
- [ ] **13.b** Indentation levels visually distinct
- [ ] **13.c** Collapse/expand for blocks with children
- [ ] **13.d** Tab indents block + children
- [ ] **13.e** Shift+Tab outdents (can't go past root)
- [ ] **13.f** Alt+Up moves block up among siblings
- [ ] **13.g** Alt+Down moves block down among siblings
- [ ] **13.h** Enter creates new block at same level
- [ ] **13.i** Shift+Enter inserts line break within block
- [ ] **13.j** `/` opens command menu

## 14. Editor - Prose Mode (Docs)

- [ ] **14.a** Headings, paragraphs, lists, code blocks render correctly
- [ ] **14.b** Bold, italic, links work
- [ ] **14.c** `/` opens command menu

## 15. Editor Mode Toggle

- [ ] **15.a** Toggle button visible in toolbar
- [ ] **15.b** Content preserved on mode switch
- [ ] **15.c** Notes default to Outliner, Docs default to Prose
- [ ] **15.d** Mode resets to default on each file open

## 16. Auto-Save

- [ ] **16.a** Changes auto-save after ~300ms pause
- [ ] **16.b** Rapid edits only save once after pause

## 17. TODO Inline Syntax

- [ ] **17.a** `- TODO text` renders with unchecked indicator
- [ ] **17.b** `- DOING text` renders with in-progress indicator
- [ ] **17.c** `- DONE text` renders with completed indicator (strikethrough/checkmark)
- [ ] **17.d** Clicking todo cycles: TODO → DOING → DONE → TODO
- [ ] **17.e** Change persisted to file on disk

## 18. Promote TODO to Task

- [ ] **18.a** `/` command menu on a TODO line offers "Promote to Task"
- [ ] **18.b** Creates `tasks/slug.md` with topics inherited from source note
- [ ] **18.c** Original line replaced with `- [[task:slug]]`
- [ ] **18.d** New task opens in center panel

## 19. Promote Section to Doc

- [ ] **19.a** `/` command menu on parent bullet offers "Promote to Doc"
- [ ] **19.b** Prompts for title, then topic selection from source note
- [ ] **19.c** Creates doc with promoted content
- [ ] **19.d** Original content replaced with `[[doc:slug]]`
- [ ] **19.e** Doc opens in Prose mode

## 20. Topic/Person Autocomplete

- [ ] **20.a** Typing `#` shows active topic suggestions, filtered as you type
- [ ] **20.b** Typing `@` shows active people suggestions
- [ ] **20.c** Selecting inserts full reference
- [ ] **20.d** Typing without selecting creates new topic

## 21. Wikilink Rendering & Navigation

- [ ] **21.a** `[[task:slug]]` renders as clickable link showing task title
- [ ] **21.b** `[[doc:slug]]` renders as clickable link showing doc title
- [ ] **21.c** `[[note:YYYY-MM-DD]]` and `[[note:YYYY-MM-DD-slug]]` render correctly
- [ ] **21.d** Clicking wikilink navigates to target entity
- [ ] **21.e** Broken links styled distinctly (red), click shows tooltip

## 22. Context-Based Reordering

- [ ] **22.a** When viewing entity with topics, related topics float to top of sidebar
- [ ] **22.b** Related docs float to top of Docs list
- [ ] **22.c** Related tasks appear in RELATED group
- [ ] **22.d** Clicking Today resets all reordering

## 23. Navigation

- [ ] **23.a** Today button → journal home, clears weighting, resets scroll
- [ ] **23.b** Topic click → topic view in center
- [ ] **23.c** Doc click → doc view in center (Prose)
- [ ] **23.d** Task click → task detail in center (Outliner)

## 24. Error Handling & Polish

- [ ] **24.a** Error boundary catches component errors with user-friendly message
- [ ] **24.b** Toast notifications for save success/failure
- [ ] **24.c** Loading indicator during index build
- [ ] **24.d** Skeleton UI while lists load
- [ ] **24.e** `?` key opens keyboard shortcuts help modal

## 25. File Watching

- [ ] **25.a** Modifying a file externally updates the UI without manual refresh

## 26. topics.yaml Support

- [ ] **26.a** App works fine without `topics.yaml`
- [ ] **26.b** If present, topic labels from yaml used in sidebar display
- [ ] **26.c** Raw ID shown for topics not in yaml

---

## Issues Log

| Item | Description | Severity |
|------|-------------|----------|
|      |             |          |
