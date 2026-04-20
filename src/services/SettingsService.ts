import { invoke } from "@tauri-apps/api/core";
import { runtime } from "../lib/runtime";

export interface Notebook {
  id: string;
  name: string;
  path: string;
}

export interface AppSettings {
  /** Root directory path. Duplicated by the active notebook's path; retained for settings-file back-compat. */
  rootPath: string | null;
  notebooks: Notebook[];
  activeNotebookId: string | null;
  leftColumnWidth: number | null;
  rightColumnWidth: number | null;
  fontSize: number | null;
  windowWidth: number | null;
  windowHeight: number | null;
  windowMaximized: boolean | null;
  darkMode: boolean | null;
  webPort: number | null;
}

const DEFAULT_SETTINGS: AppSettings = {
  rootPath: null,
  notebooks: [],
  activeNotebookId: null,
  leftColumnWidth: null,
  rightColumnWidth: null,
  fontSize: null,
  windowWidth: null,
  windowHeight: null,
  windowMaximized: null,
  darkMode: null,
  webPort: null,
};

function basenameOf(p: string): string {
  const trimmed = p.replace(/[/\\]+$/, "");
  const parts = trimmed.split(/[/\\]/);
  return parts[parts.length - 1] || trimmed || p;
}

function generateId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `nb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function makeNotebook(path: string, name?: string): Notebook {
  return {
    id: generateId(),
    name: name?.trim() || basenameOf(path),
    path,
  };
}

/**
 * Migrate legacy settings (rootPath only, no notebooks list) to the current
 * multi-notebook shape by synthesizing one notebook from the existing rootPath.
 */
function migrateNotebooks(settings: AppSettings): AppSettings {
  if (Array.isArray(settings.notebooks) && settings.notebooks.length > 0) {
    return settings;
  }
  if (settings.rootPath) {
    const nb = makeNotebook(settings.rootPath);
    return { ...settings, notebooks: [nb], activeNotebookId: nb.id };
  }
  return { ...settings, notebooks: [] };
}

export const SettingsService = {
  loadSettings: async (): Promise<AppSettings> => {
    let merged: AppSettings = DEFAULT_SETTINGS;

    if (runtime.isNative()) {
      try {
        const settings = await invoke<AppSettings>("load_settings");
        merged = { ...DEFAULT_SETTINGS, ...settings };
      } catch (error) {
        console.error("Failed to load settings:", error);
        merged = DEFAULT_SETTINGS;
      }
    } else {
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const parsed = (await res.json()) as Partial<AppSettings>;
          merged = { ...DEFAULT_SETTINGS, ...parsed };
        }
      } catch (error) {
        console.error("Failed to load settings from server:", error);
      }
    }

    return migrateNotebooks(merged);
  },

  saveSettings: async (settings: AppSettings): Promise<void> => {
    if (runtime.isNative()) {
      try {
        await invoke("save_settings", { settings });
      } catch (error) {
        console.error("Failed to save settings:", error);
        throw new Error(`Failed to save settings: ${error}`);
      }
      return;
    }

    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) {
        throw new Error("Server returned error");
      }
    } catch (error) {
      console.error("Failed to save settings to server:", error);
      throw new Error(`Failed to save settings: ${error}`);
    }
  },

  getRootPath: async (): Promise<string | null> => {
    const settings = await SettingsService.loadSettings();
    return settings.rootPath;
  },

  /**
   * Add a new notebook. If there are no notebooks yet, the new one becomes active.
   */
  addNotebook: async (
    path: string,
    name?: string
  ): Promise<{ notebook: Notebook; settings: AppSettings }> => {
    const settings = await SettingsService.loadSettings();
    const nb = makeNotebook(path, name);
    settings.notebooks = [...settings.notebooks, nb];
    if (!settings.activeNotebookId) {
      settings.activeNotebookId = nb.id;
      settings.rootPath = nb.path;
    }
    await SettingsService.saveSettings(settings);
    return { notebook: nb, settings };
  },

  /**
   * Remove a notebook by id. Does not touch the index cache — callers must
   * clear it (see clearIndexCache).
   */
  removeNotebook: async (id: string): Promise<AppSettings> => {
    const settings = await SettingsService.loadSettings();
    settings.notebooks = settings.notebooks.filter((n) => n.id !== id);
    if (settings.activeNotebookId === id) {
      const next = settings.notebooks[0] ?? null;
      settings.activeNotebookId = next?.id ?? null;
      settings.rootPath = next?.path ?? null;
    }
    await SettingsService.saveSettings(settings);
    return settings;
  },

  /** Rename a notebook. No-op if the id is unknown. */
  renameNotebook: async (id: string, name: string): Promise<AppSettings> => {
    const settings = await SettingsService.loadSettings();
    const nb = settings.notebooks.find((n) => n.id === id);
    if (nb) {
      nb.name = name;
      await SettingsService.saveSettings(settings);
    }
    return settings;
  },

  setActiveNotebook: async (id: string): Promise<AppSettings> => {
    const settings = await SettingsService.loadSettings();
    const nb = settings.notebooks.find((n) => n.id === id);
    if (nb) {
      settings.activeNotebookId = id;
      settings.rootPath = nb.path;
      await SettingsService.saveSettings(settings);
    }
    return settings;
  },

  isConfigured: async (): Promise<boolean> => {
    const settings = await SettingsService.loadSettings();
    return (
      settings.notebooks.length > 0 ||
      (settings.rootPath !== null && settings.rootPath.length > 0)
    );
  },

  clearSettings: async (): Promise<void> => {
    await SettingsService.saveSettings(DEFAULT_SETTINGS);
  },
};
