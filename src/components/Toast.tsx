import { createSignal, For } from "solid-js";

type ToastType = "success" | "error" | "info" | "warning";

interface ToastMessage {
  id: number;
  text: string;
  type: ToastType;
}

let nextId = 0;
const [toasts, setToasts] = createSignal<ToastMessage[]>([]);

// Warnings (e.g. potential data loss) linger longer than transient status
// toasts — 3 s is too short to notice and act on something that matters.
const TOAST_DURATION_MS: Record<ToastType, number> = {
  success: 3000,
  error: 3000,
  info: 3000,
  warning: 10000,
};

/**
 * Show a toast notification (T7.4).
 */
export function showToast(text: string, type: ToastType = "info") {
  const id = nextId++;
  setToasts((prev) => [...prev, { id, text, type }]);

  setTimeout(() => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, TOAST_DURATION_MS[type]);
}

/**
 * Toast container component. Mount once at app root.
 */
export function ToastContainer() {
  return (
    <div class="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      <For each={toasts()}>
        {(toast) => (
          <div
            class={`animate-slide-up rounded-lg px-4 py-2.5 text-sm shadow-lg dark:shadow-gray-900/50 ${
              toast.type === "success"
                ? "bg-green-600 text-white"
                : toast.type === "error"
                  ? "bg-red-600 text-white"
                  : toast.type === "warning"
                    ? "bg-amber-600 text-white"
                    : "bg-gray-800 text-white"
            }`}
          >
            {toast.text}
          </div>
        )}
      </For>
    </div>
  );
}
