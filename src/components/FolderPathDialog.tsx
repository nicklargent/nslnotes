import { createSignal } from "solid-js";
import { FileService } from "../services/FileService";

interface FolderPathDialogProps {
  currentPath?: string | undefined;
  onSelect: (path: string) => void;
  onCancel: () => void;
}

export function FolderPathDialog(props: FolderPathDialogProps) {
  const [path, setPath] = createSignal(props.currentPath ?? "");
  const [error, setError] = createSignal<string | null>(null);
  const [validating, setValidating] = createSignal(false);

  async function handleSubmit() {
    const trimmed = path().trim();
    if (!trimmed) {
      setError("Please enter a folder path");
      return;
    }

    setValidating(true);
    setError(null);

    try {
      const status = await FileService.verifyDirectory(trimmed);
      if (!status.readable) {
        setError(
          "Cannot read the selected folder. Please choose a different location."
        );
        return;
      }
      if (!status.writable) {
        setError(
          "Cannot write to the selected folder. Please choose a different location."
        );
        return;
      }
      await FileService.ensureDirectory(trimmed);
      props.onSelect(trimmed);
    } catch (err) {
      setError(
        `Failed to validate folder: ${err instanceof Error ? err.message : err}`
      );
    } finally {
      setValidating(false);
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) props.onCancel();
  }

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleBackdropClick}
    >
      <div class="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
        <h2 class="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
          Switch Notes Folder
        </h2>

        <label class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">
          Folder path
        </label>
        <input
          type="text"
          value={path()}
          onInput={(e) => setPath(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleSubmit();
            if (e.key === "Escape") props.onCancel();
          }}
          placeholder="/home/user/notes"
          autofocus
          class="mb-3 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
        />

        {error() && (
          <div class="mb-3 rounded border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/30">
            <p class="text-sm text-red-700 dark:text-red-400">{error()}</p>
          </div>
        )}

        <div class="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => props.onCancel()}
            class="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={validating()}
            class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {validating() ? "Validating..." : "Use This Folder"}
          </button>
        </div>
      </div>
    </div>
  );
}
