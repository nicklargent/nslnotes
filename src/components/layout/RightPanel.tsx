import { createSignal, Show } from "solid-js";
import { TaskGroup } from "../tasks/TaskGroup";
import { ClosedTaskItem } from "../tasks/ClosedTaskItem";
import type { Task } from "../../types/entities";
import type { GroupedTasks, GroupedClosedTasks } from "../../types/task-groups";

interface RightPanelProps {
  groupedTasks: GroupedTasks;
  groupedClosedTasks: GroupedClosedTasks;
  highlightedTaskPath: string | null;
  linkedPaths: Set<string>;
  onTaskClick: (task: Task) => void;
  onCreateTask: () => void;
}

/**
 * Right panel displaying tasks grouped into sections.
 * Toggle between open and closed (done/cancelled) views.
 */
export function RightPanel(props: RightPanelProps) {
  const [showClosed, setShowClosed] = createSignal(false);

  const hasClosedTasks = () => {
    const g = props.groupedClosedTasks;
    return (
      g.thisWeek.length > 0 || g.lastMonth.length > 0 || g.older.length > 0
    );
  };

  const closedItemRenderer = (task: Task) => (
    <ClosedTaskItem task={task} onClick={(t) => props.onTaskClick(t)} />
  );

  return (
    <div class="flex h-full flex-col">
      {/* Header */}
      <div class="flex items-center justify-between border-b border-gray-200 px-3 py-3">
        <div class="flex items-center gap-2">
          <h2 class="text-sm font-semibold text-gray-700">
            {showClosed() ? "Closed Tasks" : "Open Tasks"}
          </h2>
          <button
            class="rounded px-1.5 py-0.5 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            onClick={() => setShowClosed((s) => !s)}
            title={showClosed() ? "Show open tasks" : "Show closed tasks"}
          >
            {showClosed() ? "Open" : "Closed"}
          </button>
        </div>
        <Show when={!showClosed()}>
          <button
            class="rounded px-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            onClick={() => props.onCreateTask()}
          >
            +
          </button>
        </Show>
      </div>

      {/* Task content */}
      <div class="flex-1 overflow-y-auto px-1 py-2">
        <Show
          when={!showClosed()}
          fallback={
            <Show
              when={hasClosedTasks()}
              fallback={
                <p class="px-2 py-4 text-center text-xs text-gray-400">
                  No closed tasks
                </p>
              }
            >
              <TaskGroup
                label="This Week"
                tasks={props.groupedClosedTasks.thisWeek}
                onTaskClick={props.onTaskClick}
                renderItem={closedItemRenderer}
              />
              <TaskGroup
                label="Last Month"
                tasks={props.groupedClosedTasks.lastMonth}
                onTaskClick={props.onTaskClick}
                renderItem={closedItemRenderer}
              />
              <TaskGroup
                label="Older"
                tasks={props.groupedClosedTasks.older}
                onTaskClick={props.onTaskClick}
                renderItem={closedItemRenderer}
              />
            </Show>
          }
        >
          <TaskGroup
            label="Overdue"
            tasks={props.groupedTasks.overdue}
            highlightedPath={props.highlightedTaskPath}
            linkedPaths={props.linkedPaths}
            onTaskClick={(t) => props.onTaskClick(t)}
          />
          <TaskGroup
            label="This Week"
            tasks={props.groupedTasks.thisWeek}
            highlightedPath={props.highlightedTaskPath}
            linkedPaths={props.linkedPaths}
            onTaskClick={(t) => props.onTaskClick(t)}
          />
          <TaskGroup
            label="Later"
            tasks={props.groupedTasks.later}
            highlightedPath={props.highlightedTaskPath}
            linkedPaths={props.linkedPaths}
            onTaskClick={(t) => props.onTaskClick(t)}
          />
        </Show>
      </div>
    </div>
  );
}
