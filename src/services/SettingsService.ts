import { invoke } from "@tauri-apps/api/core";
import { runtime } from "../lib/runtime";

/**
 * Application settings structure
 */
export interface AppSettings {
  /** Root directory path for notes storage */
  rootPath: string | null;
  /** Left column width in pixels */
  leftColumnWidth: number | null;
  /** Right column width in pixels */
  rightColumnWidth: number | null;
  /** Base font size in pixels */
  fontSize: number | null;
  /** Window width in logical pixels */
  windowWidth: number | null;
  /** Window height in logical pixels */
  windowHeight: number | null;
  /** Whether window is maximized */
  windowMaximized: boolean | null;
  /** Whether dark mode is enabled */
  darkMode: boolean | null;
}

/**
 * Default settings
 */
const DEFAULT_SETTINGS: AppSettings = {
  rootPath: null,
  leftColumnWidth: null,
  rightColumnWidth: null,
  fontSize: null,
  windowWidth: null,
  windowHeight: null,
  windowMaximized: null,
  darkMode: null,
};

/**
 * SettingsService handles persisting and loading application settings.
 * Native mode uses Tauri IPC, web mode uses the HTTP API.
 * Both read/write the same settings.json file on disk.
 */
export const SettingsService = {
  loadSettings: async (): Promise<AppSettings> => {
    if (runtime.isNative()) {
      try {
        const settings = await invoke<AppSettings>("load_settings");
        return {
          ...DEFAULT_SETTINGS,
          ...settings,
        };
      } catch (error) {
        console.error("Failed to load settings:", error);
        return DEFAULT_SETTINGS;
      }
    }

    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const parsed = (await res.json()) as Partial<AppSettings>;
        return { ...DEFAULT_SETTINGS, ...parsed };
      }
    } catch (error) {
      console.error("Failed to load settings from server:", error);
    }

    return DEFAULT_SETTINGS;
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

  /**
   * Get the root path setting.
   *
   * @returns Root path or null if not configured
   */
  getRootPath: async (): Promise<string | null> => {
    const settings = await SettingsService.loadSettings();
    return settings.rootPath;
  },

  /**
   * Set the root path setting.
   *
   * @param rootPath - Root directory path
   */
  setRootPath: async (rootPath: string): Promise<void> => {
    const settings = await SettingsService.loadSettings();
    settings.rootPath = rootPath;
    await SettingsService.saveSettings(settings);
  },

  /**
   * Check if the app has been configured (has a root path).
   *
   * @returns True if root path is set
   */
  isConfigured: async (): Promise<boolean> => {
    const rootPath = await SettingsService.getRootPath();
    return rootPath !== null && rootPath.length > 0;
  },

  /**
   * Clear all settings (reset to defaults).
   */
  clearSettings: async (): Promise<void> => {
    await SettingsService.saveSettings(DEFAULT_SETTINGS);
  },
};
