import { makePointerDragHandler, setWikilinkDragData } from "../../lib/drag";
import { EntityService } from "../../services/EntityService";
import type { Task } from "../../types/entities";

interface ClosedTaskItemProps {
  task: Task;
  onClick: (task: Task) => void;
}

/**
 * A closed (done/cancelled) task item with status indicator and reopen action.
 */
export function ClosedTaskItem(props: ClosedTaskItemProps) {
  async function handleReopen(e: MouseEvent) {
    e.stopPropagation();
    await EntityService.updateTaskStatus(props.task.path, "open");
  }

  const isDone = () => props.task.status === "done";

  return (
    <div
      class="group flex w-full items-center gap-1 rounded px-2 py-1.5 text-left text-sm text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700"
      draggable={true}
      onDragStart={(e: DragEvent) =>
        setWikilinkDragData(e, "task", props.task.slug)
      }
      onPointerDown={makePointerDragHandler(
        () => `[[task:${props.task.slug}]]`
      )}
    >
      {/* Status indicator */}
      <span
        class={`flex h-4 w-4 flex-shrink-0 items-center justify-center text-xs ${
          isDone() ? "text-green-400" : "text-red-300"
        }`}
        title={isDone() ? "Done" : "Cancelled"}
      >
        {isDone() ? "\u2713" : "\u2715"}
      </span>

      {/* Title */}
      <button
        class="flex-1 truncate text-left line-through"
        title={`[[task:${props.task.slug}]]`}
        onClick={() => props.onClick(props.task)}
      >
        {props.task.title}
      </button>

      {/* Reopen button - shown on hover */}
      <button
        class="flex-shrink-0 text-xs text-transparent group-hover:text-gray-400 dark:group-hover:text-gray-500 group-hover:hover:text-blue-500"
        onClick={(e) => void handleReopen(e)}
        title="Reopen task"
      >
        ↩
      </button>
    </div>
  );
}
