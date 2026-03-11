/**
 * Topic reference as it appears in content
 * Includes the prefix (# or @)
 */
export type TopicRef = `#${string}` | `@${string}`;

/**
 * Topic ID without prefix
 */
export type TopicId = string;

/**
 * Reference to an entity from a topic
 */
export interface EntityReference {
  type: "note" | "task" | "doc";
  path: string;
  slug: string;
  title: string | null;
  date: string | null;
}

/**
 * Computed topic state
 */
export interface Topic {
  /** Full reference including prefix */
  ref: TopicRef;
  /** ID without prefix */
  id: TopicId;
  /** Whether this is a person (@) or subject (#) */
  kind: "topic" | "person";
  /** Display label from topics.yaml or raw ref */
  label: string;
  /** Optional note from topics.yaml */
  note: string | null;
  /** Whether topic meets active criteria */
  isActive: boolean;
  /** Files referencing this topic */
  references: EntityReference[];
  /** Open tasks with this topic */
  openTaskCount: number;
  /** Most recent reference date */
  lastUsed: Date | null;
}

/**
 * Entry from topics.yaml
 */
export interface TopicDecoration {
  id: TopicRef;
  label?: string;
  note?: string;
  archived?: boolean;
}
