import {
  createSignal,
  createMemo,
  createEffect,
  For,
  Show,
  onMount,
  onCleanup,
} from "solid-js";
import { DateHeader } from "./DateHeader";
import { DailyNote } from "./DailyNote";
import { NamedNoteCard } from "./NamedNoteCard";
import { DraftNoteCard } from "./DraftNoteCard";
import { getTodayISO } from "../../lib/dates";
import { indexStore } from "../../stores/indexStore";
import { contextStore, setContextStore } from "../../stores/contextStore";
import { NavigationService } from "../../services/NavigationService";
import type { Note } from "../../types/entities";

interface JournalViewProps {
  onNewNote: (date: string) => void;
  draftDate: string | null;
  onDraftClear: () => void;
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
  const [autofocusNotePath, setAutofocusNotePath] = createSignal<string | null>(
    null
  );
  const [pendingScrollDate, setPendingScrollDate] = createSignal<string | null>(
    null
  );
  const [hoveredDate, setHoveredDate] = createSignal<string | null>(null);
  const [highlightPath, setHighlightPath] = createSignal<string | null>(null);
  let scrollRef: HTMLDivElement | undefined;
  let observer: IntersectionObserver | undefined;
  let programmaticScroll = false;
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

  /** Get named note paths for a date (stable strings for For keying). */
  const getNamedNotePaths = (date: string): string[] => {
    const result: { path: string; slug: string }[] = [];
    for (const note of indexStore.notes.values()) {
      if (note.date === date && !note.isDaily)
        result.push({ path: note.path, slug: note.slug });
    }
    return result
      .sort((a, b) => a.slug.localeCompare(b.slug))
      .map((n) => n.path);
  };

