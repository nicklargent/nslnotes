import { createSignal, createMemo, Show, For, batch } from "solid-js";
import { Editor } from "../editor/Editor";
import { ConfirmDeleteModal } from "../modals/ConfirmDeleteModal";
import { TemplateService } from "../../services/TemplateService";
import { IndexService } from "../../services/IndexService";
import { NavigationService } from "../../services/NavigationService";
import { notebooksApi } from "../../stores/notebooksStore";
import { indexStore } from "../../stores/indexStore";
import { showToast } from "../Toast";
import type { Template } from "../../types/entities";

type EditorFields = { displayName: string; content: string };
type EditorMode =
  | { kind: "list" }
  | ({ kind: "create" } & EditorFields)
  | ({ kind: "edit"; template: Template } & EditorFields);

function isEditing(m: EditorMode): m is Exclude<EditorMode, { kind: "list" }> {
  return m.kind !== "list";
}

export function TemplatesView() {
  const [mode, setMode] = createSignal<EditorMode>({ kind: "list" });
  const [pendingDelete, setPendingDelete] = createSignal<Template | null>(null);
  const [saving, setSaving] = createSignal(false);

  const sortedTemplates = createMemo(() =>
    Array.from(indexStore.templates.values()).sort((a, b) =>
      a.displayName.toLowerCase().localeCompare(b.displayName.toLowerCase())
    )
  );

  const editingMode = createMemo<Exclude<EditorMode, { kind: "list" }> | null>(
    () => {
      const m = mode();
      return isEditing(m) ? m : null;
    }
  );

  function startCreate() {
    setMode({ kind: "create", displayName: "", content: "" });
  }

  function startEdit(template: Template) {
    setMode({
      kind: "edit",
      template,
      displayName: template.displayName,
      content: template.content,
    });
  }

  function updateField<K extends keyof EditorFields>(
    key: K,
    value: EditorFields[K]
  ) {
    const cur = mode();
    if (isEditing(cur)) setMode({ ...cur, [key]: value });
  }

  function cancelEditor() {
    setMode({ kind: "list" });
  }

  async function saveCreate() {
    const m = mode();
    if (m.kind !== "create") return;
    const rootPath = notebooksApi.activeRoot();
    if (!rootPath) return;
    const name = m.displayName.trim();
    if (!name) {
      showToast("Template name is required", "error");
      return;
    }
    setSaving(true);
    try {
      await TemplateService.create(rootPath, name, m.content);
      await IndexService.invalidateTemplates(rootPath);
      setMode({ kind: "list" });
      showToast("Template created", "success");
    } catch (err) {
      showToast(
        `Failed to create template: ${err instanceof Error ? err.message : String(err)}`,
        "error"
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit() {
    const m = mode();
    if (m.kind !== "edit") return;
    const rootPath = notebooksApi.activeRoot();
    if (!rootPath) return;
    const newName = m.displayName.trim();
    if (!newName) {
      showToast("Template name is required", "error");
      return;
    }
    setSaving(true);
    try {
      const saved = await TemplateService.save(m.template, m.content);
      if (newName !== m.template.displayName) {
        await TemplateService.rename(saved, newName);
      }
      await IndexService.invalidateTemplates(rootPath);
      setMode({ kind: "list" });
      showToast("Template saved", "success");
    } catch (err) {
      showToast(
        `Failed to save template: ${err instanceof Error ? err.message : String(err)}`,
        "error"
      );
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    const target = pendingDelete();
    if (!target) return;
    const rootPath = notebooksApi.activeRoot();
    if (!rootPath) return;
    try {
      await TemplateService.remove(target);
      await IndexService.invalidateTemplates(rootPath);
      batch(() => {
        setPendingDelete(null);
        const m = mode();
        if (m.kind === "edit" && m.template.path === target.path) {
          setMode({ kind: "list" });
        }
      });
      showToast("Template deleted", "success");
    } catch (err) {
      showToast(
        `Failed to delete template: ${err instanceof Error ? err.message : String(err)}`,
        "error"
      );
    }
  }

  function previewLine(content: string): string {
    const trimmed = content.trim();
    if (!trimmed) return "(empty)";
    const firstLine = trimmed.split("\n", 1)[0] ?? "";
    return firstLine.length > 80 ? firstLine.slice(0, 80) + "…" : firstLine;
  }

  return (
    <div class="h-full overflow-y-auto">
      <div class="mx-auto max-w-3xl px-6 py-6">
        <div class="mb-6 flex items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <button
              type="button"
              class="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              onClick={() => NavigationService.goHome()}
            >
              ← Home
            </button>
            <h1 class="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Templates
            </h1>
          </div>
          <Show when={mode().kind === "list"}>
            <button
              type="button"
              class="rounded border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
              onClick={startCreate}
            >
              + New template
            </button>
          </Show>
        </div>

        <Show when={mode().kind === "list"}>
          <Show
            when={sortedTemplates().length > 0}
            fallback={
              <p class="rounded border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-400 dark:border-gray-700 dark:text-gray-500">
                No templates yet. Create one to pre-fill the body of new tasks.
              </p>
            }
          >
            <ul class="divide-y divide-gray-100 dark:divide-gray-700">
              <For each={sortedTemplates()}>
                {(template) => (
                  <li class="group flex items-center justify-between gap-3 py-3">
                    <button
                      type="button"
                      class="flex-1 text-left"
                      onClick={() => startEdit(template)}
                    >
                      <div class="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {template.displayName}
                      </div>
                      <div class="text-xs text-gray-500 dark:text-gray-400">
                        {previewLine(template.content)}
                      </div>
                    </button>
                    <div class="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        class="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                        onClick={() => startEdit(template)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        class="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30"
                        onClick={() => setPendingDelete(template)}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </Show>

        <Show when={editingMode()}>
          {(m) => (
            <div>
              <div class="mb-4">
                <label class="block text-xs text-gray-500 dark:text-gray-400">
                  Name
                </label>
                <input
                  type="text"
                  value={m().displayName}
                  onInput={(e) =>
                    updateField("displayName", e.currentTarget.value)
                  }
                  placeholder="e.g. Meeting prep"
                  class="mt-1 w-full border-b border-gray-200 bg-transparent py-1 text-base text-gray-900 outline-none focus:border-gray-400 dark:border-gray-700 dark:text-gray-100 dark:focus:border-gray-500"
                />
              </div>

              <div class="border-t border-gray-100 pt-4 dark:border-gray-700">
                <Editor
                  content={m().content}
                  placeholder="Write the template body…"
                  onUpdate={(content) => updateField("content", content)}
                />
              </div>

              <div class="mt-4 flex items-center justify-end gap-2">
                <Show when={m().kind === "edit"}>
                  <button
                    type="button"
                    class="mr-auto rounded px-3 py-1 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30"
                    onClick={() => {
                      const cur = mode();
                      if (cur.kind === "edit") setPendingDelete(cur.template);
                    }}
                  >
                    Delete
                  </button>
                </Show>
                <button
                  type="button"
                  class="rounded px-3 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                  onClick={cancelEditor}
                  disabled={saving()}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  class="rounded bg-gray-900 px-3 py-1 text-xs font-medium text-white hover:bg-gray-700 disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300"
                  onClick={() => {
                    const cur = mode();
                    if (cur.kind === "create") void saveCreate();
                    else if (cur.kind === "edit") void saveEdit();
                  }}
                  disabled={saving()}
                >
                  Save
                </button>
              </div>
            </div>
          )}
        </Show>
      </div>

      <Show when={pendingDelete()}>
        {(target) => (
          <ConfirmDeleteModal
            title={`the "${target().displayName}" template`}
            onConfirm={() => void confirmDelete()}
            onClose={() => setPendingDelete(null)}
          />
        )}
      </Show>
    </div>
  );
}
