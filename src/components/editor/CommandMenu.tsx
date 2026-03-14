import { createSignal, For, onMount, onCleanup } from "solid-js";

interface CommandMenuItem {
  id: string;
  label: string;
  description: string;
}

const COMMANDS: CommandMenuItem[] = [
  {
    id: "promote-to-task",
    label: "Promote to Task",
    description: "Create a task from this line",
  },
  {
    id: "promote-to-doc",
    label: "Promote to Doc",
    description: "Create a document from this section",
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
];

interface CommandMenuProps {
  position: { top: number; left: number };
  onSelect: (action: string) => void;
  onClose: () => void;
}

/**
 * Command menu triggered by / key (T5.8, T6.8, T6.9).
 * Shows available actions for the editor.
 * Includes promote-to-task and promote-to-doc actions.
 */
export function CommandMenu(props: CommandMenuProps) {
  const [filter, setFilter] = createSignal("");
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  let menuRef: HTMLDivElement | undefined;

  const filteredCommands = () => {
    const f = filter().toLowerCase();
    return COMMANDS.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(f) ||
        cmd.description.toLowerCase().includes(f)
    );
  };

  function handleKeyDown(e: KeyboardEvent) {
    const cmds = filteredCommands();

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((i) => Math.min(i + 1, cmds.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter": {
        e.preventDefault();
        e.stopPropagation();
        const selected = cmds[selectedIndex()];
        if (selected) {
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
      if (menuRef && !menuRef.contains(e.target as Node)) {
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
      class="fixed z-50 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
      style={{
        top: `${props.position.top + 24}px`,
        left: `${props.position.left}px`,
      }}
    >
      <div class="border-b border-gray-100 px-2 py-1">
        <input
          type="text"
          class="w-full border-0 bg-transparent text-sm outline-none"
          placeholder="Type to filter..."
          value={filter()}
          onInput={(e) => {
            setFilter(e.currentTarget.value);
            setSelectedIndex(0);
          }}
          autofocus
        />
      </div>
      <div class="max-h-48 overflow-y-auto">
        <For each={filteredCommands()}>
          {(cmd, index) => (
            <button
              class={`flex w-full flex-col px-3 py-1.5 text-left ${
                index() === selectedIndex()
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
              onClick={() => props.onSelect(cmd.id)}
              onMouseEnter={() => setSelectedIndex(index())}
            >
              <span class="text-sm font-medium">{cmd.label}</span>
              <span class="text-xs text-gray-400">{cmd.description}</span>
            </button>
          )}
        </For>
      </div>
    </div>
  );
}
