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
