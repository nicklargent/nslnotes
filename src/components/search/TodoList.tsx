import { createMemo, For, Show } from "solid-js";
import { IndexService } from "../../services/IndexService";
import { NavigationService } from "../../services/NavigationService";
import {
  TYPE_BADGES,
  getEntityTitle,
  getEntityDate,
  groupByTimeRange,
  TimeGroupHeader,
} from "./shared";

interface TodoListProps {
  query: string;
}

const KIND_BADGES: Record<string, { label: string; class: string }> = {
  TODO: {
    label: "TODO",
    class: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  },
  DOING: {
    label: "DOING",
    class:
      "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  },
  WAITING: {
    label: "WAIT",
    class:
      "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  },
  LATER: {
    label: "LATER",
    class: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  },
  checkbox: {
    label: "[ ]",
    class: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  },
};

export function TodoList(props: TodoListProps) {
  const todos = createMemo(() => IndexService.searchTodos(props.query));

  const grouped = createMemo(() =>
    groupByTimeRange(todos(), (t) => getEntityDate(t.entity))
  );

  return (
    <div class="flex-1">
      <Show
        when={todos().length > 0}
        fallback={
          <div class="p-6 text-center text-sm text-gray-400 dark:text-gray-500">
            No open TODOs found
          </div>
        }
      >
        <For each={grouped()}>
          {(group) => (
            <div>
              <TimeGroupHeader label={group.label} />
              <Show
                when={group.items.length > 0}
                fallback={
                  <div class="px-4 py-2 text-xs text-gray-400 dark:text-gray-500">
                    None
                  </div>
                }
              >
                <div class="divide-y divide-gray-100 dark:divide-gray-700">
                  <For each={group.items}>
                    {(result) => {
                      const kindBadge = () => KIND_BADGES[result.kind];
                      const typeBadge = () => TYPE_BADGES[result.entity.type];
                      return (
                        <button
                          type="button"
                          class="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50"
                          onClick={() =>
                            NavigationService.navigateTo(result.entity)
                          }
                        >
                          <div class="flex items-center gap-2">
                            <span
                              class={`rounded px-1.5 py-0.5 text-[10px] font-medium ${kindBadge()?.class ?? ""}`}
                            >
                              {kindBadge()?.label ?? result.kind}
                            </span>
                            <span class="truncate text-sm text-gray-900 dark:text-gray-100">
                              {result.text}
                            </span>
                          </div>
                          <div class="mt-1 flex items-center gap-1.5">
                            <span
                              class={`rounded px-1 py-0.5 text-[9px] font-medium ${typeBadge()?.class ?? ""}`}
                            >
                              {typeBadge()?.label ?? result.entity.type}
                            </span>
                            <span class="truncate text-xs text-gray-400 dark:text-gray-500">
                              {getEntityTitle(result.entity)}
                            </span>
                            <span class="ml-auto shrink-0 text-xs text-gray-400 dark:text-gray-500">
                              {getEntityDate(result.entity)}
                            </span>
                          </div>
                        </button>
                      );
                    }}
                  </For>
                </div>
              </Show>
            </div>
          )}
        </For>
      </Show>
    </div>
  );
}
