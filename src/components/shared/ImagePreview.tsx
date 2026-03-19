import { Show, onMount, onCleanup } from "solid-js";
import {
  previewImageUrl,
  closeImagePreview,
} from "../../stores/imagePreviewStore";

/**
 * Full-resolution image preview modal.
 * Dismissed by clicking outside, pressing Escape, or clicking close button.
 */
export function ImagePreview() {
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeImagePreview();
    }
  }

  onMount(() => {
    document.addEventListener("keydown", handleKeyDown, true);
  });

  onCleanup(() => {
    document.removeEventListener("keydown", handleKeyDown, true);
  });

  return (
    <Show when={previewImageUrl()}>
      {(url) => (
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeImagePreview();
          }}
        >
          {/* Close button */}
          <button
            type="button"
            class="absolute right-4 top-4 rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70"
            onClick={() => closeImagePreview()}
          >
            <svg
              class="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>

          {/* Image at native resolution */}
          <img
            src={url()}
            alt="Preview"
            class="max-h-[90vh] max-w-[90vw] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </Show>
  );
}
