import {
  createSignal,
  createMemo,
  createEffect,
  For,
  onMount,
  onCleanup,
  Show,
} from "solid-js";
import { IndexService } from "../../services/IndexService";
import { indexStore } from "../../stores/indexStore";

interface WikilinkSuggestion {
  type: "task" | "doc" | "note";
  slug: string;
  title: string;
}

interface WikilinkAutocompleteProps {
  position: { top: number; left: number };
  filter: string;
  onSelect: (wikilink: string) => void;
  onClose: () => void;
}

const MAX_SUGGESTIONS = 10;

/**
 * Autocomplete popup for wikilinks (`[[` trigger).
 * Shows matching tasks, docs, and named notes.
 */
export function WikilinkAutocomplete(props: WikilinkAutocompleteProps) {
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  let menuRef: HTMLDivElement | undefined;

  // Reset selection when filter changes
  createEffect(() => {
    void props.filter;
    setSelectedIndex(0);
  });

  const suggestions = createMemo((): WikilinkSuggestion[] => {
    const filter = props.filter.toLowerCase();

    // Check for type prefix filter (e.g., "task:", "doc:", "note:")
    let typeFilter: "task" | "doc" | "note" | null = null;
    let textFilter = filter;
    const colonIdx = filter.indexOf(":");
    if (colonIdx !== -1) {
      const prefix = filter.slice(0, colonIdx);
      if (prefix === "task" || prefix === "doc" || prefix === "note") {
        typeFilter = prefix;
        textFilter = filter.slice(colonIdx + 1);
      }
    }

    const results: WikilinkSuggestion[] = [];

    // Tasks
    if (!typeFilter || typeFilter === "task") {
      for (const task of IndexService.getOpenTasks()) {
        if (matchesFilter(task.title, task.slug, textFilter)) {
          results.push({ type: "task", slug: task.slug, title: task.title });
          if (results.length >= MAX_SUGGESTIONS) return results;
        }
      }
    }

    // Docs — iterate store directly to avoid unnecessary sort from getDocs()
    if (!typeFilter || typeFilter === "doc") {
      for (const doc of indexStore.docs.values()) {
        if (matchesFilter(doc.title, doc.slug, textFilter)) {
          results.push({ type: "doc", slug: doc.slug, title: doc.title });
          if (results.length >= MAX_SUGGESTIONS) return results;
        }
      }
    }

    // Named notes
    if (!typeFilter || typeFilter === "note") {
      for (const note of indexStore.notes.values()) {
        if (note.isDaily || !note.title) continue;
        if (matchesFilter(note.title, note.slug, textFilter)) {
          results.push({
            type: "note",
            slug: note.slug,
            title: note.title,
          });
          if (results.length >= MAX_SUGGESTIONS) return results;
        }
      }
    }

    return results;
  });

  function matchesFilter(title: string, slug: string, filter: string): boolean {
    if (!filter) return true;
    return (
      title.toLowerCase().includes(filter) ||
      slug.toLowerCase().includes(filter)
    );
  }

  function handleKeyDown(e: KeyboardEvent) {
    const items = suggestions();

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((i) => Math.min(i + 1, items.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
      case "Tab": {
        const selected = items[selectedIndex()];
        if (selected) {
          e.preventDefault();
          e.stopPropagation();
          props.onSelect(`[[${selected.type}:${selected.slug}]]`);
        }
        break;
      }
      case "Escape":
        e.preventDefault();
        props.onClose();
        break;
    }
  }

  onMount(() => {
    document.addEventListener("keydown", handleKeyDown, true);

    function handleClickOutside(e: MouseEvent) {
      if (menuRef && !menuRef.contains(e.target as Node)) {
        props.onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);

    onCleanup(() => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("mousedown", handleClickOutside);
    });
  });

  const typeBadgeClass = (type: "task" | "doc" | "note"): string => {
    switch (type) {
      case "task":
        return "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300";
      case "doc":
        return "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300";
      case "note":
        return "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300";
    }
  };

  return (
    <Show when={suggestions().length > 0}>
      <div
        ref={menuRef}
        class="fixed z-50 w-72 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 py-1 shadow-lg dark:shadow-gray-900/50"
        style={{
          top: `${props.position.top + 24}px`,
          left: `${props.position.left}px`,
        }}
      >
        <For each={suggestions()}>
          {(item, index) => (
            <button
              class={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
                index() === selectedIndex()
                  ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700"
                  : "text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
              }`}
              onClick={() => props.onSelect(`[[${item.type}:${item.slug}]]`)}
              onMouseEnter={() => setSelectedIndex(index())}
            >
              <span
                class={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-xs font-medium ${typeBadgeClass(item.type)}`}
              >
                {item.type}
              </span>
              <span class="truncate">{item.title}</span>
            </button>
          )}
        </For>
      </div>
    </Show>
  );
}
