import { describe, it, expect } from "vitest";
import { IndexService, collectAllTopics } from "./IndexService";
import type { Note, Task, Doc } from "../types/entities";
import type { TopicRef } from "../types/topics";

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    type: "note",
    path: "/root/notes/2026-03-10.md",
    slug: "2026-03-10",
    topics: [],
    frontmatter: { date: "2026-03-10" },
    content: "",
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
    content: "",
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
    content: "",
    modifiedAt: new Date("2026-03-10T12:00:00Z"),
    title: "My Doc",
    created: "2026-03-10",
    pinned: false,
    ...overrides,
  };
}

describe("IndexService.parseImageRefs", () => {
  it("parses basic image reference", () => {
    const content = "![alt text](./images/photo.png)";
    const refs = IndexService.parseImageRefs("/root/notes/note.md", content);
    expect(refs).toHaveLength(1);
    expect(refs[0]!.alt).toBe("alt text");
    expect(refs[0]!.relativePath).toBe("./images/photo.png");
    expect(refs[0]!.width).toBeUndefined();
  });

  it("parses image reference with width", () => {
    const content = "![screenshot](./img.png){width=400}";
    const refs = IndexService.parseImageRefs("/root/notes/note.md", content);
    expect(refs).toHaveLength(1);
    expect(refs[0]!.width).toBe(400);
  });

  it("parses multiple image references", () => {
    const content = `
Some text
![first](./a.png)
More text
![second](./b.jpg){width=200}
![third](./c.gif)
`;
    const refs = IndexService.parseImageRefs("/root/notes/note.md", content);
    expect(refs).toHaveLength(3);
    expect(refs[0]!.alt).toBe("first");
    expect(refs[1]!.alt).toBe("second");
    expect(refs[1]!.width).toBe(200);
    expect(refs[2]!.alt).toBe("third");
  });

  it("handles empty alt text", () => {
    const content = "![](./image.png)";
    const refs = IndexService.parseImageRefs("/root/notes/note.md", content);
    expect(refs).toHaveLength(1);
    expect(refs[0]!.alt).toBe("");
  });

  it("returns empty for content without images", () => {
    const content = "Just regular text [not an image](link)";
    const refs = IndexService.parseImageRefs("/root/notes/note.md", content);
    expect(refs).toHaveLength(0);
  });

  it("handles .assets directory paths", () => {
    const content = "![photo](./.assets/1711234567-photo.png)";
    const refs = IndexService.parseImageRefs("/root/notes/note.md", content);
    expect(refs).toHaveLength(1);
    expect(refs[0]!.relativePath).toBe("./.assets/1711234567-photo.png");
  });

  it("handles paths without leading ./", () => {
    const content = "![img](images/photo.png)";
    const refs = IndexService.parseImageRefs("/root/notes/note.md", content);
    expect(refs).toHaveLength(1);
    expect(refs[0]!.relativePath).toBe("images/photo.png");
  });
});

describe("IndexService.resolveImagePath", () => {
  it("resolves relative path with ./", () => {
    const result = IndexService.resolveImagePath(
      "./.assets/photo.png",
      "/root/notes/my-note.md"
    );
    expect(result).toBe("/root/notes/.assets/photo.png");
  });

  it("resolves relative path without ./", () => {
    const result = IndexService.resolveImagePath(
      ".assets/photo.png",
      "/root/notes/my-note.md"
    );
    expect(result).toBe("/root/notes/.assets/photo.png");
  });

  it("resolves subdirectory path", () => {
    const result = IndexService.resolveImagePath(
      "images/photo.png",
      "/root/notes/my-note.md"
    );
    expect(result).toBe("/root/notes/images/photo.png");
  });

  it("resolves for task entity paths", () => {
    const result = IndexService.resolveImagePath(
      "./.assets/img.jpg",
      "/root/tasks/my-task.md"
    );
    expect(result).toBe("/root/tasks/.assets/img.jpg");
  });

  it("resolves for doc entity paths", () => {
    const result = IndexService.resolveImagePath(
      "./.assets/diagram.png",
      "/root/docs/architecture.md"
    );
    expect(result).toBe("/root/docs/.assets/diagram.png");
  });
});

describe("collectAllTopics", () => {
  it("collects topics from frontmatter", () => {
    const entity = makeNote({
      topics: ["#work" as TopicRef, "@alice" as TopicRef],
    });
    const topics = collectAllTopics(entity);
    expect(topics).toContain("#work");
    expect(topics).toContain("@alice");
  });

  it("collects topics from body content", () => {
    const entity = makeNote({ content: "Working on #project with @bob" });
    const topics = collectAllTopics(entity);
    expect(topics).toContain("#project");
    expect(topics).toContain("@bob");
  });

  it("deduplicates topics from frontmatter and body", () => {
    const entity = makeNote({
      topics: ["#project" as TopicRef],
      content: "More about #project",
    });
    const topics = collectAllTopics(entity);
    const projectCount = topics.filter((t) => t === "#project").length;
    expect(projectCount).toBe(1);
  });

  it("lowercases frontmatter topics", () => {
    const entity = makeNote({ topics: ["#MyTopic" as TopicRef] });
    const topics = collectAllTopics(entity);
    expect(topics).toContain("#mytopic");
  });

  it("returns empty array when no topics", () => {
    const entity = makeNote({ topics: [], content: "no topics here" });
    const topics = collectAllTopics(entity);
    expect(topics).toHaveLength(0);
  });

  it("works with task entities", () => {
    const entity = makeTask({
      topics: ["#backend" as TopicRef],
      content: "Fix #api endpoint",
    });
    const topics = collectAllTopics(entity);
    expect(topics).toContain("#backend");
    expect(topics).toContain("#api");
  });

  it("works with doc entities", () => {
    const entity = makeDoc({
      topics: ["#design" as TopicRef],
      content: "Docs about #ui patterns",
    });
    const topics = collectAllTopics(entity);
    expect(topics).toContain("#design");
    expect(topics).toContain("#ui");
  });
});
