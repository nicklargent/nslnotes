import { createSignal, Show } from "solid-js";
import type { Notebook } from "../../services/SettingsService";

interface NotebookTabProps {
  notebook: Notebook;
  active: boolean;
  disabled: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onRename: (name: string) => void;
  onReveal?: () => void;
}

/**
 * Single tab in the top notebook bar. Click to switch; right-click for menu.
 * Double-click the label to rename inline.
 */
export function NotebookTab(props: NotebookTabProps) {
  const [menuOpen, setMenuOpen] = createSignal(false);
  const [menuPos, setMenuPos] = createSignal<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [renaming, setRenaming] = createSignal(false);
  const [draftName, setDraftName] = createSignal("");

  function openMenu(e: MouseEvent) {
    e.preventDefault();
    setMenuPos({ x: e.clientX, y: e.clientY });
    setMenuOpen(true);
  }

  let longPressTimer: ReturnType<typeof setTimeout> | undefined;
  function cancelLongPress() {
    if (longPressTimer !== undefined) {
      clearTimeout(longPressTimer);
      longPressTimer = undefined;
    }
  }

  // Touch devices have no right-click, so hold for 600ms to open the same menu.
  function handlePointerDown(e: PointerEvent) {
    if (e.pointerType !== "touch") return;
    const x = e.clientX;
    const y = e.clientY;
    longPressTimer = setTimeout(() => {
      longPressTimer = undefined;
      setMenuPos({ x, y });
      setMenuOpen(true);
    }, 600);
  }

  function startRename() {
    setDraftName(props.notebook.name);
    setRenaming(true);
    setMenuOpen(false);
  }

  function commitRename() {
    const name = draftName().trim();
    if (name && name !== props.notebook.name) {
      props.onRename(name);
    }
    setRenaming(false);
  }

  return (
    <>
      <div
        class={`group relative flex min-w-0 max-w-[160px] items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm transition-colors ${
          props.active
            ? "border-blue-400 bg-blue-50 text-blue-900 dark:border-blue-500 dark:bg-blue-950 dark:text-blue-100"
            : "border-transparent text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
        } ${props.disabled ? "pointer-events-none opacity-50" : ""}`}
        onContextMenu={openMenu}
        onPointerDown={handlePointerDown}
        onPointerUp={cancelLongPress}
        onPointerCancel={cancelLongPress}
        onPointerLeave={cancelLongPress}
      >
        <Show
          when={!renaming()}
          fallback={
            <input
              class="w-full rounded bg-white px-1 text-sm text-gray-900 outline-none ring-1 ring-blue-400 dark:bg-gray-900 dark:text-gray-100"
              value={draftName()}
              onInput={(e) => setDraftName(e.currentTarget.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") setRenaming(false);
              }}
              ref={(el) => el.focus()}
            />
          }
        >
          <button
            type="button"
            class="truncate text-left"
            title={props.notebook.path}
            onClick={() => props.onSelect()}
            onDblClick={startRename}
          >
            {props.notebook.name}
          </button>
        </Show>
      </div>

      <Show when={menuOpen()}>
        <div
          class="fixed inset-0 z-40"
          onClick={() => setMenuOpen(false)}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenuOpen(false);
          }}
        >
          <div
            class="absolute min-w-[160px] rounded-md border border-gray-200 bg-white py-1 text-sm shadow-lg dark:border-gray-700 dark:bg-gray-800"
            style={{ left: `${menuPos().x}px`, top: `${menuPos().y}px` }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              class="block w-full px-3 py-1.5 text-left text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
              onClick={startRename}
            >
              Rename
            </button>
            <Show when={props.onReveal}>
              <button
                type="button"
                class="block w-full px-3 py-1.5 text-left text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                onClick={() => {
                  setMenuOpen(false);
                  props.onReveal?.();
                }}
              >
                Reveal in file manager
              </button>
            </Show>
            <div class="my-1 border-t border-gray-200 dark:border-gray-700" />
            <button
              type="button"
              class="block w-full px-3 py-1.5 text-left text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
              onClick={() => {
                setMenuOpen(false);
                props.onRemove();
              }}
            >
              Remove from list
            </button>
          </div>
        </div>
      </Show>
    </>
  );
}
