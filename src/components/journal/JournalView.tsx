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

const INITIAL_COUNT = 14;
const LOAD_MORE_COUNT = 7;

/**
 * Scrollable journal view showing dates in reverse chronological order (FR-UI-021).
 * Today at top, past dates below. Scroll triggers context updates (FR-CTX-020–022).
 */
export function JournalView(props: JournalViewProps) {
  const [dayCount, setDayCount] = createSignal(INITIAL_COUNT);
  const [focusedNoteSlug, setFocusedNoteSlug] = createSignal<string | null>(
    null
  );
  let scrollRef: HTMLDivElement | undefined;
  let observer: IntersectionObserver | undefined;

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

  /** Sliced list of dates to render (lazy loading). */
  const dates = createMemo(() => allDatesWithContent().slice(0, dayCount()));

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

  /** Handle scroll to load more dates and track visible date (T4.6). */
  function handleScroll() {
    if (!scrollRef) return;

    // Load more dates when near bottom
    const { scrollTop, scrollHeight, clientHeight } = scrollRef;
    if (scrollHeight - scrollTop - clientHeight < 200) {
      setDayCount((c) => c + LOAD_MORE_COUNT);
    }
  }

  /** Set up IntersectionObserver to track most visible date header (T4.6). */
  onMount(() => {
    if (!scrollRef) return;

    observer = new IntersectionObserver(
      (entries) => {
        // Find the topmost visible date header
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
              // At today with no focused note = home state
              if (!contextStore.isHomeState) {
                NavigationService.goHome();
              }
            } else if (date !== contextStore.journalAnchorDate) {
              setContextStore("journalAnchorDate", date);
              // Update relevance based on visible date's content
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

  /** Register a date header element with the observer. */
  function observeHeader(el: HTMLDivElement) {
    observer?.observe(el);
  }

  /** Update relevance weights based on a date's notes (T4.6). */
  function updateDateRelevance(date: string) {
    if (focusedNoteSlug() !== null) return; // Named note focus takes priority

    const todayISO = getTodayISO();
    if (date === todayISO) {
      NavigationService.goHome();
      return;
    }

    // Find the daily note for this date, use it for relevance
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

  /** Handle named note card click (T4.7). */
  function handleNamedNoteFocus(note: Note) {
    setFocusedNoteSlug(note.slug);
    NavigationService.navigateTo(note);
  }

  /** Handle click outside named notes to clear focus (T4.7). */
  function handleBackgroundClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    // If clicking the journal background (not a card), clear focus
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
        <For each={dates()}>
          {(date) => (
            <div class="mb-6">
              <div ref={observeHeader} data-date={date}>
                <DateHeader date={date} onNewNote={(d) => props.onNewNote(d)} />
              </div>

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
          )}
        </For>
      </div>
    </div>
  );
}
