import type { Note, Task, Doc } from "../types/entities";
import type { TopicRef, TopicDecoration } from "../types/topics";

const CACHE_PREFIX = "nslnotes-index-cache:";
const CACHE_VERSION = 1;

function cacheKey(notebookId: string): string {
  return `${CACHE_PREFIX}${notebookId}`;
}

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
  notebookId: string,
  notes: Map<string, Note>,
  tasks: Map<string, Task>,
  docs: Map<string, Doc>,
  topicsYaml: Map<TopicRef, TopicDecoration>
): void {
  if (!notebookId) return;
  try {
    const cache: CachedIndex = {
      version: CACHE_VERSION,
      timestamp: Date.now(),
      notes: Array.from(notes.entries()),
      tasks: Array.from(tasks.entries()),
      docs: Array.from(docs.entries()),
      topicsYaml: Array.from(topicsYaml.entries()),
    };
    localStorage.setItem(
      cacheKey(notebookId),
      JSON.stringify(cache, dateReplacer)
    );
  } catch {
    // localStorage may be full or unavailable — silently ignore
  }
}

/**
 * Load cached index if valid.
 * Returns null if no cache, cache is stale (>1 hour), or version mismatch.
 */
export function loadIndexCache(notebookId: string): {
  notes: Map<string, Note>;
  tasks: Map<string, Task>;
  docs: Map<string, Doc>;
  topicsYaml: Map<TopicRef, TopicDecoration>;
} | null {
  if (!notebookId) return null;
  try {
    const raw = localStorage.getItem(cacheKey(notebookId));
    if (!raw) return null;

    const cache: CachedIndex = JSON.parse(raw, dateReviver) as CachedIndex;
    if (cache.version !== CACHE_VERSION) return null;

    // Cache is stale if older than 1 hour
    const oneHour = 60 * 60 * 1000;
    if (Date.now() - cache.timestamp > oneHour) return null;

    // Ensure modifiedAt is a proper Date after deserialization
    const rehydrateDate = <T extends { modifiedAt: Date }>(
      entries: [string, T][]
    ): [string, T][] =>
      entries.map(([key, entity]) => [
        key,
        {
          ...entity,
          modifiedAt:
            entity.modifiedAt instanceof Date
              ? entity.modifiedAt
              : new Date(entity.modifiedAt as unknown as string),
        },
      ]);

    return {
      notes: new Map(rehydrateDate(cache.notes)),
      tasks: new Map(rehydrateDate(cache.tasks)),
      docs: new Map(rehydrateDate(cache.docs)),
      topicsYaml: new Map(cache.topicsYaml),
    };
  } catch {
    return null;
  }
}

/**
 * Clear the cache for a specific notebook.
 */
export function clearIndexCache(notebookId: string): void {
  if (!notebookId) return;
  localStorage.removeItem(cacheKey(notebookId));
}

/**
 * Clear every notebook's index cache. Used when resetting settings or when a
 * stale-format cache causes the index to fail to build.
 */
export function clearAllIndexCaches(): void {
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CACHE_PREFIX)) toRemove.push(key);
    }
    for (const key of toRemove) localStorage.removeItem(key);
  } catch {
    // ignore
  }
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
