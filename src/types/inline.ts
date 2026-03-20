/**
 * TODO item states (LogSeq-style)
 */
export type TodoState = "TODO" | "DOING" | "WAITING" | "LATER" | "DONE";

/**
 * Parsed TODO item
 */
export interface TodoItem {
  /** Full line content */
  line: string;
  /** Line number (0-indexed) */
  lineNumber: number;
  /** Current state */
  state: TodoState;
  /** Content after the state prefix */
  text: string;
  /** Indentation level */
  indent: number;
}

/**
 * Wikilink reference
 */
export interface WikiLink {
  /** Full match including brackets */
  raw: string;
  /** Entity type */
  type: "task" | "doc" | "note";
  /** Target slug or date */
  target: string;
  /** Whether target exists */
  isValid: boolean;
}
