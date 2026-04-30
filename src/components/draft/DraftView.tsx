import {
  createSignal,
  createMemo,
  createEffect,
  onMount,
  onCleanup,
  Show,
  For,
} from "solid-js";
import { EntityService } from "../../services/EntityService";
import { NavigationService } from "../../services/NavigationService";
import { contextStore, setContextStore } from "../../stores/contextStore";
import { indexStore } from "../../stores/indexStore";
import type { Template } from "../../types/entities";
import type { DraftState } from "../../types/stores";

/** Slash-menu item kinds. Templates carry their data; "manage" is a sentinel. */
type SlashItem = { kind: "template"; template: Template } | { kind: "manage" };

/** Transient flag: when true, the next editor mount should autofocus */
let _shouldAutofocusEditor = false;
export function consumeAutofocus(): boolean {
  const val = _shouldAutofocusEditor;
  _shouldAutofocusEditor = false;
  return val;
}

/**
 * Inline draft editor for creating new docs, tasks, and notes.
 * - Title input is auto-focused
 * - Enter on title or blur with non-empty title commits the entity
 * - Esc cancels without creating anything
 * - For task drafts: typing `/` opens an inline slash menu listing
 *   templates plus a "Manage templates" entry. Selecting a template
 *   strips the `/<filter>` from the title and applies the template's
 *   body to the new task on commit.
 */
export function DraftView() {
  const [title, setTitle] = createSignal("");
  const [committed, setCommitted] = createSignal(false);
  const [appliedTemplate, setAppliedTemplate] = createSignal<Template | null>(
    null
  );
  // `slashStart` holds the title-string index of the `/` that opened the
  // menu (null when closed). `slashIndex` is the highlighted item.
  const [slashStart, setSlashStart] = createSignal<number | null>(null);
  const [slashIndex, setSlashIndex] = createSignal(0);
  let cancelled = false;
  let titleRef: HTMLInputElement | undefined;

  const draft = () => contextStore.draft as DraftState;

  /** Filter text typed after the `/`, up to the next space. */
  const slashFilter = createMemo(() => {
    const s = slashStart();
    if (s === null) return "";
    const after = title().slice(s + 1);
    const space = after.search(/\s/);
    return space === -1 ? after : after.slice(0, space);
  });

  // Templates matching the current filter, plus the Manage entry. Empty
  // when the menu is closed so the memo doesn't churn on every keystroke
  // outside the slash flow.
  const slashItems = createMemo<SlashItem[]>(() => {
    if (slashStart() === null) return [];
    const f = slashFilter().toLowerCase();
    const sorted = Array.from(indexStore.templates.values()).sort((a, b) =>
      a.displayName.toLowerCase().localeCompare(b.displayName.toLowerCase())
    );
    const items: SlashItem[] = sorted
      .filter((t) => !f || t.displayName.toLowerCase().includes(f))
      .map((t) => ({ kind: "template", template: t }));
    items.push({ kind: "manage" });
    return items;
  });

  createEffect(() => {
    void slashFilter();
    setSlashIndex(0);
  });

  function closeSlash() {
    setSlashStart(null);
    setSlashIndex(0);
  }

  /** Re-evaluate slash-menu state from the current title + caret position. */
  function evaluateSlash(value: string, caret: number) {
    const s = slashStart();
    if (s === null) return;
    // Menu closes if the `/` was edited away or the caret moved before it,
    // or if a space landed between `/` and the caret.
    if (s >= value.length || value[s] !== "/" || caret <= s) {
      closeSlash();
      return;
    }
    const between = value.slice(s + 1, caret);
    if (/\s/.test(between)) {
      closeSlash();
    }
  }

  function applyTemplate(template: Template) {
    const s = slashStart();
    if (s === null) return;
    const f = slashFilter();
    const cur = title();
    // Strip the `/<filter>` token. Caret returns to `s`.
    const next = cur.slice(0, s) + cur.slice(s + 1 + f.length);
    setTitle(next);
    setAppliedTemplate(template);
    closeSlash();
    queueMicrotask(() => {
      titleRef?.focus();
      titleRef?.setSelectionRange(s, s);
    });
  }

  function pickItem(item: SlashItem) {
    if (item.kind === "manage") {
      cancelDraft();
      NavigationService.navigateToTemplates();
      return;
    }
    applyTemplate(item.template);
  }

  function clearTemplate() {
    setAppliedTemplate(null);
    titleRef?.focus();
  }

  onMount(() => {
    titleRef?.focus();
  });

  function cancelDraft() {
    cancelled = true;
    setContextStore("draft", null);
    NavigationService.goHome();
  }

  // Capture-phase Esc listener — fires before SolidJS delegation and other
  // bubble-phase handlers. When the slash menu is open, Esc dismisses
  // just the menu; otherwise it cancels the whole draft.
  function handleGlobalKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape" && contextStore.draft && !committed()) {
      e.preventDefault();
      e.stopPropagation();
      if (slashStart() !== null) {
        closeSlash();
      } else {
        cancelDraft();
      }
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
        const tpl = appliedTemplate();
        const params: Parameters<typeof EntityService.createTask>[0] = {
          title: t,
        };
        if (tpl) params.content = tpl.content;
        const task = await EntityService.createTask(params);
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

  function handleTitleInput(e: InputEvent) {
    const target = e.currentTarget as HTMLInputElement;
    const value = target.value;
    setTitle(value);
    const caret = target.selectionStart ?? value.length;

    if (draft().type === "task" && slashStart() === null) {
      if (caret > 0 && value[caret - 1] === "/") {
        setSlashStart(caret - 1);
        setSlashIndex(0);
        return;
      }
    }
    evaluateSlash(value, caret);
  }

  function handleTitleKeyDown(e: KeyboardEvent) {
    // Escape is handled by the capture-phase global listener so it can
    // suppress the parent draft cancellation when the menu is open.
    if (slashStart() !== null) {
      const items = slashItems();
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSlashIndex((i) => Math.min(i + 1, items.length - 1));
          return;
        case "ArrowUp":
          e.preventDefault();
          setSlashIndex((i) => Math.max(i - 1, 0));
          return;
        case "Enter":
        case "Tab": {
          const sel = items[slashIndex()];
          if (sel) {
            e.preventDefault();
            pickItem(sel);
          }
          return;
        }
      }
    }
    if (e.key === "Enter") {
      e.preventDefault();
      void commit();
    }
  }

  function handleTitleBlur() {
    if (title().trim() && !committed() && !cancelled && slashStart() === null) {
      void commit();
    }
  }

  function handleTitleSelect(e: Event) {
    const target = e.currentTarget as HTMLInputElement;
    evaluateSlash(target.value, target.selectionStart ?? 0);
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
        <div class="mb-4">
          <span class="mb-2 block text-xs text-gray-400 dark:text-gray-500">
            {typeLabel()}
          </span>
          <div class="relative">
            <input
              ref={titleRef}
              type="text"
              value={title()}
              onInput={handleTitleInput}
              onKeyDown={handleTitleKeyDown}
              onBlur={handleTitleBlur}
              onSelect={handleTitleSelect}
              placeholder={placeholderText()}
              class="w-full border-none bg-transparent text-xl font-semibold text-gray-900 dark:text-gray-100 outline-none placeholder:text-gray-300 dark:placeholder:text-gray-600"
            />
            <Show when={slashStart() !== null}>
              <SlashMenu
                items={slashItems()}
                selectedIndex={slashIndex()}
                onHover={setSlashIndex}
                onSelect={pickItem}
                onClose={closeSlash}
              />
            </Show>
          </div>
          <Show when={appliedTemplate()}>
            {(tpl) => (
              <div class="mt-2 inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                <span aria-hidden="true">📋</span>
                <span>Template: {tpl().displayName}</span>
                <button
                  type="button"
                  class="ml-1 text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-200"
                  onClick={clearTemplate}
                  title="Clear template"
                  aria-label="Clear template"
                >
                  ✕
                </button>
              </div>
            )}
          </Show>
          <p class="mt-2 text-xs text-gray-400 dark:text-gray-500">
            Press Enter to create, Esc to cancel
            <Show when={draft().type === "task"}>
              <span> · Type / for templates</span>
            </Show>
          </p>
        </div>

        <div class="border-t border-gray-100 dark:border-gray-700 pt-4">
          <div class="text-sm text-gray-300 dark:text-gray-600">
            Editor will be available after creating...
          </div>
        </div>
      </div>
    </div>
  );
}

