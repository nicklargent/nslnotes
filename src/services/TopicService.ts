import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { FileService } from "./FileService";
import { SettingsService } from "./SettingsService";
import type { TopicRef, TopicDecoration } from "../types/topics";

/**
 * TopicService handles topics.yaml parsing and topic decoration.
 */
export const TopicService = {
  /**
   * Load and parse topics.yaml file.
   * Returns empty map if file doesn't exist or is invalid.
   *
   * @param path - Absolute path to topics.yaml
   * @returns Map of topic decorations keyed by TopicRef
   */
  loadTopicsYaml: async (
    path: string
  ): Promise<Map<TopicRef, TopicDecoration>> => {
    const map = new Map<TopicRef, TopicDecoration>();

    // Check if file exists
    const exists = await FileService.exists(path);
    if (!exists) {
      return map;
    }

    // Read and parse
    let content: string;
    try {
      content = await FileService.read(path);
    } catch {
      return map;
    }

    let parsed: unknown;
    try {
      parsed = parseYaml(content);
    } catch {
      return map;
    }

    // Expect an array of topic entries
    if (!Array.isArray(parsed)) {
      return map;
    }

    for (const entry of parsed) {
      if (typeof entry !== "object" || entry === null) continue;

      const record = entry as Record<string, unknown>;
      const id = record["id"];

      // Validate id has # or @ prefix
      if (typeof id !== "string" || !/^[#@]/.test(id)) continue;

      const decoration: TopicDecoration = {
        id: id as TopicRef,
      };

      if (typeof record["label"] === "string") {
        decoration.label = record["label"];
      }

      if (typeof record["note"] === "string") {
        decoration.note = record["note"];
      }

      if (typeof record["archived"] === "boolean") {
        decoration.archived = record["archived"];
      }

      map.set(id as TopicRef, decoration);
    }

    return map;
  },

  /**
   * Get display label for a topic reference.
   * Uses decoration label if available, otherwise returns the raw ref.
   *
   * @param ref - Topic reference
   * @param decorations - Map of topic decorations
   * @returns Display label
   */
  getLabel: (
    ref: TopicRef,
    decorations: Map<TopicRef, TopicDecoration>
  ): string => {
    const decoration = decorations.get(ref);
    return decoration?.label ?? ref;
  },

  /**
   * Save a topic's label to topics.yaml.
   * Creates the file if it doesn't exist. Clears label if empty or matches raw ref.
   *
   * @param ref - Topic reference (e.g. "#my-topic")
   * @param label - New display label (empty string to clear)
   */
  saveTopicLabel: async (ref: TopicRef, label: string): Promise<void> => {
    const rootPath = await SettingsService.getRootPath();
    if (!rootPath) return;

    const path = rootPath + "/topics.yaml";

    let entries: Record<string, unknown>[] = [];
    const exists = await FileService.exists(path);
    if (exists) {
      try {
        const content = await FileService.read(path);
        const parsed = parseYaml(content);
        if (Array.isArray(parsed)) {
          entries = parsed;
        }
      } catch {
        // Start fresh if parse fails
      }
    }

    const trimmed = label.trim();
    const shouldClear = trimmed === "" || trimmed === ref;

    const idx = entries.findIndex(
      (e) =>
        typeof e === "object" &&
        e !== null &&
        (e as Record<string, unknown>)["id"] === ref
    );

    if (idx >= 0) {
      if (shouldClear) {
        delete (entries[idx] as Record<string, unknown>)["label"];
      } else {
        (entries[idx] as Record<string, unknown>)["label"] = trimmed;
      }
    } else if (!shouldClear) {
      entries.push({ id: ref, label: trimmed });
    }

    await FileService.write(path, stringifyYaml(entries));
  },
};
