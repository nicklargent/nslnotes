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
import { EditableDate } from "../metadata/EditableDate";
import { consumeAutofocus } from "../draft/DraftView";
import { ConfirmDeleteModal } from "../modals/ConfirmDeleteModal";
import type { Task } from "../../types/entities";

interface TaskDetailProps {
  task: Task;
}

/**
 * Task detail view in center panel (T5.14).
 * Shows task metadata (status, due, topics) and editor.
 */
export function TaskDetail(props: TaskDetailProps) {
  const [content, setContent] = createSignal("");
  const [rawMode, setRawMode] = createSignal(false);
  const [showDeleteModal, setShowDeleteModal] = createSignal(false);
  const shouldAutofocus = consumeAutofocus();
  let saveTimeout: number | undefined;
  let rawFlush: (() => Promise<void>) | null = null;

  // Reactively look up the latest task from index store so metadata edits are reflected
  const liveTask = () =>
    (indexStore.tasks.get(props.task.path) as Task | undefined) ?? props.task;

  // Sync content when task changes
  createEffect(() => {
    setContent(props.task.content);
    setEditorStore({
      activeFile: props.task.path,
      isDirty: false,
    });
  });

  function handleUpdate(newContent: string) {
    setContent(newContent);
    setEditorStore("isDirty", true);

    // Debounced auto-save (T5.12)
    window.clearTimeout(saveTimeout);
    saveTimeout = window.setTimeout(() => {
      void saveTask(props.task.path, newContent);
    }, 300);
  }

  onCleanup(() => {
    if (saveTimeout) window.clearTimeout(saveTimeout);
  });

  async function handleStatusChange(status: "open" | "done" | "cancelled") {
    await EntityService.updateTaskStatus(props.task.path, status);
  }

  async function toggleRawMode() {
    if (rawMode()) {
      // Raw → Rendered: flush raw save (which invalidates index), re-read file for updated content
      if (rawFlush) await rawFlush();
      const fileContent = await FileService.read(props.task.path);
      const parsed = parse(fileContent);
      if (parsed) {
        setContent(parsed.body);
      }
      rawFlush = null;
      setRawMode(false);
    } else {
      // Rendered → Raw: flush pending TipTap save first
      if (saveTimeout) {
        window.clearTimeout(saveTimeout);
        await saveTask(props.task.path, content());
      }
      setRawMode(true);
    }
  }

  const statusColor = () => {
    switch (liveTask().status) {
      case "open":
        return "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300";
      case "done":
        return "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300";
      case "cancelled":
        return "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400";
    }
  };

  return (
    <div class="h-full overflow-y-auto">
      <div class="mx-auto max-w-2xl px-6 py-6">
        {/* Header */}
        <div class="mb-4">
          <EditableText
            value={liveTask().title}
            onSave={(title) =>
              void EntityService.updateFrontmatter(props.task.path, { title })
            }
            class="text-xl font-semibold text-gray-900 dark:text-gray-100"
          />
          <div class="mt-1">
            <code class="select-all rounded bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 text-xs text-gray-500 dark:text-gray-400">
              [[task:{liveTask().slug}]]
            </code>
          </div>
          <div class="mt-2">
            <EditableTopics
              topics={liveTask().topics}
              onSave={(topics) =>
                void EntityService.updateFrontmatter(props.task.path, {
                  topics,
                })
              }
            />
          </div>
          <div class="mt-2 flex items-center gap-3">
            <span
              class={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor()}`}
            >
              {liveTask().status}
            </span>
            <EditableDate
              value={liveTask().due}
              onSave={(due) =>
                void EntityService.updateFrontmatter(props.task.path, { due })
              }
              label="Due"
            />
            <span class="text-xs text-gray-400 dark:text-gray-500">
              Created: {liveTask().created}
            </span>
            <RawModeToggle
              active={rawMode()}
              onClick={() => void toggleRawMode()}
            />
          </div>
        </div>

        {/* Status actions */}
        <div class="mb-4 flex gap-2">
          <Show when={liveTask().status === "open"}>
            <button
              class="rounded bg-green-50 dark:bg-green-900/30 px-3 py-1 text-xs font-medium text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/40"
              onClick={() => void handleStatusChange("done")}
            >
              Mark Done
            </button>
            <button
              class="rounded bg-gray-50 dark:bg-gray-900 px-3 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
              onClick={() => void handleStatusChange("cancelled")}
            >
              Cancel
            </button>
          </Show>
          <Show when={liveTask().status !== "open"}>
            <button
              class="rounded bg-blue-50 dark:bg-blue-900/30 px-3 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40"
              onClick={() => void handleStatusChange("open")}
            >
              Reopen
            </button>
          </Show>
          <button
            class="rounded bg-red-50 dark:bg-red-900/30 px-3 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40"
            onClick={() => setShowDeleteModal(true)}
          >
            Delete
          </button>
        </div>

        {/* Editor */}
        <div class="border-t border-gray-100 dark:border-gray-700 pt-4">
          <Show
            when={rawMode()}
            fallback={
              <Editor
                content={content()}
                placeholder="Add task details..."
                autofocus={shouldAutofocus}
                entityPath={props.task.path}
                onUpdate={handleUpdate}
              />
            }
          >
            <RawEditor
              filePath={props.task.path}
              onFlushRef={(fn) => {
                rawFlush = fn;
              }}
            />
          </Show>
        </div>

        {/* Dirty indicator */}
        <Show when={editorStore.isDirty}>
          <div class="mt-2 text-right text-xs text-gray-300 dark:text-gray-600">
            Saving...
          </div>
        </Show>
      </div>

      <Show when={showDeleteModal()}>
        <ConfirmDeleteModal
          title={liveTask().title}
          onClose={() => setShowDeleteModal(false)}
          onConfirm={() => {
            setShowDeleteModal(false);
            void EntityService.deleteEntity(props.task.path);
          }}
        />
      </Show>
    </div>
  );
}

async function saveTask(path: string, body: string) {
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
