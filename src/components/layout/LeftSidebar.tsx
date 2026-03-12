import { TodayButton } from "../sidebar/TodayButton";
import { TopicsList } from "../sidebar/TopicsList";
import { DocsList } from "../sidebar/DocsList";
import type { Topic, TopicRef } from "../../types/topics";
import type { Doc } from "../../types/entities";

interface LeftSidebarProps {
  topics: Topic[];
  docs: Doc[];
  onTodayClick: () => void;
  onTopicClick: (ref: TopicRef) => void;
  onDocClick: (doc: Doc) => void;
  onCreateDoc: () => void;
}

/**
 * Left sidebar with Today button, Topics section, and Docs section.
 * Satisfies FR-UI-010–012.
 */
export function LeftSidebar(props: LeftSidebarProps) {
  return (
    <div class="flex h-full flex-col">
      {/* Today button - pinned at top */}
      <div class="border-b border-gray-200 p-3">
        <TodayButton onClick={() => props.onTodayClick()} />
      </div>

      {/* Scrollable sections */}
      <div class="flex-1 overflow-y-auto">
        <TopicsList
          topics={props.topics}
          onTopicClick={(ref) => props.onTopicClick(ref)}
        />
        <DocsList
          docs={props.docs}
          onDocClick={(doc) => props.onDocClick(doc)}
          onCreateDoc={() => props.onCreateDoc()}
        />
      </div>
    </div>
  );
}
