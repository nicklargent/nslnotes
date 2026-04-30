import { Show, createSignal } from "solid-js";
import { useRegisterSW } from "virtual:pwa-register/solid";

/**
 * Service-worker update prompt.
 *
 * The PWA is registered with `registerType: "prompt"` (see vite.config.ts) so
 * a new build is downloaded into the "waiting" state but never activated
 * automatically. Without a UI for the corresponding `onNeedRefresh` callback,
 * users would stay pinned to the previously cached version until a hard
 * reload — which is exactly what was happening before this component existed.
 */
export function UpdatePrompt() {
  const [reloading, setReloading] = createSignal(false);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  function dismiss() {
    setNeedRefresh(false);
  }

  async function reload() {
    setReloading(true);
    await updateServiceWorker(true);
  }

  return (
    <Show when={needRefresh()}>
      <div
        role="status"
        aria-live="polite"
        class="fixed bottom-4 left-1/2 z-[110] flex -translate-x-1/2 items-center gap-3 rounded-lg bg-gray-900 px-4 py-2.5 text-sm text-white shadow-lg dark:bg-gray-100 dark:text-gray-900"
      >
        <span>A new version is available.</span>
        <button
          type="button"
          class="rounded bg-white/10 px-2.5 py-1 text-xs font-medium hover:bg-white/20 disabled:opacity-50 dark:bg-gray-900/10 dark:hover:bg-gray-900/20"
          onClick={() => void reload()}
          disabled={reloading()}
        >
          {reloading() ? "Reloading…" : "Reload"}
        </button>
        <button
          type="button"
          class="rounded px-1.5 text-xs text-white/70 hover:text-white dark:text-gray-900/70 dark:hover:text-gray-900"
          onClick={dismiss}
          aria-label="Dismiss update notice"
          disabled={reloading()}
        >
          ✕
        </button>
      </div>
    </Show>
  );
}
