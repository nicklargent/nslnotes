import {
  createSignal,
  createEffect,
  createMemo,
  onCleanup,
  Show,
} from "solid-js";
import { Editor } from "../editor/Editor";
import { RawEditor } from "../editor/RawEditor";
import { RawModeToggle } from "../editor/RawModeToggle";
import { FileService } from "../../services/FileService";
import { IndexService } from "../../services/IndexService";
import { SettingsService } from "../../services/SettingsService";
import { EntityService } from "../../services/EntityService";
import { parse, serialize } from "../../lib/frontmatter";
import { indexStore } from "../../stores/indexStore";
import { EditableText } from "../metadata/EditableText";
import { EditableTopics } from "../metadata/EditableTopics";
import { ConfirmDeleteModal } from "../modals/ConfirmDeleteModal";
import type { Note } from "../../types/entities";

interface NamedNoteCardProps {
  note: Note;
  isFocused: boolean;
  hovered: boolean;
  autofocus?: boolean;
  onClick: (note: Note) => void;
}

/**
 * Card rendering for a named note within the journal (FR-ENT-003, T5.13).
 * Shows title and preview/excerpt. When focused, expands to inline edit.
 */
export function NamedNoteCard(props: NamedNoteCardProps) {
  const [content, setContent] = createSignal("");
  const [rawMode, setRawMode] = createSignal(false);
  const [showDeleteModal, setShowDeleteModal] = createSignal(false);
  let saveTimeout: number | undefined;
  let lastLocalContent: string | undefined;
  let rawFlush: (() => Promise<void>) | null = null;

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

  onCleanup(() => {
    if (saveTimeout) {
      window.clearTimeout(saveTimeout);
      void saveNamedNote(props.note.path, content());
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

  async function toggleRawMode() {
    if (rawMode()) {
      // Raw → Rendered: flush raw save (which invalidates index), re-read file for updated content
      if (rawFlush) await rawFlush();
      const fileContent = await FileService.read(props.note.path);
      const parsed = parse(fileContent);
      if (parsed) {
        lastLocalContent = parsed.body;
        setContent(parsed.body);
      }
      rawFlush = null;
      setRawMode(false);
    } else {
      // Rendered → Raw: flush pending TipTap save first
      if (saveTimeout) {
        window.clearTimeout(saveTimeout);
        await saveNamedNote(props.note.path, content());
      }
      setRawMode(true);
    }
  }

  return (
    <div
      class={`mt-2 overflow-hidden rounded-lg border p-3 transition-colors ${
        props.isFocused
          ? "border-blue-300 bg-blue-50 dark:bg-blue-900/30"
          : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-600"
      }`}
      onClick={(e) => {
        if (!props.isFocused) {
          e.stopPropagation();
          props.onClick(liveNote());
        }
      }}
    >
      <div
        class="mb-1 flex items-start justify-between"
        onClick={(e) => {
          if (props.isFocused) e.stopPropagation();
        }}
      >
        <EditableText
          value={liveNote().title ?? liveNote().slug}
          onSave={(title) =>
            void EntityService.updateFrontmatter(props.note.path, { title })
          }
          class="text-sm font-medium text-gray-800 dark:text-gray-100"
        />
        <div
          class={`ml-2 flex shrink-0 items-center gap-1 transition-opacity duration-300 ${props.hovered || props.isFocused ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        >
          <span onClick={(e) => e.stopPropagation()}>
            <RawModeToggle
              active={rawMode()}
              onClick={() => void toggleRawMode()}
            />
          </span>
          <button
            class="rounded p-0.5 text-gray-400 dark:text-gray-500 hover:bg-red-100 hover:text-red-600"
            title="Delete note"
            onClick={(e) => {
              e.stopPropagation();
              setShowDeleteModal(true);
            }}
          >
            <svg
              class="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      </div>

      <div
        class="mt-2"
        onClick={(e) => {
          if (props.isFocused) e.stopPropagation();
        }}
      >
        <Show
          when={rawMode()}
          fallback={
            <Editor
              content={content()}
              placeholder="Start writing..."
              autofocus={props.autofocus}
              entityPath={props.note.path}
              onUpdate={handleUpdate}
            />
          }
        >
          <RawEditor
            filePath={props.note.path}
            onFlushRef={(fn) => {
              rawFlush = fn;
            }}
          />
        </Show>
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

      <Show when={showDeleteModal()}>
        <ConfirmDeleteModal
          title={liveNote().title ?? liveNote().slug}
          onClose={() => setShowDeleteModal(false)}
          onConfirm={() => {
            setShowDeleteModal(false);
            void EntityService.deleteEntity(props.note.path);
          }}
        />
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
