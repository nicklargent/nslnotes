import { onMount } from "solid-js";
import {
  findStore,
  updateQuery,
  goNext,
  goPrev,
  closeFind,
  setFindInputRef,
} from "../../stores/findStore";

export function FindBar() {
  let inputEl: HTMLInputElement | undefined;

  onMount(() => {
    inputEl?.focus();
  });

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      goPrev();
    } else if (e.key === "Enter") {
      e.preventDefault();
      goNext();
    }
  }

  return (
    <div
      class="absolute top-2 right-2 z-50 flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 shadow-lg dark:border-gray-600 dark:bg-gray-800"
      onKeyDown={handleKeyDown}
    >
      <input
        ref={(el) => {
          inputEl = el;
          setFindInputRef(el);
        }}
        type="text"
        placeholder="Find..."
        value={findStore.query}
        onInput={(e) => updateQuery(e.currentTarget.value)}
        class="w-44 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-100 dark:placeholder:text-gray-500"
      />

      <span class="min-w-[3.5rem] text-center text-xs text-gray-400 dark:text-gray-500 select-none">
        {findStore.query
          ? findStore.totalMatches > 0
            ? `${findStore.currentGlobal + 1} of ${findStore.totalMatches}`
            : "No results"
          : ""}
      </span>

      <button
        type="button"
        onClick={goPrev}
        disabled={findStore.totalMatches === 0}
        class="flex h-6 w-6 items-center justify-center rounded text-gray-600 hover:bg-gray-100 disabled:opacity-30 dark:text-gray-300 dark:hover:bg-gray-700"
        title="Previous (Shift+Enter)"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path
            d="M2 8L6 4L10 8"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>

      <button
        type="button"
        onClick={goNext}
        disabled={findStore.totalMatches === 0}
        class="flex h-6 w-6 items-center justify-center rounded text-gray-600 hover:bg-gray-100 disabled:opacity-30 dark:text-gray-300 dark:hover:bg-gray-700"
        title="Next (Enter)"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path
            d="M2 4L6 8L10 4"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>

      <button
        type="button"
        onClick={closeFind}
        class="flex h-6 w-6 items-center justify-center rounded text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
        title="Close (Escape)"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path
            d="M2 2L10 10M10 2L2 10"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
          />
        </svg>
      </button>
    </div>
  );
}
