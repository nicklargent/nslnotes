import {
  createSignal,
  createMemo,
  onMount,
  onCleanup,
  Show,
  For,
} from "solid-js";
import {
  RenameService,
  noteSlugSuffix,
  computeTargetPath,
} from "../../services/RenameService";
import { NavigationService } from "../../services/NavigationService";
import { rootPathFromEntity } from "../../services/ImageService";
import { indexStore } from "../../stores/indexStore";
import { generateSlug } from "../../lib/slug";
import { getTodayISO } from "../../lib/dates";
import type { Entity, EntityType } from "../../types/entities";

interface RenameConvertModalProps {
  entity: Entity;
  onClose: () => void;
}

const TYPE_LABELS: Record<EntityType, string> = {
  task: "Task",
  doc: "Doc",
  note: "Note",
};

function initialSlug(entity: Entity): string {
  if (entity.type === "note") return noteSlugSuffix(entity.slug);
  return entity.slug;
}

function initialDate(entity: Entity): string {
  if (entity.type === "note") return entity.date;
  return getTodayISO();
}

export function RenameConvertModal(props: RenameConvertModalProps) {
  const sourceType = props.entity.type;
  const rootPath = rootPathFromEntity(props.entity.path);
  const [targetType, setTargetType] = createSignal<EntityType>(sourceType);
  const [slug, setSlug] = createSignal(initialSlug(props.entity));
  const [date, setDate] = createSignal(initialDate(props.entity));
  const [error, setError] = createSignal<string | null>(null);
  const [submitting, setSubmitting] = createSignal(false);

  const cleanSlug = createMemo(() => generateSlug(slug()));

  const targetPath = createMemo(() => {
    const result = computeTargetPath(
      rootPath,
      targetType(),
      cleanSlug(),
      targetType() === "note" ? date() : undefined
    );
    return "error" in result ? "" : result.path;
  });

  const backlinkCount = createMemo(
    () => (indexStore.backlinkIndex.get(props.entity.path) ?? []).length
  );

  const isNoOp = createMemo(() => targetPath() === props.entity.path);

  const buttonLabel = createMemo(() =>
    targetType() === sourceType ? "Rename" : "Convert"
  );

  async function submit() {
    if (submitting()) return;
    setError(null);
    if (!cleanSlug()) {
      setError("Slug is required");
      return;
    }
    setSubmitting(true);
    try {
      const result = await RenameService.renameOrConvert({
        entityPath: props.entity.path,
        targetType: targetType(),
        targetSlug: cleanSlug(),
        ...(targetType() === "note" ? { targetDate: date() } : {}),
      });
      if ("error" in result) {
        setError(result.error);
        setSubmitting(false);
        return;
      }
      NavigationService.navigateTo(result.entity);
      props.onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  onMount(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        props.onClose();
      }
    }
    document.addEventListener("keydown", onKey, true);
    onCleanup(() => document.removeEventListener("keydown", onKey, true));
  });

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div class="w-full max-w-md rounded-lg bg-white dark:bg-gray-800 p-6 shadow-xl">
        <h2 class="mb-4 text-lg font-semibold text-gray-800 dark:text-gray-100">
          Rename / Convert
        </h2>

        <div class="mb-4">
          <label class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
            Type
          </label>
          <div class="flex gap-2" role="radiogroup">
            <For each={["task", "doc", "note"] as EntityType[]}>
              {(t) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={targetType() === t}
                  class={`rounded px-3 py-1 text-sm border ${
                    targetType() === t
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600"
                  }`}
                  onClick={() => setTargetType(t)}
                >
                  {TYPE_LABELS[t]}
                </button>
              )}
            </For>
          </div>
        </div>

        <div class="mb-4">
          <label
            for="rename-slug"
            class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
          >
            Slug
          </label>
          <input
            id="rename-slug"
            type="text"
            class="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-sm text-gray-800 dark:text-gray-100 outline-none focus:border-blue-500"
            value={slug()}
            onInput={(e) => setSlug(e.currentTarget.value)}
          />
          <Show when={slug() !== cleanSlug() && cleanSlug()}>
            <div class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              will be saved as <code>{cleanSlug()}</code>
            </div>
          </Show>
        </div>

        <Show when={targetType() === "note"}>
          <div class="mb-4">
            <label
              for="rename-date"
              class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
            >
              Date
            </label>
            <input
              id="rename-date"
              type="date"
              class="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-sm text-gray-800 dark:text-gray-100 outline-none focus:border-blue-500"
              value={date()}
              onInput={(e) => setDate(e.currentTarget.value)}
            />
          </div>
        </Show>

        <div class="mb-4 rounded bg-gray-50 dark:bg-gray-900/40 p-2 text-xs text-gray-600 dark:text-gray-300">
          <Show when={!isNoOp()} fallback={<span>No change.</span>}>
            <div>
              Will move to <code class="break-all">{targetPath()}</code>
            </div>
            <Show when={backlinkCount() > 0}>
              <div class="mt-1">
                Will update <strong>{backlinkCount()}</strong> inbound reference
                {backlinkCount() === 1 ? "" : "s"}.
              </div>
            </Show>
          </Show>
        </div>

        <Show when={error()}>
          <div class="mb-4 rounded border border-red-300 bg-red-50 dark:bg-red-900/30 dark:border-red-700 p-2 text-xs text-red-700 dark:text-red-300">
            {error()}
          </div>
        </Show>

        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="rounded px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            onClick={() => props.onClose()}
            disabled={submitting()}
          >
            Cancel
          </button>
          <button
            type="button"
            class="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            onClick={() => void submit()}
            disabled={submitting() || isNoOp() || !cleanSlug()}
          >
            {submitting() ? "Working..." : buttonLabel()}
          </button>
        </div>
      </div>
    </div>
  );
}
