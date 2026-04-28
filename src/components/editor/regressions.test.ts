// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { htmlFromMarkdown } from "./markdownToHtml";
import { markdownFromHtml } from "./htmlToMarkdown";

/**
 * Round-trip a markdown string through the editor (markdown → HTML →
 * markdown) and return what the serializer produces. This is the editor's
 * canonical form for the input.
 *
 * Tests below are split into:
 * - "stable" — input should equal its own round-trip. These pin that a
 *   supported construct survives untouched.
 * - "regression guards" — documents a specific bug we've fixed. Each test
 *   encodes the exact input/output pair that would have failed before the
 *   fix, so future regressions fail with a clear name.
 */
function rt(md: string): string {
  return markdownFromHtml(htmlFromMarkdown(md));
}

describe("round-trip: supported constructs are stable", () => {
  it("headings h1–h6", () => {
    for (const n of [1, 2, 3, 4, 5, 6]) {
      const md = `${"#".repeat(n)} heading`;
      expect(rt(md)).toBe(md);
    }
  });

  it("bullet list", () => {
    const md = "- a\n- b\n- c";
    expect(rt(md)).toBe(md);
  });

  it("ordered list", () => {
    const md = "1. a\n2. b\n3. c";
    expect(rt(md)).toBe(md);
  });

  it("nested bullet list", () => {
    const md = "- top\n  - child\n    - grandchild\n- sibling";
    expect(rt(md)).toBe(md);
  });

  it("task list (open and done)", () => {
    const md = "- [ ] open\n- [x] done";
    expect(rt(md)).toBe(md);
  });

  it("inline marks: bold, em, strike, code", () => {
    const md = "**b** *i* ~~s~~ `c`";
    expect(rt(md)).toBe(md);
  });

  it("markdown link", () => {
    const md = "See [docs](https://example.com).";
    expect(rt(md)).toBe(md);
  });

  it("wikilinks: doc, task, note", () => {
    const md = "[[doc:a]] [[task:b]] [[note:c]]";
    expect(rt(md)).toBe(md);
  });

  it("image with width suffix", () => {
    const md = "![pic](./a.png){width=400}";
    expect(rt(md)).toBe(md);
  });

  it("fenced code with language", () => {
    const md = "```bash\necho hello\n```";
    expect(rt(md)).toBe(md);
  });

  it("blockquote", () => {
    const md = "> line one\n> line two";
    expect(rt(md)).toBe(md);
  });

  it("horizontal rule between paragraphs", () => {
    const md = "before\n\n---\n\nafter";
    expect(rt(md)).toBe(md);
  });

  it("blank line gap between paragraphs", () => {
    const md = "one\n\ntwo";
    expect(rt(md)).toBe(md);
  });
});

describe("round-trip: regression guards", () => {
  it("TODO marker keeps exactly one space and doesn't grow on repeated passes", () => {
    // Bug: each round-trip inserted an extra space between TODO and content.
    const md = "- TODO buy milk";
    expect(rt(md)).toBe(md);
    expect(rt(rt(md))).toBe(md);
  });

  it("DOING and DONE markers round-trip cleanly", () => {
    expect(rt("- DOING write report")).toBe("- DOING write report");
    expect(rt("- DONE old task")).toBe("- DONE old task");
  });

  it("standalone TODO paragraph (no bullet) renders as a marker and round-trips", () => {
    // Bug: post-markdown-it refactor, free-standing TODO lines stopped
    // rendering as markers — only `- TODO` was recognized.
    const md = "TODO item 1";
    const html = htmlFromMarkdown(md);
    expect(html).toContain('data-todo="TODO"');
    expect(rt(md)).toBe(md);
  });

  it("standalone DOING and DONE paragraphs round-trip", () => {
    expect(rt("DOING ship feature")).toBe("DOING ship feature");
    expect(rt("DONE archive notes")).toBe("DONE archive notes");
  });

  it("two standalone TODO paragraphs separated by a blank line round-trip", () => {
    const md = "TODO item 1\n\nTODO item 2";
    expect(rt(md)).toBe(md);
  });

  it("TODO inside a heading is not converted to a marker", () => {
    // Only paragraph-context TODOs become markers; `# TODO foo` should
    // remain plain text inside the heading.
    const html = htmlFromMarkdown("# TODO foo");
    expect(html).not.toContain('data-todo="TODO"');
  });

  it("image as direct child of a list item is preserved", () => {
    // Bug: <img> has no children, so convert(imgElement) returned "" and the
    // image was silently dropped from the li.
    const md = "- parent\n  - ![pic](./foo.png)";
    expect(rt(md)).toBe(md);
  });

  it("fenced code preserves bash `[[` without stripping", () => {
    // Bug: the old wikilink pass used a naive global regex that mangled
    // bash code. The fence-aware pass now skips code content.
    const md = "```bash\nif [[ -t 1 ]]; then echo tty; fi\n```";
    expect(rt(md)).toBe(md);
  });

  it("inline code inside table cells survives", () => {
    // Bug: cells used textContent, stripping all inline marks.
    const md = "| a | b |\n| --- | --- |\n| `code` | **bold** |";
    expect(rt(md)).toBe(md);
  });

  it("table separator always normalizes to `| --- |`", () => {
    expect(rt("| a | b |\n| ---- | ------- |\n| 1 | 2 |")).toBe(
      "| a | b |\n| --- | --- |\n| 1 | 2 |"
    );
  });

  it("escaped pipe inside a table cell is preserved", () => {
    const md = "| cmd | desc |\n| --- | --- |\n| `a \\| b` | plain |";
    expect(rt(md)).toBe(md);
  });

  it("ordered-list item with a second paragraph uses 3-space continuation", () => {
    // Bug: 2-space continuation broke out of the list, causing md2 to
    // restart numbering at 1.
    const md = "1. first\n\n   more\n2. second";
    expect(rt(md)).toBe(md);
  });

  it("nested bullet under an ordered item uses 3-space indent", () => {
    const md = "1. first\n   - child\n2. second";
    expect(rt(md)).toBe(md);
  });

  it("plain bullet nested under a task is promoted to taskItem (canonical form is stable)", () => {
    // TipTap requires consistent children inside a taskItem, so plain
    // bullets under one are promoted. The first round-trip performs the
    // promotion; the second must be a fixed point.
    const canonical = "- [ ] parent\n  - [ ] plain";
    expect(rt("- [ ] parent\n  - plain")).toBe(canonical);
    expect(rt(canonical)).toBe(canonical);
  });

  it("h4–h6 headings survive round-trip (don't silently demote)", () => {
    // Bug: h4+ fell through the serializer switch, producing plain text
    // that then merged with the next paragraph via `breaks: true`.
    expect(rt("#### h4\n\nbody")).toBe("#### h4\n\nbody");
    expect(rt("##### h5")).toBe("##### h5");
    expect(rt("###### h6")).toBe("###### h6");
  });
});
