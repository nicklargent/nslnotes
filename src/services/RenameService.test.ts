import { describe, it, expect } from "vitest";
import {
  transformFrontmatter,
  rewriteWikilinks,
  noteSlugSuffix,
} from "./RenameService";

describe("noteSlugSuffix", () => {
  it("strips date prefix from named-note slug", () => {
    expect(noteSlugSuffix("2026-03-10-meeting-notes")).toBe("meeting-notes");
  });

  it("returns empty string for daily-note slug", () => {
    expect(noteSlugSuffix("2026-03-10")).toBe("");
  });
});

describe("transformFrontmatter — same-type rename", () => {
  it("preserves frontmatter exactly when type unchanged", () => {
    const result = transformFrontmatter({
      source: {
        type: "task",
        status: "open",
        created: "2026-03-10",
        due: "2026-03-20",
        title: "Old slug",
        topics: ["#project"],
      },
      sourceType: "task",
      targetType: "task",
      targetDate: undefined,
    });
    if ("error" in result) throw new Error(result.error);
    expect(result.frontmatter).toEqual({
      type: "task",
      status: "open",
      created: "2026-03-10",
      due: "2026-03-20",
      title: "Old slug",
      topics: ["#project"],
    });
  });
});

describe("transformFrontmatter — task → doc", () => {
  it("stashes status and due under _task and sets type to doc", () => {
    const result = transformFrontmatter({
      source: {
        type: "task",
        status: "open",
        created: "2026-03-10",
        due: "2026-03-20",
        title: "My item",
      },
      sourceType: "task",
      targetType: "doc",
      targetDate: undefined,
    });
    if ("error" in result) throw new Error(result.error);
    expect(result.frontmatter["type"]).toBe("doc");
    expect(result.frontmatter["title"]).toBe("My item");
    expect(result.frontmatter["status"]).toBeUndefined();
    expect(result.frontmatter["due"]).toBeUndefined();
    expect(result.frontmatter["_task"]).toEqual({
      status: "open",
      due: "2026-03-20",
    });
  });

  it("returns error when doc has no title", () => {
    const result = transformFrontmatter({
      source: {
        type: "task",
        status: "open",
        created: "2026-03-10",
      },
      sourceType: "task",
      targetType: "doc",
      targetDate: undefined,
    });
    expect("error" in result).toBe(true);
  });
});

describe("transformFrontmatter — doc → task restores stash", () => {
  it("restores status and due from _task and removes the stash key", () => {
    const result = transformFrontmatter({
      source: {
        type: "doc",
        title: "My item",
        created: "2026-03-10",
        _task: { status: "done", due: "2026-03-22" },
      },
      sourceType: "doc",
      targetType: "task",
      targetDate: undefined,
    });
    if ("error" in result) throw new Error(result.error);
    expect(result.frontmatter["type"]).toBe("task");
    expect(result.frontmatter["status"]).toBe("done");
    expect(result.frontmatter["due"]).toBe("2026-03-22");
    expect(result.frontmatter["_task"]).toBeUndefined();
  });

  it("defaults status to open when no stash", () => {
    const result = transformFrontmatter({
      source: { type: "doc", title: "My item", created: "2026-03-10" },
      sourceType: "doc",
      targetType: "task",
      targetDate: undefined,
    });
    if ("error" in result) throw new Error(result.error);
    expect(result.frontmatter["status"]).toBe("open");
    expect(result.frontmatter["due"]).toBeUndefined();
  });
});

describe("transformFrontmatter — round-trip task → doc → task", () => {
  it("preserves status and due across the hop", () => {
    const original: Record<string, unknown> = {
      type: "task",
      status: "open",
      created: "2026-03-10",
      due: "2026-03-20",
      title: "Round trip",
    };
    const toDoc = transformFrontmatter({
      source: original,
      sourceType: "task",
      targetType: "doc",
      targetDate: undefined,
    });
    if ("error" in toDoc) throw new Error(toDoc.error);
    const backToTask = transformFrontmatter({
      source: toDoc.frontmatter,
      sourceType: "doc",
      targetType: "task",
      targetDate: undefined,
    });
    if ("error" in backToTask) throw new Error(backToTask.error);
    expect(backToTask.frontmatter["status"]).toBe("open");
    expect(backToTask.frontmatter["due"]).toBe("2026-03-20");
    expect(backToTask.frontmatter["_task"]).toBeUndefined();
  });
});

