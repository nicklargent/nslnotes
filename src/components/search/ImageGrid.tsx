import { For, Show, createSignal } from "solid-js";
import { IndexService } from "../../services/IndexService";
import { ImageService } from "../../services/ImageService";
import { NavigationService } from "../../services/NavigationService";
import { openImagePreview } from "../../stores/imagePreviewStore";
import { indexStore } from "../../stores/indexStore";
import type { ImageFile } from "../../types/images";

interface ImageGridProps {
  query: string;
}

export function ImageGrid(props: ImageGridProps) {
  const [deletingPath, setDeletingPath] = createSignal<string | null>(null);

  const images = () => IndexService.searchImages(props.query);

  function getEntityName(img: ImageFile): string {
    return img.entityPath
      .substring(img.entityPath.lastIndexOf("/") + 1)
      .replace(/\.md$/, "");
  }

  function getEntityType(img: ImageFile): string {
    const path = img.entityPath;
    if (path.includes("/notes/")) return "note";
    if (path.includes("/tasks/")) return "task";
    if (path.includes("/docs/")) return "doc";
    return "";
  }

  function navigateToEntity(img: ImageFile) {
    const entity =
      indexStore.notes.get(img.entityPath) ??
      indexStore.tasks.get(img.entityPath) ??
      indexStore.docs.get(img.entityPath);
    if (entity) {
      NavigationService.navigateTo(entity);
    }
  }

  function getImageUrl(img: ImageFile): string {
    // Use ImageService.resolveImageUrl with the entity context
    return ImageService.resolveImageUrl(
      `./${img.entityPath.substring(img.entityPath.lastIndexOf("/") + 1).replace(/\.md$/, "")}.assets/${img.filename}`,
      img.entityPath,
      ""
    );
  }

  async function handleDelete(img: ImageFile) {
    setDeletingPath(img.path);
    try {
      await ImageService.deleteImage(img.path);
    } finally {
      setDeletingPath(null);
    }
  }

  return (
    <div class="p-4">
      <Show
        when={images().length > 0}
        fallback={
          <div class="text-center text-sm text-gray-400 dark:text-gray-500">
            No images found
          </div>
        }
      >
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <For each={images()}>
            {(img) => (
              <div class="group relative overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
                {/* Thumbnail */}
                <div class="relative aspect-square overflow-hidden bg-gray-100 dark:bg-gray-900">
                  <img
                    src={getImageUrl(img)}
                    alt={img.filename}
                    class="h-full w-full object-cover"
                    loading="lazy"
                  />
                  {/* Magnify icon */}
                  <button
                    type="button"
                    class="absolute bottom-1.5 right-1.5 rounded bg-black/50 p-1 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      openImagePreview(getImageUrl(img));
                    }}
                    title="Preview full size"
                  >
                    <svg
                      class="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <circle cx="11" cy="11" r="8" />
                      <path d="M21 21l-4.35-4.35" />
                      <path d="M11 8v6M8 11h6" />
                    </svg>
                  </button>
                  {/* Orphan badge */}
                  <Show when={img.isOrphan}>
                    <span class="absolute left-1.5 top-1.5 rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-medium text-white">
                      Orphan
                    </span>
                  </Show>
                  {/* Delete button for orphans */}
                  <Show when={img.isOrphan}>
                    <button
                      type="button"
                      class="absolute right-1.5 top-1.5 rounded bg-red-500 p-1 text-white opacity-0 transition-opacity hover:bg-red-600 group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDelete(img);
                      }}
                      disabled={deletingPath() === img.path}
                      title="Delete orphaned image"
                    >
                      <svg
                        class="h-3.5 w-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </Show>
                </div>
                {/* Info */}
                <div class="p-2">
                  <p class="truncate text-xs font-medium text-gray-700 dark:text-gray-300">
                    {img.filename}
                  </p>
                  <button
                    type="button"
                    class="mt-0.5 flex items-center gap-1 truncate text-[11px] text-gray-400 hover:text-blue-500 dark:text-gray-500 dark:hover:text-blue-400"
                    onClick={() => navigateToEntity(img)}
                  >
                    <span
                      class={`rounded px-1 py-0.5 text-[9px] font-medium ${
                        getEntityType(img) === "note"
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                          : getEntityType(img) === "task"
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
                            : "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                      }`}
                    >
                      {getEntityType(img)}
                    </span>
                    {getEntityName(img)}
                  </button>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
