import { Switch, Match, Show } from "solid-js";
import { JournalView } from "../journal/JournalView";
import { TaskDetail } from "../tasks/TaskDetail";
import { DocView } from "../docs/DocView";
import { TopicView } from "../topics/TopicView";
import { SearchView } from "../search/SearchView";
import { DraftView } from "../draft/DraftView";
import { FindBar } from "../editor/FindBar";
import { contextStore } from "../../stores/contextStore";
import { findStore } from "../../stores/findStore";
import type { ViewType } from "../../types/stores";
import type { Task, Doc } from "../../types/entities";

interface CenterPanelProps {
  activeView: ViewType;
  onNewNote: (date: string) => void;
  noteDraftDate: string | null;
  onNoteDraftClear: () => void;
}

/**
 * Center panel that switches content based on active view (FR-UI-020, FR-UI-021).
 * Supports journal, task detail, doc, topic, and draft views.
 */
export function CenterPanel(props: CenterPanelProps) {
  return (
    <div class="relative h-full bg-white dark:bg-gray-800">
      <Show when={findStore.visible}>
        <FindBar />
      </Show>
      <Show
        when={contextStore.draft}
        fallback={
          <Switch>
            <Match when={props.activeView === "journal"}>
              <JournalView
                onNewNote={(d) => props.onNewNote(d)}
                draftDate={props.noteDraftDate}
                onDraftClear={() => props.onNoteDraftClear()}
              />
            </Match>
            <Match when={props.activeView === "task"}>
              <Show
                when={
                  contextStore.activeEntity?.type === "task"
                    ? (contextStore.activeEntity as Task)
                    : null
                }
                fallback={
                  <div class="p-6 text-sm text-gray-400 dark:text-gray-500">
                    No task selected
                  </div>
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
                  <div class="p-6 text-sm text-gray-400 dark:text-gray-500">
                    No document selected
                  </div>
                }
              >
                {(doc) => <DocView doc={doc()} />}
              </Show>
            </Match>
            <Match when={props.activeView === "topic"}>
              <TopicView />
            </Match>
            <Match when={props.activeView === "search"}>
              <SearchView />
            </Match>
          </Switch>
        }
      >
        <DraftView />
      </Show>
    </div>
  );
}
