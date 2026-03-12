import { For, Show } from "solid-js";
import { TaskItem } from "./TaskItem";
import type { Task } from "../../types/entities";

interface TaskGroupProps {
  label: string;
  tasks: Task[];
  highlightedPath: string | null;
  onTaskClick: (task: Task) => void;
}

/**
 * A group of tasks with a section header (RELATED, OVERDUE, THIS WEEK, LATER).
 */
export function TaskGroup(props: TaskGroupProps) {
  return (
    <Show when={props.tasks.length > 0}>
      <div class="mb-3">
        <h3 class="mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
          {props.label}
        </h3>
        <div class="flex flex-col gap-0.5">
          <For each={props.tasks}>
            {(task) => (
              <TaskItem
                task={task}
                isHighlighted={task.path === props.highlightedPath}
                onClick={(t) => props.onTaskClick(t)}
              />
            )}
          </For>
        </div>
      </div>
    </Show>
  );
}
