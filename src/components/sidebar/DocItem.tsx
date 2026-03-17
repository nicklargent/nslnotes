import { setWikilinkDragData } from "../../lib/drag";
import type { Doc } from "../../types/entities";

interface DocItemProps {
  doc: Doc;
  isRelevant: boolean;
  onClick: (doc: Doc) => void;
}

/**
 * Single doc item in the sidebar Docs list.
 * Shows a subtle highlight when the current entity wikilinks to this doc.
 */
export function DocItem(props: DocItemProps) {
  return (
    <button
      class={`w-full truncate rounded px-2 py-1 text-left text-sm text-gray-700 dark:text-gray-200 transition-colors duration-200 ${
        props.isRelevant
          ? "border-l-2 border-blue-300 bg-blue-50 dark:bg-blue-900/30"
          : "hover:bg-gray-100 dark:hover:bg-gray-700"
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
