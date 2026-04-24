import { createSignal, Show } from "solid-js";
import { runtime } from "../lib/runtime";
import { FileService } from "../services/FileService";
import type { NotebookCredentials } from "../services/SettingsService";
import {
  SmbCredentialInput,
  buildSmbCredentials,
  isSmbPath,
} from "./SmbCredentialInput";

export interface SetupScreenProps {
  onComplete: (rootPath: string, creds?: NotebookCredentials) => void;
}

/**
 * SetupScreen displays on first launch when no root directory is configured.
 * Guides the user to select a folder for storing notes. When the path is an
 * `smb://` URL the form also collects credentials that get persisted in the
 * notebook's settings entry.
 */
export function SetupScreen(props: SetupScreenProps) {
  const [error, setError] = createSignal<string | null>(null);
  const [isValidating, setIsValidating] = createSignal(false);
  const [selectedPath, setSelectedPath] = createSignal<string | null>(null);
  const [manualPath, setManualPath] = createSignal("");
  const [smbUser, setSmbUser] = createSignal("");
  const [smbPass, setSmbPass] = createSignal("");
  const [smbDomain, setSmbDomain] = createSignal("");
  const isWeb = !runtime.isNative();

  const isSmb = isSmbPath;

  function credsFromInputs(): NotebookCredentials | undefined {
    return buildSmbCredentials(manualPath(), smbUser(), smbPass(), smbDomain());
  }

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

  async function handleManualPath() {
    const path = manualPath().trim();
    if (!path) {
      setError("Please enter a folder path");
      return;
    }
    if (isSmb(path) && !smbUser()) {
      setError("Enter the SMB username");
      return;
    }
    setSelectedPath(path);
    await validateAndSetup(path, credsFromInputs());
  }

  async function validateAndSetup(path: string, creds?: NotebookCredentials) {
    setIsValidating(true);
    setError(null);

    try {
      // For SMB paths the backend won't recognize the URL until the notebook
      // is saved (registration happens on settings save). Let the caller
      // persist first and discover credential errors during index build.
      if (!isSmb(path)) {
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
        await FileService.ensureDirectory(path);
      }

      props.onComplete(path, creds);
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
          Point NslNotes at a folder for your notes, tasks, and documents. Local
          paths and <code>smb://</code> URLs both work.
        </p>

        <Show when={selectedPath()}>
          <div class="mb-4 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3">
            <p class="text-sm text-gray-500 dark:text-gray-400">
              Selected folder:
            </p>
            <p class="truncate font-mono text-sm text-gray-800 dark:text-gray-100">
              {selectedPath()}
            </p>
          </div>
        </Show>

        <Show when={error()}>
          <div class="mb-4 rounded border border-red-200 bg-red-50 dark:bg-red-900/30 p-3">
            <p class="text-sm text-red-700">{error()}</p>
          </div>
        </Show>

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
              placeholder="/home/user/notes or smb://nas.local/share/path"
              class="mb-3 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 font-mono text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />

            <Show when={isSmb(manualPath())}>
              <SmbCredentialInput
                username={smbUser()}
                password={smbPass()}
                domain={smbDomain()}
                onUsernameChange={setSmbUser}
                onPasswordChange={setSmbPass}
                onDomainChange={setSmbDomain}
              />
            </Show>

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
