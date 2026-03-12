import type { Doc } from "../../types/entities";

interface DocItemProps {
  doc: Doc;
  onClick: (doc: Doc) => void;
}

/**
 * Single doc item in the sidebar Docs list.
 */
export function DocItem(props: DocItemProps) {
  return (
    <button
      class="w-full truncate rounded px-2 py-1 text-left text-sm text-gray-700 hover:bg-gray-100"
      onClick={() => props.onClick(props.doc)}
    >
      {props.doc.title}
    </button>
  );
}
