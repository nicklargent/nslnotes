import {
  formatLongDate,
  isToday,
  getRelativeDays,
  getWeekdayName,
} from "../../lib/dates";

interface DateHeaderProps {
  date: string;
  hovered: boolean;
  onNewNote: (date: string) => void;
}

/**
 * Sticky date header for each day in the journal (FR-UI-021, FR-CTX-020–021).
 * Shows human-readable date and + New Note button (visible on hover).
 */
export function DateHeader(props: DateHeaderProps) {
  const relativeDays = () => getRelativeDays(props.date);
  const isRecent = () => {
    const r = relativeDays();
    return r >= -6 && r < 0;
  };

  return (
    <div class="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-800/95 px-1 py-2 backdrop-blur-sm">
      <h3 class="text-gray-600 dark:text-gray-300">
        {isToday(props.date) ? (
          <>
            <span class="text-base font-semibold">Today</span>
            <span class="ml-1.5 text-sm text-gray-500 dark:text-gray-400">
              — {formatLongDate(props.date)}
            </span>
          </>
        ) : relativeDays() === -1 ? (
          <>
            <span class="text-base font-semibold">Yesterday</span>
            <span class="ml-1.5 text-sm text-gray-500 dark:text-gray-400">
              — {formatLongDate(props.date)}
            </span>
          </>
        ) : isRecent() ? (
          <>
            <span class="text-base font-semibold">
              {getWeekdayName(props.date)}
            </span>
            <span class="ml-1.5 text-sm text-gray-500 dark:text-gray-400">
              — {formatLongDate(props.date)}
            </span>
          </>
        ) : (
          <span class="text-sm font-semibold">
            {formatLongDate(props.date)}
          </span>
        )}
      </h3>
      <button
        class={`rounded px-2 py-0.5 text-xs text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300 transition-opacity duration-300 ${
          props.hovered ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => props.onNewNote(props.date)}
      >
        + New Note
      </button>
    </div>
  );
}
