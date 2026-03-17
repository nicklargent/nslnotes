import { formatLongDate, isToday } from "../../lib/dates";

interface DateHeaderProps {
  date: string;
  onNewNote: (date: string) => void;
}

/**
 * Sticky date header for each day in the journal (FR-UI-021, FR-CTX-020–021).
 * Shows human-readable date and + New Note button.
 */
export function DateHeader(props: DateHeaderProps) {
  const label = () => {
    if (isToday(props.date)) return `Today — ${formatLongDate(props.date)}`;
    return formatLongDate(props.date);
  };

  return (
    <div class="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-800/95 px-1 py-2 backdrop-blur-sm">
      <h3 class="text-sm font-semibold text-gray-600 dark:text-gray-300">
        {label()}
      </h3>
      <button
        class="rounded px-2 py-0.5 text-xs text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300"
        onClick={() => props.onNewNote(props.date)}
      >
        + New Note
      </button>
    </div>
  );
}
