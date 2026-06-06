import { createSignal, Show, Switch, Match } from "solid-js";
import { TaskGroup } from "../tasks/TaskGroup";
import { ClosedTaskItem } from "../tasks/ClosedTaskItem";
import { APP_VERSION, APP_COMMIT } from "virtual:app-version";
import type { Task } from "../../types/entities";
import type { GroupedTasks, GroupedClosedTasks } from "../../types/task-groups";

type TaskView = "open" | "pinned" | "closed";

interface RightPanelProps {
  groupedTasks: GroupedTasks;
  groupedPinnedTasks: GroupedTasks;
  groupedClosedTasks: GroupedClosedTasks;
  highlightedTaskPath: string | null;
  onTaskClick: (task: Task) => void;
  onCreateTask: () => void;
}

const VIEW_TITLES: Record<TaskView, string> = {
  open: "Open Tasks",
  pinned: "Pinned Tasks",
  closed: "Closed Tasks",
};

/**
 * Right panel displaying tasks grouped into sections.
 * Filter between open, pinned (focus), and closed (done/cancelled) views.
 */
export function RightPanel(props: RightPanelProps) {
  const [view, setView] = createSignal<TaskView>("open");

  const hasClosedTasks = () => {
    const g = props.groupedClosedTasks;
    return (
      g.thisWeek.length > 0 || g.lastMonth.length > 0 || g.older.length > 0
    );
  };

  const hasPinnedTasks = () => {
    const g = props.groupedPinnedTasks;
    return (
      g.overdue.length > 0 ||
      g.thisWeek.length > 0 ||
      g.nextWeek.length > 0 ||
      g.later.length > 0
    );
  };

  const closedItemRenderer = (task: Task) => (
    <ClosedTaskItem task={task} onClick={(t) => props.onTaskClick(t)} />
  );

  const tabClass = (v: TaskView) =>
    `rounded px-1.5 py-0.5 text-xs ${
      view() === v
        ? "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200"
        : "text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300"
    }`;

  // Render the four due-date groups shared by the open and pinned views.
  const openGroups = (groups: GroupedTasks) => (
    <>
      <TaskGroup
        label="Overdue"
        tasks={groups.overdue}
        highlightedPath={props.highlightedTaskPath}
        onTaskClick={(t) => props.onTaskClick(t)}
      />
      <TaskGroup
        label="This Week"
        tasks={groups.thisWeek}
        highlightedPath={props.highlightedTaskPath}
        onTaskClick={(t) => props.onTaskClick(t)}
      />
      <TaskGroup
        label="Next Week"
        tasks={groups.nextWeek}
        highlightedPath={props.highlightedTaskPath}
        onTaskClick={(t) => props.onTaskClick(t)}
      />
      <TaskGroup
        label="Later"
        tasks={groups.later}
        highlightedPath={props.highlightedTaskPath}
        onTaskClick={(t) => props.onTaskClick(t)}
      />
    </>
  );

  return (
    <div class="flex h-full flex-col">
      {/* Header */}
      <div class="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-3 py-3">
        <div class="flex items-center gap-1">
          <h2 class="sr-only">{VIEW_TITLES[view()]}</h2>
          <button
            class={tabClass("open")}
            onClick={() => setView("open")}
            title="Show open tasks"
          >
            Open
          </button>
          <button
            class={tabClass("pinned")}
            onClick={() => setView("pinned")}
            title="Show pinned tasks"
          >
            Pinned
          </button>
          <button
            class={tabClass("closed")}
            onClick={() => setView("closed")}
            title="Show closed tasks"
          >
            Closed
          </button>
        </div>
        <button
          class="rounded px-1.5 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300"
          onClick={() => props.onCreateTask()}
          title="New task"
        >
          +
        </button>
      </div>

      {/* Task content */}
      <div class="flex-1 overflow-y-auto px-1 py-2">
        <Switch>
          <Match when={view() === "open"}>
            {openGroups(props.groupedTasks)}
          </Match>
          <Match when={view() === "pinned"}>
            <Show
              when={hasPinnedTasks()}
              fallback={
                <p class="px-2 py-4 text-center text-xs text-gray-400 dark:text-gray-500">
                  No pinned tasks — pin a task to focus on it
                </p>
              }
            >
              {openGroups(props.groupedPinnedTasks)}
            </Show>
          </Match>
          <Match when={view() === "closed"}>
            <Show
              when={hasClosedTasks()}
              fallback={
                <p class="px-2 py-4 text-center text-xs text-gray-400 dark:text-gray-500">
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
          </Match>
        </Switch>
      </div>

      <div
        class="border-t border-gray-200 px-3 py-1.5 text-right text-xs text-gray-400 select-text dark:border-gray-700 dark:text-gray-500"
        title={`NslNotes v${APP_VERSION} (${APP_COMMIT})`}
      >
        v{APP_VERSION}
        <span class="ml-1 text-gray-300 dark:text-gray-600">
          ({APP_COMMIT})
        </span>
      </div>
    </div>
  );
}
