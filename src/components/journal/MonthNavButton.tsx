interface MonthNavButtonProps {
  label: string;
  onClick: () => void;
}

const LONG_MONTHS = [
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

/** Format "YYYY-MM" → "Month YYYY" */
export function formatMonthKey(mk: string): string {
  const [y, m] = mk.split("-").map(Number) as [number, number];
  return `${LONG_MONTHS[m - 1]} ${y}`;
}

export function MonthNavButton(props: MonthNavButtonProps) {
  return (
    <div class="flex justify-center py-4">
      <button
        class="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
        onClick={() => props.onClick()}
      >
        {props.label}
      </button>
    </div>
  );
}
