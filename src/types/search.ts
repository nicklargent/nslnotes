import type { Entity } from "./entities";
import type { TodoState } from "./inline";

/**
 * Filter for search results by entity type
 */
export type SearchFilter =
  | "all"
  | "notes"
  | "tasks"
  | "docs"
  | "images"
  | "todos";

/**
 * A single TODO search result
 */
export interface TodoSearchResult {
  /** The entity containing this TODO */
  entity: Entity;
  /** The TODO text content */
  text: string;
  /** Full line content */
  line: string;
  /** Line number (0-indexed) */
  lineNumber: number;
  /** Kind of TODO: LogSeq state or "checkbox" */
  kind: TodoState | "checkbox";
}

/**
 * A single search result with matched context
 */
export interface SearchResult {
  /** The matched entity */
  entity: Entity;
  /** Lines that matched the query */
  matchedLines: string[];
  /** Highlight ranges within matched lines: [lineIndex, startChar, endChar][] */
  highlightRanges: [number, number, number][];
}

/**
 * Search view state
 */
export interface SearchState {
  /** Current search query */
  query: string;
  /** Active filter tab */
  filter: SearchFilter;
  /** Search results */
  results: SearchResult[];
}
