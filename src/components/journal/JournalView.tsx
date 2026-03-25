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
import { MonthNavButton, formatMonthKey } from "./MonthNavButton";
import {
  getTodayISO,
  getMonthKey,
  getDaysInMonth,
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
const BUFFER_DAY_COUNT = 5;

/**
 * Month-based journal view.
 * Renders one month with muted buffer zones from adjacent months.
 * Navigation between months is explicit via buttons or MonthBar clicks.
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
  let observer: IntersectionObserver | undefined;

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

  /** Buffer dates from adjacent months, pre-sorted for rendering. */
  const bufferData = createMemo(() => {
    const mk = effectiveMonth();
    const todayMonth = getMonthKey(getTodayISO());
    const contentDates = datesWithContent();
    const nextMk = nextMonthKey(mk);
    const prevMk = prevMonthKey(mk);
    const top: string[] = [];
    const bottom: string[] = [];

    // Single pass: bucket content dates into adjacent months
    for (const d of contentDates) {
      const dmk = getMonthKey(d);
      if (dmk === nextMk && mk !== todayMonth) top.push(d);
      else if (dmk === prevMk) bottom.push(d);
    }

    // Top: ascending by date, take closest N, then reverse for rendering (newest first)
    top.sort();
    top.splice(BUFFER_DAY_COUNT);
    top.reverse();

    // Bottom: descending by date (closest to boundary first), take N
    bottom.sort().reverse();
    bottom.splice(BUFFER_DAY_COUNT);

    const all = new Set<string>(top);
    for (const d of bottom) all.add(d);

    return { top, bottom, all };
  });

  /** Main-month dates (today + dates with content). */
  const mainDates = createMemo((): string[] => {
    const todayISO = getTodayISO();
    const contentDates = datesWithContent();
    const mk = effectiveMonth();
    const [y, m] = mk.split("-").map(Number) as [number, number];
    const dates: string[] = [];
    for (const iso of getDaysInMonth(y, m)) {
      if (iso === todayISO || contentDates.has(iso)) dates.push(iso);
    }
    return dates;
  });

  /** Whether a "Load next month" button should appear at the top. */
  const nextMonthNav = createMemo(() => {
    const mk = effectiveMonth();
    const todayMonth = getMonthKey(getTodayISO());
    if (mk >= todayMonth) return null;
    const next = nextMonthKey(mk);
    if (next > todayMonth) return null;
    return next;
  });

  /** Whether a "Load previous month" button should appear at the bottom. */
  const prevMonthNav = createMemo(() => {
    const mk = effectiveMonth();
    const prev = prevMonthKey(mk);
    if (prev < earliestMonth()) return null;
    return prev;
  });

  /** Navigate to a month and scroll to the first regular date after render. */
  function navigateToMonth(mk: string) {
    setContextStore("currentMonth", mk);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (!scrollRef) return;
        const tryScroll = (attempts: number) => {
          if (!scrollRef) return;
          const first = scrollRef.querySelector(
            "[data-date]:not([data-buffer])"
          ) as HTMLElement | null;
          if (first) {
            first.scrollIntoView({ block: "start" });
          } else if (attempts > 0) {
            requestAnimationFrame(() => tryScroll(attempts - 1));
          } else {
            scrollRef.scrollTop = 0;
          }
        };
        tryScroll(3);
      })
    );
  }

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
          first.scrollIntoView({ block: "start" });
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
            (el as HTMLElement).scrollIntoView({ block: "start" });
            setPendingScrollDate(null);
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
  });

  onCleanup(() => {
    observer?.disconnect();
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

  /** Render a single date block (used for both buffer and main dates). */
  function renderDateBlock(date: string, isBuffer: boolean) {
    return (
      <div
        class={isBuffer ? "opacity-60" : ""}
        onMouseEnter={() => setHoveredDate(date)}
        onMouseLeave={() => {
          if (hoveredDate() === date) setHoveredDate(null);
        }}
      >
        <div
          ref={observeHeader}
          data-date={date}
          data-buffer={isBuffer || undefined}
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
                  setTimeout(() => setAutofocusNotePath(null), 0);
                }}
                onCancel={() => props.onDraftClear()}
              />
            </div>
          </Show>
        </div>
      </div>
    );
  }

  /** Top buffer zone with sticky nav button. */
  function renderTopBuffer() {
    const topDates = () => bufferData().top;
    return (
      <Show when={topDates().length > 0 || nextMonthNav()}>
        <div>
          <Show when={nextMonthNav()}>
            {(mk) => (
              <div class="sticky top-0 z-20 bg-white dark:bg-gray-800">
                <MonthNavButton
                  label={`\u2190 ${formatMonthKey(mk())}`}
                  onClick={() => {
                    const targetMk = mk();
                    const anchor = contextStore.journalAnchorDate;
                    if (anchor && getMonthKey(anchor) === targetMk)
                      setPendingScrollDate(anchor);
                    else navigateToMonth(targetMk);
                  }}
                />
              </div>
            )}
          </Show>
          <For each={topDates()}>{(date) => renderDateBlock(date, true)}</For>
        </div>
      </Show>
    );
  }

  /** Bottom buffer zone with sticky nav button. */
  function renderBottomBuffer() {
    const bottomDates = () => bufferData().bottom;
    return (
      <Show when={bottomDates().length > 0 || prevMonthNav()}>
        <div>
          <For each={bottomDates()}>
            {(date) => renderDateBlock(date, true)}
          </For>
          <Show when={prevMonthNav()}>
            {(mk) => (
              <div class="sticky bottom-0 z-20 bg-white dark:bg-gray-800">
                <MonthNavButton
                  label={`${formatMonthKey(mk())} \u2192`}
                  onClick={() => {
                    const targetMk = mk();
                    let oldest: string | undefined;
                    for (const d of visibleDateSet) {
                      if (!oldest || d < oldest) oldest = d;
                    }
                    if (oldest && getMonthKey(oldest) === targetMk)
                      setPendingScrollDate(oldest);
                    else navigateToMonth(targetMk);
                  }}
                />
              </div>
            )}
          </Show>
        </div>
      </Show>
    );
  }

  return (
    <div class="flex h-full flex-col">
      {/* MonthBar pinned at top */}
      <MonthBar
        currentMonth={effectiveMonth()}
        onSelectMonth={navigateToMonth}
      />

      {/* Scrollable journal content */}
      <div
        ref={scrollRef}
        class="flex-1 overflow-y-auto"
        onClick={(e) => handleBackgroundClick(e)}
      >
        <div class="px-[8%] pb-32 pt-4">
          {renderTopBuffer()}
          <For each={mainDates()}>{(date) => renderDateBlock(date, false)}</For>
          {renderBottomBuffer()}
        </div>
      </div>
    </div>
  );
}
