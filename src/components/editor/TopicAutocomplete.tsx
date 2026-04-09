import { createSignal, For, onMount, onCleanup, Show } from "solid-js";
import { IndexService } from "../../services/IndexService";
import type { TopicRef } from "../../types/topics";

interface TopicAutocompleteProps {
  position: { top: number; left: number };
  prefix: "#" | "@";
  filter: string;
  onSelect: (ref: TopicRef) => void;
  onClose: () => void;
}

/**
 * Autocomplete popup for topics (#) and people (@) (T6.10).
 * Shows matching active topics filtered by typed text.
 */
export function TopicAutocomplete(props: TopicAutocompleteProps) {
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  let menuRef: HTMLDivElement | undefined;

  const suggestions = () => {
    const activeTopics = IndexService.getActiveTopics();
    const f = props.filter.toLowerCase();
    return activeTopics
      .filter((t) => {
        // Match prefix type: # for topics, @ for people
        if (props.prefix === "#" && t.kind !== "topic") return false;
        if (props.prefix === "@" && t.kind !== "person") return false;
        // Exclude exact match of in-progress text (partially typed topic shouldn't suggest itself)
        // props.filter includes the prefix char, e.g. "@al" when typing @alice
        if (f && t.ref.toLowerCase() === f) return false;
        // Filter by typed text
        if (
          f &&
          !t.ref.toLowerCase().includes(f) &&
          !t.label.toLowerCase().includes(f)
        ) {
          return false;
        }
        return true;
      })
      .slice(0, 8);
  };

  function handleKeyDown(e: KeyboardEvent) {
    const items = suggestions();

    switch (e.key) {
      case "ArrowDown":
        if (items.length === 0) return;
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((i) => Math.min(i + 1, items.length - 1));
        break;
      case "ArrowUp":
        if (items.length === 0) return;
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
          props.onSelect(selected.ref);
        }
        break;
      }
      case "Escape":
        e.preventDefault();
        props.onClose();
        break;
      case " ":
        props.onClose();
        break;
    }
  }

  onMount(() => {
    document.addEventListener("keydown", handleKeyDown, true);

    function handleClickOutside(e: MouseEvent) {
      if (!menuRef || !menuRef.contains(e.target as Node)) {
        props.onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);

    onCleanup(() => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("mousedown", handleClickOutside);
    });
  });

  return (
    <Show when={suggestions().length > 0}>
      <div
        ref={menuRef}
        class="fixed z-50 w-48 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 py-1 shadow-lg dark:shadow-gray-900/50"
        style={{
          top: `${props.position.top + 24}px`,
          left: `${props.position.left}px`,
        }}
      >
        <For each={suggestions()}>
          {(topic, index) => (
            <button
              class={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
                index() === selectedIndex()
                  ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700"
                  : "text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
              }`}
              onClick={() => props.onSelect(topic.ref)}
              onMouseEnter={() => setSelectedIndex(index())}
            >
              <span
                class={
                  topic.kind === "person" ? "text-purple-500" : "text-blue-500"
                }
              >
                {topic.ref.startsWith("@") ? "@" : "#"}
              </span>
              <span class="truncate">{topic.label}</span>
            </button>
          )}
        </For>
      </div>
    </Show>
  );
}
