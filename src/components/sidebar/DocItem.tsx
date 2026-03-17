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
      class={`w-full truncate rounded px-2 py-1 text-left text-sm text-gray-700 transition-colors duration-200 ${
        props.isRelevant
          ? "border-l-2 border-blue-300 bg-blue-50"
          : "hover:bg-gray-100"
      }`}
      title={`[[doc:${props.doc.slug}]]`}
      onClick={() => props.onClick(props.doc)}
    >
      {props.doc.title}
    </button>
  );
}
