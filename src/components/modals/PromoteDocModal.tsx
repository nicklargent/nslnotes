import { createSignal, For, Show } from "solid-js";
import type { TopicRef } from "../../types/topics";

interface PromoteDocModalProps {
  sourceTopics: TopicRef[];
  onConfirm: (title: string, topics: TopicRef[]) => void;
  onClose: () => void;
}

/**
 * Modal for promoting content to a doc (T6.9, FR-INT-020–024).
 * Prompts for title and topic selection from source note.
 */
export function PromoteDocModal(props: PromoteDocModalProps) {
  const [title, setTitle] = createSignal("");
  const [selectedTopics, setSelectedTopics] = createSignal<Set<TopicRef>>(
    new Set()
  );

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

  function handleConfirm() {
    const titleVal = title().trim();
    if (!titleVal) return;
    props.onConfirm(titleVal, Array.from(selectedTopics()));
  }

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div class="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 class="mb-4 text-lg font-semibold text-gray-800">
          Promote to Document
        </h2>

        <div class="mb-3">
          <label class="mb-1 block text-sm text-gray-600">
            Document title <span class="text-red-400">*</span>
          </label>
          <input
            type="text"
            class="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            placeholder="Document title..."
            value={title()}
            onInput={(e) => setTitle(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && title().trim()) handleConfirm();
            }}
            autofocus
          />
        </div>

        <Show when={props.sourceTopics.length > 0}>
          <div class="mb-4">
            <label class="mb-2 block text-sm text-gray-600">
              Inherit topics from source note:
            </label>
            <div class="flex flex-wrap gap-2">
              <For each={props.sourceTopics}>
                {(ref) => (
                  <button
                    class={`rounded px-2 py-1 text-xs transition-colors ${
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
          </div>
        </Show>

        <div class="flex justify-end gap-2">
          <button
            class="rounded px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
            onClick={() => props.onClose()}
          >
            Cancel
          </button>
          <button
            class="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            disabled={!title().trim()}
            onClick={handleConfirm}
          >
            Create Document
          </button>
        </div>
      </div>
    </div>
  );
}
