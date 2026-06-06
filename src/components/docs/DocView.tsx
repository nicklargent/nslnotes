import { createSignal, createEffect, onCleanup, Show } from "solid-js";
import { Editor } from "../editor/Editor";
import { RawEditor } from "../editor/RawEditor";
import { RawModeToggle } from "../editor/RawModeToggle";
import { FileService } from "../../services/FileService";
import { IndexService } from "../../services/IndexService";
import { notebooksApi } from "../../stores/notebooksStore";
import { EntityService } from "../../services/EntityService";
import { parse, serialize } from "../../lib/frontmatter";
import { editorStore, setEditorStore } from "../../stores/editorStore";
import { reportIntegrity } from "../editor/saveIntegrity";
import { SaveWarningIndicator } from "../editor/SaveWarningIndicator";
import type { RoundTripCheck } from "../editor/pmMarkdown";
import { indexStore } from "../../stores/indexStore";
import { EditableText } from "../metadata/EditableText";
import { EditableTopics } from "../metadata/EditableTopics";
import { SlugBadge } from "../metadata/SlugBadge";
import { consumeAutofocus } from "../draft/DraftView";
import { DeleteIconButton } from "../buttons/DeleteIconButton";
import { RenameConvertButton } from "../buttons/RenameConvertButton";
import { BacklinksSection } from "../backlinks/BacklinksSection";
import { NavigationService } from "../../services/NavigationService";
import { StarIcon } from "../icons/StarIcon";
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
  const [saveWarning, setSaveWarning] = createSignal(false);
  const shouldAutofocus = consumeAutofocus();
  let saveTimeout: number | undefined;
  let pendingSave: { path: string; body: string } | null = null;
  let rawFlush: (() => Promise<void>) | null = null;
  let toggling = false;

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
    setSaveWarning(false);
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

  function handleIntegrity(result: RoundTripCheck) {
    setSaveWarning(reportIntegrity(result, { title: liveDoc().title }));
  }

  async function toggleRawMode() {
    if (toggling) return;
    toggling = true;
    try {
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
    } finally {
      toggling = false;
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
      <div class="px-[8%] py-6">
        <div class="mb-4">
          <div class="flex items-start justify-between gap-2">
            <div class="flex flex-wrap items-center gap-2">
              <EditableText
                value={liveDoc().title}
                onSave={(title) =>
                  void EntityService.updateFrontmatter(props.doc.path, {
                    title,
                  })
                }
                class="text-xl font-semibold text-gray-900 dark:text-gray-100"
              />
              <SlugBadge type="doc" slug={liveDoc().slug} />
            </div>
            <div class="ml-2 flex shrink-0 items-center gap-1">
              <RawModeToggle
                active={rawMode()}
                onClick={() => void toggleRawMode()}
              />
              <RenameConvertButton entity={liveDoc()} />
              <DeleteIconButton
                buttonTitle="Delete doc"
                confirmTitle={liveDoc().title}
                onConfirm={() => EntityService.deleteEntity(props.doc.path)}
              />
            </div>
          </div>
          <div class="mt-2 flex items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <EditableTopics
                topics={liveDoc().topics}
                onSave={(topics) =>
                  void EntityService.updateFrontmatter(props.doc.path, {
                    topics,
                  })
                }
              />
            </div>
            <span class="shrink-0 text-xs text-gray-400 dark:text-gray-500">
              Created: {liveDoc().created}
            </span>
          </div>
        </div>

        <div class="mb-4 flex items-center justify-end gap-2">
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
            <StarIcon class="h-3 w-3" filled={liveDoc().pinned} />
            {liveDoc().pinned ? "Pinned" : "Pin"}
          </button>
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
                onIntegrity={handleIntegrity}
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

        <Show
          when={saveWarning()}
          fallback={
            <div
              class="mt-2 text-right text-xs text-gray-300 transition-opacity dark:text-gray-600"
              classList={{ "opacity-0": !editorStore.isDirty }}
              aria-hidden={!editorStore.isDirty}
            >
              Saving...
            </div>
          }
        >
          <SaveWarningIndicator class="mt-2" />
        </Show>

        <BacklinksSection
          backlinks={indexStore.backlinkIndex.get(props.doc.path) ?? []}
          onBacklinkClick={NavigationService.navigateByPath}
        />
      </div>
    </div>
  );
}

async function saveDoc(path: string, body: string) {
  const rootPath = notebooksApi.activeRoot();
  if (!rootPath) return;

  const fileContent = await FileService.read(path);
  const parsed = parse(fileContent);
  if (!parsed) return;

  const newContent = serialize(parsed.frontmatter, body);
  await FileService.write(path, newContent);
  setEditorStore("isDirty", false);
  await IndexService.invalidate(path, rootPath);
}
