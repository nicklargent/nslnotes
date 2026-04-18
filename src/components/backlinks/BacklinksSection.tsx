import { createMemo, For, Show } from "solid-js";
import type { BacklinkEntry } from "../../types/backlinks";
import type { EntityType } from "../../types/entities";

interface BacklinksSectionProps {
  backlinks: BacklinkEntry[];
  onBacklinkClick: (path: string) => void;
}

export function BacklinksSection(props: BacklinksSectionProps) {
  const grouped = createMemo(() => {
    const groups: Record<string, BacklinkEntry[]> = {};
    for (const entry of props.backlinks) {
      const key = entry.sourceType;
      if (!groups[key]) groups[key] = [];
      groups[key].push(entry);
    }
    for (const entries of Object.values(groups)) {
      entries.sort((a, b) =>
        (b.sourceDate ?? "").localeCompare(a.sourceDate ?? "")
      );
    }
    return groups;
  });

  const typeLabels: Record<EntityType, string> = {
    note: "Notes",
    task: "Tasks",
    doc: "Docs",
  };

  const typeOrder: EntityType[] = ["note", "task", "doc"];

  return (
    <Show when={props.backlinks.length > 0}>
      <div class="mt-8 border-t border-gray-200 dark:border-gray-700 pt-4">
        <div class="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">
          Backlinks
        </div>
        <For each={typeOrder.filter((t) => grouped()[t])}>
          {(type) => (
            <div class="mb-3">
              <div class="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">
                {typeLabels[type]}
              </div>
              <For each={grouped()[type]}>
                {(entry) => (
                  <button
                    class="group block w-full text-left rounded px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700"
                    onClick={() => props.onBacklinkClick(entry.sourcePath)}
                  >
                    <div class="text-sm text-gray-700 dark:text-gray-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate">
                      {entry.sourceTitle}
                    </div>
                    <For each={entry.contextLines}>
                      {(line) => (
                        <div class="text-xs text-gray-400 dark:text-gray-500 truncate leading-snug">
                          {line}
                        </div>
                      )}
                    </For>
                  </button>
                )}
              </For>
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}
