import { createSignal, createEffect, createMemo, Show, For } from "solid-js";
import { Editor } from "../editor/Editor";
import { FileService } from "../../services/FileService";
import { IndexService } from "../../services/IndexService";
import { SettingsService } from "../../services/SettingsService";
import { EntityService } from "../../services/EntityService";
import { parse, serialize } from "../../lib/frontmatter";
import { indexStore } from "../../stores/indexStore";
import { EditableText } from "../metadata/EditableText";
import { EditableTopics } from "../metadata/EditableTopics";
import type { Note } from "../../types/entities";

interface NamedNoteCardProps {
  note: Note;
  isFocused: boolean;
  onClick: (note: Note) => void;
}

/**
 * Card rendering for a named note within the journal (FR-ENT-003, T5.13).
 * Shows title and preview/excerpt. When focused, expands to inline edit.
 */
export function NamedNoteCard(props: NamedNoteCardProps) {
  const [content, setContent] = createSignal("");
  let saveTimeout: number | undefined;

  // Reactively look up the latest note from the index store so edits are reflected
  const liveNote = createMemo(() => {
    return indexStore.notes.get(props.note.path) ?? props.note;
  });

  createEffect(() => {
    setContent(liveNote().content);
  });

  const excerpt = () => {
    const c = content();
    const lines = c.split("\n").filter((l) => l.trim());
    const preview = lines.slice(0, 3).join(" ");
    return preview.length > 120 ? preview.slice(0, 120) + "..." : preview;
  };

  function handleUpdate(newContent: string) {
    setContent(newContent);

    window.clearTimeout(saveTimeout);
    saveTimeout = window.setTimeout(() => {
      void saveNamedNote(props.note.path, newContent);
    }, 300);
  }

  return (
    <div
      class={`mt-2 rounded-lg border p-3 transition-colors ${
        props.isFocused
          ? "border-blue-300 bg-blue-50"
          : "border-gray-200 bg-gray-50 hover:border-gray-300"
      }`}
      onClick={() => {
        if (!props.isFocused) props.onClick(liveNote());
      }}
    >
      <Show
        when={props.isFocused}
        fallback={
          <h4 class="mb-1 text-sm font-medium text-gray-800">
            {liveNote().title ?? liveNote().slug}
          </h4>
        }
      >
        <div class="mb-1" onClick={(e) => e.stopPropagation()}>
          <EditableText
            value={liveNote().title ?? liveNote().slug}
            onSave={(title) =>
              void EntityService.updateFrontmatter(props.note.path, { title })
            }
            class="text-sm font-medium text-gray-800"
          />
        </div>
      </Show>

      <Show when={props.isFocused}>
        {/* Inline edit mode (T5.13) */}
        <div class="mt-2" onClick={(e) => e.stopPropagation()}>
          <Editor
            content={content()}
            mode="outliner"
            placeholder="Start writing..."
            onUpdate={handleUpdate}
            showModeToggle={true}
          />
        </div>
      </Show>

      <Show when={!props.isFocused}>
        {/* Preview mode */}
        <Show when={excerpt()}>
          <p class="mt-1 text-xs leading-relaxed text-gray-500">{excerpt()}</p>
        </Show>
      </Show>

      <Show
        when={props.isFocused}
        fallback={
          <Show when={liveNote().topics.length > 0}>
            <div class="mt-1.5 flex flex-wrap gap-1">
              <For each={liveNote().topics}>
                {(t) => (
                  <span class="rounded bg-gray-200 px-1.5 py-0.5 text-xs text-gray-500">
                    {t}
                  </span>
                )}
              </For>
            </div>
          </Show>
        }
      >
        <div class="mt-1.5" onClick={(e) => e.stopPropagation()}>
          <EditableTopics
            topics={liveNote().topics}
            onSave={(topics) =>
              void EntityService.updateFrontmatter(props.note.path, { topics })
            }
          />
        </div>
      </Show>
    </div>
  );
}

async function saveNamedNote(path: string, body: string) {
  const rootPath = await SettingsService.getRootPath();
  if (!rootPath) return;

  const fileContent = await FileService.read(path);
  const parsed = parse(fileContent);
  if (!parsed) return;

  const newContent = serialize(parsed.frontmatter, body);
  await FileService.write(path, newContent);
  await IndexService.invalidate(path, rootPath);
}
