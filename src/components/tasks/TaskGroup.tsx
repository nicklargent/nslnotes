import { For, type JSX, Show } from "solid-js";
import { TaskItem } from "./TaskItem";
import type { Task } from "../../types/entities";

interface TaskGroupProps {
  label: string;
  tasks: Task[];
  highlightedPath?: string | null;
  onTaskClick: (task: Task) => void;
  /** Optional custom item renderer. Defaults to TaskItem. */
  renderItem?: (task: Task) => JSX.Element;
}

/**
 * A group of tasks with a section header.
 */
export function TaskGroup(props: TaskGroupProps) {
  return (
    <Show when={props.tasks.length > 0}>
      <div class="mb-3">
        <h3 class="mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          {props.label}
        </h3>
        <div class="flex flex-col gap-0.5">
          <For each={props.tasks}>
            {(task) =>
              props.renderItem ? (
                props.renderItem(task)
              ) : (
                <TaskItem
                  task={task}
                  isHighlighted={task.path === (props.highlightedPath ?? null)}
                  onClick={(t) => props.onTaskClick(t)}
                />
              )
            }
          </For>
        </div>
      </div>
    </Show>
  );
}
