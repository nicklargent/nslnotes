import type { Task } from "../../types/entities";
import { formatRelativeDate } from "../../lib/dates";

interface TaskItemProps {
  task: Task;
  isHighlighted: boolean;
  onClick: (task: Task) => void;
}

/**
 * Single task item in the right panel task list.
 * Shows title and due date display (FR-UI-034).
 */
export function TaskItem(props: TaskItemProps) {
  return (
    <button
      class={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${
        props.isHighlighted
          ? "bg-blue-50 ring-1 ring-blue-200"
          : "hover:bg-gray-100"
      }`}
      onClick={() => props.onClick(props.task)}
    >
      <span class="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-400" />
      <span class="flex-1 truncate text-gray-700">{props.task.title}</span>
      {props.task.due && (
        <span class="flex-shrink-0 text-xs text-gray-400">
          {formatRelativeDate(props.task.due)}
        </span>
      )}
    </button>
  );
}
