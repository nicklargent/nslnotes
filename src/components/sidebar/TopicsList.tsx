import { For, Show } from "solid-js";
import { TopicItem } from "./TopicItem";
import type { Topic, TopicRef } from "../../types/topics";

interface TopicsListProps {
  title?: string;
  fallbackText?: string;
  topics: Topic[];
  activeTopics: Set<TopicRef>;
  onTopicClick: (ref: TopicRef) => void;
}

/**
 * Topics section in the left sidebar.
 * Renders active topics sorted alphabetically (FR-UI-011).
 */
export function TopicsList(props: TopicsListProps) {
  return (
    <div class="border-b border-gray-100 px-3 py-2">
      <h2 class="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">
        {props.title ?? "Topics"}
      </h2>
      <Show
        when={props.topics.length > 0}
        fallback={
          <p class="py-2 text-xs text-gray-300">
            {props.fallbackText ?? "No topics yet"}
          </p>
        }
      >
        <div class="flex flex-col gap-0.5">
          <For each={props.topics}>
            {(topic) => (
              <TopicItem
                topic={topic}
                isRelevant={props.activeTopics.has(topic.ref)}
                onClick={(t) => props.onTopicClick(t.ref)}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