  /** Handle scroll to update virtual window. */
  function handleScroll() {
    if (!scrollRef || programmaticScroll) return;

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
      // Anchor a visible date element so we can compensate for topPadding drift.
      // When startIndex changes, topPadding recalculates using height estimates
      // that may differ from actual rendered heights, shifting all content.
      const containerTop = scrollRef.getBoundingClientRect().top;
      const dateEls = scrollRef.querySelectorAll("[data-date]");
      let anchorDate: string | undefined;
      let anchorVisualTop = 0;

      for (const el of dateEls) {
        const top = el.getBoundingClientRect().top;
        if (top >= containerTop - 50) {
          anchorDate = (el as HTMLElement).dataset["date"];
          anchorVisualTop = top;
          break;
        }
      }

      // Solid updates DOM synchronously on signal change
      setStartIndex(newStart);

      // Measure how far the anchor drifted and compensate
      if (anchorDate) {
        const el = scrollRef.querySelector(`[data-date="${anchorDate}"]`);
        if (el) {
          const drift = el.getBoundingClientRect().top - anchorVisualTop;
          if (Math.abs(drift) > 1) {
            programmaticScroll = true;
            scrollRef.scrollTop += drift;
            // Release after browser processes the scroll event (fires async)
            requestAnimationFrame(() => {
              programmaticScroll = false;
            });
          }
        }
      }
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

  /** Track which dates are currently visible in the viewport. */
  const visibleDateSet = new Set<string>();
  const pendingHeaders: HTMLDivElement[] = [];

  /** Schedule flash highlight after scroll settles. */
  let highlightTimer: number | undefined;
  function triggerHighlight(path: string, delay = 150) {
    window.clearTimeout(highlightTimer);
    highlightTimer = window.setTimeout(() => {
      setHighlightPath(path);
      highlightTimer = window.setTimeout(() => setHighlightPath(null), 1500);
    }, delay);
  }
  onCleanup(() => window.clearTimeout(highlightTimer));

  /** Capture navigation intent on mount — set pending scroll target. */
  onMount(() => {
    if (contextStore.isHomeState) return; // home state starts at top, nothing to do
    const anchorDate = contextStore.journalAnchorDate;
    const entityPath = contextStore.activeEntity?.path;
    if (anchorDate) {
      setPendingScrollDate(anchorDate);
      // For today (index 0) or already-visible dates, highlight immediately
      const all = allDatesWithContent();
      if (all.indexOf(anchorDate) === 0 && entityPath) {
        requestAnimationFrame(() => triggerHighlight(entityPath, 50));
      }
    }
  });

  /** React to home state changes (Today button while already on journal). */
  createEffect(() => {
    if (contextStore.isHomeState) {
      setStartIndex(0);
      setPendingScrollDate(null);
      requestAnimationFrame(() => {
        if (scrollRef) scrollRef.scrollTop = 0;
      });
    }
  });

  /** Scroll to pending date after render. */
  createEffect(() => {
    const target = pendingScrollDate();
    if (!target || !scrollRef) return;

    // Capture entity path now before scroll/observers can clear it
    const entityPath = contextStore.activeEntity?.path ?? null;

    const all = allDatesWithContent();
    const dateIndex = all.indexOf(target);
    if (dateIndex > 0) {
      const newStart = Math.max(0, dateIndex - BUFFER_SIZE);
      programmaticScroll = true;
      setStartIndex(newStart);
      // Double rAF ensures Solid has flushed DOM updates from setStartIndex
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (!scrollRef) {
            programmaticScroll = false;
            return;
          }
          const tryScroll = (attempts: number) => {
            const el = scrollRef!.querySelector(`[data-date="${target}"]`);
            if (el) {
              // Use manual scroll position instead of scrollIntoView to stay
              // consistent with handleScroll's height-accumulation model.
              const container = scrollRef!;
              const elTop = (el as HTMLElement).offsetTop;
              programmaticScroll = true;
              container.scrollTop = elTop;
              setPendingScrollDate(null);
              // Release lock after browser processes the scroll
              requestAnimationFrame(() => {
                programmaticScroll = false;
              });
              if (entityPath) triggerHighlight(entityPath);
            } else if (attempts > 0) {
              requestAnimationFrame(() => tryScroll(attempts - 1));
            } else {
              programmaticScroll = false;
              setPendingScrollDate(null);
            }
          };
          tryScroll(3);
        })
      );
    } else {
      setPendingScrollDate(null);
    }
  });

  /** Set up IntersectionObserver to track visible date headers (T4.6). */
  onMount(() => {
    if (!scrollRef) return;

    observer = new IntersectionObserver(
      (entries) => {
        const prevSize = visibleDateSet.size;
        let topDate: string | null = null;
        let topY = Infinity;

        for (const entry of entries) {
          const date = (entry.target as HTMLElement).dataset["date"];
          if (!date) continue;
          if (entry.isIntersecting) {
            visibleDateSet.add(date);
            if (entry.boundingClientRect.top < topY) {
              topY = entry.boundingClientRect.top;
              topDate = date;
            }
          } else {
            visibleDateSet.delete(date);
          }
        }

        // Only update store if the set of visible dates actually changed
        if (visibleDateSet.size !== prevSize || entries.length > 0) {
          setContextStore("visibleDates", new Set(visibleDateSet));
        }

        if (focusedNoteSlug() === null && visibleDateSet.size > 0) {
          updateVisibleContext();
        }

        if (topDate && topDate !== contextStore.journalAnchorDate) {
          setContextStore("journalAnchorDate", topDate);
        }
      },
      { root: scrollRef, threshold: 0 }
    );

    // Observe any headers that rendered before the observer was ready
    for (const el of pendingHeaders) {
      observer.observe(el);
    }
    pendingHeaders.length = 0;
  });

  onCleanup(() => {
    observer?.disconnect();
  });

  function observeHeader(el: HTMLDivElement) {
    if (observer) {
      observer.observe(el);
    } else {
      pendingHeaders.push(el);
    }
  }

  function updateVisibleContext() {
    if (focusedNoteSlug() !== null) return;
    setContextStore({
      activeEntity: null,
      isHomeState: false,
    });
  }

  function handleNamedNoteFocus(note: Note) {
    setFocusedNoteSlug(note.slug);
    NavigationService.focusEntity(note);
  }

  function handleBackgroundClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest("[data-note-card]")) {
      if (focusedNoteSlug() !== null) {
        setFocusedNoteSlug(null);
        updateVisibleContext();
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
            <div
              ref={(el) => cacheDateHeight(date, el)}
              onMouseEnter={() => setHoveredDate(date)}
              onMouseLeave={() => {
                if (hoveredDate() === date) setHoveredDate(null);
              }}
            >
              <div
                ref={observeHeader}
                data-date={date}
                class="sticky top-0 z-10"
              >
                <DateHeader
                  date={date}
                  hovered={hoveredDate() === date}
                  onNewNote={(d) => props.onNewNote(d)}
                />
              </div>

              <div
                class="mb-6"
                classList={{
                  "animate-flash": getDailyNote(date)?.path === highlightPath(),
                }}
              >
                <DailyNote
                  date={date}
                  note={getDailyNote(date)}
                  hovered={hoveredDate() === date}
                />

                <For each={getNamedNotePaths(date)}>
                  {(path) => {
                    const note = () => indexStore.notes.get(path);
                    return (
                      <Show when={note()}>
                        {(n) => (
                          <div data-note-card>
                            <NamedNoteCard
                              note={n()}
                              isFocused={focusedNoteSlug() === n().slug}
                              hovered={hoveredDate() === date}
                              autofocus={autofocusNotePath() === n().path}
                              highlight={n().path === highlightPath()}
                              onClick={(nn) => handleNamedNoteFocus(nn)}
                            />
                          </div>
                        )}
                      </Show>
                    );
                  }}
                </For>

                <Show when={props.draftDate === date}>
                  <div data-note-card>
                    <DraftNoteCard
                      date={date}
                      onCommit={(note) => {
                        setAutofocusNotePath(note.path);
                        props.onDraftClear();
                        handleNamedNoteFocus(note);
                        // Clear after render so the NamedNoteCard picks it up on mount
                        setTimeout(() => setAutofocusNotePath(null), 0);
                      }}
                      onCancel={() => props.onDraftClear()}
                    />
                  </div>
                </Show>
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
