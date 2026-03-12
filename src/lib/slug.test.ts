import { describe, it, expect } from "vitest";
import { generateSlug, generateUniqueSlugSync } from "./slug";

describe("generateSlug", () => {
  it("converts basic title to kebab-case", () => {
    expect(generateSlug("Hello World")).toBe("hello-world");
  });

  it("handles the exact example from requirements", () => {
    // FR-FS-030: "Hello World!" → "hello-world"
    expect(generateSlug("Hello World!")).toBe("hello-world");
  });

  it("converts to lowercase", () => {
    expect(generateSlug("UPPERCASE")).toBe("uppercase");
    expect(generateSlug("MixedCase")).toBe("mixedcase");
  });

  it("replaces spaces with hyphens", () => {
    expect(generateSlug("one two three")).toBe("one-two-three");
  });

  it("replaces underscores with hyphens", () => {
    expect(generateSlug("snake_case_name")).toBe("snake-case-name");
  });

  it("removes special characters", () => {
    expect(generateSlug("Hello! World?")).toBe("hello-world");
    expect(generateSlug("Test @#$% Value")).toBe("test-value");
    expect(generateSlug("fix(auth): bug #123")).toBe("fixauth-bug-123");
  });

  it("collapses multiple consecutive hyphens", () => {
    expect(generateSlug("one  two")).toBe("one-two");
    expect(generateSlug("one - two")).toBe("one-two");
    expect(generateSlug("one---two")).toBe("one-two");
  });

  it("removes leading hyphens", () => {
    expect(generateSlug("-leading")).toBe("leading");
    expect(generateSlug("---leading")).toBe("leading");
    expect(generateSlug(" leading")).toBe("leading");
  });

  it("removes trailing hyphens", () => {
    expect(generateSlug("trailing-")).toBe("trailing");
    expect(generateSlug("trailing---")).toBe("trailing");
    expect(generateSlug("trailing ")).toBe("trailing");
  });

  it("handles empty string", () => {
    expect(generateSlug("")).toBe("");
  });

  it("handles string with only special characters", () => {
    expect(generateSlug("!@#$%")).toBe("");
  });

  it("preserves numbers", () => {
    expect(generateSlug("version 2.0")).toBe("version-20");
    expect(generateSlug("2024 goals")).toBe("2024-goals");
    expect(generateSlug("task 123")).toBe("task-123");
  });

  it("handles unicode and accented characters", () => {
    // These get stripped since we only keep [a-z0-9-]
    expect(generateSlug("café")).toBe("caf");
    expect(generateSlug("naïve")).toBe("nave");
  });

  it("handles mixed spaces and hyphens", () => {
    expect(generateSlug("one - two - three")).toBe("one-two-three");
    expect(generateSlug("one  -  two")).toBe("one-two");
  });
});

describe("generateUniqueSlugSync", () => {
  it("returns base slug when no collisions", () => {
    const existing = ["other-file.md", "another-file.md"];
    expect(generateUniqueSlugSync("My Title", existing)).toBe("my-title");
  });

  it("appends -2 for first collision", () => {
    const existing = ["my-title.md"];
    expect(generateUniqueSlugSync("My Title", existing)).toBe("my-title-2");
  });

  it("increments suffix for subsequent collisions", () => {
    const existing = ["my-title.md", "my-title-2.md"];
    expect(generateUniqueSlugSync("My Title", existing)).toBe("my-title-3");
  });

  it("finds gaps in collision sequence", () => {
    const existing = ["my-title.md", "my-title-2.md", "my-title-4.md"];
    expect(generateUniqueSlugSync("My Title", existing)).toBe("my-title-3");
  });

  it("handles many collisions", () => {
    const existing = [
      "task.md",
      "task-2.md",
      "task-3.md",
      "task-4.md",
      "task-5.md",
    ];
    expect(generateUniqueSlugSync("Task", existing)).toBe("task-6");
  });

  it("ignores non-md files", () => {
    const existing = ["my-title.txt", "my-title.json"];
    expect(generateUniqueSlugSync("My Title", existing)).toBe("my-title");
  });

  it("handles empty file list", () => {
    expect(generateUniqueSlugSync("My Title", [])).toBe("my-title");
  });

  it("handles empty slug input", () => {
    // Empty title should fall back to "untitled"
    expect(generateUniqueSlugSync("", [])).toBe("untitled");
    expect(generateUniqueSlugSync("!!!", [])).toBe("untitled");
  });

  it("handles untitled collision", () => {
    const existing = ["untitled.md"];
    expect(generateUniqueSlugSync("", existing)).toBe("untitled-2");
  });

  it("distinguishes similar slugs correctly", () => {
    // "task-1" as a title (becomes "task-1") vs "task" with suffix 1
    const existing = ["task.md", "task-10.md"];
    expect(generateUniqueSlugSync("Task", existing)).toBe("task-2");
  });

  it("handles slugs ending in numbers", () => {
    // Title "Task 2" becomes "task-2", which looks like a suffix but isn't
    const existing = ["task-2.md"];
    // Since "task-2" exists as base, we'd need "task-2-2"
    // But our logic treats -2 as suffix of "task"
    // This is actually correct per spec - "task" doesn't exist
    // Let's verify the behavior
    expect(generateUniqueSlugSync("Task 2", existing)).toBe("task-2-2");
  });

  it("only treats -N suffix as collision if base exists", () => {
    // If only "task-2.md" exists (no "task.md"),
    // creating a new "Task" should give us "task" (no collision)
    // But we need to be careful: our parseSlugWithSuffix sees task-2 as task with suffix 2
    // This means creating "Task" would be "task", which is fine
    const existing = ["task-2.md"];
    expect(generateUniqueSlugSync("Task", existing)).toBe("task");
  });
});
