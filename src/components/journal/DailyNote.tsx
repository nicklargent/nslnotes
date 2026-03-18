import { createSignal, createEffect, onCleanup, Show } from "solid-js";
import { Editor } from "../editor/Editor";
import { RawEditor } from "../editor/RawEditor";
import { RawModeToggle } from "../editor/RawModeToggle";
import { serialize } from "../../lib/frontmatter";
import { FileService } from "../../services/FileService";
import { IndexService } from "../../services/IndexService";
import { EntityService } from "../../services/EntityService";
import { SettingsService } from "../../services/SettingsService";
import { parse } from "../../lib/frontmatter";
import { ConfirmDeleteModal } from "../modals/ConfirmDeleteModal";
import type { Note } from "../../types/entities";

interface DailyNoteProps {
  date: string;
  note: Note | undefined;
  hovered: boolean;
}

/**
 * Daily note editor for a single date (FR-ENT-001, FR-ENT-002).
 * If no file exists, renders empty editable area.
 * First keystroke creates the file on disk (lazy creation).
 * Uses TipTap Editor component (T5.13).
 */
export function DailyNote(props: DailyNoteProps) {
  const [content, setContent] = createSignal("");
  const [created, setCreated] = createSignal(false);
  const [rawMode, setRawMode] = createSignal(false);
  const [showDeleteModal, setShowDeleteModal] = createSignal(false);
  let saveTimeout: number | undefined;
  let rawFlush: (() => Promise<void>) | null = null;

  // Track props reactively
  createEffect(() => {
    setContent(props.note?.content ?? "");
    setCreated(!!props.note);
  });

  let pendingSave: { date: string; body: string } | null = null;

  function handleUpdate(value: string) {
    setContent(value);
    const date = props.date;

    // Lazy creation: first keystroke creates the file
    if (!created() && value.trim() !== "") {
      setCreated(true);
      void createDailyNoteFile(date, value);
      return;
    }

    // Debounced save for subsequent edits (T5.12)
    if (created()) {
      pendingSave = { date, body: value };
      window.clearTimeout(saveTimeout);
      saveTimeout = window.setTimeout(() => {
        if (pendingSave) {
          void saveDailyNote(pendingSave.date, pendingSave.body);
          pendingSave = null;
        }
      }, 300);
    }
  }

  // Flush pending saves on cleanup
  onCleanup(() => {
    if (saveTimeout) {
      window.clearTimeout(saveTimeout);
    }
    if (pendingSave) {
      void saveDailyNote(pendingSave.date, pendingSave.body);
      pendingSave = null;
    }
  });

  async function handleDelete() {
    const rootPath = await SettingsService.getRootPath();
    if (!rootPath) return;
    const path = `${rootPath}/notes/${props.date}.md`;
    await EntityService.deleteEntity(path);
    setCreated(false);
    setContent("");
  }

  async function toggleRawMode() {
    const rootPath = await SettingsService.getRootPath();
    if (!rootPath) return;
    const path = `${rootPath}/notes/${props.date}.md`;

    if (rawMode()) {
      // Raw → Rendered: flush raw save (which invalidates index), re-read file for updated content
      if (rawFlush) await rawFlush();
      const fileContent = await FileService.read(path);
      const parsed = parse(fileContent);
      if (parsed) {
        setContent(parsed.body);
      }
      rawFlush = null;
      setRawMode(false);
    } else {
      // Rendered → Raw: flush pending TipTap save first
      if (pendingSave) {
        window.clearTimeout(saveTimeout);
        await saveDailyNote(pendingSave.date, pendingSave.body);
        pendingSave = null;
      }
      setRawMode(true);
    }
  }

  return (
    <div class="min-h-[60px] py-1">
      <div class="flex items-center justify-between">
        <div class="flex-1">
          <Show
            when={rawMode() && props.note}
            fallback={
              <Editor
                content={content()}
                placeholder="Start writing..."
                onUpdate={handleUpdate}
              />
            }
          >
            <RawEditor
              filePath={props.note!.path}
              onFlushRef={(fn) => {
                rawFlush = fn;
              }}
            />
          </Show>
        </div>
        <Show when={created()}>
          <div
            class={`ml-2 flex shrink-0 flex-col gap-1 self-start transition-opacity duration-300 ${props.hovered ? "opacity-100" : "opacity-0 pointer-events-none"}`}
          >
            <RawModeToggle
              active={rawMode()}
              onClick={() => void toggleRawMode()}
            />
            <button
              class="rounded p-0.5 text-gray-400 dark:text-gray-500 hover:bg-red-100 hover:text-red-600"
              title="Delete daily note"
              onClick={() => setShowDeleteModal(true)}
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
        </Show>
      </div>

      <Show when={showDeleteModal()}>
        <ConfirmDeleteModal
          title={`daily note for ${props.date}`}
          onClose={() => setShowDeleteModal(false)}
          onConfirm={() => {
            setShowDeleteModal(false);
            void handleDelete();
          }}
        />
      </Show>
    </div>
  );
}

async function createDailyNoteFile(date: string, body: string) {
  const rootPath = await SettingsService.getRootPath();
  if (!rootPath) return;

  const path = `${rootPath}/notes/${date}.md`;
  const frontmatter = { type: "note", date };
  const fileContent = serialize(frontmatter, body);
  await FileService.write(path, fileContent);
  await IndexService.invalidate(path, rootPath);
}

async function saveDailyNote(date: string, body: string) {
  const rootPath = await SettingsService.getRootPath();
  if (!rootPath) return;

  const path = `${rootPath}/notes/${date}.md`;
  const exists = await FileService.exists(path);
  if (!exists) return;

  const fileContent = await FileService.read(path);
  const parsed = parse(fileContent);
  if (!parsed) return;

  const newContent = serialize(parsed.frontmatter, body);
  await FileService.write(path, newContent);
  await IndexService.invalidate(path, rootPath);
}