interface SlashMenuProps {
  items: SlashItem[];
  selectedIndex: number;
  onHover: (index: number) => void;
  onSelect: (item: SlashItem) => void;
  onClose: () => void;
}

function SlashMenu(props: SlashMenuProps) {
  let menuRef: HTMLDivElement | undefined;

  // Click-outside dismissal. Keystroke handling lives on the input itself
  // so the menu can intercept ArrowUp/Down/Enter without stealing focus.
  onMount(() => {
    function handleClickOutside(e: MouseEvent) {
      if (!menuRef || !menuRef.contains(e.target as Node)) {
        // Mousedown on the input itself shouldn't close the menu.
        const target = e.target as HTMLElement | null;
        if (target?.tagName === "INPUT") return;
        props.onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    onCleanup(() => {
      document.removeEventListener("mousedown", handleClickOutside);
    });
  });

  return (
    <div
      ref={menuRef}
      data-slash-menu
      class="absolute left-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800 dark:shadow-gray-900/50"
    >
      <div class="max-h-64 overflow-y-auto">
        <For each={props.items}>
          {(item, index) => {
            const active = () => index() === props.selectedIndex;
            const isManage = item.kind === "manage";
            return (
              <button
                type="button"
                // Prevent the input's blur from auto-committing the draft
                // when the user clicks a menu item.
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => props.onHover(index())}
                onClick={() => props.onSelect(item)}
                class={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
                  active()
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200"
                    : "text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                } ${isManage ? "border-t border-gray-100 dark:border-gray-700" : ""}`}
              >
                <Show
                  when={item.kind === "template" ? item : null}
                  fallback={
                    <>
                      <span class="text-base leading-none">⚙</span>
                      <span class="font-medium">Manage templates…</span>
                    </>
                  }
                >
                  {(t) => (
                    <>
                      <span class="text-base leading-none">📋</span>
                      <span class="flex-1 truncate font-medium">
                        {t().template.displayName}
                      </span>
                    </>
                  )}
                </Show>
              </button>
            );
          }}
        </For>
      </div>
    </div>
  );
}
