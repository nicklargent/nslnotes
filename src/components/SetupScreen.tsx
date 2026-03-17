import { createSignal } from "solid-js";
import { runtime } from "../lib/runtime";
import { FileService } from "../services/FileService";
import { SettingsService } from "../services/SettingsService";

export interface SetupScreenProps {
  onComplete: (rootPath: string) => void;
}

/**
 * SetupScreen displays on first launch when no root directory is configured.
 * Guides the user to select a folder for storing notes.
 */
export function SetupScreen(props: SetupScreenProps) {
  const [error, setError] = createSignal<string | null>(null);
  const [isValidating, setIsValidating] = createSignal(false);
  const [selectedPath, setSelectedPath] = createSignal<string | null>(null);
  const [manualPath, setManualPath] = createSignal("");
  const isWeb = !runtime.isNative();

  /**
   * Open the native folder picker dialog
   */
  async function selectFolder() {
    setError(null);

    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Notes Folder",
      });

      if (selected && typeof selected === "string") {
        setSelectedPath(selected);
        await validateAndSetup(selected);
      }
    } catch (err) {
      setError(`Failed to open folder picker: ${err}`);
    }
  }

  /**
   * Handle manual path submission (web mode)
   */
  async function handleManualPath() {
    const path = manualPath().trim();
    if (!path) {
      setError("Please enter a folder path");
      return;
    }
    setSelectedPath(path);
    await validateAndSetup(path);
  }

  /**
   * Validate the selected folder and set up the directory structure
   */
  async function validateAndSetup(path: string) {
    setIsValidating(true);
    setError(null);

    try {
      // Verify the directory is accessible and writable
      const status = await FileService.verifyDirectory(path);

      if (!status.readable) {
        setError(
          "Cannot read the selected folder. Please choose a different location."
        );
        setIsValidating(false);
        return;
      }

      if (!status.writable) {
        setError(
          "Cannot write to the selected folder. Please choose a different location."
        );
        setIsValidating(false);
        return;
      }

      // Create the required subdirectories
      await FileService.ensureDirectory(path);

      // Save the root path to settings
      await SettingsService.setRootPath(path);

      // Notify parent that setup is complete
      props.onComplete(path);
    } catch (err) {
      setError(`Failed to set up folder: ${err}`);
    } finally {
      setIsValidating(false);
    }
  }

  return (
    <div class="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div class="w-full max-w-md rounded-lg bg-white dark:bg-gray-800 p-8 shadow-lg dark:shadow-gray-900/50">
        <h1 class="mb-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
          Welcome to NslNotes
        </h1>
        <p class="mb-6 text-gray-600 dark:text-gray-300">
          Choose a folder where your notes, tasks, and documents will be stored.
          All files are plain markdown, so you always own your data.
        </p>

        {selectedPath() && (
          <div class="mb-4 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3">
            <p class="text-sm text-gray-500 dark:text-gray-400">
              Selected folder:
            </p>
            <p class="truncate font-mono text-sm text-gray-800 dark:text-gray-100">
              {selectedPath()}
            </p>
          </div>
        )}

        {error() && (
          <div class="mb-4 rounded border border-red-200 bg-red-50 dark:bg-red-900/30 p-3">
            <p class="text-sm text-red-700">{error()}</p>
          </div>
        )}

        {isWeb ? (
          <div>
            <label class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">
              Folder path
            </label>
            <input
              type="text"
              value={manualPath()}
              onInput={(e) => setManualPath(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleManualPath();
              }}
              placeholder="/home/user/notes"
              class="mb-3 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 font-mono text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={() => void handleManualPath()}
              disabled={isValidating()}
              class="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isValidating() ? "Setting up..." : "Use This Folder"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={selectFolder}
            disabled={isValidating()}
            class="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isValidating() ? "Setting up..." : "Choose Folder"}
          </button>
        )}

        <p class="mt-4 text-center text-xs text-gray-400 dark:text-gray-500">
          NslNotes will create notes/, tasks/, and docs/ subfolders.
        </p>
      </div>
    </div>
  );
}
