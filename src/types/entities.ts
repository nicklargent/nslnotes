import type { TopicRef } from "./topics";

/**
 * Base fields shared by all file entities
 */
export interface BaseEntity {
  /** Absolute path to file */
  path: string;
  /** File slug (filename without extension) */
  slug: string;
  /** Topics referenced in frontmatter */
  topics: TopicRef[];
  /** Raw frontmatter as parsed */
  frontmatter: Record<string, unknown>;
  /** Body content (markdown) */
  content: string;
  /** File modification timestamp */
  modifiedAt: Date;
  /** True if body contains any unchecked TODO or `- [ ]` item (excl. code blocks) */
  hasUnchecked: boolean;
}

/**
 * Note entity (daily or named)
 */
export interface Note extends BaseEntity {
  type: "note";
  /** ISO date string YYYY-MM-DD */
  date: string;
  /** Human-readable title (null for daily notes) */
  title: string | null;
  /** Whether this is a daily note (no title/slug suffix) */
  isDaily: boolean;
}

export type TaskStatus = "open" | "done" | "cancelled";

/**
 * Task entity
 */
export interface Task extends BaseEntity {
  type: "task";
  /** Current status */
  status: TaskStatus;
  /** ISO date when task was created */
  created: string;
  /** Optional ISO due date */
  due: string | null;
  /** Title extracted from first line or slug */
  title: string;
  /** Whether this task is pinned (focus flag) */
  pinned: boolean;
}

/**
 * Doc entity
 */
export interface Doc extends BaseEntity {
  type: "doc";
  /** Human-readable title (required) */
  title: string;
  /** ISO date when doc was created */
  created: string;
  /** Whether doc is pinned to the top of the sidebar */
  pinned: boolean;
}

/**
 * Union type for all entities
 */
export type Entity = Note | Task | Doc;

/**
 * Entity type discriminator
 */
export type EntityType = Entity["type"];

/**
 * Task template — predefined body content for new tasks.
 * Stored as a plain markdown file under `${rootPath}/.templates/tasks/`,
 * keyed by filename slug. Templates are not entities and are not
 * indexed alongside notes/tasks/docs.
 */
export interface Template {
  /** Slug identifier (filename without `.md`), e.g. "meeting-prep" */
  id: string;
  /** Human-readable name derived from the slug, e.g. "Meeting prep" */
  displayName: string;
  /** Absolute path to the template file */
  path: string;
  /** Raw markdown body content */
  content: string;
}
