import type { Entity } from "../../types/entities";

export type TimeGroup<T> = { label: string; items: T[] };

export function groupByTimeRange<T>(
  items: T[],
  getDate: (item: T) => string
): TimeGroup<T>[] {
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const last30: T[] = [];
  const last6m: T[] = [];
  const older: T[] = [];

  for (const item of items) {
    const d = new Date(getDate(item));
    if (d >= thirtyDaysAgo) last30.push(item);
    else if (d >= sixMonthsAgo) last6m.push(item);
    else older.push(item);
  }

  return [
    { label: "Last 30 days", items: last30 },
    { label: "Last 6 months", items: last6m },
    { label: "Older", items: older },
  ];
}

export function TimeGroupHeader(props: { label: string }) {
  return (
    <div class="sticky top-0 z-10 mt-6 border-b-4 border-gray-300 bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 first:mt-0 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300">
      {props.label}
    </div>
  );
}

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
