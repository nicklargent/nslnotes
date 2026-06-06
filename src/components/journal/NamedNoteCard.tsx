import {
  createSignal,
  createEffect,
  createMemo,
  onCleanup,
  Show,
} from "solid-js";
import { Editor } from "../editor/Editor";
import { reportIntegrity } from "../editor/saveIntegrity";
import { SaveWarningIndicator } from "../editor/SaveWarningIndicator";
import type { RoundTripCheck } from "../editor/pmMarkdown";
import { RawEditor } from "../editor/RawEditor";
import { RawModeToggle } from "../editor/RawModeToggle";
import { FileService } from "../../services/FileService";
import { IndexService } from "../../services/IndexService";
import { EntityService } from "../../services/EntityService";
import { notebooksApi } from "../../stores/notebooksStore";
import { parse, serialize } from "../../lib/frontmatter";
import { indexStore } from "../../stores/indexStore";
import { EditableText } from "../metadata/EditableText";
import { EditableTopics } from "../metadata/EditableTopics";
import { SlugBadge } from "../metadata/SlugBadge";
import { DeleteIconButton } from "../buttons/DeleteIconButton";
import { RenameConvertButton } from "../buttons/RenameConvertButton";
import type { Note } from "../../types/entities";

interface NamedNoteCardProps {
  note: Note;
  isFocused: boolean;
  hovered: boolean;
  autofocus?: boolean;
  highlight?: boolean;
  onClick: (note: Note) => void;
}

/**
 * Card rendering for a named note within the journal (FR-ENT-003, T5.13).
 * Shows title and preview/excerpt. When focused, expands to inline edit.
 */
export function NamedNoteCard(props: NamedNoteCardProps) {
  const [content, setContent] = createSignal("");
  const [rawMode, setRawMode] = createSignal(false);
  const [saveWarning, setSaveWarning] = createSignal(false);
  let saveTimeout: number | undefined;
  let lastLocalContent: string | undefined;
  let rawFlush: (() => Promise<void>) | null = null;
  let toggling = false;

  // Reactively look up the latest note from the index store so edits are reflected
  const liveNote = createMemo(() => {
    return indexStore.notes.get(props.note.path) ?? props.note;
  });

  createEffect(() => {
    const noteContent = liveNote().content;
    // Skip own-save echoes; keep `lastLocalContent` in sync on real
    // resyncs so a notebook-switch reset cycle doesn't leave the editor
    // empty (see DailyNote.tsx for the full rationale).
    if (noteContent !== lastLocalContent) {
      setContent(noteContent);
      lastLocalContent = noteContent;
    }
  });

  function handleIntegrity(result: RoundTripCheck) {
    setSaveWarning(
      reportIntegrity(result, {
        title: liveNote().title ?? liveNote().slug,
      })
    );
  }

  // Pending save snapshot. We capture the path at edit time and reuse it
  // on cleanup so a notebook switch (which can cause `props.note` to
  // stop being current) never routes the write to the wrong notebook.
  let pendingSave: { path: string; body: string } | null = null;

  onCleanup(() => {
    if (saveTimeout) {
      window.clearTimeout(saveTimeout);
      saveTimeout = undefined;
    }
    if (pendingSave) {
      const { path, body } = pendingSave;
      pendingSave = null;
      void saveNamedNote(path, body);
    }
  });

  function handleUpdate(newContent: string) {
    lastLocalContent = newContent;
    setContent(newContent);
    const notePath = props.note.path;
    pendingSave = { path: notePath, body: newContent };

    window.clearTimeout(saveTimeout);
    saveTimeout = window.setTimeout(() => {
      if (pendingSave) {
        const { path, body } = pendingSave;
        pendingSave = null;
        void saveNamedNote(path, body);
      }
    }, 300);
  }

  async function toggleRawMode() {
    if (toggling) return;
    toggling = true;
    try {
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
    } finally {
      toggling = false;
    }
  }

  return (
    <div
      class={`mt-2 overflow-hidden rounded-lg border p-3 transition-colors ${
        props.isFocused
          ? "border-blue-300 bg-blue-50 dark:bg-blue-900/30"
          : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-600"
      }${props.highlight ? " animate-flash" : ""}`}
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
        <div class="flex flex-wrap items-center gap-2">
          <EditableText
            value={liveNote().title ?? liveNote().slug}
            onSave={(title) =>
              void EntityService.updateFrontmatter(props.note.path, { title })
            }
            class="text-lg font-semibold text-gray-800 dark:text-gray-100"
          />
          <SlugBadge type="note" slug={liveNote().slug} />
        </div>
        <div
          class={`ml-2 flex shrink-0 items-center gap-1 transition-opacity duration-300 ${props.hovered || props.isFocused ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        >
          <span onClick={(e) => e.stopPropagation()}>
            <RawModeToggle
              active={rawMode()}
              onClick={() => void toggleRawMode()}
            />
          </span>
          <Show when={!liveNote().isDaily}>
            <RenameConvertButton entity={liveNote()} stopPropagation />
          </Show>
          <DeleteIconButton
            buttonTitle="Delete note"
            confirmTitle={liveNote().title ?? liveNote().slug}
            onConfirm={() => EntityService.deleteEntity(props.note.path)}
            stopPropagation
          />
        </div>
      </div>

      <div class="mt-1" onClick={(e) => e.stopPropagation()}>
        <EditableTopics
          topics={liveNote().topics}
          onSave={(topics) =>
            void EntityService.updateFrontmatter(props.note.path, { topics })
          }
        />
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
              embedded={true}
              onUpdate={handleUpdate}
              onIntegrity={handleIntegrity}
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
        <Show when={saveWarning()}>
          <SaveWarningIndicator class="mt-1" />
        </Show>
      </div>
    </div>
  );
}

async function saveNamedNote(path: string, body: string) {
  const rootPath = notebooksApi.activeRoot();
  if (!rootPath) return;

  const fileContent = await FileService.read(path);
  const parsed = parse(fileContent);
  if (!parsed) return;

  const newContent = serialize(parsed.frontmatter, body);
  await FileService.write(path, newContent);
  await IndexService.invalidate(path, rootPath);
}
