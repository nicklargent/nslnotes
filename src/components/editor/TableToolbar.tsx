import { createSignal, onMount, onCleanup } from "solid-js";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";

interface TableToolbarProps {
  editor: TiptapEditor;
  onClose: () => void;
  ref?: ((el: HTMLDivElement) => void) | undefined;
}

interface ToolbarPosition {
  top: number;
  left: number;
}

/**
 * Floating toolbar for table operations.
 * Appears above the table when cursor is in a cell without text selection.
 */
export function TableToolbar(props: TableToolbarProps) {
  const [position, setPosition] = createSignal<ToolbarPosition>({
    top: 0,
    left: 0,
  });
  let menuRef: HTMLDivElement | undefined;

  function updatePosition() {
    const { view } = props.editor;
    const { $from } = props.editor.state.selection;

    // Find the current cell to position toolbar near it
    let cellRect: DOMRect | null = null;
    for (let d = $from.depth; d > 0; d--) {
      const nodeName = $from.node(d).type.name;
      if (nodeName === "tableCell" || nodeName === "tableHeader") {
        const cellStart = $from.before(d);
        const dom = view.nodeDOM(cellStart);
        if (dom instanceof HTMLElement) {
          cellRect = dom.getBoundingClientRect();
        }
        break;
      }
    }

    // Find the table for horizontal centering
    for (let d = $from.depth; d > 0; d--) {
      if ($from.node(d).type.name === "table") {
        const tableStart = $from.before(d);
        const dom = view.nodeDOM(tableStart);
        if (dom instanceof HTMLElement) {
          const tableRect = dom.getBoundingClientRect();
          // Position above the current cell's row, centered on table
          const top = cellRect ? cellRect.top - 8 : tableRect.top - 8;
          setPosition({
            top,
            left: tableRect.left + tableRect.width / 2,
          });
        }
        return;
      }
    }
  }

  onMount(() => {
    updatePosition();

    // Reposition on selection changes (moving between cells)
    const handleTransaction = () => updatePosition();
    props.editor.on("selectionUpdate", handleTransaction);

    // Reposition on scroll so toolbar follows the active cell
    const scrollContainer =
      menuRef?.closest(".overflow-y-auto") ??
      document.querySelector(".overflow-y-auto");
    const handleScroll = () => updatePosition();
    scrollContainer?.addEventListener("scroll", handleScroll, {
      passive: true,
    });

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
      props.editor.off("selectionUpdate", handleTransaction);
      scrollContainer?.removeEventListener("scroll", handleScroll);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown, true);
    });
  });

  function insertParagraphBefore() {
    const { state } = props.editor;
    const { $from } = state.selection;
    for (let d = $from.depth; d > 0; d--) {
      if ($from.node(d).type.name === "table") {
        const insertPos = $from.before(d);
        const paragraph = state.schema.nodes["paragraph"]!.create();
        const tr = state.tr.insert(insertPos, paragraph);
        tr.setSelection(TextSelection.create(tr.doc, insertPos + 1));
        props.editor.view.dispatch(tr);
        props.onClose();
        return;
      }
    }
  }

  function insertParagraphAfter() {
    const { state } = props.editor;
    const { $from } = state.selection;
    for (let d = $from.depth; d > 0; d--) {
      if ($from.node(d).type.name === "table") {
        const insertPos = $from.after(d);
        const paragraph = state.schema.nodes["paragraph"]!.create();
        const tr = state.tr.insert(insertPos, paragraph);
        tr.setSelection(TextSelection.create(tr.doc, insertPos + 1));
        props.editor.view.dispatch(tr);
        props.onClose();
        return;
      }
    }
  }

  const btnClass =
    "px-2 py-1 text-xs rounded transition-colors text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 whitespace-nowrap";

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
        {/* Column operations */}
        <button
          class={btnClass}
          onClick={() => {
            props.editor.chain().focus().addColumnBefore().run();
          }}
          title="Add column before"
        >
          +Col←
        </button>
        <button
          class={btnClass}
          onClick={() => {
            props.editor.chain().focus().addColumnAfter().run();
          }}
          title="Add column after"
        >
          +Col→
        </button>
        <button
          class={btnClass}
          onClick={() => {
            props.editor.chain().focus().deleteColumn().run();
          }}
          title="Delete column"
        >
          −Col
        </button>

        <div class="mx-0.5 h-5 w-px bg-gray-200 dark:bg-gray-600" />

        {/* Row operations */}
        <button
          class={btnClass}
          onClick={() => {
            props.editor.chain().focus().addRowBefore().run();
          }}
          title="Add row above"
        >
          +Row↑
        </button>
        <button
          class={btnClass}
          onClick={() => {
            props.editor.chain().focus().addRowAfter().run();
          }}
          title="Add row below"
        >
          +Row↓
        </button>
        <button
          class={btnClass}
          onClick={() => {
            props.editor.chain().focus().deleteRow().run();
          }}
          title="Delete row"
        >
          −Row
        </button>

        <div class="mx-0.5 h-5 w-px bg-gray-200 dark:bg-gray-600" />

        {/* Escape / delete */}
        <button
          class={btnClass}
          onClick={insertParagraphBefore}
          title="Insert paragraph before table"
        >
          ¶↑
        </button>
        <button
          class={btnClass}
          onClick={insertParagraphAfter}
          title="Insert paragraph after table"
        >
          ¶↓
        </button>
        <button
          class={`${btnClass} text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30`}
          onClick={() => {
            props.editor.chain().focus().deleteTable().run();
            props.onClose();
          }}
          title="Delete table"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
