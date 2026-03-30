import { For, Show, createMemo } from "solid-js";
import { BackButton } from "./BackButton";
import { DocItem } from "./DocItem";
import type { Doc } from "../../types/entities";

interface DocsListProps {
  docs: Doc[];
  activeDocPath: string | null;
  expanded: boolean;
  onToggleExpand: () => void;
  onDocClick: (doc: Doc) => void;
  onCreateDoc: () => void;
}

const MAX_VISIBLE = 10;

/**
 * Docs section in the left sidebar.
 * Shows pinned docs first, then recent docs, with a "show more" toggle.
 * Total visible docs capped at 10 (pinned + recent) unless expanded.
 * More than 10 pinned docs is allowed but no recent docs will show.
 */
export function DocsList(props: DocsListProps) {
  const pinnedDocs = createMemo(() =>
    props.docs
      .filter((d) => d.pinned)
      .sort((a, b) =>
        a.title.toLowerCase().localeCompare(b.title.toLowerCase())
      )
  );

  const recentDocs = createMemo(() =>
    props.docs
      .filter((d) => !d.pinned)
      .sort((a, b) =>
        a.title.toLowerCase().localeCompare(b.title.toLowerCase())
      )
  );

  const recentSlots = createMemo(() =>
    Math.max(0, MAX_VISIBLE - pinnedDocs().length)
  );

  const displayedRecent = createMemo(() => {
    if (props.expanded) return recentDocs();
    return recentDocs().slice(0, recentSlots());
  });

  const hiddenCount = createMemo(() => {
    if (props.expanded) return 0;
    return Math.max(0, recentDocs().length - recentSlots());
  });

  return (
    <div
      class={`px-3 py-2${props.expanded ? " flex min-h-0 flex-1 flex-col" : ""}`}
    >
      <div class="mb-1 flex items-center justify-between">
        <h2 class="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          Docs
        </h2>
        <div class="flex items-center gap-1">
          <Show when={props.expanded}>
            <BackButton onClick={() => props.onToggleExpand()} />
          </Show>
          <button
            class="rounded px-1 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300"
            onClick={() => props.onCreateDoc()}
          >
            +
          </button>
        </div>
      </div>
      <Show
        when={props.docs.length > 0}
        fallback={
          <p class="py-2 text-xs text-gray-300 dark:text-gray-600">
            No docs yet
          </p>
        }
      >
        <div
          class={`flex flex-col gap-0.5${props.expanded ? " min-h-0 flex-1 overflow-y-auto [&>*]:shrink-0" : ""}`}
        >
          {/* Pinned section */}
          <Show when={pinnedDocs().length > 0}>
            <div class="mb-0.5 mt-1 text-[10px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">
              Pinned
            </div>
            <For each={pinnedDocs()}>
              {(doc) => (
                <DocItem
                  doc={doc}
                  isActive={doc.path === props.activeDocPath}
                  onClick={(d) => props.onDocClick(d)}
                />
              )}
            </For>
          </Show>

          {/* Recent section */}
          <Show when={displayedRecent().length > 0}>
            <Show when={pinnedDocs().length > 0}>
              <div class="mb-0.5 mt-2 text-[10px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Recent
              </div>
            </Show>
            <For each={displayedRecent()}>
              {(doc) => (
                <DocItem
                  doc={doc}
                  isActive={doc.path === props.activeDocPath}
                  onClick={(d) => props.onDocClick(d)}
                />
              )}
            </For>
          </Show>
        </div>

        {/* Show more / show less toggle */}
        <Show when={hiddenCount() > 0 && !props.expanded}>
          <button
            class="mt-1 text-xs text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 cursor-pointer"
            onClick={() => props.onToggleExpand()}
          >
            Show all ({hiddenCount()})
          </button>
        </Show>
      </Show>
    </div>
  );
}
