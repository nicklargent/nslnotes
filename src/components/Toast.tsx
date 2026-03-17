import { createSignal, For } from "solid-js";

interface ToastMessage {
  id: number;
  text: string;
  type: "success" | "error" | "info";
}

let nextId = 0;
const [toasts, setToasts] = createSignal<ToastMessage[]>([]);

/**
 * Show a toast notification (T7.4).
 */
export function showToast(
  text: string,
  type: "success" | "error" | "info" = "info"
) {
  const id = nextId++;
  setToasts((prev) => [...prev, { id, text, type }]);

  setTimeout(() => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, 3000);
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
