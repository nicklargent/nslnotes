import { FileService } from "./FileService";
import { TopicService } from "./TopicService";
import { indexStore, setIndexStore } from "../stores/indexStore";
import { parseNote, parseTask, parseDoc } from "../lib/entityParser";
import { parseTopicRefs } from "../lib/markdown";
import { computeRelevance } from "../lib/relevance";
import { isOverdue, isWithinDays } from "../lib/dates";
import { saveIndexCache, loadIndexCache } from "../lib/indexCache";
import type { Note, Task, Doc, Entity } from "../types/entities";
import type { TopicRef, Topic, EntityReference } from "../types/topics";
import type { ContextState } from "../types/stores";
import type { GroupedTasks } from "../types/task-groups";
import type { WikiLink } from "../types/inline";

/**
 * Join path segments (simple implementation).
 */
function joinPath(...segments: string[]): string {
  return segments
    .map((s, i) => {
      if (i > 0) s = s.replace(/^[/\\]+/, "");
      if (i < segments.length - 1) s = s.replace(/[/\\]+$/, "");
      return s;
    })
    .filter((s) => s.length > 0)
    .join("/");
}

/**
 * IndexService manages the in-memory index of all entities.
 */
export const IndexService = {
  /**
   * Build the full index from the file system.
   * Reads all .md files in notes/, tasks/, docs/ and populates the index store.
   *
   * @param rootPath - Root directory path
   * @returns Timing info for performance monitoring
   */
  buildIndex: async (
    rootPath: string
  ): Promise<{
    durationMs: number;
    counts: { notes: number; tasks: number; docs: number };
  }> => {
    const startTime = performance.now();

    // Try loading cached index first (T7.2)
    const cached = loadIndexCache();
    if (cached) {
      const topics = buildTopics(
        cached.notes,
        cached.tasks,
        cached.docs,
        cached.topicsYaml
      );
      setIndexStore({
        notes: cached.notes,
        tasks: cached.tasks,
        docs: cached.docs,
        topics,
        topicsYaml: cached.topicsYaml,
        lastIndexed: new Date(),
      });
      // Rebuild in background to pick up any changes since cache
      void IndexService._rebuildFresh(rootPath);
      const durationMs = performance.now() - startTime;
      return {
        durationMs,
        counts: {
          notes: cached.notes.size,
          tasks: cached.tasks.size,
          docs: cached.docs.size,
        },
      };
    }

    const notesDir = joinPath(rootPath, "notes");
    const tasksDir = joinPath(rootPath, "tasks");
    const docsDir = joinPath(rootPath, "docs");

    // Read all markdown files from each directory in parallel
    const [noteFiles, taskFiles, docFiles] = await Promise.all([
      FileService.listMarkdownFiles(notesDir).catch(() => []),
      FileService.listMarkdownFiles(tasksDir).catch(() => []),
      FileService.listMarkdownFiles(docsDir).catch(() => []),
    ]);

    // Parse all files in parallel
    const notePromises = noteFiles.map(async (entry) => {
      const content = await FileService.read(entry.path);
      return parseNote(entry.path, content);
    });

    const taskPromises = taskFiles.map(async (entry) => {
      const content = await FileService.read(entry.path);
      return parseTask(entry.path, content);
    });

    const docPromises = docFiles.map(async (entry) => {
      const content = await FileService.read(entry.path);
      return parseDoc(entry.path, content);
    });

    const [noteResults, taskResults, docResults] = await Promise.all([
      Promise.all(notePromises),
      Promise.all(taskPromises),
      Promise.all(docPromises),
    ]);

    // Build maps (filter out invalid files)
    const notes = new Map<string, Note>();
    for (const note of noteResults) {
      if (note) notes.set(note.path, note);
    }

    const tasks = new Map<string, Task>();
    for (const task of taskResults) {
      if (task) tasks.set(task.path, task);
    }

    const docs = new Map<string, Doc>();
    for (const doc of docResults) {
      if (doc) docs.set(doc.path, doc);
    }

    // Load topics.yaml
    const topicsYamlPath = joinPath(rootPath, "topics.yaml");
    const topicsYaml = await TopicService.loadTopicsYaml(topicsYamlPath);

    // Build topics from all entities
    const topics = buildTopics(notes, tasks, docs, topicsYaml);

    // Update the store
    setIndexStore({
      notes,
      tasks,
      docs,
      topics,
      topicsYaml,
      lastIndexed: new Date(),
    });

    // Save to cache (T7.2)
    saveIndexCache(notes, tasks, docs, topicsYaml);

    const durationMs = performance.now() - startTime;
    return {
      durationMs,
      counts: { notes: notes.size, tasks: tasks.size, docs: docs.size },
    };
  },

  /**
   * Background rebuild after loading from cache (T7.2).
   * Performs a full file system read and updates the store with fresh data.
   */
  _rebuildFresh: async (rootPath: string): Promise<void> => {
    const notesDir = joinPath(rootPath, "notes");
    const tasksDir = joinPath(rootPath, "tasks");
    const docsDir = joinPath(rootPath, "docs");

    const [noteFiles, taskFiles, docFiles] = await Promise.all([
      FileService.listMarkdownFiles(notesDir).catch(() => []),
      FileService.listMarkdownFiles(tasksDir).catch(() => []),
      FileService.listMarkdownFiles(docsDir).catch(() => []),
    ]);

    const notePromises = noteFiles.map(async (entry) => {
      const content = await FileService.read(entry.path);
      return parseNote(entry.path, content);
    });
    const taskPromises = taskFiles.map(async (entry) => {
      const content = await FileService.read(entry.path);
      return parseTask(entry.path, content);
    });
    const docPromises = docFiles.map(async (entry) => {
      const content = await FileService.read(entry.path);
      return parseDoc(entry.path, content);
    });

    const [noteResults, taskResults, docResults] = await Promise.all([
      Promise.all(notePromises),
      Promise.all(taskPromises),
      Promise.all(docPromises),
    ]);

    const notes = new Map<string, Note>();
    for (const note of noteResults) {
      if (note) notes.set(note.path, note);
    }
    const tasks = new Map<string, Task>();
    for (const task of taskResults) {
      if (task) tasks.set(task.path, task);
    }
    const docs = new Map<string, Doc>();
    for (const doc of docResults) {
      if (doc) docs.set(doc.path, doc);
    }

    const topicsYamlPath = joinPath(rootPath, "topics.yaml");
    const topicsYaml = await TopicService.loadTopicsYaml(topicsYamlPath);
    const topics = buildTopics(notes, tasks, docs, topicsYaml);

    setIndexStore({
      notes,
      tasks,
      docs,
      topics,
      topicsYaml,
      lastIndexed: new Date(),
    });

    saveIndexCache(notes, tasks, docs, topicsYaml);
  },

  /**
   * Invalidate and re-parse a single file.
   * Updates the relevant store entries and recomputes topics.
   *
   * @param path - Path to the changed file
   * @param rootPath - Root directory path (for topic recomputation)
   */
  invalidate: async (path: string, rootPath: string): Promise<void> => {
    // Determine which subdirectory the file is in
    const notesDir = joinPath(rootPath, "notes");
    const tasksDir = joinPath(rootPath, "tasks");
    const docsDir = joinPath(rootPath, "docs");

    const exists = await FileService.exists(path);

    if (path.startsWith(notesDir)) {
      if (exists) {
        const content = await FileService.read(path);
        const note = parseNote(path, content);
        const newNotes = new Map(indexStore.notes);
        if (note) {
          newNotes.set(path, note);
        } else {
          newNotes.delete(path);
        }
        setIndexStore("notes", newNotes);
      } else {
        const newNotes = new Map(indexStore.notes);
        newNotes.delete(path);
        setIndexStore("notes", newNotes);
      }
    } else if (path.startsWith(tasksDir)) {
      if (exists) {
        const content = await FileService.read(path);
        const task = parseTask(path, content);
        const newTasks = new Map(indexStore.tasks);
        if (task) {
          newTasks.set(path, task);
        } else {
          newTasks.delete(path);
        }
        setIndexStore("tasks", newTasks);
      } else {
        const newTasks = new Map(indexStore.tasks);
        newTasks.delete(path);
        setIndexStore("tasks", newTasks);
      }
    } else if (path.startsWith(docsDir)) {
      if (exists) {
        const content = await FileService.read(path);
        const doc = parseDoc(path, content);
        const newDocs = new Map(indexStore.docs);
        if (doc) {
          newDocs.set(path, doc);
        } else {
          newDocs.delete(path);
        }
        setIndexStore("docs", newDocs);
      } else {
        const newDocs = new Map(indexStore.docs);
        newDocs.delete(path);
        setIndexStore("docs", newDocs);
      }
    } else if (path.endsWith("topics.yaml")) {
      const topicsYaml = await TopicService.loadTopicsYaml(path);
      setIndexStore("topicsYaml", topicsYaml);
    }

    // Recompute topics
    const topics = buildTopics(
      indexStore.notes,
      indexStore.tasks,
      indexStore.docs,
      indexStore.topicsYaml
    );
    setIndexStore("topics", topics);
  },

  /**
   * Get notes, optionally filtered by date.
   */
  getNotes: (filter?: { date?: string; isDaily?: boolean }): Note[] => {
    let notes = Array.from(indexStore.notes.values());

    if (filter?.date) {
      notes = notes.filter((n) => n.date === filter.date);
    }

    if (filter?.isDaily !== undefined) {
      notes = notes.filter((n) => n.isDaily === filter.isDaily);
    }

    return notes;
  },

  /**
   * Get notes for a specific date.
   */
  getNotesForDate: (date: string): Note[] => {
    return Array.from(indexStore.notes.values()).filter((n) => n.date === date);
  },

  /**
   * Get all open tasks.
   */
  getOpenTasks: (): Task[] => {
    return Array.from(indexStore.tasks.values()).filter(
      (t) => t.status === "open"
    );
  },

  /**
   * Get tasks grouped for the right panel display.
   *
   * @param context - Current context state
   * @returns Grouped tasks
   */
  getGroupedTasks: (context: ContextState): GroupedTasks => {
    const openTasks = IndexService.getOpenTasks();
    const related: Task[] = [];
    const overdue: Task[] = [];
    const thisWeek: Task[] = [];
    const later: Task[] = [];

    for (const task of openTasks) {
      // Check if related (only when not home state)
      if (!context.isHomeState && context.relevanceWeights.has(task.path)) {
        related.push(task);
        continue; // A task goes in only one group
      }

      // Check due date groups
      if (task.due) {
        if (isOverdue(task.due)) {
          overdue.push(task);
        } else if (isWithinDays(task.due, 7)) {
          thisWeek.push(task);
        } else {
          later.push(task);
        }
      } else {
        later.push(task);
      }
    }

    // Sort related by relevance score (descending)
    related.sort((a, b) => {
      const scoreA = context.relevanceWeights.get(a.path) ?? 0;
      const scoreB = context.relevanceWeights.get(b.path) ?? 0;
      return scoreB - scoreA;
    });

    // Sort overdue by due date (most overdue first)
    overdue.sort((a, b) => (a.due ?? "").localeCompare(b.due ?? ""));

    // Sort this week by due date
    thisWeek.sort((a, b) => (a.due ?? "").localeCompare(b.due ?? ""));

    return { related, overdue, thisWeek, later };
  },

  /**
   * Get all docs sorted alphabetically by title.
   */
  getDocs: (): Doc[] => {
    return Array.from(indexStore.docs.values()).sort((a, b) =>
      a.title.toLowerCase().localeCompare(b.title.toLowerCase())
    );
  },

  /**
   * Get active topics sorted by most recently used.
   */
  getActiveTopics: (): Topic[] => {
    return Array.from(indexStore.topics.values())
      .filter((t) => t.isActive)
      .sort((a, b) => {
        const aTime = a.lastUsed?.getTime() ?? 0;
        const bTime = b.lastUsed?.getTime() ?? 0;
        return bTime - aTime;
      });
  },

  /**
   * Get all references for a topic.
   */
  getTopicReferences: (ref: TopicRef): EntityReference[] => {
    const topic = indexStore.topics.get(ref);
    return topic?.references ?? [];
  },

  /**
   * Resolve a wikilink to its target entity.
   *
   * @param link - The wikilink to resolve
   * @returns The target entity, or null if not found
   */
  resolveWikilink: (link: WikiLink): Entity | null => {
    switch (link.type) {
      case "task": {
        for (const task of indexStore.tasks.values()) {
          if (task.slug === link.target) return task;
        }
        return null;
      }
      case "doc": {
        for (const doc of indexStore.docs.values()) {
          if (doc.slug === link.target) return doc;
        }
        return null;
      }
      case "note": {
        for (const note of indexStore.notes.values()) {
          if (note.slug === link.target) return note;
        }
        return null;
      }
      default:
        return null;
    }
  },

  /**
   * Compute relevance weights for the current context entity.
   *
   * @param entity - The entity to compute relevance from
   * @returns Map of entity path → relevance score
   */
  computeRelevance: (entity: Entity): Map<string, number> => {
    const allEntities: Entity[] = [
      ...indexStore.notes.values(),
      ...indexStore.tasks.values(),
      ...indexStore.docs.values(),
    ];
    return computeRelevance(entity, allEntities);
  },
};

