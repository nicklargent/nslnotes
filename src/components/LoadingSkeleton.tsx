/**
 * Loading skeleton components (T7.5).
 * Show placeholder UI while index is building.
 */

export function SidebarSkeleton() {
  return (
    <div class="flex flex-col p-3">
      {/* Today button skeleton */}
      <div class="mb-4 h-9 w-full animate-pulse rounded bg-gray-200 dark:bg-gray-600" />

      {/* Topics section */}
      <div class="mb-2 h-4 w-16 animate-pulse rounded bg-gray-200 dark:bg-gray-600" />
      <div class="mb-1 h-6 w-full animate-pulse rounded bg-gray-100 dark:bg-gray-700" />
      <div class="mb-1 h-6 w-3/4 animate-pulse rounded bg-gray-100 dark:bg-gray-700" />
      <div class="mb-1 h-6 w-5/6 animate-pulse rounded bg-gray-100 dark:bg-gray-700" />
      <div class="mb-4 h-6 w-2/3 animate-pulse rounded bg-gray-100 dark:bg-gray-700" />

      {/* Docs section */}
      <div class="mb-2 h-4 w-12 animate-pulse rounded bg-gray-200 dark:bg-gray-600" />
      <div class="mb-1 h-6 w-full animate-pulse rounded bg-gray-100 dark:bg-gray-700" />
      <div class="mb-1 h-6 w-4/5 animate-pulse rounded bg-gray-100 dark:bg-gray-700" />
      <div class="mb-1 h-6 w-3/4 animate-pulse rounded bg-gray-100 dark:bg-gray-700" />
    </div>
  );
}

export function JournalSkeleton() {
  return (
    <div class="mx-auto max-w-2xl px-4 pt-4">
      {/* Date header skeleton */}
      <div class="mb-3 h-7 w-40 animate-pulse rounded bg-gray-200 dark:bg-gray-600" />

      {/* Editor area skeleton */}
      <div class="mb-2 h-4 w-full animate-pulse rounded bg-gray-100 dark:bg-gray-700" />
      <div class="mb-2 h-4 w-5/6 animate-pulse rounded bg-gray-100 dark:bg-gray-700" />
      <div class="mb-2 h-4 w-3/4 animate-pulse rounded bg-gray-100 dark:bg-gray-700" />
      <div class="mb-6 h-4 w-1/2 animate-pulse rounded bg-gray-100 dark:bg-gray-700" />

      {/* Second date header */}
      <div class="mb-3 h-7 w-36 animate-pulse rounded bg-gray-200 dark:bg-gray-600" />
      <div class="mb-2 h-4 w-full animate-pulse rounded bg-gray-100 dark:bg-gray-700" />
      <div class="mb-2 h-4 w-4/5 animate-pulse rounded bg-gray-100 dark:bg-gray-700" />
    </div>
  );
}

export function TaskListSkeleton() {
  return (
    <div class="p-3">
      {/* Header skeleton */}
      <div class="mb-3 flex items-center justify-between">
        <div class="h-5 w-24 animate-pulse rounded bg-gray-200 dark:bg-gray-600" />
        <div class="h-6 w-6 animate-pulse rounded bg-gray-200 dark:bg-gray-600" />
      </div>

      {/* Task items */}
      <div class="mb-1 h-8 w-full animate-pulse rounded bg-gray-100 dark:bg-gray-700" />
      <div class="mb-1 h-8 w-full animate-pulse rounded bg-gray-100 dark:bg-gray-700" />
      <div class="mb-1 h-8 w-full animate-pulse rounded bg-gray-100 dark:bg-gray-700" />
      <div class="mb-3 h-8 w-full animate-pulse rounded bg-gray-100 dark:bg-gray-700" />

      {/* Section header */}
      <div class="mb-2 h-4 w-20 animate-pulse rounded bg-gray-200 dark:bg-gray-600" />
      <div class="mb-1 h-8 w-full animate-pulse rounded bg-gray-100 dark:bg-gray-700" />
      <div class="mb-1 h-8 w-full animate-pulse rounded bg-gray-100 dark:bg-gray-700" />
    </div>
  );
}
