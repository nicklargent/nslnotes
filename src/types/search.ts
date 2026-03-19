import type { Entity } from "./entities";

/**
 * Filter for search results by entity type
 */
export type SearchFilter = "all" | "notes" | "tasks" | "docs" | "images";

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
