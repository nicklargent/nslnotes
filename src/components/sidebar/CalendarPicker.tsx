import { createSignal, createMemo, onMount, onCleanup, For } from "solid-js";
import { Portal } from "solid-js/web";
import { getTodayISO, toISODate } from "../../lib/dates";

interface CalendarPickerProps {
  datesWithNotes: Set<string>;
  onSelectDate: (date: string) => void;
  onClose: () => void;
  anchorRect: DOMRect;
}

const DAYS_OF_WEEK = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function CalendarPicker(props: CalendarPickerProps) {
  const now = new Date();
  const [viewYear, setViewYear] = createSignal(now.getFullYear());
  const [viewMonth, setViewMonth] = createSignal(now.getMonth());

  let containerRef: HTMLDivElement | undefined;

  const todayISO = getTodayISO();

  const cells = createMemo(() => {
    const year = viewYear();
    const month = viewMonth();
    const firstDay = new Date(year, month, 1);
    // Monday-based: 0=Mon..6=Sun
    const startDow = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const result: Array<{ day: number; iso: string } | null> = [];
    for (let i = 0; i < startDow; i++) result.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      result.push({ day: d, iso: toISODate(new Date(year, month, d)) });
    }
    return result;
  });

  function prevMonth() {
    if (viewMonth() === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (viewMonth() === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") props.onClose();
  }

  function handleClickOutside(e: MouseEvent) {
    if (containerRef && !containerRef.contains(e.target as Node)) {
      props.onClose();
    }
  }

  onMount(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
  });

  onCleanup(() => {
    document.removeEventListener("keydown", handleKeyDown);
    document.removeEventListener("mousedown", handleClickOutside);
  });

  return (
    <Portal>
      <div
        ref={containerRef}
        class="fixed z-50 w-64 rounded-lg border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-600 dark:bg-gray-800"
        style={{
          top: `${props.anchorRect.bottom + 4}px`,
          left: `${props.anchorRect.left}px`,
        }}
      >
        {/* Header: prev / month year / next */}
        <div class="mb-2 flex items-center justify-between">
          <button
            type="button"
            class="rounded p-1 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
            onClick={prevMonth}
          >
            <svg
              class="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span class="text-sm font-medium text-gray-700 dark:text-gray-200">
            {MONTH_NAMES[viewMonth()]} {viewYear()}
          </span>
          <button
            type="button"
            class="rounded p-1 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
            onClick={nextMonth}
          >
            <svg
              class="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Day-of-week headers */}
        <div class="grid grid-cols-7 mb-1">
          <For each={DAYS_OF_WEEK}>
            {(d) => (
              <div class="text-center text-xs text-gray-400 dark:text-gray-500">
                {d}
              </div>
            )}
          </For>
        </div>

        {/* Day cells */}
        <div class="grid grid-cols-7">
          <For each={cells()}>
            {(cell) => {
              if (!cell) return <div />;
              const isToday = cell.iso === todayISO;
              const hasNote = props.datesWithNotes.has(cell.iso);
              return (
                <button
                  type="button"
                  class={`relative flex flex-col items-center justify-center rounded py-1 text-xs ${
                    isToday
                      ? "bg-blue-100 font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                      : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                  }`}
                  onClick={() => props.onSelectDate(cell.iso)}
                >
                  {cell.day}
                  {hasNote && (
                    <span class="absolute bottom-0.5 h-1 w-1 rounded-full bg-blue-500" />
                  )}
                </button>
              );
            }}
          </For>
        </div>
      </div>
    </Portal>
  );
}
