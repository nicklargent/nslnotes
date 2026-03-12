import { createSignal, For, onMount, onCleanup } from "solid-js";
import type { EditorMode } from "../../types/stores";

interface CommandMenuItem {
  id: string;
  label: string;
  description: string;
  modes: EditorMode[];
}

const COMMANDS: CommandMenuItem[] = [
  {
    id: "heading1",
    label: "Heading 1",
    description: "Large section heading",
    modes: ["prose"],
  },
  {
    id: "heading2",
    label: "Heading 2",
    description: "Medium section heading",
    modes: ["prose"],
  },
  {
    id: "heading3",
    label: "Heading 3",
    description: "Small section heading",
    modes: ["prose"],
  },
  {
    id: "bullet-list",
    label: "Bullet List",
    description: "Unordered list",
    modes: ["prose"],
  },
  {
    id: "ordered-list",
    label: "Ordered List",
    description: "Numbered list",
    modes: ["prose"],
  },
  {
    id: "code-block",
    label: "Code Block",
    description: "Code snippet",
    modes: ["prose", "outliner"],
  },
  {
    id: "bold",
    label: "Bold",
    description: "Bold text",
    modes: ["prose", "outliner"],
  },
  {
    id: "italic",
    label: "Italic",
    description: "Italic text",
    modes: ["prose", "outliner"],
  },
  {
    id: "divider",
    label: "Divider",
    description: "Horizontal rule",
    modes: ["prose"],
  },
];

interface CommandMenuProps {
  position: { top: number; left: number };
  mode: EditorMode;
  onSelect: (action: string) => void;
  onClose: () => void;
}

/**
 * Command menu triggered by / key (T5.8).
 * Shows available actions filtered by current editor mode.
 */
export function CommandMenu(props: CommandMenuProps) {
  const [filter, setFilter] = createSignal("");
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  let menuRef: HTMLDivElement | undefined;

  const filteredCommands = () => {
    const f = filter().toLowerCase();
    return COMMANDS.filter(
      (cmd) =>
        cmd.modes.includes(props.mode) &&
        (cmd.label.toLowerCase().includes(f) ||
          cmd.description.toLowerCase().includes(f))
    );
  };

  function handleKeyDown(e: KeyboardEvent) {
    const cmds = filteredCommands();

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, cmds.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter": {
        e.preventDefault();
        const selected = cmds[selectedIndex()];
        if (selected) {
          props.onSelect(selected.id);
        }
        break;
      }
      case "Escape":
        e.preventDefault();
        props.onClose();
        break;
    }
  }

  onMount(() => {
    document.addEventListener("keydown", handleKeyDown);
    function handleClickOutside(e: MouseEvent) {
      if (menuRef && !menuRef.contains(e.target as Node)) {
        props.onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);

    onCleanup(() => {
      document.removeEventListener("keydown", handleKeyDown);
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
