import { Switch, Match } from "solid-js";
import { JournalView } from "../journal/JournalView";
import type { ViewType } from "../../types/stores";

interface CenterPanelProps {
  activeView: ViewType;
  onNewNote: (date: string) => void;
}

/**
 * Center panel that switches content based on active view (FR-UI-020, FR-UI-021).
 * Supports journal, task, doc, and topic views.
 */
export function CenterPanel(props: CenterPanelProps) {
  return (
    <div class="h-full bg-white">
      <Switch>
        <Match when={props.activeView === "journal"}>
          <JournalView onNewNote={(d) => props.onNewNote(d)} />
        </Match>
        <Match when={props.activeView === "task"}>
          <div class="p-6">
            <h2 class="mb-2 text-lg font-semibold text-gray-800">
              Task Detail
            </h2>
            <p class="text-sm text-gray-400">Task detail view placeholder</p>
          </div>
        </Match>
        <Match when={props.activeView === "doc"}>
          <div class="p-6">
            <h2 class="mb-2 text-lg font-semibold text-gray-800">Document</h2>
            <p class="text-sm text-gray-400">Doc view placeholder</p>
          </div>
        </Match>
        <Match when={props.activeView === "topic"}>
          <div class="p-6">
            <h2 class="mb-2 text-lg font-semibold text-gray-800">Topic</h2>
            <p class="text-sm text-gray-400">Topic view placeholder</p>
          </div>
        </Match>
      </Switch>
    </div>
  );
}
