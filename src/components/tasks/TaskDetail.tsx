import { createSignal, createEffect, Show } from "solid-js";
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
import { EditableDate } from "../metadata/EditableDate";
import type { Task } from "../../types/entities";
import type { EditorMode } from "../../types/stores";

interface TaskDetailProps {
  task: Task;
}

/**
 * Task detail view in center panel (T5.14).
 * Shows task metadata (status, due, topics) and editor in Outliner mode.
 */
export function TaskDetail(props: TaskDetailProps) {
  const [content, setContent] = createSignal("");
  const [mode, setMode] = createSignal<EditorMode>("outliner");
  let saveTimeout: number | undefined;

  // Reactively look up the latest task from index store so metadata edits are reflected
  const liveTask = () =>
    (indexStore.tasks.get(props.task.path) as Task | undefined) ?? props.task;

  // Sync content when task changes
  createEffect(() => {
    setContent(props.task.content);
    setMode("outliner"); // T5.11: tasks default to outliner
    setEditorStore({
      activeFile: props.task.path,
      mode: "outliner",
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

  function handleModeChange(newMode: EditorMode) {
    setMode(newMode);
    setEditorStore("mode", newMode);
  }

  async function handleStatusChange(status: "done" | "cancelled") {
    const rootPath = await SettingsService.getRootPath();
    if (!rootPath) return;

    const fileContent = await FileService.read(props.task.path);
    const parsed = parse(fileContent);
    if (!parsed) return;

    parsed.frontmatter["status"] = status;
    const newContent = serialize(parsed.frontmatter, parsed.body);
    await FileService.write(props.task.path, newContent);
    await IndexService.invalidate(props.task.path, rootPath);
  }

  const statusColor = () => {
    switch (liveTask().status) {
      case "open":
        return "bg-blue-100 text-blue-700";
      case "done":
        return "bg-green-100 text-green-700";
      case "cancelled":
        return "bg-gray-100 text-gray-500";
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
            class="text-xl font-semibold text-gray-900"
          />
          <div class="mt-2 flex items-center gap-2">
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
            <span class="text-xs text-gray-400">
              Created: {liveTask().created}
            </span>
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
        </div>

        {/* Status actions */}
        <Show when={liveTask().status === "open"}>
          <div class="mb-4 flex gap-2">
            <button
              class="rounded bg-green-50 px-3 py-1 text-xs font-medium text-green-700 hover:bg-green-100"
              onClick={() => void handleStatusChange("done")}
            >
              Mark Done
            </button>
            <button
              class="rounded bg-gray-50 px-3 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100"
              onClick={() => void handleStatusChange("cancelled")}
            >
              Cancel
            </button>
          </div>
        </Show>

        {/* Editor */}
        <div class="border-t border-gray-100 pt-4">
          <Editor
            content={content()}
            mode={mode()}
            placeholder="Add task details..."
            onUpdate={handleUpdate}
            onModeChange={handleModeChange}
          />
        </div>

        {/* Dirty indicator */}
        <Show when={editorStore.isDirty}>
          <div class="mt-2 text-right text-xs text-gray-300">Saving...</div>
        </Show>
      </div>
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
