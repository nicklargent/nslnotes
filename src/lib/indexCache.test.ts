import { describe, it, expect, beforeEach, vi } from "vitest";
import { saveIndexCache, loadIndexCache, clearIndexCache } from "./indexCache";
import type { Note, Task, Doc } from "../types/entities";
import type { TopicRef, TopicDecoration } from "../types/topics";

// Mock localStorage
const storage = new Map<string, string>();
const localStorageMock = {
  getItem: vi.fn((key: string) => storage.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    storage.set(key, value);
  }),
  removeItem: vi.fn((key: string) => {
    storage.delete(key);
  }),
};

vi.stubGlobal("localStorage", localStorageMock);

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    type: "note",
    path: "/root/notes/2026-03-10.md",
    slug: "2026-03-10",
    topics: [],
    frontmatter: { date: "2026-03-10" },
    content: "Note content",
    modifiedAt: new Date("2026-03-10T12:00:00Z"),
    date: "2026-03-10",
    title: null,
    isDaily: true,
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    type: "task",
    path: "/root/tasks/my-task.md",
    slug: "my-task",
    topics: [],
    frontmatter: { status: "open", created: "2026-03-10" },
    content: "Task content",
    modifiedAt: new Date("2026-03-10T12:00:00Z"),
    status: "open",
    created: "2026-03-10",
    due: null,
    title: "My Task",
    ...overrides,
  };
}

function makeDoc(overrides: Partial<Doc> = {}): Doc {
  return {
    type: "doc",
    path: "/root/docs/my-doc.md",
    slug: "my-doc",
    topics: [],
    frontmatter: { title: "My Doc", created: "2026-03-10" },
    content: "Doc content",
    modifiedAt: new Date("2026-03-10T12:00:00Z"),
    title: "My Doc",
    created: "2026-03-10",
    pinned: false,
    ...overrides,
  };
}

