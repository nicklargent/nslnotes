import { createSignal, Show } from "solid-js";
import { serialize } from "../../lib/frontmatter";
import { generateSlug } from "../../lib/slug";
import { FileService } from "../../services/FileService";
import { IndexService } from "../../services/IndexService";
import { SettingsService } from "../../services/SettingsService";
import type { TopicRef } from "../../types/topics";

interface CreateNoteModalProps {
  date: string;
  onClose: () => void;
  onCreated: (slug: string | null) => void;
}

/**
 * Modal for creating a new note (FR-INT-030–032).
 * Title optional — if empty, cursor placed in daily note.
 * If title provided, named note file created.
 */
export function CreateNoteModal(props: CreateNoteModalProps) {
  const [title, setTitle] = createSignal("");
  const [topicsInput, setTopicsInput] = createSignal("");
  const [isCreating, setIsCreating] = createSignal(false);

  async function handleConfirm() {
    const titleVal = title().trim();

    if (titleVal === "") {
      // No title: just focus daily note
      props.onCreated(null);
      return;
    }

    setIsCreating(true);

    const rootPath = await SettingsService.getRootPath();
    if (!rootPath) {
      setIsCreating(false);
      return;
    }

    // Parse topics
    const topics: TopicRef[] = topicsInput()
      .split(",")
      .map((t) => t.trim())
      .filter((t) => /^[#@]/.test(t)) as TopicRef[];

    // Generate slug and create file
    const slug = generateSlug(titleVal);
    const filename = `${props.date}-${slug}`;
    const path = `${rootPath}/notes/${filename}.md`;

    const frontmatter: Record<string, unknown> = {
      type: "note",
      date: props.date,
      title: titleVal,
    };
    if (topics.length > 0) {
      frontmatter["topics"] = topics;
    }

    const content = serialize(frontmatter, "");
    await FileService.write(path, content);
    await IndexService.invalidate(path, rootPath);

    setIsCreating(false);
    props.onCreated(slug);
  }

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div class="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 class="mb-4 text-lg font-semibold text-gray-800">New Note</h2>

        <div class="mb-3">
          <label class="mb-1 block text-sm text-gray-600">
            Title{" "}
            <span class="text-gray-400">
              (optional — leave empty for daily note)
            </span>
          </label>
          <input
            type="text"
            class="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            placeholder="Meeting notes, Ideas, ..."
            value={title()}
            onInput={(e) => setTitle(e.currentTarget.value)}
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
              class="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
              onClick={() => void handleConfirm()}
            >
              {title().trim() ? "Create Note" : "Go to Daily Note"}
            </button>
          </Show>
        </div>
      </div>
    </div>
  );
}
