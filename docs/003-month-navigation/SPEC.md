# 003: Month-Based Journal Navigation

## Overview

The infinite-scroll journal renders TipTap editors for every visible date, causing performance issues as the number of notes grows. Rather than optimizing with lazy rendering (which introduces UX regressions), this feature **bounds the problem structurally** by replacing infinite scroll with month-based navigation. Only ~30-35 dates are ever rendered, eliminating the performance problem while improving navigation clarity.

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
- **Month pills**: clicking a month selects it, resets `loadedMonths` to just that month, scrolls to top
- Selected month highlighted with a pill style (blue background)

---

## Month View

When a month is selected, its dates render in **reverse chronological order** (most recent at top, matching current journal convention).

### Date Filtering
- **Only dates with content** are rendered — empty days are skipped
- **Today is always included** in the current month, even if it has no notes, to preserve the "start writing" experience
- For the current month, dates start from today; for past months, from the last day of the month

### Buffer Days
- 4 dimmed days from the previous month appear at the bottom of each month view
- Buffer days are only shown if they have content
- Buffer days are interactive — clicking one navigates to that month
- Visual distinction: reduced opacity (50%)

---

## Scroll-to-Load

When the user scrolls past the buffer days, the previous month's dates load below seamlessly.

- An `IntersectionObserver` on a sentinel `<div>` at the bottom triggers the load
- Maximum of 3 loaded months at once (~60-90 dates) for performance
- Only loads if there are notes in or before the target month

---

## Navigation Anchoring

Navigating to a note (from backlinks, search, sidebar, calendar picker) sets `currentMonth` to that note's month, resets loaded months, scrolls to the target date, and highlights the note.

- `NavigationService.navigateToDate(date)`: sets `currentMonth: getMonthKey(date)`
- `NavigationService.navigateTo(entity)`: for notes with dates, sets `currentMonth` and `scrollToDate`
- `NavigationService.goHome()`: sets `currentMonth: null` (today's month)
- History state (`NavHistoryEntry`) includes `currentMonth` for back/forward navigation

---

## MonthBar Auto-Tracking

As the user scrolls across month boundaries (when multiple months are loaded), the MonthBar highlights the month of the topmost visible date. This uses the existing `IntersectionObserver` on date headers — when the topmost visible date changes months, `currentMonth` in the context store updates reactively.

---

## Files Modified

| File | Changes |
|------|---------|
| `src/lib/dates.ts` | Added `getMonthKey()`, `getDaysInMonth()`, `getBufferDays()` utilities |
| `src/types/stores.ts` | Added `currentMonth` to `ContextState` and `NavHistoryEntry` |
| `src/stores/contextStore.ts` | Added `currentMonth: null` to initial state |
| `src/services/NavigationService.ts` | Wire `currentMonth` in `navigateToDate`, `goHome`, `navigateTo`, `restoreState`, `snapshotEntry` |
| `src/components/journal/MonthBar.tsx` | **New** — month navigation strip component |
| `src/components/journal/JournalView.tsx` | **Rewrite** — replaced virtual scroll with month-based rendering |

### Unchanged
- `DateHeader.tsx`, `DailyNote.tsx`, `NamedNoteCard.tsx`, `DraftNoteCard.tsx` — reused as-is
- `CalendarPicker.tsx` — already calls `NavigationService.navigateToDate()` which now sets `currentMonth`

---

## Design Decisions

1. **Year labels**: Skinny bar above spanning its months, not inline with month names — keeps the month strip compact
2. **Empty days skipped**: Only dates with content shown (matches current behavior) — avoids mounting unnecessary TipTap editors
3. **Month switch resets**: Clicking a month clears scroll-loaded months for a clean slate — prevents accumulating too many rendered dates
4. **Today always visible**: Even without notes, today appears in the current month view to preserve the "start writing" experience
5. **Buffer days**: 4 days from the previous month shown at reduced opacity — softens month boundaries while keeping them navigable
6. **Max 3 loaded months**: Caps rendered dates at ~60-90 to maintain performance without lazy rendering