describe("transformFrontmatter — convert to note", () => {
  it("uses targetDate and drops created field", () => {
    const result = transformFrontmatter({
      source: {
        type: "doc",
        title: "Becoming a note",
        created: "2026-03-10",
        pinned: true,
      },
      sourceType: "doc",
      targetType: "note",
      targetDate: "2026-04-01",
    });
    if ("error" in result) throw new Error(result.error);
    expect(result.frontmatter["type"]).toBe("note");
    expect(result.frontmatter["date"]).toBe("2026-04-01");
    expect(result.frontmatter["created"]).toBeUndefined();
    expect(result.frontmatter["_doc"]).toEqual({ pinned: true });
    expect(result.frontmatter["pinned"]).toBeUndefined();
  });

  it("returns error when targetDate is missing", () => {
    const result = transformFrontmatter({
      source: { type: "doc", title: "T", created: "2026-03-10" },
      sourceType: "doc",
      targetType: "note",
      targetDate: undefined,
    });
    expect("error" in result).toBe(true);
  });

  it("restores date from _note stash on note → task → note round-trip", () => {
    const note: Record<string, unknown> = {
      type: "note",
      date: "2026-03-10",
      title: "From note",
    };
    const toTask = transformFrontmatter({
      source: note,
      sourceType: "note",
      targetType: "task",
      targetDate: undefined,
    });
    if ("error" in toTask) throw new Error(toTask.error);
    expect(toTask.frontmatter["_note"]).toEqual({ date: "2026-03-10" });
    // Restore back to note without explicit targetDate — should pick up stash
    const backToNote = transformFrontmatter({
      source: toTask.frontmatter,
      sourceType: "task",
      targetType: "note",
      targetDate: undefined,
    });
    if ("error" in backToNote) throw new Error(backToNote.error);
    expect(backToNote.frontmatter["date"]).toBe("2026-03-10");
    expect(backToNote.frontmatter["_note"]).toBeUndefined();
  });
});

describe("rewriteWikilinks", () => {
  it("rewrites a simple match", () => {
    const out = rewriteWikilinks(
      "See [[task:fix-bug]] for details.",
      "task",
      "fix-bug",
      "doc",
      "fix-bug"
    );
    expect(out).toBe("See [[doc:fix-bug]] for details.");
  });

  it("rewrites multiple matches on one line and preserves others", () => {
    const out = rewriteWikilinks(
      "[[task:foo]] and [[task:bar]] and [[task:foo]]",
      "task",
      "foo",
      "doc",
      "foo"
    );
    expect(out).toBe("[[doc:foo]] and [[task:bar]] and [[doc:foo]]");
  });

  it("does not rewrite inside fenced code blocks", () => {
    const input = [
      "Live ref: [[task:foo]]",
      "```",
      "Example: [[task:foo]]",
      "```",
      "Also live: [[task:foo]]",
    ].join("\n");
    const out = rewriteWikilinks(input, "task", "foo", "doc", "foo");
    expect(out).toBe(
      [
        "Live ref: [[doc:foo]]",
        "```",
        "Example: [[task:foo]]",
        "```",
        "Also live: [[doc:foo]]",
      ].join("\n")
    );
  });

  it("returns identical content when no match", () => {
    const input = "Nothing to rewrite here.";
    expect(rewriteWikilinks(input, "task", "foo", "doc", "foo")).toBe(input);
  });

  it("does not match longer slugs that share a prefix", () => {
    // The brackets terminate at ]] so [[task:fix-bug-extra]] is NOT a match for fix-bug.
    const out = rewriteWikilinks(
      "[[task:fix-bug-extra]]",
      "task",
      "fix-bug",
      "doc",
      "fix-bug"
    );
    expect(out).toBe("[[task:fix-bug-extra]]");
  });
});
