import { createSignal, createEffect, on, onCleanup, Show } from "solid-js";
import { Editor } from "../editor/Editor";
import { RawEditor } from "../editor/RawEditor";
import { RawModeToggle } from "../editor/RawModeToggle";
import { serialize } from "../../lib/frontmatter";
import { FileService } from "../../services/FileService";
import { IndexService } from "../../services/IndexService";
import { EntityService } from "../../services/EntityService";
import { parse } from "../../lib/frontmatter";
import { DeleteIconButton } from "../buttons/DeleteIconButton";
import { notebooksApi } from "../../stores/notebooksStore";
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
  let saveTimeout: number | undefined;
  let savingPromise: Promise<void> | null = null;
  let rawFlush: (() => Promise<void>) | null = null;
  let lastLocalContent: string | undefined;

  // Only sync content when the note identity (path) changes, not on every re-parse
  createEffect(
    on(
      () => props.note?.path,
      () => {
        const noteContent = props.note?.content ?? "";
        // Skip if this is feedback from our own save (the file content
        // matches what the user just typed). When we DO sync, keep
        // `lastLocalContent` in lockstep with `content()` — otherwise a
        // notebook-switch reset cycle (note becomes undefined → ""
        // restored from cache) leaves them desynced and the editor stays
        // empty even when the cache holds the saved content.
        if (noteContent !== lastLocalContent) {
          setContent(noteContent);
          lastLocalContent = noteContent;
        }
        setCreated(!!props.note);
      }
    )
  );

  // Path is captured at edit time so a notebook switch between keystroke
  // and debounced save can't route the write to the wrong notebook.
  let pendingSave: { path: string; rootPath: string; body: string } | null =
    null;

  function resolveDailyNotePath(): { path: string; rootPath: string } | null {
    const root = notebooksApi.activeRoot();
    if (!root) return null;
    const rootPath = root.replace(/\/+$/, "");
    return { path: `${rootPath}/notes/${props.date}.md`, rootPath };
  }

  function handleUpdate(value: string) {
    lastLocalContent = value;
    setContent(value);

    const resolved = resolveDailyNotePath();
    if (!resolved) return;
    const { path, rootPath } = resolved;

    // Lazy creation: first keystroke creates the file
    if (!created() && value.trim() !== "") {
      setCreated(true);
      void createDailyNoteFile(path, rootPath, props.date, value);
      return;
    }

    // Debounced save for subsequent edits (T5.12)
    if (created()) {
      pendingSave = { path, rootPath, body: value };
      window.clearTimeout(saveTimeout);
      saveTimeout = window.setTimeout(() => {
        // Clear so `hasPendingChanges()` (used by beforeunload) doesn't
        // report `true` for the expired timer.
        saveTimeout = undefined;
        if (pendingSave) {
          const { path: p, rootPath: r, body: b } = pendingSave;
          pendingSave = null;
          savingPromise = saveDailyNote(p, r, b).finally(() => {
            savingPromise = null;
          });
        }
      }, 300);
    }
  }

  async function flushPendingSave() {
    if (saveTimeout) {
      window.clearTimeout(saveTimeout);
      saveTimeout = undefined;
    }
    if (pendingSave) {
      const { path, rootPath, body } = pendingSave;
      pendingSave = null;
      await saveDailyNote(path, rootPath, body);
    }
    if (savingPromise) {
      await savingPromise;
    }
  }

  function hasPendingChanges() {
    return !!pendingSave || !!savingPromise || !!saveTimeout;
  }

  function handleBeforeUnload(e: BeforeUnloadEvent) {
    if (hasPendingChanges()) {
      e.preventDefault();
    }
  }

  window.addEventListener("beforeunload", handleBeforeUnload);

  // Flush pending saves on cleanup
  onCleanup(() => {
    window.removeEventListener("beforeunload", handleBeforeUnload);
    void flushPendingSave();
  });

  async function handleDelete() {
    const resolved = resolveDailyNotePath();
    if (!resolved) return;
    await EntityService.deleteEntity(resolved.path);
    setCreated(false);
    setContent("");
  }

  async function toggleRawMode() {
    const resolved = resolveDailyNotePath();
    if (!resolved) return;
    const { path } = resolved;

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
      await flushPendingSave();
      setRawMode(true);
    }
  }

  return (
    <div class="min-h-[60px] py-1">
      <div class="flex items-center justify-between">
        <div class="flex-1 min-w-0">
          <Show
            when={rawMode() && props.note}
            fallback={
              <Editor
                content={content()}
                placeholder="Start writing..."
                entityPath={props.note?.path}
                embedded={true}
                onUpdate={handleUpdate}
                onFlushSave={flushPendingSave}
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
            <DeleteIconButton
              buttonTitle="Delete daily note"
              confirmTitle={`daily note for ${props.date}`}
              onConfirm={handleDelete}
            />
          </div>
        </Show>
      </div>
    </div>
  );
}

async function createDailyNoteFile(
  path: string,
  rootPath: string,
  date: string,
  body: string
) {
  const frontmatter = { type: "note", date };
  const fileContent = serialize(frontmatter, body);
  await FileService.write(path, fileContent);
  await IndexService.invalidate(path, rootPath);
}

async function saveDailyNote(path: string, rootPath: string, body: string) {
  // Skip the upfront `FileService.exists` check — `read` will throw if
  // the file vanished between edit and debounced save, and we just bail
  // either way. One fewer SMB round-trip per debounced keystroke.
  let fileContent: string;
  try {
    fileContent = await FileService.read(path);
  } catch {
    return;
  }
  const parsed = parse(fileContent);
  if (!parsed) return;

  const newContent = serialize(parsed.frontmatter, body);
  await FileService.write(path, newContent);
  await IndexService.invalidate(path, rootPath);
}
