interface RawModeToggleProps {
  active: boolean;
  onClick: () => void;
}

/**
 * Small icon button to toggle between rendered editor and raw source view.
 * Highlights blue when active (raw mode).
 */
export function RawModeToggle(props: RawModeToggleProps) {
  return (
    <button
      class={`rounded p-0.5 ${props.active ? "bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400" : "text-gray-400 dark:text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300"}`}
      title={props.active ? "Switch to editor" : "View source"}
      onClick={props.onClick}
    >
      <svg
        class="h-4 w-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
        />
      </svg>
    </button>
  );
}
