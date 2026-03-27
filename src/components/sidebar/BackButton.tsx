interface BackButtonProps {
  onClick: () => void;
}

export function BackButton(props: BackButtonProps) {
  return (
    <button
      class="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200 cursor-pointer"
      onClick={() => props.onClick()}
    >
      <svg
        class="h-3 w-3"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M15 19l-7-7 7-7" />
      </svg>
      Back
    </button>
  );
}
