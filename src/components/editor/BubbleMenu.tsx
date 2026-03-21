import { createSignal, Show, onMount, onCleanup } from "solid-js";
import type { Editor as TiptapEditor } from "@tiptap/core";

interface BubbleMenuProps {
  editor: TiptapEditor;
  onClose: () => void;
  onExtract?: () => void;
  ref?: ((el: HTMLDivElement) => void) | undefined;
}

interface MenuPosition {
  top: number;
  left: number;
}

/**
 * Floating toolbar that appears on text selection.
 * Allows toggling formatting (bold, italic, strike, code, headings, link, extract).
 */
export function BubbleMenu(props: BubbleMenuProps) {
  const [position, setPosition] = createSignal<MenuPosition>({
    top: 0,
    left: 0,
  });
  let menuRef: HTMLDivElement | undefined;

  function updatePosition() {
    const { state, view } = props.editor;
    const { from, to } = state.selection;
    if (from === to) return;

    const startCoords = view.coordsAtPos(from);
    const endCoords = view.coordsAtPos(to);

    // Center horizontally between selection start and end
    const centerX = (startCoords.left + endCoords.right) / 2;
    // Position above the selection
    const top = startCoords.top - 8;
    setPosition({ top, left: centerX });
  }

  onMount(() => {
    updatePosition();

    function handleClickOutside(e: MouseEvent) {
      if (menuRef && !menuRef.contains(e.target as Node)) {
        props.onClose();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        props.onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown, true);

    onCleanup(() => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown, true);
    });
  });

  type ToggleFormat = "bold" | "italic" | "strike" | "code" | "heading";

  function toggle(format: ToggleFormat, attrs?: Record<string, unknown>) {
    const chain = props.editor.chain().focus();
    switch (format) {
      case "bold":
        chain.toggleBold().run();
        break;
      case "italic":
        chain.toggleItalic().run();
        break;
      case "strike":
        chain.toggleStrike().run();
        break;
      case "code":
        chain.toggleCode().run();
        break;
      case "heading":
        chain.toggleHeading(attrs as { level: 1 | 2 | 3 }).run();
        break;
    }
  }

  function isActive(
    format: ToggleFormat,
    attrs?: Record<string, unknown>
  ): boolean {
    return props.editor.isActive(format, attrs);
  }

  const btnClass = (active: boolean) =>
    `px-2 py-1 text-sm rounded transition-colors ${
      active
        ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700"
        : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
    }`;

  return (
    <div
      ref={(el) => {
        menuRef = el;
        props.ref?.(el);
      }}
      class="fixed z-50 animate-bubble-up"
      style={{
        top: `${position().top}px`,
        left: `${position().left}px`,
        transform: "translate(-50%, -100%)",
      }}
    >
      <div class="flex items-center gap-0.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-1 py-0.5 shadow-lg dark:shadow-gray-900/50">
        <button
          class={btnClass(isActive("bold"))}
          onClick={() => toggle("bold")}
          title="Bold"
        >
          <span class="font-bold">B</span>
        </button>
        <button
          class={btnClass(isActive("italic"))}
          onClick={() => toggle("italic")}
          title="Italic"
        >
          <span class="italic">I</span>
        </button>
        <button
          class={btnClass(isActive("strike"))}
          onClick={() => toggle("strike")}
          title="Strikethrough"
        >
          <span class="line-through">S</span>
        </button>
        <button
          class={btnClass(isActive("code"))}
          onClick={() => toggle("code")}
          title="Inline Code"
        >
          <span class="font-mono text-xs">&lt;&gt;</span>
        </button>

        <div class="mx-0.5 h-5 w-px bg-gray-200 dark:bg-gray-600" />

        <button
          class={btnClass(isActive("heading", { level: 1 }))}
          onClick={() => toggle("heading", { level: 1 })}
          title="Heading 1"
        >
          <span class="text-xs font-bold">H1</span>
        </button>
        <button
          class={btnClass(isActive("heading", { level: 2 }))}
          onClick={() => toggle("heading", { level: 2 })}
          title="Heading 2"
        >
          <span class="text-xs font-bold">H2</span>
        </button>
        <button
          class={btnClass(isActive("heading", { level: 3 }))}
          onClick={() => toggle("heading", { level: 3 })}
          title="Heading 3"
        >
          <span class="text-xs font-bold">H3</span>
        </button>

        <Show when={props.onExtract}>
          <div class="mx-0.5 h-5 w-px bg-gray-200 dark:bg-gray-600" />
          <button
            class={btnClass(false)}
            onClick={() => {
              props.onExtract?.();
              props.onClose();
            }}
            title="Extract to task or document"
          >
            <span class="text-xs">Extract</span>
          </button>
        </Show>
      </div>
    </div>
  );
}
