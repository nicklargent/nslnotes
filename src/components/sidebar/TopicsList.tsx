import { For, Show, createMemo } from "solid-js";
import { BackButton } from "./BackButton";
import { TopicItem } from "./TopicItem";
import type { Topic, TopicRef } from "../../types/topics";

interface TopicsListProps {
  title?: string;
  fallbackText?: string;
  topics: Topic[];
  expanded: boolean;
  onToggleExpand: () => void;
  onTopicClick: (ref: TopicRef) => void;
  onEditLabel: (topic: Topic, newLabel: string) => void;
}

const COLLAPSED_LIMIT = 5;

/**
 * Topics section in the left sidebar.
 * Shows top 10 by weighted usage score, expandable to full alphabetical list.
 */
export function TopicsList(props: TopicsListProps) {
  const hasMore = () => props.topics.length > COLLAPSED_LIMIT;

  const displayedTopics = createMemo(() => {
    if (!props.expanded) {
      return props.topics.slice(0, COLLAPSED_LIMIT);
    }
    // When expanded, show all topics sorted alphabetically
    return [...props.topics].sort((a, b) =>
      a.label.toLowerCase().localeCompare(b.label.toLowerCase())
    );
  });

  return (
    <div
      class={`border-b border-gray-100 dark:border-gray-700 px-3 py-2${props.expanded ? " flex min-h-0 flex-1 flex-col" : ""}`}
    >
      <div class="mb-1 flex items-center justify-between">
        <h2 class="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          {props.title ?? "Topics"}
        </h2>
        <Show when={props.expanded}>
          <BackButton onClick={() => props.onToggleExpand()} />
        </Show>
      </div>
      <Show
        when={props.topics.length > 0}
        fallback={
          <p class="py-2 text-xs text-gray-300 dark:text-gray-600">
            {props.fallbackText ?? "No topics yet"}
          </p>
        }
      >
        <div
          class={`flex flex-col gap-0.5${props.expanded ? " min-h-0 flex-1 overflow-y-auto" : ""}`}
        >
          <For each={displayedTopics()}>
            {(topic) => (
              <TopicItem
                topic={topic}
                onClick={(t) => props.onTopicClick(t.ref)}
                onEditLabel={props.onEditLabel}
              />
            )}
          </For>
        </div>
        <Show when={hasMore() && !props.expanded}>
          <button
            class="mt-1 text-xs text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 cursor-pointer"
            onClick={() => props.onToggleExpand()}
          >
            Show all ({props.topics.length - COLLAPSED_LIMIT})
          </button>
        </Show>
      </Show>
    </div>
  );
}
