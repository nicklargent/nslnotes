import { makePointerDragHandler, setWikilinkDragData } from "../../lib/drag";
import { UncheckedIndicator } from "../metadata/UncheckedIndicator";
import { StarIcon } from "../icons/StarIcon";
import { EntityService } from "../../services/EntityService";
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
      class={`group flex w-full items-center gap-1.5 truncate rounded px-2 py-1 text-left text-sm transition-colors duration-200 ${
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
      <span
        role="button"
        tabindex="-1"
        class={`flex-shrink-0 ${
          props.doc.pinned
            ? "text-amber-500 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300"
            : "text-transparent group-hover:text-gray-300 dark:group-hover:text-gray-600 group-hover:hover:text-amber-400"
        }`}
        title={props.doc.pinned ? "Unpin doc" : "Pin doc"}
        onClick={(e) => {
          e.stopPropagation();
          void EntityService.updateFrontmatter(props.doc.path, {
            pinned: props.doc.pinned ? null : true,
          });
        }}
      >
        <StarIcon class="h-3 w-3" filled={props.doc.pinned} />
      </span>
      <span class="truncate">{props.doc.title}</span>
      <UncheckedIndicator show={props.doc.hasUnchecked} />
    </button>
  );
}
