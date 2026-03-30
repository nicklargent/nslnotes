import type { TodoItem, TodoState, WikiLink } from "../types/inline";
import type { TopicRef } from "../types/topics";

/**
 * Regex for TODO items: "- TODO|DOING|DONE text"
 * Captures indentation, state, and text.
 */
const TODO_PATTERN = /^(\s*)- (TODO|DOING|WAITING|LATER|DONE)\s+(.*)/;

/**
 * Regex for wikilinks: [[type:target]]
 */
const WIKILINK_PATTERN = /\[\[(task|doc|note):([^\]]+)\]\]/g;

/**
 * Regex for topic references: #topic-name or @person-name
 * Must be preceded by whitespace or start of line, followed by non-alphanumeric or end.
 */
const TOPIC_REF_PATTERN =
  /(?:^|(?<=\s))[#@][a-z0-9][a-z0-9-]+(?=[\s.,;:!?)\]|}]|$)/gi;

/**
 * Check if a line is inside a fenced code block.
 * Returns a set of line indices that are within code blocks.
 */
function getCodeBlockLines(lines: string[]): Set<number> {
  const codeLines = new Set<number>();
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line !== undefined && /^\s*```/.test(line)) {
      if (inCodeBlock) {
        codeLines.add(i);
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
        codeLines.add(i);
      }
    } else if (inCodeBlock) {
      codeLines.add(i);
    }
  }

  return codeLines;
}

/**
 * Regex for unchecked markdown checkboxes: "- [ ] text"
 */
const CHECKBOX_PATTERN = /^(\s*)- \[ \]\s+(.*)/;

/**
 * Parse TODO items from markdown content.
 *
 * @param content - Markdown body content
 * @returns Array of parsed todo items
 */
export function parseTodos(content: string): TodoItem[] {
  return parseTodosAndCheckboxes(content).todos;
}

/**
 * Parse unchecked markdown checkboxes from content.
 *
 * @param content - Markdown body content
 * @returns Array of parsed checkbox items
 */
export function parseCheckboxes(content: string): TodoItem[] {
  return parseTodosAndCheckboxes(content).checkboxes;
}

/**
 * Parse both TODO items and unchecked checkboxes in a single pass.
 * Splits lines and computes code blocks once for both patterns.
 *
 * @param content - Markdown body content
 * @returns Object with todos and checkboxes arrays
 */
export function parseTodosAndCheckboxes(content: string): {
  todos: TodoItem[];
  checkboxes: TodoItem[];
} {
  const lines = content.split("\n");
  const codeLines = getCodeBlockLines(lines);
  const todos: TodoItem[] = [];
  const checkboxes: TodoItem[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (codeLines.has(i)) continue;

    const line = lines[i];
    if (line === undefined) continue;

    const todoMatch = TODO_PATTERN.exec(line);
    if (todoMatch) {
      todos.push({
        line,
        lineNumber: i,
        state: todoMatch[2] as TodoState,
        text: todoMatch[3] ?? "",
        indent: (todoMatch[1] ?? "").length,
      });
      continue;
    }

    const cbMatch = CHECKBOX_PATTERN.exec(line);
    if (cbMatch) {
      checkboxes.push({
        line,
        lineNumber: i,
        state: "TODO" as TodoState,
        text: cbMatch[2] ?? "",
        indent: (cbMatch[1] ?? "").length,
      });
    }
  }

  return { todos, checkboxes };
}

/**
 * Parse wikilinks from markdown content.
 *
 * @param content - Markdown body content
 * @returns Array of parsed wikilinks
 */
export function parseWikilinks(content: string): WikiLink[] {
  const lines = content.split("\n");
  const codeLines = getCodeBlockLines(lines);

  // Build a version of content without code blocks for matching
  const filteredLines = lines.map((line, i) => (codeLines.has(i) ? "" : line));
  const filteredContent = filteredLines.join("\n");

  const wikilinks: WikiLink[] = [];
  let match: RegExpExecArray | null;

  // Reset regex state
  WIKILINK_PATTERN.lastIndex = 0;

  while ((match = WIKILINK_PATTERN.exec(filteredContent)) !== null) {
    const type = match[1] as "task" | "doc" | "note";
    const target = match[2] ?? "";

    wikilinks.push({
      raw: match[0],
      type,
      target,
      isValid: false, // Validity determined later by IndexService
    });
  }

  return wikilinks;
}

/**
 * Parse topic references (#topic, @person) from markdown content.
 *
 * @param content - Markdown body content
 * @returns Array of topic references found
 */
export function parseTopicRefs(content: string): TopicRef[] {
  const lines = content.split("\n");
  const codeLines = getCodeBlockLines(lines);

  // Build filtered content without code blocks
  const filteredLines = lines.map((line, i) => (codeLines.has(i) ? "" : line));
  const filteredContent = filteredLines.join("\n");

  const refs = new Set<TopicRef>();
  let match: RegExpExecArray | null;

  // Reset regex state
  TOPIC_REF_PATTERN.lastIndex = 0;

  while ((match = TOPIC_REF_PATTERN.exec(filteredContent)) !== null) {
    const ref = match[0].toLowerCase() as TopicRef;
    refs.add(ref);
  }

  return Array.from(refs);
}
