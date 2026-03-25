import { createSignal, createEffect, onCleanup, Show } from "solid-js";
import { Editor } from "../editor/Editor";
import { RawEditor } from "../editor/RawEditor";
import { RawModeToggle } from "../editor/RawModeToggle";
import { FileService } from "../../services/FileService";
import { IndexService } from "../../services/IndexService";
import { SettingsService } from "../../services/SettingsService";
import { EntityService } from "../../services/EntityService";
import { parse, serialize } from "../../lib/frontmatter";
import { editorStore, setEditorStore } from "../../stores/editorStore";
import { indexStore } from "../../stores/indexStore";
import { EditableText } from "../metadata/EditableText";
import { EditableTopics } from "../metadata/EditableTopics";
import { consumeAutofocus } from "../draft/DraftView";
import { ConfirmDeleteModal } from "../modals/ConfirmDeleteModal";
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
  const [rawMode, setRawMode] = createSignal(false);
  const [showDeleteModal, setShowDeleteModal] = createSignal(false);
  const shouldAutofocus = consumeAutofocus();
  let saveTimeout: number | undefined;
  let pendingSave: { path: string; body: string } | null = null;
  let rawFlush: (() => Promise<void>) | null = null;

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

  async function toggleRawMode() {
    if (rawMode()) {
      // Raw → Rendered: flush raw save (which invalidates index), re-read file for updated content
      if (rawFlush) await rawFlush();
      const fileContent = await FileService.read(props.doc.path);
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
        await saveDoc(pendingSave.path, pendingSave.body);
        pendingSave = null;
      }
      setRawMode(true);
    }
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
            class="text-xl font-semibold text-gray-900 dark:text-gray-100"
          />
          <div class="mt-1">
            <code class="select-all rounded bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 text-xs text-gray-500 dark:text-gray-400">
              [[doc:{liveDoc().slug}]]
            </code>
          </div>
          <div class="mt-2">
            <EditableTopics
              topics={liveDoc().topics}
              onSave={(topics) =>
                void EntityService.updateFrontmatter(props.doc.path, { topics })
              }
            />
          </div>
          <div class="mt-2 flex items-center gap-3">
            <span class="text-xs text-gray-400 dark:text-gray-500">
              Created: {liveDoc().created}
            </span>
            <button
              class={`flex items-center gap-1 rounded px-3 py-1 text-xs font-medium ${
                liveDoc().pinned
                  ? "bg-amber-50 text-amber-600 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400"
                  : "bg-gray-50 text-gray-500 hover:bg-gray-100 dark:bg-gray-700 dark:text-gray-400"
              }`}
              onClick={() =>
                void EntityService.updateFrontmatter(props.doc.path, {
                  pinned: liveDoc().pinned ? null : true,
                })
              }
              title={liveDoc().pinned ? "Unpin doc" : "Pin doc"}
            >
              <Show
                when={liveDoc().pinned}
                fallback={
                  <svg
                    class="h-3 w-3"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path d="M12 2l2.09 6.26L21 9.27l-5 3.64L17.18 20 12 16.77 6.82 20 8 12.91l-5-3.64 6.91-1.01z" />
                  </svg>
                }
              >
                <svg
                  class="h-3 w-3"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M12 2l2.09 6.26L21 9.27l-5 3.64L17.18 20 12 16.77 6.82 20 8 12.91l-5-3.64 6.91-1.01z" />
                </svg>
              </Show>
              {liveDoc().pinned ? "Pinned" : "Pin"}
            </button>
            <RawModeToggle
              active={rawMode()}
              onClick={() => void toggleRawMode()}
            />
            <button
              class="rounded bg-red-50 dark:bg-red-900/30 px-3 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-100"
              onClick={() => setShowDeleteModal(true)}
            >
              Delete
            </button>
          </div>
        </div>

        {/* Editor */}
        <div class="border-t border-gray-100 dark:border-gray-700 pt-4">
          <Show
            when={rawMode()}
            fallback={
              <Editor
                content={content()}
                placeholder="Start writing..."
                autofocus={shouldAutofocus}
                entityPath={props.doc.path}
                onUpdate={handleUpdate}
              />
            }
          >
            <RawEditor
              filePath={props.doc.path}
              onFlushRef={(fn) => {
                rawFlush = fn;
              }}
            />
          </Show>
        </div>

        <Show when={editorStore.isDirty}>
          <div class="mt-2 text-right text-xs text-gray-300 dark:text-gray-600">
            Saving...
          </div>
        </Show>
      </div>

      <Show when={showDeleteModal()}>
        <ConfirmDeleteModal
          title={liveDoc().title}
          onClose={() => setShowDeleteModal(false)}
          onConfirm={() => {
            setShowDeleteModal(false);
            void EntityService.deleteEntity(props.doc.path);
          }}
        />
      </Show>
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
