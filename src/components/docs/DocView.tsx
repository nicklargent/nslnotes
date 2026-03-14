import { createSignal, createEffect, onCleanup, Show, For } from "solid-js";
import { Editor } from "../editor/Editor";
import { FileService } from "../../services/FileService";
import { IndexService } from "../../services/IndexService";
import { SettingsService } from "../../services/SettingsService";
import { parse, serialize } from "../../lib/frontmatter";
import { editorStore, setEditorStore } from "../../stores/editorStore";
import type { Doc } from "../../types/entities";
import type { EditorMode } from "../../types/stores";

interface DocViewProps {
  doc: Doc;
}

/**
 * Doc view in center panel (T5.15).
 * Shows doc title, topics, and editor in Prose mode by default.
 */
export function DocView(props: DocViewProps) {
  const [content, setContent] = createSignal("");
  const [mode, setMode] = createSignal<EditorMode>("prose");
  let saveTimeout: number | undefined;
  let pendingSave: { path: string; body: string } | null = null;

  createEffect(() => {
    const docContent = props.doc.content;
    // Flush any pending save for the previous doc before switching
    if (pendingSave && pendingSave.path !== props.doc.path) {
      window.clearTimeout(saveTimeout);
      void saveDoc(pendingSave.path, pendingSave.body);
      pendingSave = null;
    }
    setContent(docContent);
    setMode("prose"); // T5.11: docs default to prose
    setEditorStore({
      activeFile: props.doc.path,
      mode: "prose",
      isDirty: false,
    });
  });

  function handleUpdate(newContent: string) {
    const docPath = props.doc.path; // Capture eagerly before timeout
    setContent(newContent);
    setEditorStore("isDirty", true);

    pendingSave = { path: docPath, body: newContent };
    window.clearTimeout(saveTimeout);
    saveTimeout = window.setTimeout(() => {
      if (pendingSave) {
        void saveDoc(pendingSave.path, pendingSave.body);
        pendingSave = null;
      }
    }, 300);
  }

  // Flush pending saves on cleanup (component unmount / doc switch)
  onCleanup(() => {
    if (saveTimeout) {
      window.clearTimeout(saveTimeout);
    }
    if (pendingSave) {
      void saveDoc(pendingSave.path, pendingSave.body);
      pendingSave = null;
    }
  });

  function handleModeChange(newMode: EditorMode) {
    setMode(newMode);
    setEditorStore("mode", newMode);
  }

  return (
    <div class="h-full overflow-y-auto">
      <div class="mx-auto max-w-2xl px-6 py-6">
        {/* Header */}
        <div class="mb-4">
          <h1 class="text-xl font-semibold text-gray-900">{props.doc.title}</h1>
          <Show when={props.doc.topics.length > 0}>
            <div class="mt-2 flex flex-wrap gap-1">
              <For each={props.doc.topics}>
                {(t) => (
                  <span class="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                    {t}
                  </span>
                )}
              </For>
            </div>
          </Show>
          <span class="mt-1 block text-xs text-gray-400">
            Created: {props.doc.created}
          </span>
        </div>

        {/* Editor */}
        <div class="border-t border-gray-100 pt-4">
          <Editor
            content={content()}
            mode={mode()}
            placeholder="Start writing..."
            onUpdate={handleUpdate}
            onModeChange={handleModeChange}
          />
        </div>

        <Show when={editorStore.isDirty}>
          <div class="mt-2 text-right text-xs text-gray-300">Saving...</div>
        </Show>
      </div>
    </div>
  );
}

async function saveDoc(path: string, body: string) {
  const rootPath = await SettingsService.getRootPath();
  if (!rootPath) return;

  const fileContent = await FileService.read(path);
  const parsed = parse(fileContent);
  if (!parsed) return;

  const newContent = serialize(parsed.frontmatter, body);
  await FileService.write(path, newContent);
  setEditorStore("isDirty", false);
  await IndexService.invalidate(path, rootPath);
}
