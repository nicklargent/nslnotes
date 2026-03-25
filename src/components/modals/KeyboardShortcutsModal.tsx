import { For } from "solid-js";

interface KeyboardShortcutsModalProps {
  onClose: () => void;
}

interface ShortcutGroup {
  title: string;
  shortcuts: { keys: string; description: string }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "Global",
    shortcuts: [
      { keys: "Ctrl/\u2318 + N", description: "Quick capture" },
      { keys: "Ctrl/\u2318 + K", description: "Search" },
      { keys: "Ctrl/\u2318 + F", description: "Find in page" },
      { keys: "Ctrl/\u2318 + =", description: "Increase font size" },
      { keys: "Ctrl/\u2318 + -", description: "Decrease font size" },
      { keys: "?", description: "Show this help" },
    ],
  },
  {
    title: "Editor",
    shortcuts: [
      { keys: "Tab", description: "Indent list item" },
      { keys: "Shift + Tab", description: "Outdent list item" },
      { keys: "Alt + Up", description: "Move list item up" },
      { keys: "Alt + Down", description: "Move list item down" },
      { keys: "Shift + Enter", description: "Line break within block" },
      { keys: "/", description: "Open command menu" },
      { keys: "#", description: "Topic autocomplete" },
      { keys: "@", description: "Person autocomplete" },
    ],
  },
];

/**
 * Keyboard shortcuts reference modal (T7.6).
 * Accessible via ? key.
 */
export function KeyboardShortcutsModal(props: KeyboardShortcutsModalProps) {
  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div class="w-full max-w-lg rounded-lg bg-white dark:bg-gray-800 p-6 shadow-xl">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-100">
            Keyboard Shortcuts
          </h2>
          <button
            class="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
            onClick={() => props.onClose()}
          >
            Esc
          </button>
        </div>

        <div class="max-h-[60vh] overflow-y-auto">
          <For each={SHORTCUT_GROUPS}>
            {(group) => (
              <div class="mb-4">
                <h3 class="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  {group.title}
                </h3>
                <For each={group.shortcuts}>
                  {(shortcut) => (
                    <div class="flex items-center justify-between py-1">
                      <span class="text-sm text-gray-600 dark:text-gray-300">
                        {shortcut.description}
                      </span>
                      <kbd class="rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-2 py-0.5 text-xs font-mono text-gray-500 dark:text-gray-400">
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
