import { createSignal, createEffect, createMemo } from "solid-js";
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
  autofocus?: boolean;
  onClick: (note: Note) => void;
}

/**
 * Card rendering for a named note within the journal (FR-ENT-003, T5.13).
 * Shows title and preview/excerpt. When focused, expands to inline edit.
 */
export function NamedNoteCard(props: NamedNoteCardProps) {
  const [content, setContent] = createSignal("");
  let saveTimeout: number | undefined;
  let lastLocalContent: string | undefined;

  // Reactively look up the latest note from the index store so edits are reflected
  const liveNote = createMemo(() => {
    return indexStore.notes.get(props.note.path) ?? props.note;
  });

  createEffect(() => {
    const noteContent = liveNote().content;
    // Skip feedback from our own edits to avoid unnecessary re-renders
    if (noteContent !== lastLocalContent) {
      setContent(noteContent);
    }
  });

  function handleUpdate(newContent: string) {
    lastLocalContent = newContent;
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
      onClick={(e) => {
        if (!props.isFocused) {
          e.stopPropagation();
          props.onClick(liveNote());
        }
      }}
    >
      <div
        class="mb-1"
        onClick={(e) => {
          if (props.isFocused) e.stopPropagation();
        }}
      >
        <EditableText
          value={liveNote().title ?? liveNote().slug}
          onSave={(title) =>
            void EntityService.updateFrontmatter(props.note.path, { title })
          }
          class="text-sm font-medium text-gray-800"
        />
      </div>

      <div
        class="mt-2"
        onClick={(e) => {
          if (props.isFocused) e.stopPropagation();
        }}
      >
        <Editor
          content={content()}
          placeholder="Start writing..."
          autofocus={props.autofocus}
          onUpdate={handleUpdate}
        />
      </div>

      <div
        class="mt-1.5"
        onClick={(e) => {
          if (props.isFocused) e.stopPropagation();
        }}
      >
        <EditableTopics
          topics={liveNote().topics}
          onSave={(topics) =>
            void EntityService.updateFrontmatter(props.note.path, { topics })
          }
        />
      </div>
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
