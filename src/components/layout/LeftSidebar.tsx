import { TodayButton } from "../sidebar/TodayButton";
import { TopicsList } from "../sidebar/TopicsList";
import { DocsList } from "../sidebar/DocsList";
import { uiStore, setUIStore } from "../../stores/uiStore";
import { debouncedSave } from "./Layout";
import { TopicService } from "../../services/TopicService";
import { IndexService } from "../../services/IndexService";
import { SettingsService } from "../../services/SettingsService";
import type { Topic, TopicRef } from "../../types/topics";
import type { Doc } from "../../types/entities";

interface LeftSidebarProps {
  topics: Topic[];
  docs: Doc[];
  activeTopics: Set<TopicRef>;
  linkedPaths: Set<string>;
  onTodayClick: () => void;
  onSearchClick: () => void;
  onTopicClick: (ref: TopicRef) => void;
  onDocClick: (doc: Doc) => void;
  onCreateDoc: () => void;
}

function clampFontSize(size: number): number {
  return Math.min(24, Math.max(12, size));
}

/**
 * Left sidebar with Today button, Topics section, Docs section, and font size controls.
 * Satisfies FR-UI-010–012.
 */
export function LeftSidebar(props: LeftSidebarProps) {
  function changeFontSize(delta: number) {
    setUIStore("fontSize", clampFontSize(uiStore.fontSize + delta));
    debouncedSave();
  }

  async function handleEditLabel(topic: Topic, newLabel: string) {
    await TopicService.saveTopicLabel(topic.ref, newLabel);
    const rootPath = await SettingsService.getRootPath();
    if (rootPath) {
      await IndexService.invalidate(rootPath + "/topics.yaml", rootPath);
    }
  }

  return (
    <div class="flex h-full flex-col">
      {/* Today + Search buttons - pinned at top */}
      <div class="border-b border-gray-200 p-3 dark:border-gray-700">
        <TodayButton onClick={() => props.onTodayClick()} />
        <button
          type="button"
          class="mt-2 flex w-full items-center gap-2 rounded-lg border border-gray-300 px-4 py-1.5 text-sm text-gray-500 hover:border-gray-400 hover:text-gray-700 dark:border-gray-600 dark:text-gray-400 dark:hover:border-gray-500 dark:hover:text-gray-300"
          onClick={() => props.onSearchClick()}
        >
          <svg
            class="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          Search
          <span class="ml-auto text-xs text-gray-400 dark:text-gray-500">
            {navigator.platform.includes("Mac") ? "\u2318K" : "Ctrl+K"}
          </span>
        </button>
      </div>

      {/* Scrollable sections */}
      <div class="flex-1 overflow-y-auto">
        <TopicsList
          topics={props.topics.filter((t) => t.kind !== "person")}
          activeTopics={props.activeTopics}
          onTopicClick={(ref) => props.onTopicClick(ref)}
          onEditLabel={handleEditLabel}
        />
        <TopicsList
          title="People"
          fallbackText="No people yet"
          topics={props.topics.filter((t) => t.kind === "person")}
          activeTopics={props.activeTopics}
          onTopicClick={(ref) => props.onTopicClick(ref)}
          onEditLabel={handleEditLabel}
        />
        <DocsList
          docs={props.docs}
          linkedPaths={props.linkedPaths}
          onDocClick={(doc) => props.onDocClick(doc)}
          onCreateDoc={() => props.onCreateDoc()}
        />
      </div>

      {/* Font size & dark mode controls */}
      <div class="flex items-center justify-center gap-2 border-t border-gray-200 px-3 py-2 dark:border-gray-700">
        <button
          type="button"
          class="rounded px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
          onClick={() => changeFontSize(-1)}
          title="Decrease font size"
        >
          A&minus;
        </button>
        <span class="min-w-[3ch] text-center text-xs text-gray-500 dark:text-gray-400">
          {uiStore.fontSize}
        </span>
        <button
          type="button"
          class="rounded px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
          onClick={() => changeFontSize(1)}
          title="Increase font size"
        >
          A+
        </button>
        <div class="mx-1 h-4 w-px bg-gray-300 dark:bg-gray-600" />
        <button
          type="button"
          class="rounded px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
          onClick={() => {
            setUIStore("darkMode", !uiStore.darkMode);
            debouncedSave();
          }}
          title={
            uiStore.darkMode ? "Switch to light mode" : "Switch to dark mode"
          }
        >
          {uiStore.darkMode ? (
            <svg
              class="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle cx="12" cy="12" r="5" />
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
          ) : (
            <svg
              class="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
