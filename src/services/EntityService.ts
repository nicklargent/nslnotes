import { FileService } from "./FileService";
import { IndexService } from "./IndexService";
import { ImageService } from "./ImageService";
import { NavigationService } from "./NavigationService";
import { SettingsService } from "./SettingsService";
import { serialize, parse } from "../lib/frontmatter";
import { generateSlug, generateUniqueSlug } from "../lib/slug";
import { getTodayISO } from "../lib/dates";
import { runtime } from "../lib/runtime";
import { indexStore } from "../stores/indexStore";
import { contextStore, setContextStore } from "../stores/contextStore";
import type { Note, Task, Doc } from "../types/entities";
import type { TopicRef } from "../types/topics";

/**
 * EntityService handles CRUD operations for all entity types (Design §6.3).
 */
export const EntityService = {
  /**
   * Delete an entity file and remove it from the index.
   */
  deleteEntity: async (path: string): Promise<void> => {
    const rootPath = await SettingsService.getRootPath();
    if (!rootPath) return;

    await FileService.delete(path);
    await IndexService.invalidate(path, rootPath);

    // Delete the associated .assets/ directory if it exists
    const assetsDir = ImageService.getAssetsDir(path);
    if (await runtime.exists(assetsDir)) {
      // Remove image index entries for images in this assets dir
      const imageEntries = [...indexStore.imageFiles.keys()].filter((imgPath) =>
        imgPath.startsWith(assetsDir + "/")
      );
      for (const imgPath of imageEntries) {
        indexStore.imageFiles.delete(imgPath);
        indexStore.imageToEntities.delete(imgPath);
      }
      indexStore.entityToImages.delete(path);

      await runtime.deleteDirectory(assetsDir);
    }

    if (contextStore.activeEntity?.path === path) {
      NavigationService.goHome();
    }
  },

  /**
   * Generic frontmatter updater — reads file, merges updates, writes back, invalidates index.
   */
  updateFrontmatter: async (
    path: string,
    updates: Record<string, unknown>
  ): Promise<void> => {
    const rootPath = await SettingsService.getRootPath();
    if (!rootPath) return;
    const fileContent = await FileService.read(path);
    const parsed = parse(fileContent);
    if (!parsed) return;
    for (const [key, value] of Object.entries(updates)) {
      if (
        value === null ||
        value === undefined ||
        (Array.isArray(value) && value.length === 0)
      ) {
        delete parsed.frontmatter[key];
      } else {
        parsed.frontmatter[key] = value;
      }
    }
    const newContent = serialize(parsed.frontmatter, parsed.body);
    await FileService.write(path, newContent);
    await IndexService.invalidate(path, rootPath);

    // Refresh contextStore.activeEntity if it matches the updated path
    if (contextStore.activeEntity?.path === path) {
      const updated =
        indexStore.notes.get(path) ??
        indexStore.tasks.get(path) ??
        indexStore.docs.get(path) ??
        null;
      if (updated) {
        setContextStore("activeEntity", updated);
      }
    }
  },

  /**
   * Create a daily note for a given date (T6.1).
   * Returns existing note if already present.
   */
  createDailyNote: async (date: string): Promise<Note | null> => {
    const rootPath = await SettingsService.getRootPath();
    if (!rootPath) return null;

    const path = `${rootPath}/notes/${date}.md`;

    // Return existing note if present
    const existing = indexStore.notes.get(path);
    if (existing) return existing;

    const frontmatter: Record<string, unknown> = {
      type: "note",
      date,
    };

    const content = serialize(frontmatter, "");
    await FileService.write(path, content);
    await IndexService.invalidate(path, rootPath);

    return indexStore.notes.get(path) ?? null;
  },

  /**
   * Create a named note (T6.2).
   */
  createNamedNote: async (params: {
    date: string;
    title: string;
    topics?: TopicRef[];
  }): Promise<Note | null> => {
    const rootPath = await SettingsService.getRootPath();
    if (!rootPath) return null;

    const notesDir = `${rootPath}/notes`;
    const slug = await generateUniqueSlug(
      `${params.date}-${params.title}`,
      notesDir
    );
    const path = `${notesDir}/${slug}.md`;

    const frontmatter: Record<string, unknown> = {
      type: "note",
      date: params.date,
      title: params.title,
    };
    if (params.topics && params.topics.length > 0) {
      frontmatter["topics"] = params.topics;
    }

    const content = serialize(frontmatter, "");
    await FileService.write(path, content);
    await IndexService.invalidate(path, rootPath);

    return indexStore.notes.get(path) ?? null;
  },

  /**
   * Create a task (T6.3).
   */
  createTask: async (params: {
    title: string;
    due?: string | undefined;
    topics?: TopicRef[] | undefined;
    content?: string | undefined;
  }): Promise<Task | null> => {
    const rootPath = await SettingsService.getRootPath();
    if (!rootPath) return null;

    const tasksDir = `${rootPath}/tasks`;
    await runtime.ensureDirectory(tasksDir);
    const slug = await generateUniqueSlug(params.title, tasksDir);
    const path = `${tasksDir}/${slug}.md`;

    const frontmatter: Record<string, unknown> = {
      type: "task",
      title: params.title,
      status: "open",
      created: getTodayISO(),
    };
    if (params.due) {
      frontmatter["due"] = params.due;
    }
    if (params.topics && params.topics.length > 0) {
      frontmatter["topics"] = params.topics;
    }

    const body = params.content ?? "";
    const fileContent = serialize(frontmatter, body);
    await FileService.write(path, fileContent);
    await IndexService.invalidate(path, rootPath);

    return indexStore.tasks.get(path) ?? null;
  },

  /**
   * Update task status (T6.5).
   */
  updateTaskStatus: async (
    path: string,
    status: "open" | "done" | "cancelled"
  ): Promise<Task | null> => {
    const rootPath = await SettingsService.getRootPath();
    if (!rootPath) return null;

    const fileContent = await FileService.read(path);
    const parsed = parse(fileContent);
    if (!parsed) return null;

    parsed.frontmatter["status"] = status;
    const newContent = serialize(parsed.frontmatter, parsed.body);
    await FileService.write(path, newContent);
    await IndexService.invalidate(path, rootPath);

    return indexStore.tasks.get(path) ?? null;
  },

  /**
   * Create a doc (T6.6).
   */
  createDoc: async (params: {
    title: string;
    topics?: TopicRef[] | undefined;
    content?: string | undefined;
  }): Promise<Doc | null> => {
    const rootPath = await SettingsService.getRootPath();
    if (!rootPath) return null;

    const docsDir = `${rootPath}/docs`;
    await runtime.ensureDirectory(docsDir);
    const slug = await generateUniqueSlug(params.title, docsDir);
    const path = `${docsDir}/${slug}.md`;

    const frontmatter: Record<string, unknown> = {
      type: "doc",
      title: params.title,
      created: getTodayISO(),
    };
    if (params.topics && params.topics.length > 0) {
      frontmatter["topics"] = params.topics;
    }

    const body = params.content ?? "";
    const fileContent = serialize(frontmatter, body);
    await FileService.write(path, fileContent);
    await IndexService.invalidate(path, rootPath);

    return indexStore.docs.get(path) ?? null;
  },

  /**
   * Promote a TODO line to a task (T6.8).
   * Creates a task file and returns the slug for wikilink replacement.
   */
  promoteToTask: async (params: {
    todoText: string;
    slug?: string;
    sourceTopics: TopicRef[];
    body?: string;
    sourceEntityPath?: string;
  }): Promise<{ task: Task; slug: string } | null> => {
    const rootPath = await SettingsService.getRootPath();
    if (!rootPath) return null;

    const tasksDir = `${rootPath}/tasks`;
    await runtime.ensureDirectory(tasksDir);
    const slug = await generateUniqueSlug(
      params.slug ?? params.todoText,
      tasksDir
    );
    const path = `${tasksDir}/${slug}.md`;

    const frontmatter: Record<string, unknown> = {
      type: "task",
      title: params.todoText,
      status: "open",
      created: getTodayISO(),
    };
    if (params.sourceTopics.length > 0) {
      frontmatter["topics"] = params.sourceTopics;
    }

    // Copy images if body contains image references
    let body = params.body ?? "";
    if (body && params.sourceEntityPath && /!\[/.test(body)) {
      body = await ImageService.copyImagesForPromotion(
        params.sourceEntityPath,
        path,
        body
      );
    }

    const fileContent = serialize(frontmatter, body);
    await FileService.write(path, fileContent);
    await IndexService.invalidate(path, rootPath);

    const task = indexStore.tasks.get(path);
    if (!task) return null;
    return { task, slug };
  },

  /**
   * Promote a section to a doc (T6.9).
   * Creates a doc file with the promoted content.
   */
  promoteToDoc: async (params: {
    title: string;
    slug?: string;
    content: string;
    topics?: TopicRef[] | undefined;
    sourceEntityPath?: string;
  }): Promise<{ doc: Doc; slug: string } | null> => {
    const rootPath = await SettingsService.getRootPath();
    if (!rootPath) return null;

    const docsDir = `${rootPath}/docs`;
    await runtime.ensureDirectory(docsDir);
    const slug = await generateUniqueSlug(params.slug ?? params.title, docsDir);
    const path = `${docsDir}/${slug}.md`;

    const frontmatter: Record<string, unknown> = {
      type: "doc",
      title: params.title,
      created: getTodayISO(),
    };
    if (params.topics && params.topics.length > 0) {
      frontmatter["topics"] = params.topics;
    }

    // Copy images if content contains image references
    let content = params.content;
    if (content && params.sourceEntityPath && /!\[/.test(content)) {
      content = await ImageService.copyImagesForPromotion(
        params.sourceEntityPath,
        path,
        content
      );
    }

    const fileContent = serialize(frontmatter, content);
    await FileService.write(path, fileContent);
    await IndexService.invalidate(path, rootPath);

    const doc = indexStore.docs.get(path);
    if (!doc) return null;
    return { doc, slug };
  },

  /**
   * Promote selected text to a named note.
   * Creates a note file with the promoted content on the same date.
   */
  /**
   * Append text to today's daily note, creating it if needed.
   */
  appendToDailyNote: async (text: string): Promise<Note | null> => {
    const rootPath = await SettingsService.getRootPath();
    if (!rootPath) return null;

    const today = getTodayISO();
    const path = `${rootPath}/notes/${today}.md`;

    const existing = indexStore.notes.get(path);
    if (existing) {
      const fileContent = await FileService.read(path);
      const parsed = parse(fileContent);
      if (!parsed) return null;
      const newBody = parsed.body ? `${parsed.body}\n\n${text}` : text;
      const newContent = serialize(parsed.frontmatter, newBody);
      await FileService.write(path, newContent);
      await IndexService.invalidate(path, rootPath);
      return indexStore.notes.get(path) ?? null;
    }

    const frontmatter: Record<string, unknown> = {
      type: "note",
      date: today,
    };
    const content = serialize(frontmatter, text);
    await FileService.write(path, content);
    await IndexService.invalidate(path, rootPath);
    return indexStore.notes.get(path) ?? null;
  },

  promoteToNote: async (params: {
    title: string;
    slug?: string;
    date: string;
    sourceTopics: TopicRef[];
    body?: string;
    sourceEntityPath?: string;
  }): Promise<{ note: Note; slug: string } | null> => {
    const rootPath = await SettingsService.getRootPath();
    if (!rootPath) return null;

    const notesDir = `${rootPath}/notes`;
    const slug = await generateUniqueSlug(
      `${params.date}-${params.slug ?? generateSlug(params.title)}`,
      notesDir
    );
    const path = `${notesDir}/${slug}.md`;

    const frontmatter: Record<string, unknown> = {
      type: "note",
      date: params.date,
      title: params.title,
    };
    if (params.sourceTopics.length > 0) {
      frontmatter["topics"] = params.sourceTopics;
    }

    // Copy images if body contains image references
    let body = params.body ?? "";
    if (body && params.sourceEntityPath && /!\[/.test(body)) {
      body = await ImageService.copyImagesForPromotion(
        params.sourceEntityPath,
        path,
        body
      );
    }

    const fileContent = serialize(frontmatter, body);
    await FileService.write(path, fileContent);
    await IndexService.invalidate(path, rootPath);

    const note = indexStore.notes.get(path);
    if (!note) return null;
    return { note, slug };
  },
};
