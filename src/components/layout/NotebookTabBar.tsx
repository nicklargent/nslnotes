import { For, createSignal, Show } from "solid-js";
import logoUrl from "../../assets/logo.svg";
import { notebooksStore } from "../../stores/notebooksStore";
import { runtime } from "../../lib/runtime";
import { FolderPathDialog } from "../FolderPathDialog";
import { showToast } from "../Toast";
import type { Notebook } from "../../services/SettingsService";
import { NotebookTab } from "./NotebookTab";

interface NotebookTabBarProps {
  onSelect: (nb: Notebook) => void | Promise<void>;
  onAdd: (path: string) => void | Promise<void>;
  onRemove: (id: string) => void | Promise<void>;
  onRename: (id: string, name: string) => void | Promise<void>;
}

export function NotebookTabBar(props: NotebookTabBarProps) {
  const [showFolderDialog, setShowFolderDialog] = createSignal(false);

  async function handleAddClick() {
    if (runtime.isNative()) {
      try {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const selected = await open({
          directory: true,
          multiple: false,
          title: "Add Notebook",
        });
        if (!selected || typeof selected !== "string") return;
        await props.onAdd(selected);
      } catch (err) {
        showToast(
          `Failed to add notebook: ${err instanceof Error ? err.message : "Unknown error"}`,
          "error"
        );
      }
    } else {
      setShowFolderDialog(true);
    }
  }

  async function revealInFiles(nb: Notebook) {
    if (!runtime.isNative()) {
      showToast("Reveal is only available in the native app", "info");
      return;
    }
    try {
      const { openPath } = await import("@tauri-apps/plugin-opener");
      await openPath(nb.path);
    } catch (err) {
      showToast(
        `Failed to open folder: ${err instanceof Error ? err.message : "Unknown error"}`,
        "error"
      );
    }
  }

  return (
    <div class="flex h-10 flex-shrink-0 items-center gap-1 border-b border-gray-200 bg-white px-2 dark:border-gray-700 dark:bg-gray-900">
      <img src={logoUrl} alt="NslNotes" class="h-6 w-6 flex-shrink-0 mr-2" />

      <div class="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        <For each={notebooksStore.notebooks}>
          {(nb) => (
            <NotebookTab
              notebook={nb}
              active={nb.id === notebooksStore.activeNotebookId}
              disabled={notebooksStore.switching}
              onSelect={() => void props.onSelect(nb)}
              onRemove={() => void props.onRemove(nb.id)}
              onRename={(name) => void props.onRename(nb.id, name)}
              onReveal={() => void revealInFiles(nb)}
            />
          )}
        </For>
        <button
          type="button"
          class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
          onClick={() => void handleAddClick()}
          title="Add notebook"
          disabled={notebooksStore.switching}
        >
          <svg
            class="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      <Show when={showFolderDialog()}>
        <FolderPathDialog
          onSelect={(path) => {
            setShowFolderDialog(false);
            void props.onAdd(path);
          }}
          onCancel={() => setShowFolderDialog(false)}
        />
      </Show>
    </div>
  );
}
