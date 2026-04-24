import { For, Show, createSignal, onCleanup, onMount } from "solid-js";
import type { Notebook } from "../../services/SettingsService";

interface NotebookSwitcherProps {
  notebooks: Notebook[];
  activeNotebookId: string | null;
  disabled: boolean;
  onSelect: (nb: Notebook) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onReveal?: ((nb: Notebook) => void) | undefined;
}

/**
 * Compact notebook picker for viewports where horizontal tabs would overflow.
 * Shows the active notebook's name as a button; tapping opens a list of all
 * notebooks plus add / rename / remove actions.
 */
export function NotebookSwitcher(props: NotebookSwitcherProps) {
  const [open, setOpen] = createSignal(false);
  const [renameTargetId, setRenameTargetId] = createSignal<string | null>(null);
  const [draftName, setDraftName] = createSignal("");

  const activeNotebook = () =>
    props.notebooks.find((n) => n.id === props.activeNotebookId) ?? null;

  function close() {
    setOpen(false);
    setRenameTargetId(null);
  }

  onMount(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && open()) {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    }
    document.addEventListener("keydown", onKey, true);
    onCleanup(() => document.removeEventListener("keydown", onKey, true));
  });

  function beginRename(nb: Notebook) {
    setRenameTargetId(nb.id);
    setDraftName(nb.name);
  }

  function commitRename() {
    const id = renameTargetId();
    if (!id) return;
    const name = draftName().trim();
    const nb = props.notebooks.find((n) => n.id === id);
    if (name && nb && name !== nb.name) {
      props.onRename(id, name);
    }
    setRenameTargetId(null);
  }

  return (
    <div class="relative flex min-w-0 flex-1 items-center">
      <button
        type="button"
        class="flex min-w-0 max-w-full items-center gap-1.5 rounded-md border border-transparent px-2.5 py-1 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
        onClick={() => setOpen((v) => !v)}
        disabled={props.disabled || props.notebooks.length === 0}
        data-testid="notebook-switcher-toggle"
      >
        <span class="truncate font-medium">
          {activeNotebook()?.name ?? "No notebook"}
        </span>
        <svg
          class="h-4 w-4 flex-shrink-0 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      <Show when={open()}>
        <div
          class="fixed inset-0 z-40"
          onClick={close}
          onContextMenu={(e) => {
            e.preventDefault();
            close();
          }}
        >
          <div
            class="absolute left-2 top-11 min-w-[240px] max-w-[90vw] rounded-md border border-gray-200 bg-white py-1 text-sm shadow-lg dark:border-gray-700 dark:bg-gray-800"
            onClick={(e) => e.stopPropagation()}
            data-testid="notebook-switcher-menu"
          >
            <For each={props.notebooks}>
              {(nb) => (
                <Show
                  when={renameTargetId() !== nb.id}
                  fallback={
                    <div class="px-2 py-1">
                      <input
                        class="w-full rounded bg-white px-2 py-1 text-sm text-gray-900 outline-none ring-1 ring-blue-400 dark:bg-gray-900 dark:text-gray-100"
                        value={draftName()}
                        onInput={(e) => setDraftName(e.currentTarget.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename();
                          if (e.key === "Escape") setRenameTargetId(null);
                        }}
                        ref={(el) => setTimeout(() => el.focus(), 0)}
                      />
                    </div>
                  }
                >
                  <div
                    class={
                      "group flex items-center gap-1 px-1 " +
                      (nb.id === props.activeNotebookId
                        ? "bg-blue-50 dark:bg-blue-950"
                        : "hover:bg-gray-100 dark:hover:bg-gray-700")
                    }
                  >
                    <button
                      type="button"
                      class={
                        "flex-1 truncate px-2 py-1.5 text-left " +
                        (nb.id === props.activeNotebookId
                          ? "font-medium text-blue-900 dark:text-blue-100"
                          : "text-gray-700 dark:text-gray-200")
                      }
                      onClick={() => {
                        close();
                        props.onSelect(nb);
                      }}
                      title={nb.path}
                    >
                      {nb.name}
                    </button>
                    <NotebookItemActions
                      notebook={nb}
                      onRename={() => beginRename(nb)}
                      onReveal={
                        props.onReveal
                          ? () => {
                              close();
                              props.onReveal?.(nb);
                            }
                          : undefined
                      }
                      onRemove={() => {
                        close();
                        props.onRemove(nb.id);
                      }}
                    />
                  </div>
                </Show>
              )}
            </For>

            <div class="my-1 border-t border-gray-200 dark:border-gray-700" />
            <button
              type="button"
              class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
              onClick={() => {
                close();
                props.onAdd();
              }}
              data-testid="notebook-switcher-add"
            >
              <svg
                class="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add notebook
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
}

interface NotebookItemActionsProps {
  notebook: Notebook;
  onRename: () => void;
  onReveal?: (() => void) | undefined;
  onRemove: () => void;
}

/** Per-row kebab menu for rename / reveal / remove on small screens. */
function NotebookItemActions(props: NotebookItemActionsProps) {
  const [open, setOpen] = createSignal(false);

  function close() {
    setOpen(false);
  }

  onMount(() => {
    function onDocClick() {
      if (open()) close();
    }
    document.addEventListener("click", onDocClick, true);
    onCleanup(() => document.removeEventListener("click", onDocClick, true));
  });

  return (
    <div class="relative">
      <button
        type="button"
        class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title={`Manage ${props.notebook.name}`}
        data-testid={`notebook-item-actions-${props.notebook.id}`}
      >
        <svg
          class="h-4 w-4"
          fill="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle cx="5" cy="12" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="19" cy="12" r="1.5" />
        </svg>
      </button>
      <Show when={open()}>
        <div
          class="absolute right-0 top-8 z-50 min-w-[140px] rounded-md border border-gray-200 bg-white py-1 text-sm shadow-lg dark:border-gray-700 dark:bg-gray-800"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            class="block w-full px-3 py-1.5 text-left text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
            onClick={() => {
              close();
              props.onRename();
            }}
          >
            Rename
          </button>
          <Show when={props.onReveal}>
            <button
              type="button"
              class="block w-full px-3 py-1.5 text-left text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
              onClick={() => {
                close();
                props.onReveal?.();
              }}
            >
              Reveal
            </button>
          </Show>
          <button
            type="button"
            class="block w-full px-3 py-1.5 text-left text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
            onClick={() => {
              close();
              props.onRemove();
            }}
          >
            Remove
          </button>
        </div>
      </Show>
    </div>
  );
}
