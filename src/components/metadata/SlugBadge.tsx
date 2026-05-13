import type { EntityType } from "../../types/entities";

interface SlugBadgeProps {
  type: EntityType;
  slug: string;
}

export function SlugBadge(props: SlugBadgeProps) {
  return (
    <span class="group relative inline-flex items-center align-middle">
      <span class="inline-flex items-center rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 group-hover:rounded-r-none">
        <svg
          class="h-3 w-3 m-0.5 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      </span>
      <code class="absolute left-full top-0 bottom-0 z-10 inline-flex items-center max-w-xs overflow-hidden whitespace-nowrap select-all rounded-r bg-gray-100 dark:bg-gray-700 pr-1.5 text-xs text-gray-500 dark:text-gray-400 opacity-0 pointer-events-none transition-opacity duration-150 group-hover:opacity-100 group-hover:pointer-events-auto">
        [[{props.type}:{props.slug}]]
      </code>
    </span>
  );
}
