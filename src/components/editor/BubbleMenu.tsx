import { createSignal, Show, onMount, onCleanup } from "solid-js";
import type { Editor as TiptapEditor } from "@tiptap/core";

interface BubbleMenuProps {
  editor: TiptapEditor;
  onClose: () => void;
  ref?: ((el: HTMLDivElement) => void) | undefined;
}

interface MenuPosition {
  top: number;
  left: number;
}

/**
 * Floating toolbar that appears on text selection.
 * Allows toggling formatting (bold, italic, strike, code, headings, link).
 */
export function BubbleMenu(props: BubbleMenuProps) {
  const [position, setPosition] = createSignal<MenuPosition>({
    top: 0,
    left: 0,
  });
  const [linkMode, setLinkMode] = createSignal(false);
  const [linkUrl, setLinkUrl] = createSignal("");
  let menuRef: HTMLDivElement | undefined;
  let linkInputRef: HTMLInputElement | undefined;

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
      if (e.key === "Escape" && !linkMode()) {
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
    format: ToggleFormat | "link",
    attrs?: Record<string, unknown>
  ): boolean {
    return props.editor.isActive(format, attrs);
  }

  function handleLinkClick(e: MouseEvent) {
    e.stopPropagation();
    const existingHref = props.editor.getAttributes("link")["href"] as
      | string
      | undefined;
    setLinkUrl(existingHref ?? "");
    setLinkMode(true);
    setTimeout(() => linkInputRef?.focus(), 0);
  }

  function applyLink() {
    const url = linkUrl().trim();
    if (url) {
      props.editor.chain().focus().setLink({ href: url }).run();
    }
    setLinkMode(false);
  }

  function removeLink() {
    props.editor.chain().focus().unsetLink().run();
    setLinkMode(false);
  }

  function handleLinkKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      applyLink();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setLinkMode(false);
    }
  }

  const btnClass = (active: boolean) =>
    `px-2 py-1 text-sm rounded transition-colors ${
      active ? "bg-blue-100 text-blue-700" : "text-gray-600 hover:bg-gray-100"
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
      <Show
        when={!linkMode()}
        fallback={
          <div class="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 shadow-lg">
            <input
              ref={linkInputRef}
              type="text"
              class="w-48 border-0 bg-transparent text-sm outline-none"
              placeholder="Enter URL..."
              value={linkUrl()}
              onInput={(e) => setLinkUrl(e.currentTarget.value)}
              onKeyDown={handleLinkKeyDown}
            />
            <button
              class="px-2 py-0.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded"
              onClick={applyLink}
            >
              Apply
            </button>
            <Show when={isActive("link")}>
              <button
                class="px-2 py-0.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded"
                onClick={removeLink}
              >
                Remove
              </button>
            </Show>
            <button
              class="px-1 py-0.5 text-xs text-gray-400 hover:text-gray-600"
              onClick={() => setLinkMode(false)}
            >
              Esc
            </button>
          </div>
        }
      >
        <div class="flex items-center gap-0.5 rounded-lg border border-gray-200 bg-white px-1 py-0.5 shadow-lg">
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

          <div class="mx-0.5 h-5 w-px bg-gray-200" />

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

          <div class="mx-0.5 h-5 w-px bg-gray-200" />

          <button
            class={btnClass(isActive("link"))}
            onClick={handleLinkClick}
            title="Link"
          >
            <span class="text-xs">Link</span>
          </button>
        </div>
      </Show>
    </div>
  );
}
