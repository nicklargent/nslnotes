import type { Topic } from "../../types/topics";

interface TopicItemProps {
  topic: Topic;
  onClick: (topic: Topic) => void;
}

/**
 * Single topic/person item in the sidebar.
 * Distinguishes # topics from @ people visually.
 */
export function TopicItem(props: TopicItemProps) {
  return (
    <button
      class="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-gray-100"
      onClick={() => props.onClick(props.topic)}
    >
      <span
        class={
          props.topic.kind === "person" ? "text-purple-500" : "text-blue-500"
        }
      >
        {props.topic.kind === "person" ? "@" : "#"}
      </span>
      <span class="truncate text-gray-700">
        {props.topic.label.replace(/^[#@]/, "")}
      </span>
      {props.topic.openTaskCount > 0 && (
        <span class="ml-auto text-xs text-gray-400">
          {props.topic.openTaskCount}
        </span>
      )}
    </button>
  );
}
