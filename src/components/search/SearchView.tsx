import {
  createSignal,
  createEffect,
  onMount,
  onCleanup,
  For,
  Show,
  Switch,
  Match,
} from "solid-js";
import { IndexService } from "../../services/IndexService";
import { NavigationService } from "../../services/NavigationService";
import { contextStore, setContextStore } from "../../stores/contextStore";
import { registerContainer, unregisterContainer } from "../../stores/findStore";
import { ImageGrid } from "./ImageGrid";
import { TodoList } from "./TodoList";
import { TYPE_BADGES, getEntityTitle, getEntityDate } from "./shared";
import type { SearchFilter, SearchResult } from "../../types/search";

const FILTERS: { label: string; value: SearchFilter }[] = [
  { label: "All", value: "all" },
  { label: "Notes", value: "notes" },
  { label: "Tasks", value: "tasks" },
  { label: "Docs", value: "docs" },
  { label: "Images", value: "images" },
  { label: "TODOs", value: "todos" },
];

export function SearchView() {
  let inputRef: HTMLInputElement | undefined;
  let containerRef: HTMLDivElement | undefined;
  const [query, setQuery] = createSignal(contextStore.searchState?.query ?? "");
  const [filter, setFilter] = createSignal<SearchFilter>(
    contextStore.searchState?.filter ?? "all"
  );
  const [results, setResults] = createSignal<SearchResult[]>([]);
  let debounceTimer: number | undefined;

  onMount(() => {
    inputRef?.focus();
  });

  // Debounced search
  createEffect(() => {
    const q = query();
    const f = filter();
    clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      if (f === "images" || f === "todos") {
        // These tabs use their own components directly
        setResults([]);
        setContextStore("searchState", { query: q, filter: f, results: [] });
        NavigationService.replaceCurrentState();
        return;
      }
      const searchResults = q.length >= 2 ? IndexService.search(q, f) : [];
      setResults(searchResults);
      // Sync back to store
      setContextStore("searchState", {
        query: q,
        filter: f,
        results: searchResults,
      });
      NavigationService.replaceCurrentState();
    }, 200);
  });

  onCleanup(() => {
    clearTimeout(debounceTimer);
    if (containerRef) unregisterContainer(containerRef);
  });

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      NavigationService.goHome();
    }
  }

  return (
    <div
      class="flex h-full flex-col"
      ref={(el) => {
        containerRef = el;
        registerContainer(el);
      }}
    >
      {/* Search input */}
      <div class="border-b border-gray-200 p-4 dark:border-gray-700">
        <input
          ref={inputRef}
          type="text"
          placeholder="Search notes, tasks, and docs..."
          value={query()}
          onInput={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          class="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
        />

        {/* Filter tabs */}
        <div class="mt-3 flex gap-1">
          <For each={FILTERS}>
            {(f) => (
              <button
                type="button"
                class={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  filter() === f.value
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                    : "text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                }`}
                onClick={() => setFilter(f.value)}
              >
                {f.label}
              </button>
            )}
          </For>
        </div>
      </div>

      {/* Results */}
      <div class="flex-1 overflow-y-auto">
        <Switch
          fallback={
            <Show
              when={results().length > 0}
              fallback={
                <div class="p-6 text-center text-sm text-gray-400 dark:text-gray-500">
                  <Show
                    when={query().length >= 2}
                    fallback="Type at least 2 characters to search"
                  >
                    No results found
                  </Show>
                </div>
              }
            >
              <div class="divide-y divide-gray-100 dark:divide-gray-700">
                <For each={results()}>
                  {(result) => (
                    <button
                      type="button"
                      class="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50"
                      onClick={() =>
                        NavigationService.navigateTo(result.entity)
                      }
                    >
                      <div class="flex items-center gap-2">
                        <span
                          class={`rounded px-1.5 py-0.5 text-[10px] font-medium ${TYPE_BADGES[result.entity.type]?.class ?? ""}`}
                        >
                          {TYPE_BADGES[result.entity.type]?.label ??
                            result.entity.type}
                        </span>
                        <span class="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                          {getEntityTitle(result.entity)}
                        </span>
                        <span class="ml-auto shrink-0 text-xs text-gray-400 dark:text-gray-500">
                          {getEntityDate(result.entity)}
                        </span>
                      </div>
                      <Show when={result.matchedLines.length > 0}>
                        <p class="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">
                          {result.matchedLines[0]}
                        </p>
                      </Show>
                    </button>
                  )}
                </For>
              </div>
            </Show>
          }
        >
          <Match when={filter() === "images"}>
            <ImageGrid query={query()} />
          </Match>
          <Match when={filter() === "todos"}>
            <TodoList query={query()} />
          </Match>
        </Switch>
      </div>
    </div>
  );
}
