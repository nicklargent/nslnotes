import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { TopicRef } from "../types/topics";

/**
 * Frontmatter delimiter
 */
const FRONTMATTER_DELIMITER = "---";

/**
 * Result of parsing a markdown file with frontmatter
 */
export interface ParseResult {
  /** Parsed frontmatter as raw object */
  frontmatter: Record<string, unknown>;
  /** Body content after frontmatter */
  body: string;
}

/**
 * Note frontmatter schema
 */
export interface NoteFrontmatter {
  type: "note";
  date: string;
  title?: string;
  topics?: TopicRef[];
}

/**
 * Task frontmatter schema
 */
export interface TaskFrontmatter {
  type: "task";
  status: "open" | "done" | "cancelled";
  created: string;
  due?: string;
  title?: string;
  topics?: TopicRef[];
}

/**
 * Doc frontmatter schema
 */
export interface DocFrontmatter {
  type: "doc";
  title: string;
  created: string;
  topics?: TopicRef[];
}

/**
 * Union of all frontmatter types
 */
export type Frontmatter = NoteFrontmatter | TaskFrontmatter | DocFrontmatter;

/**
 * Validation error
 */
export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Validation result
 */
export type ValidationResult<T> =
  | { valid: true; data: T }
  | { valid: false; errors: ValidationError[] };

