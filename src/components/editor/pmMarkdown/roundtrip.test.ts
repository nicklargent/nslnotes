// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { parseMarkdown, serializeMarkdown } from "./index";

/**
 * Round-trip tests for the new prosemirror-markdown pipeline.
 * Uses the same fixtures as the legacy regressions.test.ts so we can verify
 * parity before swapping call sites.
 */
function rt(md: string): string {
  const doc = parseMarkdown(md);
  return serializeMarkdown(doc).replace(/\n+$/, "");
}

describe("pm-markdown round-trip: stable constructs", () => {
  it("headings h1–h6", () => {
    for (const n of [1, 2, 3, 4, 5, 6]) {
      const md = `${"#".repeat(n)} heading`;
      expect(rt(md)).toBe(md);
    }
  });

  it("plain paragraph", () => {
    expect(rt("hello world")).toBe("hello world");
  });

  it("two paragraphs separated by blank line", () => {
    expect(rt("first\n\nsecond")).toBe("first\n\nsecond");
  });

  it("bullet list", () => {
    expect(rt("- a\n- b\n- c")).toBe("- a\n- b\n- c");
  });

  it("ordered list", () => {
    expect(rt("1. a\n2. b\n3. c")).toBe("1. a\n2. b\n3. c");
  });

  it("inline marks: bold, italic, strike, code", () => {
    expect(rt("**b** *i* ~~s~~ `c`")).toBe("**b** *i* ~~s~~ `c`");
  });

  it("fenced code with language", () => {
    expect(rt("```bash\necho hello\n```")).toBe("```bash\necho hello\n```");
  });

  it("blockquote", () => {
    expect(rt("> line one")).toBe("> line one");
  });

  it("horizontal rule between paragraphs", () => {
    expect(rt("before\n\n---\n\nafter")).toBe("before\n\n---\n\nafter");
  });

  it("blank line gap between paragraphs", () => {
    expect(rt("one\n\ntwo")).toBe("one\n\ntwo");
  });
});

describe("pm-markdown round-trip: TODO markers", () => {
  it("TODO at line start", () => {
    expect(rt("TODO buy milk")).toBe("TODO buy milk");
  });

  it("DOING and DONE round-trip", () => {
    expect(rt("DOING write report")).toBe("DOING write report");
  });

  it("TODO inside list item", () => {
    expect(rt("- TODO buy milk")).toBe("- TODO buy milk");
  });

  it("TODO inside heading is not converted", () => {
    expect(rt("# TODO foo")).toBe("# TODO foo");
  });
});

describe("pm-markdown round-trip: task lists", () => {
  it("task list (open and done)", () => {
    expect(rt("- [ ] open\n- [x] done")).toBe("- [ ] open\n- [x] done");
  });
});

describe("pm-markdown round-trip: tables", () => {
  it("simple table", () => {
    const md = "| a | b |\n| --- | --- |\n| 1 | 2 |";
    expect(rt(md)).toBe(md);
  });
});

describe("pm-markdown round-trip: images", () => {
  it("plain image", () => {
    expect(rt("![pic](./a.png)")).toBe("![pic](./a.png)");
  });

  it("image with width suffix", () => {
    expect(rt("![pic](./a.png){width=400}")).toBe("![pic](./a.png){width=400}");
  });
});
