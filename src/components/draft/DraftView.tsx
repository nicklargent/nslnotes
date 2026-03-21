import { createSignal, onMount, onCleanup } from "solid-js";
import { EntityService } from "../../services/EntityService";
import { NavigationService } from "../../services/NavigationService";
import { contextStore, setContextStore } from "../../stores/contextStore";
import type { DraftState } from "../../types/stores";

/** Transient flag: when true, the next editor mount should autofocus */
let _shouldAutofocusEditor = false;
export function consumeAutofocus(): boolean {
  const val = _shouldAutofocusEditor;
  _shouldAutofocusEditor = false;
  return val;
}

/**
 * Inline draft editor for creating new docs, tasks, and notes.
 * Renders in center panel instead of a modal dialog.
 * - Title input is auto-focused
 * - Enter on title or blur with non-empty title commits the entity
 * - Esc cancels without creating anything
 */
export function DraftView() {
  const [title, setTitle] = createSignal("");
  const [committed, setCommitted] = createSignal(false);
  let cancelled = false;
  let titleRef: HTMLInputElement | undefined;

  const draft = () => contextStore.draft as DraftState;

  onMount(() => {
    titleRef?.focus();
  });

  function cancelDraft() {
    cancelled = true;
    setContextStore("draft", null);
    NavigationService.goHome();
  }

  // Capture-phase Esc listener — fires before SolidJS delegation and other
  // bubble-phase handlers, ensuring the cancel always takes effect.
  function handleGlobalKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape" && contextStore.draft && !committed()) {
      e.preventDefault();
      e.stopPropagation();
      cancelDraft();
    }
  }

  onMount(() => {
    document.addEventListener("keydown", handleGlobalKeyDown, true);
  });

  onCleanup(() => {
    document.removeEventListener("keydown", handleGlobalKeyDown, true);
  });

  async function commit() {
    const t = title().trim();
    if (!t || committed()) return;
    setCommitted(true);

    const d = draft();
    try {
      if (d.type === "doc") {
        const doc = await EntityService.createDoc({ title: t });
        if (doc) {
          _shouldAutofocusEditor = true;
          setContextStore("draft", null);
          NavigationService.navigateTo(doc);
        }
      } else if (d.type === "task") {
        const task = await EntityService.createTask({ title: t });
        if (task) {
          _shouldAutofocusEditor = true;
          setContextStore("draft", null);
          NavigationService.navigateTo(task);
        }
      }
    } catch {
      setCommitted(false);
    }
  }

  function handleTitleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      void commit();
    }
  }

  function handleTitleBlur() {
    if (title().trim() && !committed() && !cancelled) {
      void commit();
    }
  }

  const placeholderText = () => {
    return draft().type === "doc" ? "Document title..." : "Task title...";
  };

  const typeLabel = () => {
    return draft().type === "doc" ? "New Document" : "New Task";
  };

  return (
    <div class="h-full overflow-y-auto">
      <div class="mx-auto max-w-2xl px-6 py-6">
        {/* Header */}
        <div class="mb-4">
          <span class="mb-2 block text-xs text-gray-400 dark:text-gray-500">
            {typeLabel()}
          </span>
          <input
            ref={titleRef}
            type="text"
            value={title()}
            onInput={(e) => setTitle(e.currentTarget.value)}
            onKeyDown={handleTitleKeyDown}
            onBlur={handleTitleBlur}
            placeholder={placeholderText()}
            class="w-full border-none bg-transparent text-xl font-semibold text-gray-900 dark:text-gray-100 outline-none placeholder:text-gray-300 dark:placeholder:text-gray-600"
          />
          <p class="mt-2 text-xs text-gray-400 dark:text-gray-500">
            Press Enter to create, Esc to cancel
          </p>
        </div>

        {/* Placeholder editor area */}
        <div class="border-t border-gray-100 dark:border-gray-700 pt-4">
          <div class="text-sm text-gray-300 dark:text-gray-600">
            Editor will be available after creating...
          </div>
        </div>
      </div>
    </div>
  );
}
