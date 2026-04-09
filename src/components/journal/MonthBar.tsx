import { createMemo, createEffect, onMount, onCleanup, For } from "solid-js";
import { todayISO, getMonthKey, prevMonthKey } from "../../lib/dates";
import { indexStore } from "../../stores/indexStore";

interface MonthBarProps {
  currentMonth: string;
  onSelectMonth: (ym: string) => void;
}

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * Compact horizontal month navigation strip.
 * Reverse chronological: current month leftmost, oldest rightmost.
 * Year labels shown in a skinny bar above spanning their months.
 */
export function MonthBar(props: MonthBarProps) {
  let scrollRef: HTMLDivElement | undefined;

  /** Derive month range from notes index: earliest note to today. */
  const monthList = createMemo(() => {
    const todayKey = getMonthKey(todayISO());
    let earliest = todayKey;

    for (const note of indexStore.notes.values()) {
      if (note.date) {
        const mk = getMonthKey(note.date);
        if (mk < earliest) earliest = mk;
      }
    }

    // Build reverse-chrono list from today back to earliest
    const months: string[] = [];
    let cursor = todayKey;
    while (cursor >= earliest) {
      months.push(cursor);
      cursor = prevMonthKey(cursor);
    }
    return months;
  });

  /** Group months by year for year labels. */
  const yearGroups = createMemo(() => {
    const groups: { year: string; months: string[] }[] = [];
    let currentYear = "";
    let currentGroup: string[] = [];

    for (const mk of monthList()) {
      const year = mk.slice(0, 4);
      if (year !== currentYear) {
        if (currentGroup.length > 0) {
          groups.push({ year: currentYear, months: currentGroup });
        }
        currentYear = year;
        currentGroup = [mk];
      } else {
        currentGroup.push(mk);
      }
    }
    if (currentGroup.length > 0) {
      groups.push({ year: currentYear, months: currentGroup });
    }
    return groups;
  });

  /** Auto-scroll to keep selected month visible. */
  createEffect(() => {
    const mk = props.currentMonth;
    requestAnimationFrame(() => {
      if (!scrollRef) return;
      const el = scrollRef.querySelector(`[data-month="${mk}"]`);
      if (el) {
        el.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "center",
        });
      }
    });
  });

  /** Convert vertical wheel to horizontal scroll (non-passive for preventDefault). */
  onMount(() => {
    if (!scrollRef) return;
    function handleWheel(e: WheelEvent) {
      if (!scrollRef) return;
      if (e.deltaY !== 0) {
        e.preventDefault();
        scrollRef.scrollLeft += e.deltaY;
      }
    }
    scrollRef.addEventListener("wheel", handleWheel, { passive: false });
    onCleanup(() => scrollRef?.removeEventListener("wheel", handleWheel));
  });

  function monthLabel(mk: string): string {
    const m = parseInt(mk.slice(5), 10);
    return SHORT_MONTHS[m - 1] ?? mk;
  }

  return (
    <div class="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-1.5">
      <div class="flex items-center gap-2">
        {/* Scrollable month strip */}
        <div
          ref={scrollRef}
          class="flex-1 overflow-x-auto"
          style={{ "scrollbar-width": "none" }}
        >
          <div class="flex">
            <For each={yearGroups()}>
              {(group, i) => (
                <div
                  class={`flex flex-col ${i() > 0 ? "ml-1 pl-1.5 border-l border-gray-300 dark:border-gray-600" : ""}`}
                >
                  {/* Year label */}
                  <div class="px-1 text-[10px] font-medium text-gray-400 dark:text-gray-500 text-center">
                    {group.year}
                  </div>
                  {/* Month pills */}
                  <div class="flex gap-0.5">
                    <For each={group.months}>
                      {(mk) => {
                        const isSelected = () => mk === props.currentMonth;
                        return (
                          <button
                            data-month={mk}
                            class={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors whitespace-nowrap ${
                              isSelected()
                                ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
                                : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300"
                            }`}
                            onClick={() => props.onSelectMonth(mk)}
                          >
                            {monthLabel(mk)}
                          </button>
                        );
                      }}
                    </For>
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>
      </div>
    </div>
  );
}
