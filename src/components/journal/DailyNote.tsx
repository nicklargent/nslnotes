import { createSignal, createEffect } from "solid-js";
import { Editor } from "../editor/Editor";
import { serialize } from "../../lib/frontmatter";
import { FileService } from "../../services/FileService";
import { IndexService } from "../../services/IndexService";
import { SettingsService } from "../../services/SettingsService";
import { parse } from "../../lib/frontmatter";
import type { Note } from "../../types/entities";

interface DailyNoteProps {
  date: string;
  note: Note | undefined;
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
  let saveTimeout: number | undefined;

  // Track props reactively
  createEffect(() => {
    setContent(props.note?.content ?? "");
    setCreated(!!props.note);
  });

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
      window.clearTimeout(saveTimeout);
      saveTimeout = window.setTimeout(() => {
        void saveDailyNote(date, value);
      }, 300);
    }
  }

  return (
    <div class="min-h-[60px] py-1">
      <Editor
        content={content()}
        mode="outliner"
        placeholder="Start writing..."
        onUpdate={handleUpdate}
        showModeToggle={false}
      />
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
