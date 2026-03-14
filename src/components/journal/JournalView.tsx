import { createSignal, createMemo, For, onMount, onCleanup } from "solid-js";
import { DateHeader } from "./DateHeader";
import { DailyNote } from "./DailyNote";
import { NamedNoteCard } from "./NamedNoteCard";
import { getTodayISO } from "../../lib/dates";
import { indexStore } from "../../stores/indexStore";
import { contextStore, setContextStore } from "../../stores/contextStore";
import { NavigationService } from "../../services/NavigationService";
import type { Note } from "../../types/entities";

interface JournalViewProps {
  onNewNote: (date: string) => void;
}

/** How many dates to render above/below viewport for smooth scrolling. */
const BUFFER_SIZE = 5;
/** Estimated height of a single date section. */
const ESTIMATED_DATE_HEIGHT = 160;
/** Max dates rendered at once. */
const MAX_RENDERED = 30;

/**
 * Virtual-scrolling journal view (T7.1).
 * Only renders dates within a window around the scroll position.
 * Today at top, past dates below. Scroll triggers context updates (FR-CTX-020–022).
 */
export function JournalView(props: JournalViewProps) {
  const [startIndex, setStartIndex] = createSignal(0);
  const [focusedNoteSlug, setFocusedNoteSlug] = createSignal<string | null>(
    null
  );
  let scrollRef: HTMLDivElement | undefined;
  let observer: IntersectionObserver | undefined;
  const heightCache = new Map<string, number>();

  /** All dates with content, sorted reverse-chronologically, today always first. */
  const allDatesWithContent = createMemo(() => {
    const todayISO = getTodayISO();
    const dateSet = new Set<string>();
    for (const note of indexStore.notes.values()) {
      if (note.date) dateSet.add(note.date);
    }
    dateSet.delete(todayISO);
    const sorted = [...dateSet].sort((a, b) => b.localeCompare(a));
    return [todayISO, ...sorted];
  });

  /** Windowed dates to render. */
  const visibleDates = createMemo(() => {
    const all = allDatesWithContent();
    const start = startIndex();
    const end = Math.min(start + MAX_RENDERED, all.length);
    return all.slice(start, end);
  });

  /** Total height of all dates before the visible window (for padding). */
  const topPadding = createMemo(() => {
    const all = allDatesWithContent();
    let height = 0;
    for (let i = 0; i < startIndex(); i++) {
      const date = all[i];
      height += date
        ? (heightCache.get(date) ?? ESTIMATED_DATE_HEIGHT)
        : ESTIMATED_DATE_HEIGHT;
    }
    return height;
  });

  /** Total height of all dates after the visible window. */
  const bottomPadding = createMemo(() => {
    const all = allDatesWithContent();
    let height = 0;
    const end = Math.min(startIndex() + MAX_RENDERED, all.length);
    for (let i = end; i < all.length; i++) {
      const date = all[i];
      height += date
        ? (heightCache.get(date) ?? ESTIMATED_DATE_HEIGHT)
        : ESTIMATED_DATE_HEIGHT;
    }
    return height;
  });

  /** Get daily note for a date. */
  const getDailyNote = (date: string): Note | undefined => {
    for (const note of indexStore.notes.values()) {
      if (note.date === date && note.isDaily) return note;
    }
    return undefined;
  };

  /** Get named notes for a date. */
  const getNamedNotes = (date: string): Note[] => {
    const result: Note[] = [];
    for (const note of indexStore.notes.values()) {
      if (note.date === date && !note.isDaily) result.push(note);
    }
    return result.sort((a, b) => a.slug.localeCompare(b.slug));
  };

  /** Handle scroll to update virtual window. */
  function handleScroll() {
    if (!scrollRef) return;

    const { scrollTop } = scrollRef;
    const all = allDatesWithContent();

    // Find which date should be at the top of the viewport
    let accHeight = 0;
    let newStart = 0;
    for (let i = 0; i < all.length; i++) {
      const date = all[i];
      const h = date
        ? (heightCache.get(date) ?? ESTIMATED_DATE_HEIGHT)
        : ESTIMATED_DATE_HEIGHT;
      if (accHeight + h > scrollTop - BUFFER_SIZE * ESTIMATED_DATE_HEIGHT) {
        newStart = Math.max(0, i - BUFFER_SIZE);
        break;
      }
      accHeight += h;
    }

    if (newStart !== startIndex()) {
      setStartIndex(newStart);
    }
  }

  /** Cache the measured height of a date section. */
  function cacheDateHeight(date: string, el: HTMLDivElement) {
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        heightCache.set(date, entry.contentRect.height);
      }
    });
    ro.observe(el);
    onCleanup(() => ro.disconnect());
  }

  /** Set up IntersectionObserver to track most visible date header (T4.6). */
  onMount(() => {
    if (!scrollRef) return;

    observer = new IntersectionObserver(
      (entries) => {
        let topEntry: IntersectionObserverEntry | null = null;
        for (const entry of entries) {
          if (entry.isIntersecting) {
            if (
              !topEntry ||
              entry.boundingClientRect.top < topEntry.boundingClientRect.top
            ) {
              topEntry = entry;
            }
          }
        }

        if (topEntry?.target) {
          const date = (topEntry.target as HTMLElement).dataset["date"];
          if (date) {
            const todayISO = getTodayISO();
            if (date === todayISO && focusedNoteSlug() === null) {
              if (!contextStore.isHomeState) {
                NavigationService.goHome();
              }
            } else if (date !== contextStore.journalAnchorDate) {
              setContextStore("journalAnchorDate", date);
              updateDateRelevance(date);
            }
          }
        }
      },
      { root: scrollRef, threshold: 0.5 }
    );
  });

  onCleanup(() => {
    observer?.disconnect();
  });

  function observeHeader(el: HTMLDivElement) {
    observer?.observe(el);
  }

  function updateDateRelevance(date: string) {
    if (focusedNoteSlug() !== null) return;

    const todayISO = getTodayISO();
    if (date === todayISO) {
      NavigationService.goHome();
      return;
    }

    const daily = getDailyNote(date);
    if (daily) {
      setContextStore({
        activeEntity: daily,
        isHomeState: false,
      });
      NavigationService.updateRelevance();
    } else {
      setContextStore({ isHomeState: false });
      NavigationService.clearRelevance();
    }
  }

  function handleNamedNoteFocus(note: Note) {
    setFocusedNoteSlug(note.slug);
    NavigationService.navigateTo(note);
  }

  function handleBackgroundClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest("[data-note-card]")) {
      if (focusedNoteSlug() !== null) {
        setFocusedNoteSlug(null);
        const anchor = contextStore.journalAnchorDate;
        if (anchor) {
          updateDateRelevance(anchor);
        } else {
          NavigationService.goHome();
        }
      }
    }
  }

  return (
    <div
      ref={scrollRef}
      class="h-full overflow-y-auto"
      onScroll={handleScroll}
      onClick={(e) => handleBackgroundClick(e)}
    >
      <div class="mx-auto max-w-2xl px-4 pb-32">
        {/* Spacer for virtualized dates above the window */}
        <div style={{ height: `${topPadding()}px` }} />

        <For each={visibleDates()}>
          {(date) => (
            <div ref={(el) => cacheDateHeight(date, el)}>
              <div
                ref={observeHeader}
                data-date={date}
                class="sticky top-0 z-10"
              >
                <DateHeader date={date} onNewNote={(d) => props.onNewNote(d)} />
              </div>

              <div class="mb-6">
                <DailyNote date={date} note={getDailyNote(date)} />

                <For each={getNamedNotes(date)}>
                  {(note) => (
                    <div data-note-card>
                      <NamedNoteCard
                        note={note}
                        isFocused={focusedNoteSlug() === note.slug}
                        onClick={(n) => handleNamedNoteFocus(n)}
                      />
                    </div>
                  )}
                </For>
              </div>
            </div>
          )}
        </For>

        {/* Spacer for virtualized dates below the window */}
        <div style={{ height: `${bottomPadding()}px` }} />
      </div>
    </div>
  );
}
