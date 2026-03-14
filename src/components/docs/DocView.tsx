import { createSignal, createEffect, onCleanup, Show } from "solid-js";
import { Editor } from "../editor/Editor";
import { FileService } from "../../services/FileService";
import { IndexService } from "../../services/IndexService";
import { SettingsService } from "../../services/SettingsService";
import { EntityService } from "../../services/EntityService";
import { parse, serialize } from "../../lib/frontmatter";
import { editorStore, setEditorStore } from "../../stores/editorStore";
import { indexStore } from "../../stores/indexStore";
import { EditableText } from "../metadata/EditableText";
import { EditableTopics } from "../metadata/EditableTopics";
import type { Doc } from "../../types/entities";

interface DocViewProps {
  doc: Doc;
}

/**
 * Doc view in center panel (T5.15).
 * Shows doc title, topics, and editor.
 */
export function DocView(props: DocViewProps) {
  const [content, setContent] = createSignal("");
  let saveTimeout: number | undefined;
  let pendingSave: { path: string; body: string } | null = null;

  // Reactively look up the latest doc from index store so metadata edits are reflected
  const liveDoc = () =>
    (indexStore.docs.get(props.doc.path) as Doc | undefined) ?? props.doc;

  createEffect(() => {
    const docContent = props.doc.content;
    // Flush any pending save for the previous doc before switching
    if (pendingSave && pendingSave.path !== props.doc.path) {
      window.clearTimeout(saveTimeout);
      void saveDoc(pendingSave.path, pendingSave.body);
      pendingSave = null;
    }
    setContent(docContent);
    setEditorStore({
      activeFile: props.doc.path,
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

  return (
    <div class="h-full overflow-y-auto">
      <div class="mx-auto max-w-2xl px-6 py-6">
        {/* Header */}
        <div class="mb-4">
          <EditableText
            value={liveDoc().title}
            onSave={(title) =>
              void EntityService.updateFrontmatter(props.doc.path, { title })
            }
            class="text-xl font-semibold text-gray-900"
          />
          <div class="mt-2">
            <EditableTopics
              topics={liveDoc().topics}
              onSave={(topics) =>
                void EntityService.updateFrontmatter(props.doc.path, { topics })
              }
            />
          </div>
          <span class="mt-1 block text-xs text-gray-400">
            Created: {liveDoc().created}
          </span>
        </div>

        {/* Editor */}
        <div class="border-t border-gray-100 pt-4">
          <Editor
            content={content()}
            placeholder="Start writing..."
            onUpdate={handleUpdate}
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
