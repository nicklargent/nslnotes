import {
  runtime,
  type FileChangeEvent,
  type FileWatchCallback,
} from "../lib/runtime";

/**
 * File entry metadata
 */
export interface FileEntry {
  /** Filename (not full path) */
  name: string;
  /** Full absolute path */
  path: string;
  /** Whether this is a directory */
  isDirectory: boolean;
}

/**
 * File stat information
 */
export interface FileStat {
  /** File size in bytes */
  size: number;
  /** Whether this is a directory */
  isDirectory: boolean;
  /** Whether this is a file */
  isFile: boolean;
  /** Last modified timestamp */
  modifiedAt: Date;
  /** Created timestamp (if available) */
  createdAt: Date | null;
}

/**
 * Directory verification status
 */
export interface DirectoryStatus {
  /** Whether directory exists and is readable */
  readable: boolean;
  /** Whether directory is writable */
  writable: boolean;
  /** Whether all required subdirectories exist */
  hasStructure: boolean;
}

/**
 * Required subdirectories for NslNotes
 */
const REQUIRED_SUBDIRS = ["notes", "tasks", "docs"];

/**
 * FileService provides file system operations for NslNotes.
 * Acts as a facade over the runtime abstraction layer.
 */
export const FileService = {
  /**
   * Read file content from disk.
   *
   * @param path - Absolute path to file
   * @returns File content as string
   * @throws Error if file doesn't exist or is inaccessible
   */
  read: async (path: string): Promise<string> => {
    return runtime.readFile(path);
  },

  /**
   * Write content to file, creating parent directories if needed.
   *
   * @param path - Absolute path to file
   * @param content - Content to write
   */
  write: async (path: string, content: string): Promise<void> => {
    return runtime.writeFile(path, content);
  },

  /**
   * Delete a file.
   *
   * @param path - Absolute path to file
   * @throws Error if file doesn't exist
   */
  delete: async (path: string): Promise<void> => {
    return runtime.deleteFile(path);
  },

  /**
   * Check if file exists.
   *
   * @param path - Absolute path to check
   * @returns True if file exists
   */
  exists: async (path: string): Promise<boolean> => {
    return runtime.exists(path);
  },

  /**
   * List files in directory.
   *
   * @param dir - Directory path
   * @param pattern - Optional glob pattern to filter (e.g., "*.md")
   * @returns Array of file entries
   */
  list: async (dir: string, pattern?: string): Promise<FileEntry[]> => {
    const files = await runtime.listDirectory(dir);

    // Filter by pattern if provided
    let filtered = files;
    if (pattern) {
      const regex = globToRegex(pattern);
      filtered = files.filter((f) => regex.test(f));
    }

    // Convert to FileEntry format
    // Runtime returns absolute paths, so extract the filename for `name`
    return filtered.map((filePath) => {
      const name = filePath.split("/").pop() ?? filePath;
      return {
        name,
        path: filePath,
        isDirectory: !name.includes("."), // Simple heuristic - proper stat would be better
      };
    });
  },

  /**
   * List only markdown files in a directory.
   *
   * @param dir - Directory path
   * @returns Array of markdown file entries
   */
  listMarkdownFiles: async (dir: string): Promise<FileEntry[]> => {
    return FileService.list(dir, "*.md");
  },

  /**
   * Get file metadata.
   * Note: Currently limited - full stat requires backend support.
   *
   * @param path - Absolute path to file
   * @returns File stat information
   */
  stat: async (path: string): Promise<FileStat> => {
    // For now, we can only check existence and infer some properties
    // Full stat would require additional Tauri commands
    const exists = await runtime.exists(path);

    if (!exists) {
      throw new Error(`File not found: ${path}`);
    }

    // Read file to get size (not ideal, but works without additional backend)
    const content = await runtime.readFile(path);

    return {
      size: new Blob([content]).size,
      isDirectory: false, // We only support files currently
      isFile: true,
      modifiedAt: new Date(), // Would need backend support for actual mtime
      createdAt: null,
    };
  },

  /**
   * Watch directory for file changes.
   * Returns unsubscribe function.
   *
   * @param dir - Directory to watch
   * @param callback - Callback for file change events
   * @returns Unsubscribe function
   */
  watch: (dir: string, callback: FileWatchCallback): (() => void) => {
    return runtime.watchFiles(dir, callback);
  },

  /**
   * Subscribe to file change events without starting a new watcher.
   * Use after startWatching has been called.
   *
   * @param callback - Callback for file change events
   * @returns Unsubscribe function
   */
  onFileChange: (callback: FileWatchCallback): (() => void) => {
    return runtime.onFileChange(callback);
  },

  /**
   * Start watching a directory.
   *
   * @param dir - Directory to watch
   */
  startWatching: async (dir: string): Promise<void> => {
    return runtime.startWatching(dir);
  },

  /**
   * Stop watching for file changes.
   */
  stopWatching: async (): Promise<void> => {
    return runtime.stopWatching();
  },

  /**
   * Verify directory is accessible and properly structured.
   *
   * @param path - Root directory path
   * @returns Directory status
   */
  verifyDirectory: async (path: string): Promise<DirectoryStatus> => {
    const { readable, writable } = await runtime.verifyDirectory(path);

    if (!readable) {
      return { readable: false, writable: false, hasStructure: false };
    }

    // Check for required subdirectories
    let hasStructure = true;
    for (const subdir of REQUIRED_SUBDIRS) {
      const subdirPath = joinPath(path, subdir);
      const exists = await runtime.exists(subdirPath);
      if (!exists) {
        hasStructure = false;
        break;
      }
    }

    return { readable, writable, hasStructure };
  },

  /**
   * Ensure directory exists with required structure.
   * Creates the directory and subdirectories if they don't exist.
   *
   * @param path - Root directory path
   */
  ensureDirectory: async (path: string): Promise<void> => {
    // Ensure root directory exists
    await runtime.ensureDirectory(path);

    // Ensure required subdirectories exist
    for (const subdir of REQUIRED_SUBDIRS) {
      const subdirPath = joinPath(path, subdir);
      await runtime.ensureDirectory(subdirPath);
    }
  },

  /**
   * Get the path to a subdirectory.
   *
   * @param root - Root directory path
   * @param subdir - Subdirectory name ("notes", "tasks", or "docs")
   * @returns Full path to subdirectory
   */
  getSubdirPath: (root: string, subdir: "notes" | "tasks" | "docs"): string => {
    return joinPath(root, subdir);
  },

  /**
   * Check if running in native Tauri environment.
   */
  isNative: (): boolean => {
    return runtime.isNative();
  },
};

/**
 * Join path segments.
 * Simple implementation - handles both Unix and Windows paths.
 */
function joinPath(...segments: string[]): string {
  return segments
    .map((s, i) => {
      // Remove trailing slashes except for first segment
      if (i > 0) {
        s = s.replace(/^[/\\]+/, "");
      }
      // Remove leading slashes except for last segment
      if (i < segments.length - 1) {
        s = s.replace(/[/\\]+$/, "");
      }
      return s;
    })
    .filter((s) => s.length > 0)
    .join("/");
}

/**
 * Convert glob pattern to regex.
 * Supports * and ? wildcards.
 */
function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&") // Escape special regex chars
    .replace(/\*/g, ".*") // * matches any characters
    .replace(/\?/g, "."); // ? matches single character
  return new RegExp(`^${escaped}$`, "i");
}

// Re-export types for convenience
export type { FileChangeEvent, FileWatchCallback };
