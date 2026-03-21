import { createSignal, For, Show } from "solid-js";
import type { BacklinkEntry } from "../../types/backlinks";
import type { EntityType } from "../../types/entities";

interface BacklinksSectionProps {
  backlinks: BacklinkEntry[];
  onBacklinkClick: (path: string) => void;
}

export function BacklinksSection(props: BacklinksSectionProps) {
  const [expanded, setExpanded] = createSignal(true);

  const grouped = () => {
    const groups: Record<string, BacklinkEntry[]> = {};
    for (const entry of props.backlinks) {
      const key = entry.sourceType;
      if (!groups[key]) groups[key] = [];
      groups[key].push(entry);
    }
    // Sort entries within each group by date descending
    for (const entries of Object.values(groups)) {
      entries.sort((a, b) =>
        (b.sourceDate ?? "").localeCompare(a.sourceDate ?? "")
      );
    }
    return groups;
  };

  const typeLabels: Record<EntityType, string> = {
    note: "Notes",
    task: "Tasks",
    doc: "Docs",
  };

  const typeOrder: EntityType[] = ["note", "task", "doc"];

  return (
    <Show when={props.backlinks.length > 0}>
      <div class="border-t border-gray-200 dark:border-gray-700">
        <button
          class="flex w-full items-center gap-1 px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          onClick={() => setExpanded((s) => !s)}
        >
          <span class="text-[10px]">{expanded() ? "▼" : "▶"}</span>
          <span>Referenced by ({props.backlinks.length})</span>
        </button>

        <Show when={expanded()}>
          <div class="px-3 pb-2">
            <For each={typeOrder.filter((t) => grouped()[t])}>
              {(type) => (
                <div class="mb-1.5">
                  <div class="text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-0.5">
                    {typeLabels[type]}
                  </div>
                  <For each={grouped()[type]}>
                    {(entry) => (
                      <button
                        class="group block w-full text-left rounded px-1.5 py-1 hover:bg-gray-100 dark:hover:bg-gray-700"
                        onClick={() => props.onBacklinkClick(entry.sourcePath)}
                      >
                        <div class="text-xs text-gray-700 dark:text-gray-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate">
                          {entry.sourceTitle}
                        </div>
                        <For each={entry.contextLines}>
                          {(line) => (
                            <div class="text-[11px] text-gray-400 dark:text-gray-500 truncate leading-tight">
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
      </div>
    </Show>
  );
}
