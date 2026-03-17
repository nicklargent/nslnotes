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
 * LocalStorage key for web fallback
 */
const STORAGE_KEY = "nslnotes_settings";

/**
 * SettingsService handles persisting and loading application settings.
 * Uses Tauri's app config directory in native mode, localStorage in web mode.
 */
export const SettingsService = {
  /**
   * Load application settings.
   * Returns default settings if none exist.
   *
   * @returns Application settings
   */
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

    // Web fallback: use localStorage
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<AppSettings>;
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
        };
      }
    } catch (error) {
      console.error("Failed to load settings from localStorage:", error);
    }

    return DEFAULT_SETTINGS;
  },

  /**
   * Save application settings.
   *
   * @param settings - Settings to save
   */
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

    // Web fallback: use localStorage
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error("Failed to save settings to localStorage:", error);
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
