import type { Note, Task, Doc, Entity } from "./entities";
import type { TopicRef, Topic, TopicDecoration } from "./topics";
import type { SearchState } from "./search";
import type { ImageFile } from "./images";
import type { BacklinkEntry } from "./backlinks";

/**
 * Index store state
 */
export interface IndexState {
  /** All notes indexed by path */
  notes: Map<string, Note>;
  /** All tasks indexed by path */
  tasks: Map<string, Task>;
  /** All docs indexed by path */
  docs: Map<string, Doc>;
  /** Computed topics with references */
  topics: Map<TopicRef, Topic>;
  /** Parsed topics.yaml entries */
  topicsYaml: Map<TopicRef, TopicDecoration>;
  /** Last full index timestamp */
  lastIndexed: Date | null;
  /** All discovered image files indexed by absolute path */
  imageFiles: Map<string, ImageFile>;
  /** Entity path → image absolute paths referenced in its markdown */
  entityToImages: Map<string, string[]>;
  /** Image absolute path → entity paths that reference it */
  imageToEntities: Map<string, string[]>;
  /** Target entity path → backlink entries pointing to it */
  backlinkIndex: Map<string, BacklinkEntry[]>;
}

/**
 * View types for center panel
 */
export type ViewType = "journal" | "task" | "doc" | "topic" | "search";

/**
 * Draft state for inline entity creation
 */
export interface DraftState {
  type: "doc" | "task" | "note";
  date?: string;
}

/**
 * Context store state
 */
export interface ContextState {
  /** Current view in center panel */
  activeView: ViewType;
  /** Currently focused entity (if any) */
  activeEntity: Entity | null;
  /** Active topic/person (for topic views) */
  activeTopic: TopicRef | null;
  /** Computed relevance weights for UI ordering */
  relevanceWeights: Map<string, number>;
  /** Whether in home state (no weighting) */
  isHomeState: boolean;
  /** Journal scroll anchor date */
  journalAnchorDate: string | null;
  /** Dates currently visible in the journal viewport */
  visibleDates: Set<string>;
  /** Active draft for inline creation (null = no draft) */
  draft: DraftState | null;
  /** Search view state (null when not searching) */
  searchState: SearchState | null;
  /** One-shot command: scroll journal to this date, then clear */
  scrollToDate: string | null;
  /** Current month key "YYYY-MM" for month-based navigation (null = today's month) */
  currentMonth: string | null;
}

/**
 * Serializable navigation state for browser history integration.
 */
export interface NavHistoryEntry {
  activeView: ViewType;
  activeEntity: Entity | null;
  activeTopic: TopicRef | null;
  isHomeState: boolean;
  journalAnchorDate: string | null;
  searchState: SearchState | null;
  currentMonth: string | null;
}

/**
 * Editor store state
 */
export interface EditorState {
  /** Currently open file path */
  activeFile: string | null;
  /** Whether content has unsaved changes */
  isDirty: boolean;
  /** Pending debounced save timeout */
  pendingSave: number | null;
}
