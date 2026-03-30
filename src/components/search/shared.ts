import type { Entity } from "../../types/entities";

export const TYPE_BADGES: Record<string, { label: string; class: string }> = {
  note: {
    label: "Note",
    class: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  },
  task: {
    label: "Task",
    class: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  },
  doc: {
    label: "Doc",
    class: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  },
};

export function getEntityTitle(entity: Entity): string {
  if (entity.type === "note") return entity.title ?? entity.date;
  return entity.title;
}

export function getEntityDate(entity: Entity): string {
  if (entity.type === "note") return entity.date;
  if (entity.type === "task") return entity.created;
  if (entity.type === "doc") return entity.created;
  return "";
}
