interface TodayButtonProps {
  onClick: () => void;
}

/**
 * Primary navigation button pinned at top of left sidebar.
 * Always visible regardless of scroll position (FR-UI-010).
 * Click triggers navigation to home state (wired in T3.9).
 */
export function TodayButton(props: TodayButtonProps) {
  return (
    <button
      class="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 active:bg-blue-800"
      onClick={() => props.onClick()}
    >
      Today
    </button>
  );
}
