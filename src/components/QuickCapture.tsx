import { createSignal, onMount, onCleanup } from "solid-js";
import { EntityService } from "../services/EntityService";
import { showToast } from "./Toast";

interface QuickCaptureProps {
  onClose: () => void;
}

export function QuickCapture(props: QuickCaptureProps) {
  const [text, setText] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  let inputRef: HTMLTextAreaElement | undefined;

  onMount(() => {
    inputRef?.focus();
  });

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      props.onClose();
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  }

  // Close on outside keydown (Escape) at document level
  function handleGlobalKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      props.onClose();
    }
  }

  onMount(() => {
    document.addEventListener("keydown", handleGlobalKeyDown);
    onCleanup(() => {
      document.removeEventListener("keydown", handleGlobalKeyDown);
    });
  });

  async function submit() {
    const value = text().trim();
    if (!value || saving()) return;

    setSaving(true);
    try {
      await EntityService.appendToDailyNote(value);
      showToast("Captured to today's note", "success");
      props.onClose();
    } catch (err) {
      showToast(
        `Capture failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        "error"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      class="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div class="w-full max-w-lg rounded-lg bg-white dark:bg-gray-800 shadow-xl overflow-hidden">
        <div class="flex items-center gap-2 px-4 pt-3 pb-1">
          <span class="text-xs font-medium text-gray-400 dark:text-gray-500">
            Quick capture to today's note
          </span>
          <span class="ml-auto text-xs text-gray-400 dark:text-gray-500">
            Enter to save
          </span>
        </div>
        <div class="px-4 pb-3">
          <textarea
            ref={inputRef}
            class="w-full resize-none rounded border-0 bg-transparent p-0 text-base text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-0"
            placeholder="What's on your mind?"
            rows={3}
            value={text()}
            onInput={(e) => setText(e.currentTarget.value)}
            onKeyDown={handleKeyDown}
            disabled={saving()}
          />
        </div>
      </div>
    </div>
  );
}
