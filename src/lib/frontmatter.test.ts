import { describe, it, expect } from "vitest";
import {
  parse,
  serialize,
  validateNote,
  validateTask,
  validateDoc,
  validateFrontmatter,
} from "./frontmatter";

describe("parse", () => {
  it("parses valid frontmatter", () => {
    const content = `---
type: note
date: 2026-03-10
---

Body content here.`;

    const result = parse(content);
    expect(result).not.toBeNull();
    expect(result?.frontmatter).toEqual({ type: "note", date: "2026-03-10" });
    expect(result?.body).toBe("Body content here.");
  });

  it("parses frontmatter with topics array", () => {
    const content = `---
type: note
date: 2026-03-10
topics:
  - "#project"
  - "@alice"
---

Content`;

    const result = parse(content);
    expect(result).not.toBeNull();
    expect(result?.frontmatter["topics"]).toEqual(["#project", "@alice"]);
  });

  it("handles empty body", () => {
    const content = `---
type: note
date: 2026-03-10
---
`;

    const result = parse(content);
    expect(result).not.toBeNull();
    expect(result?.body).toBe("");
  });

  it("returns null for content without frontmatter", () => {
    const content = "Just regular markdown content.";
    expect(parse(content)).toBeNull();
  });

  it("returns null for missing closing delimiter", () => {
    const content = `---
type: note
date: 2026-03-10

Body without closing delimiter`;

    expect(parse(content)).toBeNull();
  });

  it("returns null for empty frontmatter", () => {
    const content = `---
---

Body`;

    expect(parse(content)).toBeNull();
  });

  it("returns null for invalid YAML", () => {
    const content = `---
type: [invalid yaml
---

Body`;

    expect(parse(content)).toBeNull();
  });

  it("handles leading whitespace", () => {
    const content = `
---
type: note
date: 2026-03-10
---

Body`;

    const result = parse(content);
    expect(result).not.toBeNull();
    expect(result?.frontmatter["type"]).toBe("note");
  });

  it("handles multiline body content", () => {
    const content = `---
type: note
date: 2026-03-10
---

Line 1
Line 2

Paragraph 2`;

    const result = parse(content);
    expect(result?.body).toBe("Line 1\nLine 2\n\nParagraph 2");
  });
});

describe("serialize", () => {
  it("serializes frontmatter and body", () => {
    const frontmatter = { type: "note", date: "2026-03-10" };
    const body = "Body content here.";

    const result = serialize(frontmatter, body);

    expect(result).toContain("---\n");
    expect(result).toContain("type:");
    expect(result).toContain("date:");
    expect(result).toContain("Body content here.");
    expect(result.endsWith("\n")).toBe(true);
  });

  it("handles empty body", () => {
    const frontmatter = { type: "note", date: "2026-03-10" };

    const result = serialize(frontmatter, "");

    expect(result).toContain("---\n");
    expect(result.endsWith("---\n")).toBe(true);
  });

  it("serializes topics array", () => {
    const frontmatter = {
      type: "note",
      date: "2026-03-10",
      topics: ["#project", "@alice"],
    };

    const result = serialize(frontmatter, "Body");

    expect(result).toContain("#project");
    expect(result).toContain("@alice");
  });

  it("round-trips parse -> serialize -> parse", () => {
    const original = `---
type: note
date: 2026-03-10
title: Test Note
---

Body content.`;

    const parsed = parse(original);
    expect(parsed).not.toBeNull();

    const serialized = serialize(parsed!.frontmatter, parsed!.body);
    const reparsed = parse(serialized);

    expect(reparsed).not.toBeNull();
    expect(reparsed?.frontmatter).toEqual(parsed?.frontmatter);
    expect(reparsed?.body).toBe(parsed?.body);
  });
});

describe("validateNote", () => {
  it("validates valid note frontmatter", () => {
    const frontmatter = {
      type: "note",
      date: "2026-03-10",
    };

    const result = validateNote(frontmatter);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data.type).toBe("note");
      expect(result.data.date).toBe("2026-03-10");
    }
  });

  it("validates note with optional fields", () => {
    const frontmatter = {
      type: "note",
      date: "2026-03-10",
      title: "My Note",
      topics: ["#project", "@alice"],
    };

    const result = validateNote(frontmatter);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data.title).toBe("My Note");
      expect(result.data.topics).toEqual(["#project", "@alice"]);
    }
  });

  it("rejects missing type", () => {
    const frontmatter = { date: "2026-03-10" };

    const result = validateNote(frontmatter);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.field === "type")).toBe(true);
    }
  });

  it("rejects invalid date format", () => {
    const frontmatter = { type: "note", date: "March 10, 2026" };

    const result = validateNote(frontmatter);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.field === "date")).toBe(true);
    }
  });

  it("rejects invalid topic format", () => {
    const frontmatter = {
      type: "note",
      date: "2026-03-10",
      topics: ["invalid-topic"],
    };

    const result = validateNote(frontmatter);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.field === "topics")).toBe(true);
    }
  });
});

