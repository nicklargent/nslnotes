import { For, onMount, onCleanup } from "solid-js";

interface KeyboardShortcutsModalProps {
  onClose: () => void;
}

interface ShortcutGroup {
  title: string;
  shortcuts: { keys: string; description: string }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "Navigation",
    shortcuts: [
      {
        keys: "Click Today",
        description: "Go to home state (today's journal)",
      },
      { keys: "Click topic/doc", description: "Navigate to topic or document" },
      { keys: "Click task", description: "Open task detail view" },
      { keys: "?", description: "Show this help" },
    ],
  },
  {
    title: "Outliner",
    shortcuts: [
      { keys: "Tab", description: "Indent block" },
      { keys: "Shift + Tab", description: "Outdent block" },
      { keys: "Alt + Up", description: "Move block up" },
      { keys: "Alt + Down", description: "Move block down" },
      { keys: "Enter", description: "New block at same level" },
      { keys: "Shift + Enter", description: "Line break within block" },
    ],
  },
  {
    title: "Editor",
    shortcuts: [
      { keys: "/", description: "Open command menu" },
      { keys: "#", description: "Topic autocomplete" },
      { keys: "@", description: "Person autocomplete" },
    ],
  },
  {
    title: "Command Menu",
    shortcuts: [
      { keys: "Up / Down", description: "Navigate items" },
      { keys: "Enter", description: "Select item" },
      { keys: "Escape", description: "Close menu" },
      { keys: "Type...", description: "Filter commands" },
    ],
  },
];

/**
 * Keyboard shortcuts reference modal (T7.6).
 * Accessible via ? key.
 */
export function KeyboardShortcutsModal(props: KeyboardShortcutsModalProps) {
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape" || e.key === "?") {
      e.preventDefault();
      props.onClose();
    }
  }

  onMount(() => {
    document.addEventListener("keydown", handleKeyDown);
    onCleanup(() => {
      document.removeEventListener("keydown", handleKeyDown);
    });
  });

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div class="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-lg font-semibold text-gray-800">
            Keyboard Shortcuts
          </h2>
          <button
            class="text-gray-400 hover:text-gray-600"
            onClick={() => props.onClose()}
          >
            Esc
          </button>
        </div>

        <div class="max-h-[60vh] overflow-y-auto">
          <For each={SHORTCUT_GROUPS}>
            {(group) => (
              <div class="mb-4">
                <h3 class="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  {group.title}
                </h3>
                <For each={group.shortcuts}>
                  {(shortcut) => (
                    <div class="flex items-center justify-between py-1">
                      <span class="text-sm text-gray-600">
                        {shortcut.description}
                      </span>
                      <kbd class="rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-mono text-gray-500">
                        {shortcut.keys}
                      </kbd>
                    </div>
                  )}
                </For>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}
