import { describe, it, expect } from "vitest";
import { parseNote, parseTask, parseDoc } from "./entityParser";

describe("parseNote", () => {
  it("parses a daily note", () => {
    const content = `---
type: "note"
date: "2026-03-10"
---
Today's notes`;
    const note = parseNote("/root/notes/2026-03-10.md", content);
    expect(note).not.toBeNull();
    expect(note!.type).toBe("note");
    expect(note!.slug).toBe("2026-03-10");
    expect(note!.date).toBe("2026-03-10");
    expect(note!.isDaily).toBe(true);
    expect(note!.title).toBeNull();
    expect(note!.content).toBe("Today's notes");
    expect(note!.path).toBe("/root/notes/2026-03-10.md");
  });

  it("parses a named note", () => {
    const content = `---
type: "note"
date: "2026-03-10"
title: "Meeting Notes"
topics:
  - "#project"
---
Discussion about project`;
    const note = parseNote("/root/notes/2026-03-10-meeting-notes.md", content);
    expect(note).not.toBeNull();
    expect(note!.slug).toBe("2026-03-10-meeting-notes");
    expect(note!.isDaily).toBe(false);
    expect(note!.title).toBe("Meeting Notes");
    expect(note!.topics).toEqual(["#project"]);
  });

  it("returns null for missing frontmatter", () => {
    expect(parseNote("/root/notes/test.md", "no frontmatter here")).toBeNull();
  });

  it("returns null for invalid note frontmatter (missing date)", () => {
    const content = `---
type: "note"
title: "No Date"
---
body`;
    expect(parseNote("/root/notes/test.md", content)).toBeNull();
  });

  it("returns null for wrong type field", () => {
    const content = `---
type: "task"
date: "2026-03-10"
---
body`;
    expect(parseNote("/root/notes/test.md", content)).toBeNull();
  });

  it("returns null for empty content", () => {
    expect(parseNote("/root/notes/test.md", "")).toBeNull();
  });

  it("extracts slug from nested path", () => {
    const content = `---
type: "note"
date: "2026-01-15"
---
content`;
    const note = parseNote("/deep/nested/path/notes/my-note.md", content);
    expect(note!.slug).toBe("my-note");
  });

  it("handles empty topics array", () => {
    const content = `---
type: "note"
date: "2026-03-10"
topics: []
---
content`;
    const note = parseNote("/root/notes/2026-03-10.md", content);
    expect(note!.topics).toEqual([]);
  });

  it("handles multiple topics", () => {
    const content = `---
type: "note"
date: "2026-03-10"
topics:
  - "#work"
  - "@alice"
  - "#meeting"
---
content`;
    const note = parseNote("/root/notes/2026-03-10-standup.md", content);
    expect(note!.topics).toEqual(["#work", "@alice", "#meeting"]);
  });

  it("sets modifiedAt to a Date", () => {
    const content = `---
type: "note"
date: "2026-03-10"
---
content`;
    const note = parseNote("/root/notes/2026-03-10.md", content);
    expect(note!.modifiedAt).toBeInstanceOf(Date);
  });

  it("preserves raw frontmatter", () => {
    const content = `---
type: "note"
date: "2026-03-10"
custom_field: "hello"
---
body`;
    const note = parseNote("/root/notes/2026-03-10.md", content);
    expect(note!.frontmatter["custom_field"]).toBe("hello");
  });
});

