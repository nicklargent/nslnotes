import { createSignal, Show } from "solid-js";
import type { Topic } from "../../types/topics";

interface TopicItemProps {
  topic: Topic;
  isRelevant: boolean;
  onClick: (topic: Topic) => void;
  onEditLabel: (topic: Topic, newLabel: string) => void;
}

/**
 * Single topic/person item in the sidebar.
 * Distinguishes # topics from @ people visually.
 * Shows a subtle highlight when the topic is mentioned by the current entity.
 */
export function TopicItem(props: TopicItemProps) {
  const isPerson = () => props.topic.kind === "person";
  const [editing, setEditing] = createSignal(false);

  function startEdit(e: MouseEvent) {
    e.stopPropagation();
    setEditing(true);
  }

  function commitEdit(value: string) {
    setEditing(false);
    props.onEditLabel(props.topic, value);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      commitEdit((e.target as HTMLInputElement).value);
    } else if (e.key === "Escape") {
      setEditing(false);
    }
  }

  return (
    <button
      class={`group flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm transition-colors duration-200 ${
        props.isRelevant
          ? isPerson()
            ? "border-l-2 border-purple-300 bg-purple-50 dark:bg-purple-900/30"
            : "border-l-2 border-blue-300 bg-blue-50 dark:bg-blue-900/30"
          : "hover:bg-gray-100 dark:hover:bg-gray-700"
      }`}
      onClick={() => props.onClick(props.topic)}
    >
      <span class={isPerson() ? "text-purple-500" : "text-blue-500"}>
        {isPerson() ? "@" : "#"}
      </span>
      <Show
        when={editing()}
        fallback={
          <span class="truncate text-gray-700 dark:text-gray-200">
            {props.topic.label.replace(/^[#@]/, "")}
          </span>
        }
      >
        <input
          type="text"
          class="min-w-0 flex-1 rounded border border-blue-300 bg-white dark:bg-gray-800 px-1 py-0 text-sm text-gray-700 dark:text-gray-200 outline-none focus:ring-1 focus:ring-blue-400"
          value={props.topic.label.replace(/^[#@]/, "")}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={handleKeyDown}
          onBlur={(e) => commitEdit(e.target.value)}
          ref={(el) =>
            setTimeout(() => {
              el.focus();
              el.select();
            })
          }
        />
      </Show>
      <Show when={!editing()}>
        {props.topic.openTaskCount > 0 && (
          <span class="ml-auto text-xs text-gray-400 dark:text-gray-500">
            {props.topic.openTaskCount}
          </span>
        )}
        <span
          class="ml-auto hidden shrink-0 cursor-pointer text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 group-hover:inline"
          onClick={startEdit}
          title="Edit label"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            <path d="m15 5 4 4" />
          </svg>
        </span>
      </Show>
    </button>
  );
}
