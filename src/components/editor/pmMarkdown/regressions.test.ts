// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { parseMarkdown, serializeMarkdown } from "./index";

/**
 * Regression suite for the new prosemirror-markdown pipeline. Mirrors the
 * legacy editor/regressions.test.ts assertions, validated against the new
 * parse/serialize functions.
 */
function rt(md: string): string {
  const doc = parseMarkdown(md);
  return serializeMarkdown(doc).replace(/\n+$/, "");
}

describe("pm-markdown round-trip: supported constructs are stable", () => {
  it("headings h1–h6", () => {
    for (const n of [1, 2, 3, 4, 5, 6]) {
      const md = `${"#".repeat(n)} heading`;
      expect(rt(md)).toBe(md);
    }
  });

  it("bullet list", () => {
    expect(rt("- a\n- b\n- c")).toBe("- a\n- b\n- c");
  });

  it("ordered list", () => {
    expect(rt("1. a\n2. b\n3. c")).toBe("1. a\n2. b\n3. c");
  });

  it("nested bullet list", () => {
    expect(rt("- top\n  - child\n    - grandchild\n- sibling")).toBe(
      "- top\n  - child\n    - grandchild\n- sibling"
    );
  });

  it("task list (open and done)", () => {
    expect(rt("- [ ] open\n- [x] done")).toBe("- [ ] open\n- [x] done");
  });

  it("inline marks: bold, em, strike, code", () => {
    expect(rt("**b** *i* ~~s~~ `c`")).toBe("**b** *i* ~~s~~ `c`");
  });

  it("markdown link is preserved as raw text", () => {
    expect(rt("See [docs](https://example.com).")).toBe(
      "See [docs](https://example.com)."
    );
  });

  it("wikilinks: doc, task, note", () => {
    expect(rt("[[doc:a]] [[task:b]] [[note:c]]")).toBe(
      "[[doc:a]] [[task:b]] [[note:c]]"
    );
  });

  it("image with width suffix", () => {
    expect(rt("![pic](./a.png){width=400}")).toBe("![pic](./a.png){width=400}");
  });

  it("fenced code with language", () => {
    expect(rt("```bash\necho hello\n```")).toBe("```bash\necho hello\n```");
  });

  it("blockquote", () => {
    expect(rt("> line one\n> line two")).toBe("> line one\n> line two");
  });

  it("horizontal rule between paragraphs", () => {
    expect(rt("before\n\n---\n\nafter")).toBe("before\n\n---\n\nafter");
  });

  it("blank line gap between paragraphs", () => {
    expect(rt("one\n\ntwo")).toBe("one\n\ntwo");
  });
});