describe("indexCache", () => {
  beforeEach(() => {
    storage.clear();
    vi.clearAllMocks();
  });

  describe("saveIndexCache / loadIndexCache round-trip", () => {
    it("saves and loads notes, tasks, docs, and topicsYaml", () => {
      const notes = new Map([["/root/notes/2026-03-10.md", makeNote()]]);
      const tasks = new Map([["/root/tasks/my-task.md", makeTask()]]);
      const docs = new Map([["/root/docs/my-doc.md", makeDoc()]]);
      const topicsYaml = new Map<TopicRef, TopicDecoration>([
        [
          "#project" as TopicRef,
          { id: "#project" as TopicRef, label: "Project" },
        ],
      ]);

      saveIndexCache(notes, tasks, docs, topicsYaml);
      const loaded = loadIndexCache();

      expect(loaded).not.toBeNull();
      expect(loaded!.notes.size).toBe(1);
      expect(loaded!.tasks.size).toBe(1);
      expect(loaded!.docs.size).toBe(1);
      expect(loaded!.topicsYaml.size).toBe(1);
    });

    it("preserves entity data through round-trip", () => {
      const note = makeNote({
        title: "Test Note",
        topics: ["#work" as TopicRef],
      });
      const notes = new Map([[note.path, note]]);
      const tasks = new Map<string, Task>();
      const docs = new Map<string, Doc>();
      const topicsYaml = new Map<TopicRef, TopicDecoration>();

      saveIndexCache(notes, tasks, docs, topicsYaml);
      const loaded = loadIndexCache();

      const loadedNote = loaded!.notes.get(note.path);
      expect(loadedNote!.title).toBe("Test Note");
      expect(loadedNote!.topics).toEqual(["#work"]);
      expect(loadedNote!.content).toBe("Note content");
      expect(loadedNote!.slug).toBe("2026-03-10");
    });

    it("rehydrates Date objects for modifiedAt", () => {
      const notes = new Map([["/root/notes/2026-03-10.md", makeNote()]]);
      const tasks = new Map<string, Task>();
      const docs = new Map<string, Doc>();
      const topicsYaml = new Map<TopicRef, TopicDecoration>();

      saveIndexCache(notes, tasks, docs, topicsYaml);
      const loaded = loadIndexCache();

      const loadedNote = loaded!.notes.get("/root/notes/2026-03-10.md");
      expect(loadedNote!.modifiedAt).toBeInstanceOf(Date);
      expect(loadedNote!.modifiedAt.toISOString()).toBe(
        "2026-03-10T12:00:00.000Z"
      );
    });

    it("rehydrates Date objects for tasks", () => {
      const tasks = new Map([["/root/tasks/my-task.md", makeTask()]]);
      const notes = new Map<string, Note>();
      const docs = new Map<string, Doc>();
      const topicsYaml = new Map<TopicRef, TopicDecoration>();

      saveIndexCache(notes, tasks, docs, topicsYaml);
      const loaded = loadIndexCache();

      const loadedTask = loaded!.tasks.get("/root/tasks/my-task.md");
      expect(loadedTask!.modifiedAt).toBeInstanceOf(Date);
    });
  });

  describe("loadIndexCache", () => {
    it("returns null when no cache exists", () => {
      expect(loadIndexCache()).toBeNull();
    });

    it("returns null for invalid JSON", () => {
      storage.set("nslnotes-index-cache", "not valid json{{{");
      expect(loadIndexCache()).toBeNull();
    });

    it("returns null for wrong version", () => {
      storage.set(
        "nslnotes-index-cache",
        JSON.stringify({
          version: 999,
          timestamp: Date.now(),
          notes: [],
          tasks: [],
          docs: [],
          topicsYaml: [],
        })
      );
      expect(loadIndexCache()).toBeNull();
    });

    it("returns null for stale cache (>1 hour)", () => {
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
      storage.set(
        "nslnotes-index-cache",
        JSON.stringify({
          version: 1,
          timestamp: twoHoursAgo,
          notes: [],
          tasks: [],
          docs: [],
          topicsYaml: [],
        })
      );
      expect(loadIndexCache()).toBeNull();
    });

    it("returns cache that is less than 1 hour old", () => {
      const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
      storage.set(
        "nslnotes-index-cache",
        JSON.stringify({
          version: 1,
          timestamp: thirtyMinutesAgo,
          notes: [],
          tasks: [],
          docs: [],
          topicsYaml: [],
        })
      );
      const result = loadIndexCache();
      expect(result).not.toBeNull();
      expect(result!.notes.size).toBe(0);
    });
  });

  describe("clearIndexCache", () => {
    it("removes cache from localStorage", () => {
      const notes = new Map([["/root/notes/2026-03-10.md", makeNote()]]);
      const tasks = new Map<string, Task>();
      const docs = new Map<string, Doc>();
      const topicsYaml = new Map<TopicRef, TopicDecoration>();

      saveIndexCache(notes, tasks, docs, topicsYaml);
      expect(loadIndexCache()).not.toBeNull();

      clearIndexCache();
      expect(loadIndexCache()).toBeNull();
    });
  });

  describe("edge cases", () => {
    it("handles empty maps", () => {
      const notes = new Map<string, Note>();
      const tasks = new Map<string, Task>();
      const docs = new Map<string, Doc>();
      const topicsYaml = new Map<TopicRef, TopicDecoration>();

      saveIndexCache(notes, tasks, docs, topicsYaml);
      const loaded = loadIndexCache();

      expect(loaded).not.toBeNull();
      expect(loaded!.notes.size).toBe(0);
      expect(loaded!.tasks.size).toBe(0);
      expect(loaded!.docs.size).toBe(0);
      expect(loaded!.topicsYaml.size).toBe(0);
    });

    it("handles multiple entities", () => {
      const notes = new Map([
        ["/root/notes/2026-03-10.md", makeNote()],
        [
          "/root/notes/2026-03-11.md",
          makeNote({
            path: "/root/notes/2026-03-11.md",
            slug: "2026-03-11",
            date: "2026-03-11",
          }),
        ],
      ]);
      const tasks = new Map([
        [
          "/root/tasks/task-1.md",
          makeTask({
            path: "/root/tasks/task-1.md",
            slug: "task-1",
            title: "Task 1",
          }),
        ],
        [
          "/root/tasks/task-2.md",
          makeTask({
            path: "/root/tasks/task-2.md",
            slug: "task-2",
            title: "Task 2",
          }),
        ],
      ]);
      const docs = new Map<string, Doc>();
      const topicsYaml = new Map<TopicRef, TopicDecoration>();

      saveIndexCache(notes, tasks, docs, topicsYaml);
      const loaded = loadIndexCache();

      expect(loaded!.notes.size).toBe(2);
      expect(loaded!.tasks.size).toBe(2);
    });

    it("silently handles localStorage setItem failure", () => {
      localStorageMock.setItem.mockImplementationOnce(() => {
        throw new Error("QuotaExceededError");
      });

      const notes = new Map([["/root/notes/2026-03-10.md", makeNote()]]);
      const tasks = new Map<string, Task>();
      const docs = new Map<string, Doc>();
      const topicsYaml = new Map<TopicRef, TopicDecoration>();

      // Should not throw
      expect(() =>
        saveIndexCache(notes, tasks, docs, topicsYaml)
      ).not.toThrow();
    });
  });
});