describe("validateTask", () => {
  it("validates valid task frontmatter", () => {
    const frontmatter = {
      type: "task",
      status: "open",
      created: "2026-03-10",
    };

    const result = validateTask(frontmatter);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data.type).toBe("task");
      expect(result.data.status).toBe("open");
      expect(result.data.created).toBe("2026-03-10");
    }
  });

  it("validates task with all optional fields", () => {
    const frontmatter = {
      type: "task",
      status: "open",
      created: "2026-03-10",
      due: "2026-03-15",
      title: "Fix bug",
      topics: ["#bugfix"],
    };

    const result = validateTask(frontmatter);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data.due).toBe("2026-03-15");
      expect(result.data.title).toBe("Fix bug");
      expect(result.data.topics).toEqual(["#bugfix"]);
    }
  });

  it("accepts done status", () => {
    const frontmatter = {
      type: "task",
      status: "done",
      created: "2026-03-10",
    };

    const result = validateTask(frontmatter);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data.status).toBe("done");
    }
  });

  it("accepts cancelled status", () => {
    const frontmatter = {
      type: "task",
      status: "cancelled",
      created: "2026-03-10",
    };

    const result = validateTask(frontmatter);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data.status).toBe("cancelled");
    }
  });

  it("rejects invalid status", () => {
    const frontmatter = {
      type: "task",
      status: "pending",
      created: "2026-03-10",
    };

    const result = validateTask(frontmatter);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.field === "status")).toBe(true);
    }
  });

  it("rejects invalid due date", () => {
    const frontmatter = {
      type: "task",
      status: "open",
      created: "2026-03-10",
      due: "next week",
    };

    const result = validateTask(frontmatter);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.field === "due")).toBe(true);
    }
  });
});

describe("validateDoc", () => {
  it("validates valid doc frontmatter", () => {
    const frontmatter = {
      type: "doc",
      title: "Project Guide",
      created: "2026-03-10",
    };

    const result = validateDoc(frontmatter);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data.type).toBe("doc");
      expect(result.data.title).toBe("Project Guide");
      expect(result.data.created).toBe("2026-03-10");
    }
  });

  it("validates doc with topics", () => {
    const frontmatter = {
      type: "doc",
      title: "Project Guide",
      created: "2026-03-10",
      topics: ["#project", "#documentation"],
    };

    const result = validateDoc(frontmatter);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data.topics).toEqual(["#project", "#documentation"]);
    }
  });

  it("rejects missing title", () => {
    const frontmatter = {
      type: "doc",
      created: "2026-03-10",
    };

    const result = validateDoc(frontmatter);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.field === "title")).toBe(true);
    }
  });

  it("rejects empty title", () => {
    const frontmatter = {
      type: "doc",
      title: "   ",
      created: "2026-03-10",
    };

    const result = validateDoc(frontmatter);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.field === "title")).toBe(true);
    }
  });

  it("rejects missing created date", () => {
    const frontmatter = {
      type: "doc",
      title: "Guide",
    };

    const result = validateDoc(frontmatter);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.field === "created")).toBe(true);
    }
  });
});

describe("validateFrontmatter", () => {
  it("detects and validates note type", () => {
    const frontmatter = { type: "note", date: "2026-03-10" };

    const result = validateFrontmatter(frontmatter);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data.type).toBe("note");
    }
  });

  it("detects and validates task type", () => {
    const frontmatter = { type: "task", status: "open", created: "2026-03-10" };

    const result = validateFrontmatter(frontmatter);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data.type).toBe("task");
    }
  });

  it("detects and validates doc type", () => {
    const frontmatter = { type: "doc", title: "Guide", created: "2026-03-10" };

    const result = validateFrontmatter(frontmatter);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data.type).toBe("doc");
    }
  });

  it("rejects unknown type", () => {
    const frontmatter = { type: "unknown", date: "2026-03-10" };

    const result = validateFrontmatter(frontmatter);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.field === "type")).toBe(true);
    }
  });

  it("rejects missing type", () => {
    const frontmatter = { date: "2026-03-10" };

    const result = validateFrontmatter(frontmatter);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.field === "type")).toBe(true);
    }
  });
});
