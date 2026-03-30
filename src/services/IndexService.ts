import { FileService } from "./FileService";
import { TopicService } from "./TopicService";
import { indexStore, setIndexStore } from "../stores/indexStore";
import { parseNote, parseTask, parseDoc } from "../lib/entityParser";
import {
  parseTopicRefs,
  parseWikilinks,
  parseTodosAndCheckboxes,
} from "../lib/markdown";
import { computeRelevance } from "../lib/relevance";
import {
  isOverdue,
  getEndOfWeek,
  getEndOfNextWeek,
  getToday,
  addDays,
} from "../lib/dates";
import { saveIndexCache, loadIndexCache } from "../lib/indexCache";
import type { Note, Task, Doc, Entity } from "../types/entities";
import type { TopicRef, Topic, EntityReference } from "../types/topics";
import type { GroupedTasks, GroupedClosedTasks } from "../types/task-groups";
import type { WikiLink } from "../types/inline";
import type {
  SearchFilter,
  SearchResult,
  TodoSearchResult,
} from "../types/search";
import type { ImageRef, ImageFile } from "../types/images";
import type { BacklinkEntry } from "../types/backlinks";

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
    rootPath: string,
    onProgress?: (completed: number, total: number) => void
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
      buildBacklinks();
      const cachedTotal =
        cached.notes.size + cached.tasks.size + cached.docs.size;
      onProgress?.(cachedTotal, cachedTotal);
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

    // Parse all files in parallel, reporting progress as each completes
    const totalFiles = noteFiles.length + taskFiles.length + docFiles.length;
    let completedFiles = 0;
    onProgress?.(0, totalFiles);

    function tracked<T>(promise: Promise<T>): Promise<T> {
      return promise.then((result) => {
        completedFiles++;
        onProgress?.(completedFiles, totalFiles);
        return result;
      });
    }

    const notePromises = noteFiles.map((entry) =>
      tracked(
        FileService.read(entry.path).then((c) => parseNote(entry.path, c))
      )
    );

    const taskPromises = taskFiles.map((entry) =>
      tracked(
        FileService.read(entry.path).then((c) => parseTask(entry.path, c))
      )
    );

    const docPromises = docFiles.map((entry) =>
      tracked(FileService.read(entry.path).then((c) => parseDoc(entry.path, c)))
    );

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

    // Build image index (T6.4)
    void IndexService.buildImageIndex(rootPath);

    // Build backlinks
    buildBacklinks();

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

    // Build image index (T6.4)
    void IndexService.buildImageIndex(rootPath);

    // Build backlinks
    buildBacklinks();
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

    // Rebuild backlinks
    buildBacklinks();
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
   * Get closed (done/cancelled) tasks grouped by recency.
   */
  getGroupedClosedTasks: (): GroupedClosedTasks => {
    const today = getToday();
    const weekAgo = addDays(today, -7).getTime();
    const monthAgo = addDays(today, -30).getTime();

    const thisWeek: Task[] = [];
    const lastMonth: Task[] = [];
    const older: Task[] = [];

    for (const task of indexStore.tasks.values()) {
      if (task.status !== "done" && task.status !== "cancelled") continue;
      const t = task.modifiedAt.getTime();
      if (t >= weekAgo) {
        thisWeek.push(task);
      } else if (t >= monthAgo) {
        lastMonth.push(task);
      } else {
        older.push(task);
      }
    }

    const byModifiedDesc = (a: Task, b: Task) =>
      b.modifiedAt.getTime() - a.modifiedAt.getTime();
    thisWeek.sort(byModifiedDesc);
    lastMonth.sort(byModifiedDesc);
    older.sort(byModifiedDesc);

    return { thisWeek, lastMonth, older };
  },

  /**
   * Get tasks grouped for the right panel display.
   *
   * @param context - Current context state
   * @returns Grouped tasks
   */
  getGroupedTasks: (): GroupedTasks => {
    const openTasks = IndexService.getOpenTasks();
    const endOfThisWeek = getEndOfWeek();
    const endOfNextWeek = getEndOfNextWeek();
    const overdue: Task[] = [];
    const thisWeek: Task[] = [];
    const nextWeek: Task[] = [];
    const later: Task[] = [];

    for (const task of openTasks) {
      if (task.due) {
        if (isOverdue(task.due)) {
          overdue.push(task);
        } else if (task.due <= endOfThisWeek) {
          thisWeek.push(task);
        } else if (task.due <= endOfNextWeek) {
          nextWeek.push(task);
        } else {
          later.push(task);
        }
      } else {
        later.push(task);
      }
    }

    // Sort overdue by due date (most overdue first)
    overdue.sort((a, b) => (a.due ?? "").localeCompare(b.due ?? ""));

    // Sort this week and next week by due date
    thisWeek.sort((a, b) => (a.due ?? "").localeCompare(b.due ?? ""));
    nextWeek.sort((a, b) => (a.due ?? "").localeCompare(b.due ?? ""));

    return { overdue, thisWeek, nextWeek, later };
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
   * Look up an entity by its absolute path across all entity maps.
   */
  resolveEntityByPath: (path: string): Entity | null => {
    return (
      indexStore.notes.get(path) ??
      indexStore.tasks.get(path) ??
      indexStore.docs.get(path) ??
      null
    );
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
   * Full-text search across all entities.
   * Case-insensitive substring match against body content, titles, topics, and dates.
   * Results ordered by date (reverse chronological).
   */
  search: (query: string, filter: SearchFilter): SearchResult[] => {
    if (query.length < 2) return [];

    const lowerQuery = query.toLowerCase();
    const results: SearchResult[] = [];

    const entities: Entity[] = [];
    if (filter === "all" || filter === "notes") {
      entities.push(...indexStore.notes.values());
    }
    if (filter === "all" || filter === "tasks") {
      entities.push(...indexStore.tasks.values());
    }
    if (filter === "all" || filter === "docs") {
      entities.push(...indexStore.docs.values());
    }

    for (const entity of entities) {
      const matchedLines: string[] = [];
      const highlightRanges: [number, number, number][] = [];

      // Check title
      const title =
        entity.type === "note" ? (entity.title ?? entity.date) : entity.title;
      const titleLower = title.toLowerCase();
      const titleMatch = titleLower.includes(lowerQuery);

      // Check topics
      const topicMatch = entity.topics.some((t) =>
        t.toLowerCase().includes(lowerQuery)
      );

      // Check date
      const date =
        entity.type === "note"
          ? entity.date
          : entity.type === "task" || entity.type === "doc"
            ? entity.created
            : "";
      const dateMatch = date.includes(lowerQuery);

      // Check body content line by line
      const lines = entity.content.split("\n");
      for (const line of lines) {
        const lineLower = line.toLowerCase();
        let idx = lineLower.indexOf(lowerQuery);
        if (idx !== -1) {
          const lineIndex = matchedLines.length;
          matchedLines.push(line.trim());
          while (idx !== -1) {
            highlightRanges.push([lineIndex, idx, idx + lowerQuery.length]);
            idx = lineLower.indexOf(lowerQuery, idx + 1);
          }
        }
      }

      if (titleMatch || topicMatch || dateMatch || matchedLines.length > 0) {
        // If only metadata matched, add a context line
        if (matchedLines.length === 0 && lines[0]?.trim()) {
          matchedLines.push(lines[0].trim());
        }
        results.push({ entity, matchedLines, highlightRanges });
      }
    }

    // Sort by date, reverse chronological
    results.sort((a, b) => {
      const dateA = getEntitySortDate(a.entity);
      const dateB = getEntitySortDate(b.entity);
      return dateB.localeCompare(dateA);
    });

    return results;
  },

  /**
   * Parse image references from markdown content.
   * Matches `![alt](path)` and `![alt](path){width=N}` syntax.
   */
  parseImageRefs: (_entityPath: string, content: string): ImageRef[] => {
    const regex = /!\[([^\]]*)\]\(([^)]+)\)(?:\{width=(\d+)\})?/g;
    const refs: ImageRef[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      const ref: ImageRef = {
        alt: match[1] ?? "",
        relativePath: match[2] ?? "",
      };
      if (match[3]) {
        ref.width = parseInt(match[3], 10);
      }
      refs.push(ref);
    }
    return refs;
  },

  /**
   * Resolve a relative image path to an absolute path.
   */
  resolveImagePath: (relativePath: string, entityPath: string): string => {
    const entityDir = entityPath.substring(0, entityPath.lastIndexOf("/"));
    if (relativePath.startsWith("./")) {
      return `${entityDir}/${relativePath.slice(2)}`;
    }
    return `${entityDir}/${relativePath}`;
  },

  /**
   * Scan all .assets/ directories to discover image files on disk.
   */
  scanAssetDirectories: async (
    rootPath: string
  ): Promise<Map<string, ImageFile>> => {
    const imageFiles = new Map<string, ImageFile>();
    const imageExtensions = new Set(["png", "jpg", "jpeg", "gif", "webp"]);

    for (const subdir of ["notes", "tasks", "docs"]) {
      const dirPath = joinPath(rootPath, subdir);
      let entries: { name: string; path: string }[];
      try {
        entries = await FileService.list(dirPath);
      } catch {
        continue;
      }

      // Find .assets directories
      const assetDirs = entries.filter((e) => e.name.endsWith(".assets"));

      for (const assetDir of assetDirs) {
        // Derive parent entity path
        const entitySlug = assetDir.name.replace(/\.assets$/, "");
        const entityPath = joinPath(dirPath, `${entitySlug}.md`);

        let imageEntries: { name: string; path: string }[];
        try {
          imageEntries = await FileService.list(assetDir.path);
        } catch {
          continue;
        }

        for (const img of imageEntries) {
          const ext = img.name.split(".").pop()?.toLowerCase() ?? "";
          if (!imageExtensions.has(ext)) continue;

          imageFiles.set(img.path, {
            path: img.path,
            filename: img.name,
            entityPath,
            size: 0, // Size populated lazily if needed
            isOrphan: false, // Set during buildImageIndex
          });
        }
      }
    }

    return imageFiles;
  },

  /**
   * Build bidirectional image index from parsed entities and disk scan.
   * Called during buildIndex after entities are loaded.
   */
  buildImageIndex: async (rootPath: string): Promise<void> => {
    // 1. Scan disk for image files
    const imageFiles = await IndexService.scanAssetDirectories(rootPath);

    // 2. Build entity → images map from markdown references
    const entityToImages = new Map<string, string[]>();
    const imageToEntities = new Map<string, string[]>();
    const allReferencedImages = new Set<string>();

    const allEntities: Entity[] = [
      ...indexStore.notes.values(),
      ...indexStore.tasks.values(),
      ...indexStore.docs.values(),
    ];

    for (const entity of allEntities) {
      const refs = IndexService.parseImageRefs(entity.path, entity.content);
      if (refs.length === 0) continue;

      const imagePaths: string[] = [];
      for (const ref of refs) {
        const absPath = IndexService.resolveImagePath(
          ref.relativePath,
          entity.path
        );
        imagePaths.push(absPath);
        allReferencedImages.add(absPath);

        // Build reverse map
        const existing = imageToEntities.get(absPath);
        if (existing) {
          existing.push(entity.path);
        } else {
          imageToEntities.set(absPath, [entity.path]);
        }
      }
      entityToImages.set(entity.path, imagePaths);
    }

    // 3. Mark orphans: images on disk not referenced by their parent entity
    for (const [path, imageFile] of imageFiles) {
      if (!allReferencedImages.has(path)) {
        imageFile.isOrphan = true;
      }
    }

    // 4. Update store
    setIndexStore("imageFiles", imageFiles);
    setIndexStore("entityToImages", entityToImages);
    setIndexStore("imageToEntities", imageToEntities);
  },

  /**
   * Search images by filename, alt text, or parent entity name.
   * With empty query, returns all images.
   */
  searchImages: (query: string): ImageFile[] => {
    const images = Array.from(indexStore.imageFiles.values());

    if (!query || query.length === 0) {
      return images;
    }

    const lowerQuery = query.toLowerCase();

    return images.filter((img) => {
      // Match filename
      if (img.filename.toLowerCase().includes(lowerQuery)) return true;

      // Match parent entity name
      const entityName = img.entityPath
        .substring(img.entityPath.lastIndexOf("/") + 1)
        .replace(/\.md$/, "");
      if (entityName.toLowerCase().includes(lowerQuery)) return true;

      // Match alt text from references
      const refs = indexStore.imageToEntities.get(img.path);
      if (refs) {
        for (const entityPath of refs) {
          const entity =
            indexStore.notes.get(entityPath) ??
            indexStore.tasks.get(entityPath) ??
            indexStore.docs.get(entityPath);
          if (entity) {
            const imageRefs = IndexService.parseImageRefs(
              entityPath,
              entity.content
            );
            for (const ref of imageRefs) {
              const absPath = IndexService.resolveImagePath(
                ref.relativePath,
                entityPath
              );
              if (
                absPath === img.path &&
                ref.alt.toLowerCase().includes(lowerQuery)
              ) {
                return true;
              }
            }
          }
        }
      }

      return false;
    });
  },

  /**
   * Search for open TODOs across all entities.
   * Includes LogSeq-style TODOs (excluding DONE) and unchecked markdown checkboxes.
   * With empty/short query, returns all open TODOs.
   */
  searchTodos: (query: string): TodoSearchResult[] => {
    const results: TodoSearchResult[] = [];
    const lowerQuery = query.length >= 2 ? query.toLowerCase() : "";

    const allEntities: Entity[] = [
      ...indexStore.notes.values(),
      ...indexStore.tasks.values(),
      ...indexStore.docs.values(),
    ];

    for (const entity of allEntities) {
      const { todos, checkboxes } = parseTodosAndCheckboxes(entity.content);

      for (const todo of todos) {
        if (todo.state === "DONE") continue;
        if (lowerQuery && !todo.text.toLowerCase().includes(lowerQuery))
          continue;
        results.push({
          entity,
          text: todo.text,
          line: todo.line,
          lineNumber: todo.lineNumber,
          kind: todo.state,
        });
      }

      for (const cb of checkboxes) {
        if (lowerQuery && !cb.text.toLowerCase().includes(lowerQuery)) continue;
        results.push({
          entity,
          text: cb.text,
          line: cb.line,
          lineNumber: cb.lineNumber,
          kind: "checkbox",
        });
      }
    }

    // Sort by entity date desc, then line number asc
    results.sort((a, b) => {
      const dateA = getEntitySortDate(a.entity);
      const dateB = getEntitySortDate(b.entity);
      const dateCmp = dateB.localeCompare(dateA);
      if (dateCmp !== 0) return dateCmp;
      return a.lineNumber - b.lineNumber;
    });

    return results;
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
 * Build backlink index from all entities' wikilinks.
 * Scans every entity for [[type:slug]] references, resolves them,
 * and groups BacklinkEntry items by target path.
 */
function buildBacklinks(): void {
  const backlinkIndex = new Map<string, BacklinkEntry[]>();

  function processEntity(entity: Entity): void {
    const links = parseWikilinks(entity.content);
    if (links.length === 0) return;

    const sourceTitle =
      entity.type === "note" ? (entity.title ?? entity.date) : entity.title;
    const sourceDate = entity.type === "note" ? entity.date : entity.created;

    // Build a map of wikilink raw → context lines in one pass
    const linkRaws = new Set(links.map((l) => l.raw));
    const contextByRaw = new Map<string, string[]>();
    for (const line of entity.content.split("\n")) {
      for (const raw of linkRaws) {
        if (line.includes(raw)) {
          const ctx = contextByRaw.get(raw);
          const stripped = line.replace(/^[\s#>*-]+/, "").trim();
          if (ctx) {
            if (ctx.length < 2) ctx.push(stripped);
          } else {
            contextByRaw.set(raw, [stripped]);
          }
        }
      }
    }

    // Deduplicate targets within this entity
    const seen = new Set<string>();

    for (const link of links) {
      const resolved = IndexService.resolveWikilink(link);
      if (!resolved || resolved.path === entity.path) continue;
      if (seen.has(resolved.path)) continue;
      seen.add(resolved.path);

      const entry: BacklinkEntry = {
        sourcePath: entity.path,
        sourceType: entity.type,
        sourceTitle,
        sourceDate,
        contextLines: contextByRaw.get(link.raw) ?? [],
      };

      const existing = backlinkIndex.get(resolved.path);
      if (existing) {
        existing.push(entry);
      } else {
        backlinkIndex.set(resolved.path, [entry]);
      }
    }
  }

  for (const entity of indexStore.notes.values()) processEntity(entity);
  for (const entity of indexStore.tasks.values()) processEntity(entity);
  for (const entity of indexStore.docs.values()) processEntity(entity);

  setIndexStore("backlinkIndex", backlinkIndex);
}

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
 * Get a sortable date string from an entity.
 */
function getEntitySortDate(entity: Entity): string {
  if (entity.type === "note") return entity.date;
  if (entity.type === "task") return entity.created;
  if (entity.type === "doc") return entity.created;
  return "";
}

/**
 * Collect all topic references from an entity (frontmatter + body).
 */
export function collectAllTopics(entity: Entity): TopicRef[] {
  const topics = new Set<TopicRef>(
    entity.topics.map((t) => t.toLowerCase() as TopicRef)
  );
  const inlineTopics = parseTopicRefs(entity.content);
  for (const t of inlineTopics) {
    topics.add(t);
  }
  return Array.from(topics);
}
