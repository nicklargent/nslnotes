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
      {/* Today button - pinned at top */}
      <div class="border-b border-gray-200 p-3">
        <TodayButton onClick={() => props.onTodayClick()} />
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

      {/* Font size controls */}
      <div class="flex items-center justify-center gap-2 border-t border-gray-200 px-3 py-2">
        <button
          type="button"
          class="rounded px-2 py-1 text-sm text-gray-600 hover:bg-gray-100"
          onClick={() => changeFontSize(-1)}
          title="Decrease font size"
        >
          A&minus;
        </button>
        <span class="min-w-[3ch] text-center text-xs text-gray-500">
          {uiStore.fontSize}
        </span>
        <button
          type="button"
          class="rounded px-2 py-1 text-sm text-gray-600 hover:bg-gray-100"
          onClick={() => changeFontSize(1)}
          title="Increase font size"
        >
          A+
        </button>
      </div>
    </div>
  );
}
