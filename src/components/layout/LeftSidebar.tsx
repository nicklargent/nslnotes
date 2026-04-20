import { createSignal, Show } from "solid-js";
import { TodayButton } from "../sidebar/TodayButton";
import { CalendarPicker } from "../sidebar/CalendarPicker";
import { TopicsList } from "../sidebar/TopicsList";
import { DocsList } from "../sidebar/DocsList";
import { TopicService } from "../../services/TopicService";
import { IndexService } from "../../services/IndexService";
import { SettingsService } from "../../services/SettingsService";
import type { Topic, TopicRef } from "../../types/topics";
import type { Doc } from "../../types/entities";

interface LeftSidebarProps {
  topics: Topic[];
  docs: Doc[];
  activeDocPath: string | null;
  onTodayClick: () => void;
  onSearchClick: () => void;
  onTopicClick: (ref: TopicRef) => void;
  onDocClick: (doc: Doc) => void;
  onCreateDoc: () => void;
  onQuickCapture: () => void;
  datesWithNotes: Set<string>;
  onDateSelect: (date: string) => void;
}

/**
 * Left sidebar with Today button, Topics section, and Docs section.
 * Satisfies FR-UI-010–012. Font-size and theme controls live in the top tab bar.
 */
export function LeftSidebar(props: LeftSidebarProps) {
  async function handleEditLabel(topic: Topic, newLabel: string) {
    await TopicService.saveTopicLabel(topic.ref, newLabel);
    const rootPath = await SettingsService.getRootPath();
    if (rootPath) {
      await IndexService.invalidate(rootPath + "/topics.yaml", rootPath);
    }
  }

  const [expandedSection, setExpandedSection] = createSignal<
    "topics" | "people" | "docs" | null
  >(null);

  function toggleSection(section: "topics" | "people" | "docs") {
    setExpandedSection((cur) => (cur === section ? null : section));
  }

  const [calendarOpen, setCalendarOpen] = createSignal(false);
  const [anchorRect, setAnchorRect] = createSignal<DOMRect | null>(null);
  let calendarBtnRef: HTMLButtonElement | undefined;

  function toggleCalendar() {
    if (calendarOpen()) {
      setCalendarOpen(false);
    } else if (calendarBtnRef) {
      setAnchorRect(calendarBtnRef.getBoundingClientRect());
      setCalendarOpen(true);
    }
  }

  function handleDateSelect(date: string) {
    setCalendarOpen(false);
    props.onDateSelect(date);
  }

  return (
    <div class="flex h-full flex-col">
      {/* Today + Calendar + Search buttons - pinned at top */}
      <div class="border-b border-gray-200 p-3 dark:border-gray-700">
        <div class="relative flex items-center gap-2">
          <div class="flex-1">
            <TodayButton onClick={() => props.onTodayClick()} />
          </div>
          <button
            ref={calendarBtnRef}
            type="button"
            class="rounded p-1.5 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
            onClick={toggleCalendar}
            title="Calendar"
          >
            <svg
              class="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </button>
          <Show when={calendarOpen() && anchorRect()}>
            {(rect) => (
              <CalendarPicker
                datesWithNotes={props.datesWithNotes}
                onSelectDate={handleDateSelect}
                onClose={() => setCalendarOpen(false)}
                anchorRect={rect()}
              />
            )}
          </Show>
          <button
            type="button"
            class="rounded p-1.5 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
            onClick={() => props.onQuickCapture()}
            title={`Quick capture (${navigator.platform.includes("Mac") ? "\u2318" : "Ctrl+"}N)`}
          >
            <svg
              class="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5" />
              <path d="M18 2l4 4-10 10H8v-4L18 2z" />
            </svg>
          </button>
        </div>
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
      <div
        class={`min-h-0 flex-1${expandedSection() !== null ? " flex flex-col" : " overflow-y-auto"}`}
      >
        <Show
          when={expandedSection() === null || expandedSection() === "topics"}
        >
          <TopicsList
            topics={props.topics.filter((t) => t.kind !== "person")}
            expanded={expandedSection() === "topics"}
            onToggleExpand={() => toggleSection("topics")}
            onTopicClick={(ref) => props.onTopicClick(ref)}
            onEditLabel={handleEditLabel}
          />
        </Show>
        <Show
          when={expandedSection() === null || expandedSection() === "people"}
        >
          <TopicsList
            title="People"
            fallbackText="No people yet"
            topics={props.topics.filter((t) => t.kind === "person")}
            expanded={expandedSection() === "people"}
            onToggleExpand={() => toggleSection("people")}
            onTopicClick={(ref) => props.onTopicClick(ref)}
            onEditLabel={handleEditLabel}
          />
        </Show>
        <Show when={expandedSection() === null || expandedSection() === "docs"}>
          <DocsList
            docs={props.docs}
            activeDocPath={props.activeDocPath}
            expanded={expandedSection() === "docs"}
            onToggleExpand={() => toggleSection("docs")}
            onDocClick={(doc) => props.onDocClick(doc)}
            onCreateDoc={() => props.onCreateDoc()}
          />
        </Show>
      </div>
    </div>
  );
}
