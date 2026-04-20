import { createSignal, createEffect, onCleanup } from "solid-js";
import { FileService } from "../../services/FileService";
import { IndexService } from "../../services/IndexService";
import { SettingsService } from "../../services/SettingsService";
import { setEditorStore } from "../../stores/editorStore";

interface RawEditorProps {
  filePath: string;
  onFlushRef?: (flush: () => Promise<void>) => void;
}

/**
 * Raw markdown source editor — shows full file content (frontmatter + body)
 * in a plain textarea.
 */
export function RawEditor(props: RawEditorProps) {
  const [text, setText] = createSignal("");
  let saveTimeout: number | undefined;
  let pendingSave: { path: string; content: string } | null = null;

  async function flush() {
    if (saveTimeout) window.clearTimeout(saveTimeout);
    if (pendingSave) {
      await saveRaw(pendingSave.path, pendingSave.content);
      pendingSave = null;
    }
  }

  // Expose flush to parent via callback ref
  createEffect(() => {
    props.onFlushRef?.(flush);
  });

  // Load file content on mount / path change
  createEffect(() => {
    const path = props.filePath;
    // Flush any pending save for a different path
    if (pendingSave && pendingSave.path !== path) {
      window.clearTimeout(saveTimeout);
      void saveRaw(pendingSave.path, pendingSave.content);
      pendingSave = null;
    }
    void FileService.read(path).then((content) => {
      setText(content);
      setEditorStore("isDirty", false);
    });
  });

  function handleInput(value: string) {
    const path = props.filePath;
    setText(value);
    setEditorStore("isDirty", true);

    pendingSave = { path, content: value };
    window.clearTimeout(saveTimeout);
    saveTimeout = window.setTimeout(() => {
      if (pendingSave) {
        void saveRaw(pendingSave.path, pendingSave.content);
        pendingSave = null;
      }
    }, 300);
  }

  function handleKeyDown(
    e: KeyboardEvent & { currentTarget: HTMLTextAreaElement }
  ) {
    if (e.key !== "Tab") return;
    e.preventDefault();
    const ta = e.currentTarget;
    const value = ta.value;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const multiLine = value.slice(start, end).includes("\n");

    let newValue: string;
    let newStart: number;
    let newEnd: number;

    if (!multiLine) {
      if (e.shiftKey) {
        const lineStart = value.lastIndexOf("\n", start - 1) + 1;
        const removed = value.startsWith("  ", lineStart)
          ? 2
          : value.startsWith("\t", lineStart)
            ? 1
            : 0;
        if (removed === 0) return;
        newValue = value.slice(0, lineStart) + value.slice(lineStart + removed);
        newStart = Math.max(lineStart, start - removed);
        newEnd = Math.max(lineStart, end - removed);
      } else {
        newValue = value.slice(0, start) + "  " + value.slice(end);
        newStart = newEnd = start + 2;
      }
    } else {
      const firstLineStart = value.lastIndexOf("\n", start - 1) + 1;
      const lineStarts: number[] = [firstLineStart];
      for (let i = firstLineStart; i < end; i++) {
        if (value[i] === "\n" && i + 1 < end) lineStarts.push(i + 1);
      }
      let result = value;
      let startDelta = 0;
      let endDelta = 0;
      for (let i = lineStarts.length - 1; i >= 0; i--) {
        const ls = lineStarts[i]!;
        if (e.shiftKey) {
          const removed = result.startsWith("  ", ls)
            ? 2
            : result.startsWith("\t", ls)
              ? 1
              : 0;
          if (removed === 0) continue;
          result = result.slice(0, ls) + result.slice(ls + removed);
          endDelta -= Math.min(removed, end - ls);
          if (ls < start) startDelta -= Math.min(removed, start - ls);
        } else {
          result = result.slice(0, ls) + "  " + result.slice(ls);
          endDelta += 2;
          if (ls <= start) startDelta += 2;
        }
      }
      if (result === value) return;
      newValue = result;
      newStart = Math.max(firstLineStart, start + startDelta);
      newEnd = end + endDelta;
    }

    ta.value = newValue;
    ta.setSelectionRange(newStart, newEnd);
    handleInput(newValue);
  }

  onCleanup(() => {
    if (saveTimeout) window.clearTimeout(saveTimeout);
    if (pendingSave) {
      void saveRaw(pendingSave.path, pendingSave.content);
      pendingSave = null;
    }
  });

  return (
    <textarea
      class="w-full min-h-[60vh] resize-y rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-4 font-mono text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:focus:ring-blue-500"
      spellcheck={false}
      value={text()}
      onInput={(e) => handleInput(e.currentTarget.value)}
      onKeyDown={handleKeyDown}
    />
  );
}

async function saveRaw(path: string, content: string) {
  const rootPath = await SettingsService.getRootPath();
  if (!rootPath) return;

  await FileService.write(path, content);
  setEditorStore("isDirty", false);
  await IndexService.invalidate(path, rootPath);
}
