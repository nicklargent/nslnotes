import { Show } from "solid-js";
import { TaskGroup } from "../tasks/TaskGroup";
import type { Task } from "../../types/entities";
import type { GroupedTasks } from "../../types/task-groups";

interface RightPanelProps {
  groupedTasks: GroupedTasks;
  isHomeState: boolean;
  highlightedTaskPath: string | null;
  onTaskClick: (task: Task) => void;
  onCreateTask: () => void;
}

/**
 * Right panel displaying open tasks grouped into sections (FR-UI-030–034).
 * RELATED section hidden when isHomeState = true (FR-UI-033).
 */
export function RightPanel(props: RightPanelProps) {
  return (
    <div class="flex h-full flex-col">
      {/* Header */}
      <div class="flex items-center justify-between border-b border-gray-200 px-3 py-3">
        <h2 class="text-sm font-semibold text-gray-700">Open Tasks</h2>
        <button
          class="rounded px-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          onClick={() => props.onCreateTask()}
        >
          +
        </button>
      </div>

      {/* Task groups */}
      <div class="flex-1 overflow-y-auto px-1 py-2">
        <Show when={!props.isHomeState}>
          <TaskGroup
            label="Related"
            tasks={props.groupedTasks.related}
            highlightedPath={props.highlightedTaskPath}
            onTaskClick={(t) => props.onTaskClick(t)}
          />
        </Show>
        <TaskGroup
          label="Overdue"
          tasks={props.groupedTasks.overdue}
          highlightedPath={props.highlightedTaskPath}
          onTaskClick={(t) => props.onTaskClick(t)}
        />
        <TaskGroup
          label="This Week"
          tasks={props.groupedTasks.thisWeek}
          highlightedPath={props.highlightedTaskPath}
          onTaskClick={(t) => props.onTaskClick(t)}
        />
        <TaskGroup
          label="Later"
          tasks={props.groupedTasks.later}
          highlightedPath={props.highlightedTaskPath}
          onTaskClick={(t) => props.onTaskClick(t)}
        />
      </div>
    </div>
  );
}
