import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  saveIndexCache,
  loadIndexCache,
  clearIndexCache,
  clearAllIndexCaches,
} from "./indexCache";
import type { Note, Task, Doc } from "../types/entities";
import type { TopicRef, TopicDecoration } from "../types/topics";

// Mock localStorage with keys/length support (used by clearAllIndexCaches)
const storage = new Map<string, string>();
const localStorageMock = {
  getItem: vi.fn((key: string) => storage.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    storage.set(key, value);
  }),
  removeItem: vi.fn((key: string) => {
    storage.delete(key);
  }),
  key: vi.fn((index: number) => Array.from(storage.keys())[index] ?? null),
  get length() {
    return storage.size;
  },
};

vi.stubGlobal("localStorage", localStorageMock);

const NB = "nb-test-1";
const NB2 = "nb-test-2";

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    type: "note",
    path: "/root/notes/2026-03-10.md",
    slug: "2026-03-10",
    topics: [],
    frontmatter: { date: "2026-03-10" },
    content: "Note content",
    modifiedAt: new Date("2026-03-10T12:00:00Z"),
    hasUnchecked: false,
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
    hasUnchecked: false,
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
    hasUnchecked: false,
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

      saveIndexCache(NB, notes, tasks, docs, topicsYaml);
      const loaded = loadIndexCache(NB);

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

      saveIndexCache(NB, notes, tasks, docs, topicsYaml);
      const loaded = loadIndexCache(NB);

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

      saveIndexCache(NB, notes, tasks, docs, topicsYaml);
      const loaded = loadIndexCache(NB);

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

      saveIndexCache(NB, notes, tasks, docs, topicsYaml);
      const loaded = loadIndexCache(NB);

      const loadedTask = loaded!.tasks.get("/root/tasks/my-task.md");
      expect(loadedTask!.modifiedAt).toBeInstanceOf(Date);
    });
  });

  describe("loadIndexCache", () => {
    it("returns null when no cache exists", () => {
      expect(loadIndexCache(NB)).toBeNull();
    });

    it("returns null for invalid JSON", () => {
      storage.set(`nslnotes-index-cache:${NB}`, "not valid json{{{");
      expect(loadIndexCache(NB)).toBeNull();
    });

    it("returns null for wrong version", () => {
      storage.set(
        `nslnotes-index-cache:${NB}`,
        JSON.stringify({
          version: 999,
          timestamp: Date.now(),
          notes: [],
          tasks: [],
          docs: [],
          topicsYaml: [],
        })
      );
      expect(loadIndexCache(NB)).toBeNull();
    });

    it("returns null for stale cache (>1 hour)", () => {
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
      storage.set(
        `nslnotes-index-cache:${NB}`,
        JSON.stringify({
          version: 1,
          timestamp: twoHoursAgo,
          notes: [],
          tasks: [],
          docs: [],
          topicsYaml: [],
        })
      );
      expect(loadIndexCache(NB)).toBeNull();
    });

    it("returns cache that is less than 1 hour old", () => {
      const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
      storage.set(
        `nslnotes-index-cache:${NB}`,
        JSON.stringify({
          version: 1,
          timestamp: thirtyMinutesAgo,
          notes: [],
          tasks: [],
          docs: [],
          topicsYaml: [],
        })
      );
      const result = loadIndexCache(NB);
      expect(result).not.toBeNull();
      expect(result!.notes.size).toBe(0);
    });
  });

  describe("clearIndexCache", () => {
    it("removes the target notebook's cache from localStorage", () => {
      const notes = new Map([["/root/notes/2026-03-10.md", makeNote()]]);
      const tasks = new Map<string, Task>();
      const docs = new Map<string, Doc>();
      const topicsYaml = new Map<TopicRef, TopicDecoration>();

      saveIndexCache(NB, notes, tasks, docs, topicsYaml);
      expect(loadIndexCache(NB)).not.toBeNull();

      clearIndexCache(NB);
      expect(loadIndexCache(NB)).toBeNull();
    });
  });

  describe("per-notebook isolation", () => {
    it("two notebooks' caches do not collide", () => {
      const notesA = new Map([
        ["/a/notes/a.md", makeNote({ path: "/a/notes/a.md", slug: "a" })],
      ]);
      const notesB = new Map([
        ["/b/notes/b1.md", makeNote({ path: "/b/notes/b1.md", slug: "b1" })],
        ["/b/notes/b2.md", makeNote({ path: "/b/notes/b2.md", slug: "b2" })],
      ]);
      const empty = new Map();

      saveIndexCache(NB, notesA, empty, empty, empty);
      saveIndexCache(NB2, notesB, empty, empty, empty);

      const a = loadIndexCache(NB);
      const b = loadIndexCache(NB2);
      expect(a!.notes.size).toBe(1);
      expect(b!.notes.size).toBe(2);
    });

    it("clearing one notebook does not affect another", () => {
      const empty = new Map();
      const notes = new Map([
        ["/x/notes/x.md", makeNote({ path: "/x/notes/x.md" })],
      ]);

      saveIndexCache(NB, notes, empty, empty, empty);
      saveIndexCache(NB2, notes, empty, empty, empty);

      clearIndexCache(NB);

      expect(loadIndexCache(NB)).toBeNull();
      expect(loadIndexCache(NB2)).not.toBeNull();
    });

    it("clearAllIndexCaches removes all notebook caches", () => {
      const empty = new Map();
      const notes = new Map([
        ["/x/notes/x.md", makeNote({ path: "/x/notes/x.md" })],
      ]);
      saveIndexCache(NB, notes, empty, empty, empty);
      saveIndexCache(NB2, notes, empty, empty, empty);
      // An unrelated key should not be touched.
      storage.set("unrelated-key", "keep me");

      clearAllIndexCaches();

      expect(loadIndexCache(NB)).toBeNull();
      expect(loadIndexCache(NB2)).toBeNull();
      expect(storage.get("unrelated-key")).toBe("keep me");
    });
  });

  describe("edge cases", () => {
    it("handles empty maps", () => {
      const notes = new Map<string, Note>();
      const tasks = new Map<string, Task>();
      const docs = new Map<string, Doc>();
      const topicsYaml = new Map<TopicRef, TopicDecoration>();

      saveIndexCache(NB, notes, tasks, docs, topicsYaml);
      const loaded = loadIndexCache(NB);

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

      saveIndexCache(NB, notes, tasks, docs, topicsYaml);
      const loaded = loadIndexCache(NB);

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
        saveIndexCache(NB, notes, tasks, docs, topicsYaml)
      ).not.toThrow();
    });

    it("load/save with empty notebookId are no-ops", () => {
      const empty = new Map();
      saveIndexCache("", empty, empty, empty, empty);
      expect(loadIndexCache("")).toBeNull();
    });
  });
});
