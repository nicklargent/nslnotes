import type { Task } from "./entities";

/**
 * Task group names as displayed in right panel
 */
export type TaskGroup = "RELATED" | "OVERDUE" | "THIS_WEEK" | "LATER";

/**
 * Grouped tasks for right panel display
 */
export interface GroupedTasks {
  /** Shown only when not in home state */
  related: Task[];
  overdue: Task[];
  thisWeek: Task[];
  later: Task[];
}

/**
 * Grouped closed tasks by recency for right panel display
 */
export interface GroupedClosedTasks {
  thisWeek: Task[];
  lastMonth: Task[];
  older: Task[];
}

/**
 * Task display item with computed properties
 */
export interface TaskDisplay extends Task {
  /** Which group this task belongs to */
  group: TaskGroup;
  /** Relevance score for sorting within RELATED */
  relevanceScore: number;
  /** Days until/since due date */
  daysRelative: number | null;
  /** Formatted due date display */
  dueDisplay: string | null;
  /** Whether this task is currently open in center panel */
  isHighlighted: boolean;
}
