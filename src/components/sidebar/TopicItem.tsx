import type { Topic } from "../../types/topics";

interface TopicItemProps {
  topic: Topic;
  isRelevant: boolean;
  onClick: (topic: Topic) => void;
}

/**
 * Single topic/person item in the sidebar.
 * Distinguishes # topics from @ people visually.
 * Shows a subtle highlight when the topic is mentioned by the current entity.
 */
export function TopicItem(props: TopicItemProps) {
  const isPerson = () => props.topic.kind === "person";

  return (
    <button
      class={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm transition-colors duration-200 ${
        props.isRelevant
          ? isPerson()
            ? "border-l-2 border-purple-300 bg-purple-50"
            : "border-l-2 border-blue-300 bg-blue-50"
          : "hover:bg-gray-100"
      }`}
      onClick={() => props.onClick(props.topic)}
    >
      <span class={isPerson() ? "text-purple-500" : "text-blue-500"}>
        {isPerson() ? "@" : "#"}
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
