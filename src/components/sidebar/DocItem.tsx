import { setWikilinkDragData } from "../../lib/drag";
import type { Doc } from "../../types/entities";

interface DocItemProps {
  doc: Doc;
  isRelevant: boolean;
  isActive: boolean;
  onClick: (doc: Doc) => void;
}

/**
 * Single doc item in the sidebar Docs list.
 * Shows a subtle highlight when the current entity wikilinks to this doc.
 */
export function DocItem(props: DocItemProps) {
  return (
    <button
      class={`w-full truncate rounded px-2 py-1 text-left text-sm transition-colors duration-200 ${
        props.isActive
          ? "bg-blue-50 text-gray-700 ring-1 ring-blue-200 dark:bg-blue-900/30 dark:text-gray-200"
          : props.isRelevant
            ? "border-l-2 border-blue-300 bg-blue-50 text-gray-700 dark:bg-blue-900/30 dark:text-gray-200"
            : "text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
      }`}
      title={`[[doc:${props.doc.slug}]]`}
      onClick={() => props.onClick(props.doc)}
      draggable={true}
      onDragStart={(e: DragEvent) =>
        setWikilinkDragData(e, "doc", props.doc.slug)
      }
    >
      {props.doc.title}
    </button>
  );
}
