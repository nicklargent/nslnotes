import type { Note, Task, Doc } from "../types/entities";
import type { TopicRef, TopicDecoration } from "../types/topics";

const CACHE_KEY = "nslnotes-index-cache";
const CACHE_VERSION = 1;

interface CachedIndex {
  version: number;
  timestamp: number;
  notes: [string, Note][];
  tasks: [string, Task][];
  docs: [string, Doc][];
  topicsYaml: [TopicRef, TopicDecoration][];
}

/**
 * Save index to localStorage for faster cold starts (T7.2).
 */
export function saveIndexCache(
  notes: Map<string, Note>,
  tasks: Map<string, Task>,
  docs: Map<string, Doc>,
  topicsYaml: Map<TopicRef, TopicDecoration>
): void {
  try {
    const cache: CachedIndex = {
      version: CACHE_VERSION,
      timestamp: Date.now(),
      notes: Array.from(notes.entries()),
      tasks: Array.from(tasks.entries()),
      docs: Array.from(docs.entries()),
      topicsYaml: Array.from(topicsYaml.entries()),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache, dateReplacer));
  } catch {
    // localStorage may be full or unavailable — silently ignore
  }
}

/**
 * Load cached index if valid.
 * Returns null if no cache, cache is stale (>1 hour), or version mismatch.
 */
export function loadIndexCache(): {
  notes: Map<string, Note>;
  tasks: Map<string, Task>;
  docs: Map<string, Doc>;
  topicsYaml: Map<TopicRef, TopicDecoration>;
} | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;

    const cache: CachedIndex = JSON.parse(raw, dateReviver) as CachedIndex;
    if (cache.version !== CACHE_VERSION) return null;

    // Cache is stale if older than 1 hour
    const oneHour = 60 * 60 * 1000;
    if (Date.now() - cache.timestamp > oneHour) return null;

    return {
      notes: new Map(cache.notes),
      tasks: new Map(cache.tasks),
      docs: new Map(cache.docs),
      topicsYaml: new Map(cache.topicsYaml),
    };
  } catch {
    return null;
  }
}

/**
 * Clear the index cache.
 */
export function clearIndexCache(): void {
  localStorage.removeItem(CACHE_KEY);
}

/** JSON replacer that serializes Date objects. */
function dateReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Date) {
    return { __date: value.toISOString() };
  }
  return value;
}

/** JSON reviver that deserializes Date objects. */
function dateReviver(_key: string, value: unknown): unknown {
  if (
    value &&
    typeof value === "object" &&
    "__date" in value &&
    typeof (value as { __date: unknown }).__date === "string"
  ) {
    return new Date((value as { __date: string }).__date);
  }
  return value;
}