/**
 * ISO date regex pattern (YYYY-MM-DD)
 */
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Topic ref pattern (# or @ prefix followed by alphanumeric/hyphen)
 */
const TOPIC_REF_PATTERN = /^[#@][a-z0-9-]+$/i;

/**
 * Parse markdown content with YAML frontmatter.
 *
 * @param content - Raw markdown file content
 * @returns Parsed frontmatter and body, or null if no valid frontmatter
 */
export function parse(content: string): ParseResult | null {
  const trimmed = content.trimStart();

  // Must start with frontmatter delimiter
  if (!trimmed.startsWith(FRONTMATTER_DELIMITER)) {
    return null;
  }

  // Find the closing delimiter
  const afterOpening = trimmed.slice(FRONTMATTER_DELIMITER.length);
  const closingIndex = afterOpening.indexOf(`\n${FRONTMATTER_DELIMITER}`);

  if (closingIndex === -1) {
    return null;
  }

  // Extract frontmatter YAML
  const yamlContent = afterOpening.slice(0, closingIndex).trim();

  if (yamlContent === "") {
    return null;
  }

  // Parse YAML
  let frontmatter: Record<string, unknown>;
  try {
    const parsed = parseYaml(yamlContent) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return null;
    }
    frontmatter = parsed as Record<string, unknown>;
  } catch {
    return null;
  }

  // Extract body (everything after closing delimiter)
  const bodyStart =
    FRONTMATTER_DELIMITER.length +
    closingIndex +
    1 +
    FRONTMATTER_DELIMITER.length;
  // Trim leading newlines and trailing whitespace for consistency
  const body = trimmed.slice(bodyStart).replace(/^\n+/, "").trimEnd();

  return { frontmatter, body };
}

/**
 * Serialize frontmatter and body back to markdown content.
 *
 * @param frontmatter - Frontmatter object to serialize
 * @param body - Body content
 * @returns Complete markdown string with frontmatter
 */
export function serialize(
  frontmatter: Record<string, unknown>,
  body: string
): string {
  const yaml = stringifyYaml(frontmatter, {
    lineWidth: 0, // Don't wrap lines
    defaultStringType: "QUOTE_DOUBLE",
    defaultKeyType: "PLAIN",
  }).trim();

  const normalizedBody = body.trim();

  if (normalizedBody === "") {
    return `${FRONTMATTER_DELIMITER}\n${yaml}\n${FRONTMATTER_DELIMITER}\n`;
  }

  return `${FRONTMATTER_DELIMITER}\n${yaml}\n${FRONTMATTER_DELIMITER}\n\n${normalizedBody}\n`;
}

/**
 * Check if a value is a valid ISO date string
 */
function isValidIsoDate(value: unknown): value is string {
  return typeof value === "string" && ISO_DATE_PATTERN.test(value);
}

/**
 * Check if a value is a valid topic reference
 */
function isValidTopicRef(value: unknown): value is TopicRef {
  return typeof value === "string" && TOPIC_REF_PATTERN.test(value);
}

/**
 * Validate and extract topics array from frontmatter
 */
function validateTopics(
  value: unknown
): { valid: true; topics: TopicRef[] } | { valid: false; error: string } {
  if (value === undefined || value === null) {
    return { valid: true, topics: [] };
  }

  if (!Array.isArray(value)) {
    return { valid: false, error: "topics must be an array" };
  }

  const topics: TopicRef[] = [];
  for (const item of value) {
    if (!isValidTopicRef(item)) {
      return {
        valid: false,
        error: `invalid topic reference: ${String(item)} (must start with # or @)`,
      };
    }
    topics.push(item.toLowerCase() as TopicRef);
  }

  return { valid: true, topics };
}

/**
 * Validate frontmatter as a Note.
 *
 * @param frontmatter - Raw frontmatter object
 * @returns Validation result with typed NoteFrontmatter or errors
 */
export function validateNote(
  frontmatter: Record<string, unknown>
): ValidationResult<NoteFrontmatter> {
  const errors: ValidationError[] = [];

  // Check type field
  if (frontmatter["type"] !== "note") {
    errors.push({ field: "type", message: 'must be "note"' });
  }

  // Check date field
  if (!isValidIsoDate(frontmatter["date"])) {
    errors.push({
      field: "date",
      message: "must be a valid ISO date (YYYY-MM-DD)",
    });
  }

  // Check optional title
  const title = frontmatter["title"];
  if (title !== undefined && typeof title !== "string") {
    errors.push({ field: "title", message: "must be a string" });
  }

  // Check optional topics
  const topicsResult = validateTopics(frontmatter["topics"]);
  if (!topicsResult.valid) {
    errors.push({ field: "topics", message: topicsResult.error });
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const result: NoteFrontmatter = {
    type: "note",
    date: frontmatter["date"] as string,
  };

  if (typeof title === "string") {
    result.title = title;
  }

  if (topicsResult.valid && topicsResult.topics.length > 0) {
    result.topics = topicsResult.topics;
  }

  return { valid: true, data: result };
}

/**
 * Validate frontmatter as a Task.
 *
 * @param frontmatter - Raw frontmatter object
 * @returns Validation result with typed TaskFrontmatter or errors
 */
export function validateTask(
  frontmatter: Record<string, unknown>
): ValidationResult<TaskFrontmatter> {
  const errors: ValidationError[] = [];

  // Check type field
  if (frontmatter["type"] !== "task") {
    errors.push({ field: "type", message: 'must be "task"' });
  }

  // Check status field
  const status = frontmatter["status"];
  if (status !== "open" && status !== "done" && status !== "cancelled") {
    errors.push({
      field: "status",
      message: 'must be "open", "done", or "cancelled"',
    });
  }

  // Check created field
  if (!isValidIsoDate(frontmatter["created"])) {
    errors.push({
      field: "created",
      message: "must be a valid ISO date (YYYY-MM-DD)",
    });
  }

  // Check optional due field
  const due = frontmatter["due"];
  if (due !== undefined && due !== null && !isValidIsoDate(due)) {
    errors.push({
      field: "due",
      message: "must be a valid ISO date (YYYY-MM-DD)",
    });
  }

  // Check optional title
  const title = frontmatter["title"];
  if (title !== undefined && typeof title !== "string") {
    errors.push({ field: "title", message: "must be a string" });
  }

  // Check optional topics
  const topicsResult = validateTopics(frontmatter["topics"]);
  if (!topicsResult.valid) {
    errors.push({ field: "topics", message: topicsResult.error });
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const result: TaskFrontmatter = {
    type: "task",
    status: status as "open" | "done" | "cancelled",
    created: frontmatter["created"] as string,
  };

  if (isValidIsoDate(due)) {
    result.due = due;
  }

  if (typeof title === "string") {
    result.title = title;
  }

  if (topicsResult.valid && topicsResult.topics.length > 0) {
    result.topics = topicsResult.topics;
  }

  return { valid: true, data: result };
}

/**
 * Validate frontmatter as a Doc.
 *
 * @param frontmatter - Raw frontmatter object
 * @returns Validation result with typed DocFrontmatter or errors
 */
export function validateDoc(
  frontmatter: Record<string, unknown>
): ValidationResult<DocFrontmatter> {
  const errors: ValidationError[] = [];

  // Check type field
  if (frontmatter["type"] !== "doc") {
    errors.push({ field: "type", message: 'must be "doc"' });
  }

  // Check title field (required for docs)
  const title = frontmatter["title"];
  if (typeof title !== "string" || title.trim() === "") {
    errors.push({ field: "title", message: "must be a non-empty string" });
  }

  // Check created field
  if (!isValidIsoDate(frontmatter["created"])) {
    errors.push({
      field: "created",
      message: "must be a valid ISO date (YYYY-MM-DD)",
    });
  }

  // Check optional topics
  const topicsResult = validateTopics(frontmatter["topics"]);
  if (!topicsResult.valid) {
    errors.push({ field: "topics", message: topicsResult.error });
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const result: DocFrontmatter = {
    type: "doc",
    title: title as string,
    created: frontmatter["created"] as string,
  };

  if (topicsResult.valid && topicsResult.topics.length > 0) {
    result.topics = topicsResult.topics;
  }

  return { valid: true, data: result };
}

/**
 * Detect entity type from frontmatter and validate accordingly.
 *
 * @param frontmatter - Raw frontmatter object
 * @returns Validation result with typed frontmatter or errors
 */
export function validateFrontmatter(
  frontmatter: Record<string, unknown>
): ValidationResult<Frontmatter> {
  const type = frontmatter["type"];

  switch (type) {
    case "note":
      return validateNote(frontmatter);
    case "task":
      return validateTask(frontmatter);
    case "doc":
      return validateDoc(frontmatter);
    default:
      return {
        valid: false,
        errors: [
          {
            field: "type",
            message: 'must be "note", "task", or "doc"',
          },
        ],
      };
  }
}
