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
import { MonthBar } from "./MonthBar";
import {
  getTodayISO,
  getMonthKey,
  getDaysInMonth,
  getBufferDays,
  getLeadingBufferDays,
  nextMonthKey,
  prevMonthKey,
} from "../../lib/dates";
import { indexStore } from "../../stores/indexStore";
import { contextStore, setContextStore } from "../../stores/contextStore";
import { NavigationService } from "../../services/NavigationService";
import type { Note } from "../../types/entities";

interface JournalViewProps {
  onNewNote: (date: string) => void;
  draftDate: string | null;
  onDraftClear: () => void;
}

/** Number of buffer days shown from adjacent months. */
const BUFFER_DAY_COUNT = 4;

/**
 * Month-based journal view.
 * Renders exactly one month with grey buffer zones at top (next month) and bottom (prev month).
 * Scrolling through buffer zones seamlessly transitions to the adjacent month.
 */
export function JournalView(props: JournalViewProps) {
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
  let topSentinelRef: HTMLDivElement | undefined;
  let bottomSentinelRef: HTMLDivElement | undefined;
  let observer: IntersectionObserver | undefined;
  let sentinelObserver: IntersectionObserver | undefined;
  let programmaticScroll = false;
  let lastTransitionTime = 0;

  /** Effective current month (null → today's month). */
  const effectiveMonth = createMemo(() => {
    return contextStore.currentMonth ?? getMonthKey(getTodayISO());
  });

  /** Set of all dates that have notes, for quick lookup. */
  const datesWithContent = createMemo(() => {
    const dateSet = new Set<string>();
    for (const note of indexStore.notes.values()) {
      if (note.date) dateSet.add(note.date);
    }
    return dateSet;
  });

  /** Earliest month with content — used for boundary checks. */
  const earliestMonth = createMemo(() => {
    let earliest = getMonthKey(getTodayISO());
    for (const d of datesWithContent()) {
      const mk = getMonthKey(d);
      if (mk < earliest) earliest = mk;
    }
    return earliest;
  });

  /** All rendered date entries: top buffer + main month + bottom buffer. */
  const allRenderedDates = createMemo(() => {
    const todayISO = getTodayISO();
    const todayMonth = getMonthKey(todayISO);
    const contentDates = datesWithContent();
    const mk = effectiveMonth();
    const [y, m] = mk.split("-").map(Number) as [number, number];
    const entries: { date: string; isBuffer: boolean }[] = [];

    // 1. Top buffer: leading days from NEXT month (skip if current month)
    if (mk !== todayMonth) {
      const leadingDays = getLeadingBufferDays(y, m, BUFFER_DAY_COUNT);
      for (const ld of leadingDays) {
        if (contentDates.has(ld)) {
          entries.push({ date: ld, isBuffer: true });
        }
      }
    }

    // 2. Main entries: dates with content for this month, reverse chrono
    for (const iso of getDaysInMonth(y, m)) {
      if (iso === todayISO || contentDates.has(iso)) {
        entries.push({ date: iso, isBuffer: false });
      }
    }

    // 3. Bottom buffer: trailing days from PREVIOUS month
    const bufferDays = getBufferDays(y, m, BUFFER_DAY_COUNT);
    for (const bd of bufferDays) {
      if (contentDates.has(bd)) {
        entries.push({ date: bd, isBuffer: true });
      }
    }

    return entries;
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

  /**
   * Transition to an adjacent month, anchoring scroll so the given date
   * stays at the same pixel position.
   */
  function transitionToMonth(newMonth: string, anchorDate: string) {
    if (!scrollRef) return;

    // Find anchor element and record its position
    const el = scrollRef.querySelector(
      `[data-date="${anchorDate}"]`
    ) as HTMLElement | null;
    let anchorOffset = 0;
    if (el) {
      anchorOffset =
        el.getBoundingClientRect().top - scrollRef.getBoundingClientRect().top;
    }

    programmaticScroll = true;
    lastTransitionTime = Date.now();
    setContextStore("currentMonth", newMonth);

    // Double-rAF with retry to find the anchor in the new DOM
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const tryScroll = (attempts: number) => {
          if (!scrollRef) return;
          const newEl = scrollRef.querySelector(
            `[data-date="${anchorDate}"]`
          ) as HTMLElement | null;
          if (newEl) {
            scrollRef.scrollTop = newEl.offsetTop - anchorOffset;
            requestAnimationFrame(() => {
              programmaticScroll = false;
            });
          } else if (attempts > 0) {
            requestAnimationFrame(() => tryScroll(attempts - 1));
          } else {
            programmaticScroll = false;
          }
        };
        tryScroll(5);
      })
    );
  }

  /** Handle month selection from MonthBar. */
  function handleMonthSelect(mk: string) {
    programmaticScroll = true;
    setContextStore("currentMonth", mk);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (!scrollRef) {
          programmaticScroll = false;
          return;
        }
        const first = scrollRef.querySelector(
          "[data-date]:not([data-buffer])"
        ) as HTMLElement | null;
        if (first) {
          scrollRef.scrollTop = first.offsetTop;
        } else {
          scrollRef.scrollTop = 0;
        }
        requestAnimationFrame(() => {
          programmaticScroll = false;
        });
      })
    );
  }

  /** Handle buffer day click: transition to that month with the clicked date visible. */
  function handleBufferDayClick(date: string) {
    transitionToMonth(getMonthKey(date), date);
  }

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

  /** Track which dates are currently visible in the viewport. */
  const visibleDateSet = new Set<string>();
  const pendingHeaders: HTMLDivElement[] = [];

  /** Capture navigation intent on mount. */
  onMount(() => {
    if (contextStore.isHomeState) return;
    const anchorDate = contextStore.journalAnchorDate;
    const entityPath = contextStore.activeEntity?.path;
    if (anchorDate) {
      setPendingScrollDate(anchorDate);
      if (entityPath) {
        requestAnimationFrame(() => triggerHighlight(entityPath, 50));
      }
    }
  });

  /** On initial mount, scroll past top buffer to first regular entry. */
  onMount(() => {
    if (pendingScrollDate()) return; // will be handled by scroll-to-date effect
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (!scrollRef) return;
        const first = scrollRef.querySelector(
          "[data-date]:not([data-buffer])"
        ) as HTMLElement | null;
        if (first) {
          programmaticScroll = true;
          scrollRef.scrollTop = first.offsetTop;
          requestAnimationFrame(() => {
            programmaticScroll = false;
          });
        }
      })
    );
  });

  /** React to scrollToDate command (calendar picker, etc.). */
  createEffect(() => {
    const target = contextStore.scrollToDate;
    if (!target) return;
    setContextStore("scrollToDate", null);
    setPendingScrollDate(target);
  });

  /** React to home state changes (Today button while already on journal). */
  createEffect(() => {
    if (contextStore.isHomeState) {
      setPendingScrollDate(null);
      const todayMonth = getMonthKey(getTodayISO());
      setContextStore("currentMonth", todayMonth);
      requestAnimationFrame(() => {
        if (scrollRef) scrollRef.scrollTop = 0;
      });
    }
  });

  /** Scroll to pending date after render. */
  createEffect(() => {
    const target = pendingScrollDate();
    if (!target || !scrollRef) return;

    const entityPath = contextStore.activeEntity?.path ?? null;

    // Make sure the target month is loaded
    const targetMonth = getMonthKey(target);
    if (targetMonth !== effectiveMonth()) {
      setContextStore("currentMonth", targetMonth);
      // Re-trigger after month loads
      requestAnimationFrame(() => setPendingScrollDate(target));
      return;
    }

    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (!scrollRef) return;
        const tryScroll = (attempts: number) => {
          const el = scrollRef!.querySelector(`[data-date="${target}"]`);
          if (el) {
            programmaticScroll = true;
            const container = scrollRef!;
            const elTop = (el as HTMLElement).offsetTop;
            container.scrollTop = elTop;
            setPendingScrollDate(null);
            requestAnimationFrame(() => {
              programmaticScroll = false;
            });
            if (entityPath) triggerHighlight(entityPath);
          } else if (attempts > 0) {
            requestAnimationFrame(() => tryScroll(attempts - 1));
          } else {
            setPendingScrollDate(null);
          }
        };
        tryScroll(3);
      })
    );
  });

  /** Set up IntersectionObserver to track visible date headers. */
  onMount(() => {
    if (!scrollRef) return;

    observer = new IntersectionObserver(
      (entries) => {
        const prevSize = visibleDateSet.size;
        let topDate: string | null = null;
        let topY = Infinity;

        for (const entry of entries) {
          const el = entry.target as HTMLElement;
          const date = el.dataset["date"];
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

    // Set up dual sentinel observer for seamless month transitions
    sentinelObserver = new IntersectionObserver(
      (entries) => {
        if (programmaticScroll) return;
        if (Date.now() - lastTransitionTime < 300) return;

        const todayMonth = getMonthKey(getTodayISO());
        const mk = effectiveMonth();

        for (const entry of entries) {
          if (!entry.isIntersecting) continue;

          if (entry.target === topSentinelRef) {
            // Scrolled to top → transition to next month
            if (mk === todayMonth) continue; // No next month for current month
            const next = nextMonthKey(mk);
            // Don't go past current month
            if (next > todayMonth) continue;
            // Find anchor: first visible non-buffer date, or first buffer date
            const rendered = allRenderedDates();
            const topBuffer = rendered.find((e) => e.isBuffer);
            const firstRegular = rendered.find((e) => !e.isBuffer);
            const anchor = topBuffer?.date ?? firstRegular?.date;
            if (anchor) transitionToMonth(next, anchor);
          } else if (entry.target === bottomSentinelRef) {
            // Scrolled to bottom → transition to prev month
            const prev = prevMonthKey(mk);
            if (prev < earliestMonth()) continue;
            const rendered = allRenderedDates();
            let lastBuffer: string | undefined;
            let lastRegular: string | undefined;
            for (let j = rendered.length - 1; j >= 0; j--) {
              const e = rendered[j]!;
              if (!lastBuffer && e.isBuffer) lastBuffer = e.date;
              if (!lastRegular && !e.isBuffer) lastRegular = e.date;
              if (lastBuffer && lastRegular) break;
            }
            const anchor = lastBuffer ?? lastRegular;
            if (anchor) transitionToMonth(prev, anchor);
          }
        }
      },
      { root: scrollRef, rootMargin: "50px" }
    );

    if (topSentinelRef) sentinelObserver.observe(topSentinelRef);
    if (bottomSentinelRef) sentinelObserver.observe(bottomSentinelRef);
  });

  onCleanup(() => {
    observer?.disconnect();
    sentinelObserver?.disconnect();
    visibleDateSet.clear();
    pendingHeaders.length = 0;
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
    <div class="flex h-full flex-col">
      {/* MonthBar pinned at top */}
      <MonthBar
        currentMonth={effectiveMonth()}
        onSelectMonth={handleMonthSelect}
      />

      {/* Scrollable journal content */}
      <div
        ref={scrollRef}
        class="flex-1 overflow-y-auto"
        onClick={(e) => handleBackgroundClick(e)}
      >
        <div class="mx-auto max-w-2xl px-4 pb-32 pt-4">
          <div ref={topSentinelRef} class="h-1" />

          <For each={allRenderedDates()}>
            {(entry) => (
              <div
                class={
                  entry.isBuffer
                    ? "opacity-60 cursor-pointer hover:opacity-80 transition-opacity"
                    : ""
                }
                onClick={
                  entry.isBuffer
                    ? () => handleBufferDayClick(entry.date)
                    : undefined
                }
                onMouseEnter={() => setHoveredDate(entry.date)}
                onMouseLeave={() => {
                  if (hoveredDate() === entry.date) setHoveredDate(null);
                }}
              >
                <div
                  ref={observeHeader}
                  data-date={entry.date}
                  data-buffer={entry.isBuffer || undefined}
                  class="sticky top-0 z-10"
                >
                  <DateHeader
                    date={entry.date}
                    hovered={hoveredDate() === entry.date}
                    onNewNote={(d) => props.onNewNote(d)}
                  />
                </div>

                <div
                  class="mb-6"
                  classList={{
                    "animate-flash":
                      getDailyNote(entry.date)?.path === highlightPath(),
                  }}
                >
                  <DailyNote
                    date={entry.date}
                    note={getDailyNote(entry.date)}
                    hovered={hoveredDate() === entry.date}
                  />

                  <For each={getNamedNotePaths(entry.date)}>
                    {(path) => {
                      const note = () => indexStore.notes.get(path);
                      return (
                        <Show when={note()}>
                          {(n) => (
                            <div data-note-card>
                              <NamedNoteCard
                                note={n()}
                                isFocused={focusedNoteSlug() === n().slug}
                                hovered={hoveredDate() === entry.date}
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

                  <Show when={props.draftDate === entry.date}>
                    <div data-note-card>
                      <DraftNoteCard
                        date={entry.date}
                        onCommit={(note) => {
                          setAutofocusNotePath(note.path);
                          props.onDraftClear();
                          handleNamedNoteFocus(note);
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

          <div ref={bottomSentinelRef} class="h-1" />
        </div>
      </div>
    </div>
  );
}
