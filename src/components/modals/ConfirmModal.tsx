import { onMount, onCleanup, type JSX } from "solid-js";

interface ConfirmModalProps {
  heading: string;
  body: JSX.Element;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmModal(props: ConfirmModalProps) {
  onMount(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        props.onClose();
      }
    }
    document.addEventListener("keydown", onKey, true);
    onCleanup(() => document.removeEventListener("keydown", onKey, true));
  });

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div class="w-full max-w-sm rounded-lg bg-white dark:bg-gray-800 p-6 shadow-xl">
        <h2 class="mb-4 text-lg font-semibold text-gray-800 dark:text-gray-100">
          {props.heading}
        </h2>
        <p class="mb-6 text-sm text-gray-600 dark:text-gray-300">
          {props.body}
        </p>
        <div class="flex justify-end gap-2">
          <button
            class="rounded px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            onClick={() => props.onClose()}
          >
            Cancel
          </button>
          <button
            class="rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
            onClick={() => props.onConfirm()}
          >
            {props.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
