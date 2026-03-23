import { createSignal, Show } from "solid-js";
import { setWikilinkDragData } from "../../lib/drag";
import { EntityService } from "../../services/EntityService";
import { formatRelativeDate } from "../../lib/dates";
import type { Task } from "../../types/entities";

interface TaskItemProps {
  task: Task;
  isHighlighted: boolean;
  onClick: (task: Task) => void;
}

/**
 * Single task item in the right panel task list (FR-UI-034, T6.5).
 * Shows title and due date. Supports status updates with brief visual feedback.
 */
export function TaskItem(props: TaskItemProps) {
  const [completing, setCompleting] = createSignal<"done" | "cancelled" | null>(
    null
  );

  async function handleStatusChange(
    e: MouseEvent,
    status: "done" | "cancelled"
  ) {
    e.stopPropagation();
    setCompleting(status);
    // Brief delay before updating (FR-ENT-013)
    await new Promise((r) => setTimeout(r, 600));
    await EntityService.updateTaskStatus(props.task.path, status);
    setCompleting(null);
  }

  return (
    <div
      class={`group flex w-full items-center gap-1 rounded px-2 py-1.5 text-left text-sm transition-all duration-200 ${
        completing() === "done"
          ? "bg-green-50 dark:bg-green-900/30 opacity-60"
          : completing() === "cancelled"
            ? "bg-gray-50 dark:bg-gray-900 opacity-60"
            : props.isHighlighted
              ? "bg-blue-50 dark:bg-blue-900/30 ring-1 ring-blue-200"
              : "hover:bg-gray-100 dark:hover:bg-gray-700"
      }`}
      draggable={true}
      onDragStart={(e: DragEvent) =>
        setWikilinkDragData(e, "task", props.task.slug)
      }
    >
      {/* Checkbox button for quick done */}
      <button
        class="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border border-gray-300 dark:border-gray-600 text-xs text-transparent hover:border-green-400 hover:text-green-500"
        onClick={(e) => void handleStatusChange(e, "done")}
        title="Mark done"
      >
        <Show when={completing() === "done"} fallback={"\u2713"}>
          <span class="text-green-500">{"\u2713"}</span>
        </Show>
      </button>

      {/* Title */}
      <button
        class={`flex-1 truncate text-left ${
          completing()
            ? "line-through text-gray-400 dark:text-gray-500"
            : "text-gray-700 dark:text-gray-200"
        }`}
        title={`[[task:${props.task.slug}]]`}
        onClick={() => props.onClick(props.task)}
      >
        {props.task.title}
      </button>

      {/* Due date */}
      {props.task.due && (
        <span class="flex-shrink-0 text-xs text-gray-400 dark:text-gray-500">
          {formatRelativeDate(props.task.due)}
        </span>
      )}

      {/* Cancel button - shown on hover */}
      <button
        class="flex-shrink-0 text-xs text-transparent group-hover:text-gray-300 dark:group-hover:text-gray-600 group-hover:hover:text-red-400"
        onClick={(e) => void handleStatusChange(e, "cancelled")}
        title="Cancel task"
      >
        {"\u2715"}
      </button>
    </div>
  );
}
