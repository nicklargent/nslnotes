import type { TaskStatus } from "../../types/entities";

export function isClosedStatus(s?: TaskStatus): boolean {
  return s === "done" || s === "cancelled";
}

export const CLOSED_TASK_TITLE_CLASS =
  "line-through text-gray-400 dark:text-gray-500";
