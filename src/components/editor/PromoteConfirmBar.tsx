import { createSignal, For, Show, onMount, onCleanup } from "solid-js";
import { generateSlug } from "../../lib/slug";
import type { Editor as TiptapEditor } from "@tiptap/core";
import type { PromoteRange } from "./promoteRange";
import type { TopicRef } from "../../types/topics";

interface PromoteConfirmBarProps {
  editor: TiptapEditor;
  range: PromoteRange;
  sourceTopics: TopicRef[];
  onConfirmTask: (topics: TopicRef[], slug: string) => void;
  onConfirmDoc: (topics: TopicRef[], slug: string) => void;
  onCancel: () => void;
  ref?: ((el: HTMLDivElement) => void) | undefined;
}

/**
 * Floating inline confirmation bar for promote-to-task/doc.
 * Positioned below the highlighted range, shows auto-detected title
 * and optional topic chips.
 */
export function PromoteConfirmBar(props: PromoteConfirmBarProps) {
  const [position, setPosition] = createSignal({ top: 0, left: 0 });
  const [slug, setSlug] = createSignal(generateSlug(props.range.title));
  const [selectedTopics, setSelectedTopics] = createSignal<Set<TopicRef>>(
    new Set()
  );
  function updatePosition() {
    const { view } = props.editor;
    try {
      const coords = view.coordsAtPos(props.range.from);
      setPosition({ top: coords.bottom + 8, left: coords.left });
    } catch {
      // fallback if pos is invalid
    }
  }

  onMount(() => {
    updatePosition();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        props.onCancel();
      }
    }
    document.addEventListener("keydown", handleKeyDown, true);

    onCleanup(() => {
      document.removeEventListener("keydown", handleKeyDown, true);
    });
  });

  function toggleTopic(ref: TopicRef) {
    setSelectedTopics((prev) => {
      const next = new Set(prev);
      if (next.has(ref)) {
        next.delete(ref);
      } else {
        next.add(ref);
      }
      return next;
    });
  }

  const topicsArray = () => Array.from(selectedTopics());

  // Truncate title for display
  const displayTitle = () => {
    const t = props.range.title;
    return t.length > 60 ? t.slice(0, 57) + "..." : t;
  };

  return (
    <div
      ref={(el) => {
        props.ref?.(el);
      }}
      class="fixed z-50 animate-bubble-up"
      style={{
        top: `${position().top}px`,
        left: `${position().left}px`,
      }}
    >
      <div class="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg max-w-md">
        <div class="flex items-center gap-2 mb-1">
          <span class="text-sm font-semibold text-gray-800 truncate flex-1">
            {displayTitle()}
          </span>
          <Show when={props.range.hasBody}>
            <span class="text-xs text-gray-400">+ content</span>
          </Show>
        </div>

        <div class="flex items-center gap-1 mb-2">
          <span class="text-xs text-gray-400 shrink-0">slug:</span>
          <input
            type="text"
            class="flex-1 min-w-0 border border-gray-200 rounded px-1.5 py-0.5 text-xs text-gray-700 outline-none focus:border-blue-400"
            value={slug()}
            onInput={(e) => setSlug(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
              }
            }}
          />
        </div>

        <Show when={props.sourceTopics.length > 0}>
          <div class="flex flex-wrap gap-1 mb-2">
            <For each={props.sourceTopics}>
              {(ref) => (
                <button
                  class={`rounded px-1.5 py-0.5 text-xs transition-colors ${
                    selectedTopics().has(ref)
                      ? "bg-blue-100 text-blue-700"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                  onClick={() => toggleTopic(ref)}
                >
                  {ref}
                </button>
              )}
            </For>
          </div>
        </Show>

        <div class="flex items-center gap-1">
          <button
            class="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
            onClick={() => props.onConfirmTask(topicsArray(), slug())}
          >
            Task
          </button>
          <button
            class="rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700"
            onClick={() => props.onConfirmDoc(topicsArray(), slug())}
          >
            Doc
          </button>
          <button
            class="ml-1 rounded px-1.5 py-1 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            onClick={() => props.onCancel()}
            title="Cancel (Esc)"
          >
            &times;
          </button>
        </div>
      </div>
    </div>
  );
}
