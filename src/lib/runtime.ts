import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/**
 * File change event types
 */
export type FileChangeType = "create" | "modify" | "delete";

/**
 * File change event
 */
export interface FileChangeEvent {
  path: string;
  type: FileChangeType;
}

/**
 * File watcher callback
 */
export type FileWatchCallback = (event: FileChangeEvent) => void;

/**
 * Polling state for web fallback
 */
interface PollingState {
  intervalId: number | null;
  lastModified: Map<string, number>;
  callbacks: Set<FileWatchCallback>;
}

const pollingState: PollingState = {
  intervalId: null,
  lastModified: new Map(),
  callbacks: new Set(),
};

/**
 * Native watcher state
 */
interface NativeWatcherState {
  unlistenFn: UnlistenFn | null;
  callbacks: Set<FileWatchCallback>;
  watchPath: string | null;
}

const nativeWatcherState: NativeWatcherState = {
  unlistenFn: null,
  callbacks: new Set(),
  watchPath: null,
};

/**
 * Runtime abstraction layer for file operations.
 * Uses Tauri IPC when running as native app, falls back to HTTP API in browser.
 */
export const runtime = {
  /**
   * Check if running in native Tauri environment
   */
  isNative: (): boolean => {
    return "__TAURI_INTERNALS__" in window;
  },

  /**
   * Read file contents from disk
   * @throws Error if file doesn't exist or is inaccessible
   */
  readFile: async (path: string): Promise<string> => {
    if (runtime.isNative()) {
      return invoke<string>("read_file", { path });
    }
    const res = await fetch(`/api/files?path=${encodeURIComponent(path)}`);
    if (!res.ok) {
      throw new Error(`Failed to read file: ${path}`);
    }
    return res.text();
  },

  /**
   * Write content to file, creating parent directories if needed
   */
  writeFile: async (path: string, content: string): Promise<void> => {
    if (runtime.isNative()) {
      return invoke("write_file", { path, content });
    }
    const res = await fetch("/api/files", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, content }),
    });
    if (!res.ok) {
      throw new Error(`Failed to write file: ${path}`);
    }
  },

  /**
   * Delete a file
   * @throws Error if file doesn't exist
   */
  deleteFile: async (path: string): Promise<void> => {
    if (runtime.isNative()) {
      return invoke("delete_file", { path });
    }
    const res = await fetch(`/api/files?path=${encodeURIComponent(path)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      throw new Error(`Failed to delete file: ${path}`);
    }
  },

  /**
   * Delete a directory and all its contents
   */
  deleteDirectory: async (path: string): Promise<void> => {
    if (runtime.isNative()) {
      return invoke("delete_directory", { path });
    }
    const res = await fetch(
      `/api/files/rmdir?path=${encodeURIComponent(path)}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      throw new Error(`Failed to delete directory: ${path}`);
    }
  },

  /**
   * Check if file exists
   */
  exists: async (path: string): Promise<boolean> => {
    if (runtime.isNative()) {
      return invoke<boolean>("file_exists", { path });
    }
    const res = await fetch(
      `/api/files/exists?path=${encodeURIComponent(path)}`
    );
    if (!res.ok) {
      return false;
    }
    const data = (await res.json()) as { exists: boolean };
    return data.exists;
  },

  /**
   * List files in directory
   */
  listDirectory: async (dir: string): Promise<string[]> => {
    if (runtime.isNative()) {
      return invoke<string[]>("list_directory", { path: dir });
    }
    const res = await fetch(`/api/files/list?path=${encodeURIComponent(dir)}`);
    if (!res.ok) {
      throw new Error(`Failed to list directory: ${dir}`);
    }
    return res.json() as Promise<string[]>;
  },

  /**
   * Verify directory is accessible and writable
   */
  verifyDirectory: async (
    path: string
  ): Promise<{ readable: boolean; writable: boolean }> => {
    if (runtime.isNative()) {
      return invoke("verify_directory", { path });
    }
    const res = await fetch(
      `/api/files/verify?path=${encodeURIComponent(path)}`
    );
    if (!res.ok) {
      return { readable: false, writable: false };
    }
    return res.json() as Promise<{ readable: boolean; writable: boolean }>;
  },

  /**
   * Ensure directory exists, creating if necessary
   */
  ensureDirectory: async (path: string): Promise<void> => {
    if (runtime.isNative()) {
      return invoke("ensure_directory", { path });
    }
    const res = await fetch("/api/files/mkdir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    if (!res.ok) {
      throw new Error(`Failed to create directory: ${path}`);
    }
  },

  /**
   * Copy a file from src to dst, creating parent directories if needed
   */
  copyFile: async (src: string, dst: string): Promise<void> => {
    if (runtime.isNative()) {
      return invoke("copy_file", { src, dst });
    }
    const res = await fetch("/api/files/copy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ src, dst }),
    });
    if (!res.ok) {
      throw new Error(`Failed to copy file: ${src} -> ${dst}`);
    }
  },

  /**
   * Write base64-encoded binary data to a file
   */
  writeBinary: async (path: string, base64Data: string): Promise<void> => {
    if (runtime.isNative()) {
      return invoke("write_binary", { path, base64Data });
    }
    const res = await fetch("/api/files/binary", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, base64Data }),
    });
    if (!res.ok) {
      throw new Error(`Failed to write binary file: ${path}`);
    }
  },

  /**
   * Get the size of a file in bytes
   */
  getFileSize: async (path: string): Promise<number> => {
    if (runtime.isNative()) {
      return invoke<number>("get_file_size", { path });
    }
    const res = await fetch(`/api/files/size?path=${encodeURIComponent(path)}`);
    if (!res.ok) {
      throw new Error(`Failed to get file size: ${path}`);
    }
    const data = (await res.json()) as { size: number };
    return data.size;
  },

  /**
   * Start watching a directory for file changes.
   * In native mode, uses Tauri's file watcher with notify crate.
   * In web mode, falls back to polling.
   */
  startWatching: async (dir: string): Promise<void> => {
    if (runtime.isNative()) {
      // Start native file watcher
      await invoke("start_watching", { path: dir });
      nativeWatcherState.watchPath = dir;

      // Set up event listener if not already listening
      if (nativeWatcherState.unlistenFn === null) {
        nativeWatcherState.unlistenFn = await listen<{
          path: string;
          change_type: "create" | "modify" | "delete";
        }>("file-changed", (event) => {
          const fileEvent: FileChangeEvent = {
            path: event.payload.path,
            type: event.payload.change_type,
          };
          // Notify all callbacks
          for (const callback of nativeWatcherState.callbacks) {
            callback(fileEvent);
          }
        });
      }
    }
  },

  /**
   * Stop watching the directory
   */
  stopWatching: async (): Promise<void> => {
    if (runtime.isNative()) {
      await invoke("stop_watching");
      nativeWatcherState.watchPath = null;

      // Clean up event listener
      if (nativeWatcherState.unlistenFn !== null) {
        nativeWatcherState.unlistenFn();
        nativeWatcherState.unlistenFn = null;
      }
    } else {
      // Stop polling
      if (pollingState.intervalId !== null) {
        window.clearInterval(pollingState.intervalId);
        pollingState.intervalId = null;
      }
    }
  },

  /**
   * Subscribe to file change events.
   * Must call startWatching first.
   * @returns Unsubscribe function
   */
  onFileChange: (callback: FileWatchCallback): (() => void) => {
    if (runtime.isNative()) {
      nativeWatcherState.callbacks.add(callback);
      return () => {
        nativeWatcherState.callbacks.delete(callback);
      };
    }

    // Web fallback
    pollingState.callbacks.add(callback);
    return () => {
      pollingState.callbacks.delete(callback);
    };
  },

  /**
   * Watch directory for file changes (convenience wrapper).
   * Starts watching and subscribes to events.
   * @returns Unsubscribe function
   */
  watchFiles: (
    dir: string,
    callback: FileWatchCallback,
    pollIntervalMs: number = 1000
  ): (() => void) => {
    if (runtime.isNative()) {
      // Start watching (async, but we don't await here for API compatibility)
      runtime.startWatching(dir).catch(console.error);

      // Subscribe to events
      nativeWatcherState.callbacks.add(callback);

      return () => {
        nativeWatcherState.callbacks.delete(callback);
        // Stop watching if no more callbacks
        if (nativeWatcherState.callbacks.size === 0) {
          runtime.stopWatching().catch(console.error);
        }
      };
    }

    // Web fallback: use polling
    pollingState.callbacks.add(callback);

    // Start polling if not already running
    if (pollingState.intervalId === null) {
      pollingState.intervalId = window.setInterval(() => {
        // Polling logic would check file modification times
        // This is a placeholder - actual implementation depends on backend API
      }, pollIntervalMs);
    }

    // Return unsubscribe function
    return () => {
      pollingState.callbacks.delete(callback);

      // Stop polling if no more callbacks
      if (
        pollingState.callbacks.size === 0 &&
        pollingState.intervalId !== null
      ) {
        window.clearInterval(pollingState.intervalId);
        pollingState.intervalId = null;
      }
    };
  },
};

export default runtime;
