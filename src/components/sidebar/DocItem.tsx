import { Show } from "solid-js";
import { makePointerDragHandler, setWikilinkDragData } from "../../lib/drag";
import type { Doc } from "../../types/entities";

interface DocItemProps {
  doc: Doc;
  isActive: boolean;
  onClick: (doc: Doc) => void;
}

/**
 * Single doc item in the sidebar Docs list.
 * Shows active highlight when this doc is currently selected.
 * Shows a filled star icon for pinned docs.
 */
export function DocItem(props: DocItemProps) {
  return (
    <button
      class={`flex w-full items-center gap-1.5 truncate rounded px-2 py-1 text-left text-sm transition-colors duration-200 ${
        props.isActive
          ? "bg-blue-50 text-gray-700 ring-1 ring-blue-200 dark:bg-blue-900/30 dark:text-gray-200"
          : "text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
      }`}
      title={`[[doc:${props.doc.slug}]]`}
      onClick={() => props.onClick(props.doc)}
      draggable={true}
      onDragStart={(e: DragEvent) =>
        setWikilinkDragData(e, "doc", props.doc.slug)
      }
      onPointerDown={makePointerDragHandler(() => `[[doc:${props.doc.slug}]]`)}
    >
      <Show when={props.doc.pinned}>
        <svg
          class="h-3 w-3 flex-shrink-0 text-amber-500 dark:text-amber-400"
          viewBox="0 0 24 24"
          fill="currentColor"
          stroke="currentColor"
          stroke-width="1"
        >
          <path d="M12 2l2.09 6.26L21 9.27l-5 3.64L17.18 20 12 16.77 6.82 20 8 12.91l-5-3.64 6.91-1.01z" />
        </svg>
      </Show>
      <span class="truncate">{props.doc.title}</span>
    </button>
  );
}
