import { For, createSignal, Show } from "solid-js";
import logoUrl from "../../assets/logo.svg";
import { notebooksStore } from "../../stores/notebooksStore";
import { indexStore } from "../../stores/indexStore";
import { uiStore, setUIStore } from "../../stores/uiStore";
import { debouncedSave } from "./Layout";
import { runtime } from "../../lib/runtime";
import { FolderPathDialog } from "../FolderPathDialog";
import { showToast } from "../Toast";
import type { Notebook } from "../../services/SettingsService";
import { BackupService } from "../../services/BackupService";
import { NotebookTab } from "./NotebookTab";

interface NotebookTabBarProps {
  onSelect: (nb: Notebook) => void | Promise<void>;
  onAdd: (path: string) => void | Promise<void>;
  onRemove: (id: string) => void | Promise<void>;
  onRename: (id: string, name: string) => void | Promise<void>;
}

function clampFontSize(size: number): number {
  return Math.min(24, Math.max(12, size));
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function defaultBackupFilename(now: Date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  const y = now.getFullYear();
  const m = pad(now.getMonth() + 1);
  const d = pad(now.getDate());
  const hh = pad(now.getHours());
  const mm = pad(now.getMinutes());
  return `nslnotes-backup-${y}-${m}-${d}T${hh}-${mm}.tar.gz`;
}

export function NotebookTabBar(props: NotebookTabBarProps) {
  const [showFolderDialog, setShowFolderDialog] = createSignal(false);
  const [isBackingUp, setIsBackingUp] = createSignal(false);

  function changeFontSize(delta: number) {
    setUIStore("fontSize", clampFontSize(uiStore.fontSize + delta));
    debouncedSave();
  }

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

  async function handleBackupClick() {
    if (notebooksStore.notebooks.length === 0) {
      showToast("No notebooks to back up", "info");
      return;
    }
    if (isBackingUp()) return;
    try {
      let destination: string;
      if (runtime.isNative()) {
        const { save } = await import("@tauri-apps/plugin-dialog");
        const selected = await save({
          defaultPath: defaultBackupFilename(),
          filters: [{ name: "Tar gzip archive", extensions: ["tar.gz"] }],
          title: "Save backup",
        });
        if (!selected || typeof selected !== "string") return;
        destination = selected;
      } else {
        // Web mode: the browser handles the save dialog after the response
        // arrives. `destination` is just the suggested filename.
        destination = defaultBackupFilename();
      }

      setIsBackingUp(true);
      showToast("Creating backup…", "info");
      const sources = notebooksStore.notebooks.map((nb) => ({
        name: nb.name,
        path: nb.path,
      }));
      const stats = await BackupService.createBackup(sources, destination);
      const parts = [
        `${stats.notebookCount} notebook${stats.notebookCount === 1 ? "" : "s"}`,
        `${stats.fileCount} files`,
        formatBytes(stats.bytesWritten),
      ];
      let msg = `Backup saved (${parts.join(", ")})`;
      if (stats.skippedSymlinks > 0) {
        msg += ` — ${stats.skippedSymlinks} symlink${stats.skippedSymlinks === 1 ? "" : "s"} skipped`;
      }
      showToast(msg, "success");
    } catch (err) {
      showToast(
        `Backup failed: ${err instanceof Error ? err.message : String(err)}`,
        "error"
      );
    } finally {
      setIsBackingUp(false);
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

  const controlButtonClass =
    "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700";

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
          class={controlButtonClass}
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

      {/* Trailing controls */}
      <div class="flex flex-shrink-0 items-center gap-0.5 pl-2">
        {/* Indexing spinner — only visible during background rebuild */}
        <Show when={indexStore.indexing}>
          <div
            class="flex h-7 w-7 items-center justify-center text-gray-400 dark:text-gray-500"
            title="Indexing notebook…"
          >
            <svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle
                class="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                stroke-width="4"
              />
              <path
                class="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
              />
            </svg>
          </div>
        </Show>

        {/* Backup — download a tar.gz of all notebooks */}
        <button
          type="button"
          class={controlButtonClass}
          onClick={() => void handleBackupClick()}
          title={isBackingUp() ? "Creating backup…" : "Backup all notebooks"}
          disabled={
            notebooksStore.notebooks.length === 0 ||
            notebooksStore.switching ||
            isBackingUp()
          }
        >
          {isBackingUp() ? (
            <svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle
                class="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                stroke-width="4"
              />
              <path
                class="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
              />
            </svg>
          ) : (
            <svg
              class="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          )}
        </button>

        {/* Font size — smaller A and bigger A; current size in tooltip */}
        <button
          type="button"
          class={controlButtonClass}
          onClick={() => changeFontSize(-1)}
          title={`Decrease font size (now ${uiStore.fontSize}px)`}
        >
          <span
            class="font-semibold leading-none"
            style={{ "font-size": "11px" }}
          >
            A
          </span>
        </button>
        <button
          type="button"
          class={controlButtonClass}
          onClick={() => changeFontSize(1)}
          title={`Increase font size (now ${uiStore.fontSize}px)`}
        >
          <span
            class="font-semibold leading-none"
            style={{ "font-size": "16px" }}
          >
            A
          </span>
        </button>

        {/* Dark mode toggle */}
        <button
          type="button"
          class={controlButtonClass}
          onClick={() => {
            setUIStore("darkMode", !uiStore.darkMode);
            debouncedSave();
          }}
          title={
            uiStore.darkMode ? "Switch to light mode" : "Switch to dark mode"
          }
        >
          {uiStore.darkMode ? (
            <svg
              class="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle cx="12" cy="12" r="5" />
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
          ) : (
            <svg
              class="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
            </svg>
          )}
        </button>
      </div>

      <Show when={showFolderDialog()}>
        <FolderPathDialog
          heading="Add Notebook"
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
