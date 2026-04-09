import { createSignal, createEffect, For, onMount, onCleanup } from "solid-js";

interface CommandMenuItem {
  id: string;
  label: string;
  description: string;
}

export const COMMANDS: CommandMenuItem[] = [
  {
    id: "extract",
    label: "Extract",
    description: "Extract to task or document",
  },
  {
    id: "heading1",
    label: "Heading 1",
    description: "Large section heading",
  },
  {
    id: "heading2",
    label: "Heading 2",
    description: "Medium section heading",
  },
  {
    id: "heading3",
    label: "Heading 3",
    description: "Small section heading",
  },
  {
    id: "bullet-list",
    label: "Bullet List",
    description: "Unordered list",
  },
  {
    id: "ordered-list",
    label: "Ordered List",
    description: "Numbered list",
  },
  {
    id: "code-block",
    label: "Code Block",
    description: "Code snippet",
  },
  {
    id: "bold",
    label: "Bold",
    description: "Bold text",
  },
  {
    id: "italic",
    label: "Italic",
    description: "Italic text",
  },
  {
    id: "divider",
    label: "Divider",
    description: "Horizontal rule",
  },
  {
    id: "table",
    label: "Table",
    description: "Insert a table",
  },
  {
    id: "task-list",
    label: "Task List",
    description: "Checklist with checkboxes",
  },
];

export function filterCommands(filter: string): CommandMenuItem[] {
  const f = filter.toLowerCase();
  return COMMANDS.filter(
    (cmd) =>
      cmd.label.toLowerCase().includes(f) ||
      cmd.description.toLowerCase().includes(f)
  );
}

interface CommandMenuProps {
  position: { top: number; left: number };
  filter: string;
  onSelect: (action: string) => void;
  onClose: () => void;
}

/**
 * Command menu triggered by / key (T5.8, T6.8, T6.9).
 * Shows available actions for the editor.
 * Includes extract action for promoting content.
 */
export function CommandMenu(props: CommandMenuProps) {
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  let menuRef: HTMLDivElement | undefined;

  const filteredCommands = () => filterCommands(props.filter);

  // Reset selection when filter changes
  createEffect(() => {
    void props.filter;
    setSelectedIndex(0);
  });

  function handleKeyDown(e: KeyboardEvent) {
    const cmds = filteredCommands();

    switch (e.key) {
      case "ArrowDown":
        if (cmds.length === 0) return;
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((i) => Math.min(i + 1, cmds.length - 1));
        break;
      case "ArrowUp":
        if (cmds.length === 0) return;
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
      case "Tab": {
        const selected = cmds[selectedIndex()];
        if (selected) {
          e.preventDefault();
          e.stopPropagation();
          props.onSelect(selected.id);
        }
        break;
      }
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        props.onClose();
        break;
    }
  }

  onMount(() => {
    // Use capture phase to intercept before TipTap handles Enter/Arrow keys
    document.addEventListener("keydown", handleKeyDown, true);
    function handleClickOutside(e: MouseEvent) {
      if (!menuRef || !menuRef.contains(e.target as Node)) {
        props.onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);

    onCleanup(() => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("mousedown", handleClickOutside);
    });
  });

  return (
    <div
      ref={menuRef}
      class="fixed z-50 w-56 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 py-1 shadow-lg dark:shadow-gray-900/50"
      style={{
        top: `${props.position.top + 24}px`,
        left: `${props.position.left}px`,
      }}
    >
      <div class="max-h-48 overflow-y-auto">
        <For each={filteredCommands()}>
          {(cmd, index) => (
            <button
              class={`flex w-full flex-col px-3 py-1.5 text-left ${
                index() === selectedIndex()
                  ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700"
                  : "text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
              }`}
              onClick={() => props.onSelect(cmd.id)}
              onMouseEnter={() => setSelectedIndex(index())}
            >
              <span class="text-sm font-medium">{cmd.label}</span>
              <span class="text-xs text-gray-400 dark:text-gray-500">
                {cmd.description}
              </span>
            </button>
          )}
        </For>
      </div>
    </div>
  );
}
