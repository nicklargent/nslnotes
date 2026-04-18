import type { EntityType } from "../../types/entities";

interface SlugBadgeProps {
  type: EntityType;
  slug: string;
}

export function SlugBadge(props: SlugBadgeProps) {
  return (
    <span class="group inline-flex items-center align-middle rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
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
      <code class="select-all overflow-hidden whitespace-nowrap text-xs max-w-0 group-hover:max-w-xs group-hover:pr-1.5 transition-[max-width,padding] duration-150">
        [[{props.type}:{props.slug}]]
      </code>
    </span>
  );
}