describe("parseTask", () => {
  it("parses a basic task", () => {
    const content = `---
type: "task"
status: open
created: "2026-03-10"
title: "Fix the bug"
---
Steps to reproduce`;
    const task = parseTask("/root/tasks/fix-the-bug.md", content);
    expect(task).not.toBeNull();
    expect(task!.type).toBe("task");
    expect(task!.slug).toBe("fix-the-bug");
    expect(task!.status).toBe("open");
    expect(task!.created).toBe("2026-03-10");
    expect(task!.title).toBe("Fix the bug");
    expect(task!.due).toBeNull();
    expect(task!.content).toBe("Steps to reproduce");
  });

  it("parses task with due date", () => {
    const content = `---
type: "task"
status: open
created: "2026-03-10"
title: "Ship feature"
due: "2026-03-20"
---
body`;
    const task = parseTask("/root/tasks/ship-feature.md", content);
    expect(task!.due).toBe("2026-03-20");
  });

  it("parses done task", () => {
    const content = `---
type: "task"
status: done
created: "2026-03-01"
title: "Completed task"
---
body`;
    const task = parseTask("/root/tasks/completed.md", content);
    expect(task!.status).toBe("done");
  });

  it("parses cancelled task", () => {
    const content = `---
type: "task"
status: cancelled
created: "2026-03-01"
title: "Cancelled task"
---
body`;
    const task = parseTask("/root/tasks/cancelled.md", content);
    expect(task!.status).toBe("cancelled");
  });

  it("derives title from first body line when no title in frontmatter", () => {
    const content = `---
type: "task"
status: open
created: "2026-03-10"
---
# My heading title

Rest of body`;
    const task = parseTask("/root/tasks/my-task.md", content);
    expect(task!.title).toBe("My heading title");
  });

  it("falls back to slug for title when body is empty", () => {
    const content = `---
type: "task"
status: open
created: "2026-03-10"
---
`;
    const task = parseTask("/root/tasks/my-task.md", content);
    expect(task!.title).toBe("my-task");
  });

  it("returns null for missing required fields", () => {
    const content = `---
type: "task"
title: "No status"
---
body`;
    expect(parseTask("/root/tasks/test.md", content)).toBeNull();
  });

  it("returns null for missing frontmatter", () => {
    expect(parseTask("/root/tasks/test.md", "no frontmatter")).toBeNull();
  });

  it("returns null for wrong type field", () => {
    const content = `---
type: "note"
status: open
created: "2026-03-10"
---
body`;
    expect(parseTask("/root/tasks/test.md", content)).toBeNull();
  });

  it("handles topics on tasks", () => {
    const content = `---
type: "task"
status: open
created: "2026-03-10"
title: "Task with topics"
topics:
  - "#backend"
  - "@bob"
---
body`;
    const task = parseTask("/root/tasks/task.md", content);
    expect(task!.topics).toEqual(["#backend", "@bob"]);
  });
});

describe("parseDoc", () => {
  it("parses a basic doc", () => {
    const content = `---
type: "doc"
title: "Architecture Guide"
created: "2026-03-01"
---
# Architecture

Details here`;
    const doc = parseDoc("/root/docs/architecture-guide.md", content);
    expect(doc).not.toBeNull();
    expect(doc!.type).toBe("doc");
    expect(doc!.slug).toBe("architecture-guide");
    expect(doc!.title).toBe("Architecture Guide");
    expect(doc!.created).toBe("2026-03-01");
    expect(doc!.pinned).toBe(false);
    expect(doc!.content).toContain("Details here");
  });

  it("parses pinned doc", () => {
    const content = `---
type: "doc"
title: "Important Doc"
created: "2026-03-01"
pinned: true
---
body`;
    const doc = parseDoc("/root/docs/important.md", content);
    expect(doc!.pinned).toBe(true);
  });

  it("defaults pinned to false when not specified", () => {
    const content = `---
type: "doc"
title: "Regular Doc"
created: "2026-03-01"
---
body`;
    const doc = parseDoc("/root/docs/regular.md", content);
    expect(doc!.pinned).toBe(false);
  });

  it("returns null for missing title", () => {
    const content = `---
type: "doc"
created: "2026-03-01"
---
body`;
    expect(parseDoc("/root/docs/test.md", content)).toBeNull();
  });

  it("returns null for missing created date", () => {
    const content = `---
type: "doc"
title: "No date"
---
body`;
    expect(parseDoc("/root/docs/test.md", content)).toBeNull();
  });

  it("returns null for missing frontmatter", () => {
    expect(parseDoc("/root/docs/test.md", "no frontmatter")).toBeNull();
  });

  it("returns null for wrong type field", () => {
    const content = `---
type: "note"
title: "Wrong type"
created: "2026-03-01"
---
body`;
    expect(parseDoc("/root/docs/test.md", content)).toBeNull();
  });

  it("handles topics on docs", () => {
    const content = `---
type: "doc"
title: "Design System"
created: "2026-03-01"
topics:
  - "#design"
  - "#frontend"
---
body`;
    const doc = parseDoc("/root/docs/design-system.md", content);
    expect(doc!.topics).toEqual(["#design", "#frontend"]);
  });

  it("preserves raw frontmatter", () => {
    const content = `---
type: "doc"
title: "Doc"
created: "2026-03-01"
custom: "value"
---
body`;
    const doc = parseDoc("/root/docs/doc.md", content);
    expect(doc!.frontmatter["custom"]).toBe("value");
  });
});
