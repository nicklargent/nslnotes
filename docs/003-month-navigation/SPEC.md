# 003: Month-Based Journal Navigation

## Overview

The infinite-scroll journal renders TipTap editors for every visible date, causing performance issues as the number of notes grows. Rather than optimizing with lazy rendering (which introduces UX regressions), this feature **bounds the problem structurally** by replacing infinite scroll with month-based navigation. Only ~30-35 dates are ever rendered, eliminating the performance problem while improving navigation clarity.

Navigation between months is **explicit** — via nav buttons or MonthBar clicks. There are no automatic scroll-based transitions, which were unreliable across Firefox and Tauri/WebKit.

---

## MonthBar

A compact horizontal strip pinned at the top of the journal, inside the center panel.

### Layout
- **Reverse chronological** (left-to-right): current month on the left, older months to the right
- Two-row structure: skinny year labels on top spanning their months, month pills below
- Horizontally scrollable with `overflow-x: auto`
- Auto-scrolls to keep the selected month visible via `scrollIntoView`
- Shows months from current month back to the earliest note in the index

### Controls
- **Today button**: fixed on the left edge, resets to home state (today's month, scroll to top)
- **Month pills**: clicking a month loads it and scrolls to the first regular date
- Selected month highlighted with a pill style (blue background)

---

## Month View

When a month is selected, its dates render in **reverse chronological order** (most recent at top, matching current journal convention).

### Date Filtering
- **Only dates with content** are rendered — empty days are skipped
- **Today is always included** in the current month, even if it has no notes, to preserve the "start writing" experience
- For the current month, dates start from today; for past months, from the last day of the month

### Buffer Days
- Up to 7 days from adjacent months appear at the top (next month) and bottom (previous month)
- Buffer days are only shown if they have content
- Buffer days are muted (reduced opacity) but fully editable — no click-to-navigate behavior
- Top buffer is skipped for the current month (no future dates to show)

---

## Explicit Month Navigation

Month transitions happen only through explicit user actions:

### Nav Buttons
- A **"Load [Month Name]"** button appears above the top buffer when a more recent month exists
- A **"Load [Month Name]"** button appears below the bottom buffer when an older month with content exists
- Clicking a nav button loads that month and scrolls to the first regular date

### MonthBar Click
- Clicking a month pill loads that month and scrolls to the first regular date (buffer days above viewport)

### Deep-Link Navigation
- Clicking a date in the calendar, navigating to a note via wikilink, etc. loads the correct month and scrolls the target date into view
- Uses simple `scrollTop` assignment after render — no programmatic scroll flags needed

### What Was Removed
- Scroll-based month transitions (`handleMonthScroll`, sentinel markers, `transitionToMonth`)
- `programmaticScroll`, `lastTransitionTime`, `lastTransitionFrom` flags
- Buffer day click-to-navigate behavior (`handleBufferDayClick`)
- Top/bottom marker refs (`topMarkerRef`, `bottomMarkerRef`)

---

## Navigation Anchoring

Navigating to a note (from backlinks, search, sidebar, calendar picker) sets `currentMonth` to that note's month, scrolls to the target date, and highlights the note.

- `NavigationService.navigateToDate(date)`: sets `currentMonth: getMonthKey(date)`
- `NavigationService.navigateTo(entity)`: for notes with dates, sets `currentMonth` and `scrollToDate`
- `NavigationService.goHome()`: sets `currentMonth: null` (today's month)
- History state (`NavHistoryEntry`) includes `currentMonth` for back/forward navigation

---

## Files Modified

| File | Changes |
|------|---------|
| `src/lib/dates.ts` | Added `getMonthKey()`, `getDaysInMonth()`, `getBufferDays()` utilities |
| `src/types/stores.ts` | Added `currentMonth` to `ContextState` and `NavHistoryEntry` |
| `src/stores/contextStore.ts` | Added `currentMonth: null` to initial state |
| `src/services/NavigationService.ts` | Wire `currentMonth` in `navigateToDate`, `goHome`, `navigateTo`, `restoreState`, `snapshotEntry` |
| `src/components/journal/MonthBar.tsx` | **New** — month navigation strip component |
| `src/components/journal/MonthNavButton.tsx` | **New** — simple nav button for loading adjacent months |
| `src/components/journal/JournalView.tsx` | **Rewrite** — explicit month navigation, no scroll-based transitions |

### Unchanged
- `DateHeader.tsx`, `DailyNote.tsx`, `NamedNoteCard.tsx`, `DraftNoteCard.tsx` — reused as-is
- `CalendarPicker.tsx` — already calls `NavigationService.navigateToDate()` which now sets `currentMonth`

---

## Design Decisions

1. **Year labels**: Skinny bar above spanning its months, not inline with month names — keeps the month strip compact
2. **Empty days skipped**: Only dates with content shown (matches current behavior) — avoids mounting unnecessary TipTap editors
3. **Month switch resets**: Clicking a month loads just that month for a clean slate — prevents accumulating too many rendered dates
4. **Today always visible**: Even without notes, today appears in the current month view to preserve the "start writing" experience
5. **Buffer days**: 7 days from adjacent months shown at reduced opacity — softens month boundaries while keeping them editable
6. **Explicit navigation only**: No automatic scroll-based transitions — eliminates cross-engine scroll metric inconsistencies (Firefox vs Tauri/WebKit)
7. **Nav buttons**: Clear affordance for loading adjacent months, placed at natural scroll boundaries