/**
 * Build the topics map from all entities.
 * Extracts topics from frontmatter AND body content,
 * aggregates references, and computes active/dormant status.
 */
function buildTopics(
  notes: Map<string, Note>,
  tasks: Map<string, Task>,
  docs: Map<string, Doc>,
  topicsYaml: Map<TopicRef, import("../types/topics").TopicDecoration>
): Map<TopicRef, Topic> {
  const topicMap = new Map<
    TopicRef,
    {
      references: EntityReference[];
      openTaskCount: number;
      lastUsed: Date | null;
    }
  >();

  function ensureTopic(ref: TopicRef) {
    if (!topicMap.has(ref)) {
      topicMap.set(ref, {
        references: [],
        openTaskCount: 0,
        lastUsed: null,
      });
    }
    return topicMap.get(ref)!;
  }

  function addEntityTopics(entity: Entity, refs: TopicRef[]) {
    const entityRef: EntityReference = {
      type: entity.type,
      path: entity.path,
      slug: entity.slug,
      title:
        entity.type === "note"
          ? entity.title
          : entity.type === "task"
            ? entity.title
            : entity.type === "doc"
              ? entity.title
              : null,
      date:
        entity.type === "note"
          ? entity.date
          : entity.type === "task"
            ? entity.created
            : entity.type === "doc"
              ? entity.created
              : null,
    };

    for (const ref of refs) {
      const topic = ensureTopic(ref);
      topic.references.push(entityRef);

      // Update lastUsed
      const entityModified =
        entity.modifiedAt instanceof Date
          ? entity.modifiedAt
          : new Date(entity.modifiedAt as unknown as string);
      if (
        !topic.lastUsed ||
        entityModified.getTime() > topic.lastUsed.getTime()
      ) {
        topic.lastUsed = entityModified;
      }

      // Count open tasks
      if (entity.type === "task" && entity.status === "open") {
        topic.openTaskCount++;
      }
    }
  }

  // Process all entities
  for (const note of notes.values()) {
    const allTopics = collectAllTopics(note);
    addEntityTopics(note, allTopics);
  }

  for (const task of tasks.values()) {
    const allTopics = collectAllTopics(task);
    addEntityTopics(task, allTopics);
  }

  for (const doc of docs.values()) {
    const allTopics = collectAllTopics(doc);
    addEntityTopics(doc, allTopics);
  }

  // Build final Topic objects
  const result = new Map<TopicRef, Topic>();
  const now = new Date();
  const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;

  for (const [ref, data] of topicMap.entries()) {
    const decoration = topicsYaml.get(ref);
    const id = ref.slice(1); // Remove # or @ prefix
    const kind = ref.startsWith("@") ? "person" : "topic";

    // Active if: has open tasks OR was used within 90 days
    const hasOpenTasks = data.openTaskCount > 0;
    const isRecent =
      data.lastUsed !== null &&
      now.getTime() - data.lastUsed.getTime() < ninetyDaysMs;
    const isActive = hasOpenTasks || isRecent;

    result.set(ref, {
      ref,
      id,
      kind,
      label: decoration?.label ?? ref,
      note: decoration?.note ?? null,
      isActive,
      references: data.references,
      openTaskCount: data.openTaskCount,
      lastUsed: data.lastUsed,
    });
  }

  return result;
}

/**
 * Collect all topic references from an entity (frontmatter + body).
 */
function collectAllTopics(entity: Entity): TopicRef[] {
  const topics = new Set<TopicRef>(entity.topics);
  const inlineTopics = parseTopicRefs(entity.content);
  for (const t of inlineTopics) {
    topics.add(t);
  }
  return Array.from(topics);
}
