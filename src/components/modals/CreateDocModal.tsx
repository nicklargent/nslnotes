import { createSignal, Show } from "solid-js";
import { EntityService } from "../../services/EntityService";
import { NavigationService } from "../../services/NavigationService";
import type { TopicRef } from "../../types/topics";

interface CreateDocModalProps {
  onClose: () => void;
}

/**
 * Modal for creating a new doc (T6.7, FR-INT-040, FR-INT-041).
 * Title required, topics optional.
 * Confirm creates doc and opens in center panel in Prose mode.
 */
export function CreateDocModal(props: CreateDocModalProps) {
  const [title, setTitle] = createSignal("");
  const [topicsInput, setTopicsInput] = createSignal("");
  const [isCreating, setIsCreating] = createSignal(false);

  async function handleConfirm() {
    const titleVal = title().trim();
    if (titleVal === "") return;

    setIsCreating(true);

    const topics: TopicRef[] = topicsInput()
      .split(",")
      .map((t) => t.trim())
      .filter((t) => /^[#@]/.test(t)) as TopicRef[];

    const doc = await EntityService.createDoc({
      title: titleVal,
      topics: topics.length > 0 ? topics : undefined,
    });

    setIsCreating(false);

    if (doc) {
      NavigationService.navigateTo(doc);
    }
    props.onClose();
  }

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div class="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 class="mb-4 text-lg font-semibold text-gray-800">New Document</h2>

        <div class="mb-3">
          <label class="mb-1 block text-sm text-gray-600">
            Title <span class="text-red-400">*</span>
          </label>
          <input
            type="text"
            class="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            placeholder="Document title..."
            value={title()}
            onInput={(e) => setTitle(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && title().trim()) void handleConfirm();
            }}
            autofocus
          />
        </div>

        <div class="mb-4">
          <label class="mb-1 block text-sm text-gray-600">
            Topics{" "}
            <span class="text-gray-400">(optional, comma-separated)</span>
          </label>
          <input
            type="text"
            class="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            placeholder="#project, @alice"
            value={topicsInput()}
            onInput={(e) => setTopicsInput(e.currentTarget.value)}
          />
        </div>

        <div class="flex justify-end gap-2">
          <button
            class="rounded px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
            onClick={() => props.onClose()}
          >
            Cancel
          </button>
          <Show
            when={!isCreating()}
            fallback={
              <button
                class="rounded bg-blue-600 px-4 py-2 text-sm text-white opacity-50"
                disabled
              >
                Creating...
              </button>
            }
          >
            <button
              class="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
              disabled={!title().trim()}
              onClick={() => void handleConfirm()}
            >
              Create Document
            </button>
          </Show>
        </div>
      </div>
    </div>
  );
}