describe("pm-markdown round-trip: regression guards", () => {
  it("TODO marker keeps exactly one space", () => {
    const md = "- TODO buy milk";
    expect(rt(md)).toBe(md);
    expect(rt(rt(md))).toBe(md);
  });

  it("DOING and DONE markers round-trip cleanly", () => {
    expect(rt("- DOING write report")).toBe("- DOING write report");
    expect(rt("- DONE old task")).toBe("- DONE old task");
  });

  it("standalone TODO paragraph round-trips", () => {
    expect(rt("TODO item 1")).toBe("TODO item 1");
  });

  it("standalone DOING and DONE paragraphs round-trip", () => {
    expect(rt("DOING ship feature")).toBe("DOING ship feature");
    expect(rt("DONE archive notes")).toBe("DONE archive notes");
  });

  it("two standalone TODO paragraphs separated by a blank line round-trip", () => {
    expect(rt("TODO item 1\n\nTODO item 2")).toBe("TODO item 1\n\nTODO item 2");
  });

  it("TODO inside a heading is not converted to a marker", () => {
    expect(rt("# TODO foo")).toBe("# TODO foo");
  });

  it("image as direct child of a list item is preserved", () => {
    expect(rt("- parent\n  - ![pic](./foo.png)")).toBe(
      "- parent\n  - ![pic](./foo.png)"
    );
  });

  it("fenced code preserves bash `[[` without stripping", () => {
    expect(rt("```bash\nif [[ -t 1 ]]; then echo tty; fi\n```")).toBe(
      "```bash\nif [[ -t 1 ]]; then echo tty; fi\n```"
    );
  });

  it("inline code inside table cells survives", () => {
    expect(rt("| a | b |\n| --- | --- |\n| `code` | **bold** |")).toBe(
      "| a | b |\n| --- | --- |\n| `code` | **bold** |"
    );
  });

  it("escaped pipe inside a table cell is preserved", () => {
    expect(rt("| cmd | desc |\n| --- | --- |\n| `a \\| b` | plain |")).toBe(
      "| cmd | desc |\n| --- | --- |\n| `a \\| b` | plain |"
    );
  });

  it("ordered-list item with a second paragraph", () => {
    expect(rt("1. first\n\n   more\n2. second")).toBe(
      "1. first\n\n   more\n2. second"
    );
  });

  it("nested bullet under an ordered item", () => {
    expect(rt("1. first\n   - child\n2. second")).toBe(
      "1. first\n   - child\n2. second"
    );
  });

  it("plain bullet under a task is promoted to taskItem (canonical form is stable)", () => {
    const canonical = "- [ ] parent\n  - [ ] plain";
    expect(rt("- [ ] parent\n  - plain")).toBe(canonical);
    expect(rt(canonical)).toBe(canonical);
  });

  it("heading immediately followed by paragraph (no blank line) round-trips", () => {
    // Regression: serializer emitted `\n\n` between every block, so editing
    // a tight `## H\nline 1\nline 2` in the editor would inject a blank line
    // on save.
    const md = "## Heading\nline 1\nline 2";
    expect(rt(md)).toBe(md);
  });

  it("paragraph followed by horizontal rule keeps the rule a rule", () => {
    // Without a blank line `paragraph\n---` would re-parse as a setext h2.
    // The serializer must force the blank-line separator before a horizontal
    // rule even though it's tightening other adjacent blocks.
    const md = "before\n\n---\n\nafter";
    expect(rt(md)).toBe(md);
  });

  it("blank lines inside list items become empty-paragraph spacers", () => {
    // Regression: blankLineGapsPlugin only ran at top level, so a blank
    // line between a paragraph and a code block inside a listItem produced
    // no spacer node. The editor then rendered the two flush against each
    // other, and TipTap's exitCode behaviour injected stray paragraphs as
    // the cursor passed through. Spacers are now inserted at every level.
    const md = "- bullet 2\n\n  ```plaintext\n  code about bullet 2\n  ```";
    const doc = parseMarkdown(md);
    // Find the listItem and confirm it has an empty-paragraph spacer
    const list = doc.firstChild!;
    expect(list.type.name).toBe("bulletList");
    const item = list.firstChild!;
    const childTypes: string[] = [];
    item.forEach((c) => {
      if (c.type.name === "paragraph" && c.content.size === 0) {
        childTypes.push("paragraph(empty)");
      } else {
        childTypes.push(c.type.name);
      }
    });
    expect(childTypes).toEqual(["paragraph", "paragraph(empty)", "codeBlock"]);
    expect(rt(md)).toBe(md);
  });

  it("nested mixed list under a plain bullet keeps both layers", () => {
    // Regression: previously the inner mixed list (plain + task) was dropped
    // because the parser only split mixed lists at the top level, leaving an
    // invalid bulletList containing a taskItem that PM rejected.
    const md = "- test\n  - test2\n  - [ ] check 4\n- bullet 2";
    expect(rt(md)).toBe(md);
  });

  it("h4–h6 headings survive round-trip", () => {
    expect(rt("#### h4\n\nbody")).toBe("#### h4\n\nbody");
    expect(rt("##### h5")).toBe("##### h5");
    expect(rt("###### h6")).toBe("###### h6");
  });

  it("blank lines between adjacent top-level bullets don't drop content", () => {
    // markdown-it merges adjacent same-marker lists, so the blank gap ends up
    // between two list_items inside one bullet_list. The blank-line-gaps
    // plugin used to insert an empty paragraph there — an invalid sibling of
    // listItem under bulletList — which made PM reject the whole list, leaving
    // an empty doc on reload.
    expect(rt("- a\n- b\n\n- c\n- d")).toBe("- a\n- b\n- c\n- d");
    expect(rt("- a\n\n\n- b")).toBe("- a\n- b");
    expect(rt("- a\n  - sub1\n\n- b\n  - sub2")).toBe(
      "- a\n  - sub1\n- b\n  - sub2"
    );
  });
});
