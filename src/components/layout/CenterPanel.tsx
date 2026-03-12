import { Switch, Match, Show } from "solid-js";
import { JournalView } from "../journal/JournalView";
import { TaskDetail } from "../tasks/TaskDetail";
import { DocView } from "../docs/DocView";
import { TopicView } from "../topics/TopicView";
import { contextStore } from "../../stores/contextStore";
import type { ViewType } from "../../types/stores";
import type { Task, Doc } from "../../types/entities";

interface CenterPanelProps {
  activeView: ViewType;
  onNewNote: (date: string) => void;
}

/**
 * Center panel that switches content based on active view (FR-UI-020, FR-UI-021).
 * Supports journal, task detail, doc, and topic views.
 */
export function CenterPanel(props: CenterPanelProps) {
  return (
    <div class="h-full bg-white">
      <Switch>
        <Match when={props.activeView === "journal"}>
          <JournalView onNewNote={(d) => props.onNewNote(d)} />
        </Match>
        <Match when={props.activeView === "task"}>
          <Show
            when={
              contextStore.activeEntity?.type === "task"
                ? (contextStore.activeEntity as Task)
                : null
            }
            fallback={
              <div class="p-6 text-sm text-gray-400">No task selected</div>
            }
          >
            {(task) => <TaskDetail task={task()} />}
          </Show>
        </Match>
        <Match when={props.activeView === "doc"}>
          <Show
            when={
              contextStore.activeEntity?.type === "doc"
                ? (contextStore.activeEntity as Doc)
                : null
            }
            fallback={
              <div class="p-6 text-sm text-gray-400">No document selected</div>
            }
          >
            {(doc) => <DocView doc={doc()} />}
          </Show>
        </Match>
        <Match when={props.activeView === "topic"}>
          <TopicView />
        </Match>
      </Switch>
    </div>
  );
}
