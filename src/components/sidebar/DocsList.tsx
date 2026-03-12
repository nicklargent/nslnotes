import { For, Show } from "solid-js";
import { DocItem } from "./DocItem";
import type { Doc } from "../../types/entities";

interface DocsListProps {
  docs: Doc[];
  onDocClick: (doc: Doc) => void;
  onCreateDoc: () => void;
}

/**
 * Docs section in the left sidebar.
 * Renders all docs sorted alphabetically (FR-UI-012).
 */
export function DocsList(props: DocsListProps) {
  return (
    <div class="px-3 py-2">
      <div class="mb-1 flex items-center justify-between">
        <h2 class="text-xs font-semibold uppercase tracking-wider text-gray-400">
          Docs
        </h2>
        <button
          class="rounded px-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          onClick={() => props.onCreateDoc()}
        >
          +
        </button>
      </div>
      <Show
        when={props.docs.length > 0}
        fallback={<p class="py-2 text-xs text-gray-300">No docs yet</p>}
      >
        <div class="flex flex-col gap-0.5">
          <For each={props.docs}>
            {(doc) => (
              <DocItem doc={doc} onClick={(d) => props.onDocClick(d)} />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
