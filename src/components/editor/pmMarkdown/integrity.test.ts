// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { parseMarkdown, roundTripDoc, checkRoundTrip } from "./index";
import { schema as pmSchema } from "./schema";
import { loadCorpus, collectMarkdown } from "../../../../tests/helpers/corpus";

/**
 * Tests for the save-integrity round-trip primitive (roundTrip.ts).
 *
 * `checkRoundTrip(doc)` is what approach A uses to detect that the live editor
 * doc holds content the markdown serializer cannot faithfully persist. The
 * calibration suites guard against false positives (clean content must report
 * ok); the crafted suite proves real loss is detected.
 */

// Stable markdown constructs — parsing each must yield a doc that survives the
// round trip unchanged. Mirrors the fixtures in roundtrip.test.ts.
const STABLE: Array<[string, string]> = [
  ["heading", "## heading"],
  ["paragraph", "hello world"],
  ["two paragraphs", "first\n\nsecond"],
  ["bullet list", "- a\n- b\n- c"],
  ["ordered list", "1. a\n2. b\n3. c"],
  ["inline marks", "**b** *i* ~~s~~ `c`"],
  ["fenced code", "```bash\necho hello\n```"],
  ["blockquote", "> line one"],
  ["horizontal rule", "before\n\n---\n\nafter"],
  ["task list", "- [ ] open\n- [x] done"],
  ["todo marker", "TODO buy milk"],
  ["simple table", "| a | b |\n| --- | --- |\n| 1 | 2 |"],
  ["image", "![pic](./a.png)"],
];

describe("checkRoundTrip: calibration (clean content reports ok)", () => {
  it.each(STABLE)("%s round-trips cleanly", (_label, md) => {
    const doc = parseMarkdown(md);
    expect(checkRoundTrip(doc).ok).toBe(true);
    expect(roundTripDoc(doc).ok).toBe(true);
  });
});

describe("checkRoundTrip: ignores block-structure churn (no false positives)", () => {
  // A loose list item with two paragraphs serializes such that markdown-it
  // (breaks: true) reparses it as one paragraph with a hard break. The text is
  // fully preserved — only a paragraph break became a line break — so this must
  // NOT warn. This is the edit-induced churn that fired constantly on real,
  // link/image-dense notes before the hard-break normalization.
  it("treats a paragraph break and a hard break as equivalent", () => {
    const doc = pmSchema.nodeFromJSON({
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "line one" }],
                },
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "line two" }],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(checkRoundTrip(doc).ok).toBe(true);
  });

  it("ignores trailing/leading whitespace markdown trims at textblock edges", () => {
    // A trailing space at the end of a line, or a leading space in a bullet, is
    // dropped on save by design — must not warn.
    const trailing = pmSchema.nodeFromJSON({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "foo " }] },
      ],
    });
    const leadingInBullet = pmSchema.nodeFromJSON({
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                { type: "paragraph", content: [{ type: "text", text: " a" }] },
              ],
            },
          ],
        },
      ],
    });
    expect(checkRoundTrip(trailing).ok).toBe(true);
    expect(checkRoundTrip(leadingInBullet).ok).toBe(true);
  });

  it("treats a transient empty nested bullet as no loss", () => {
    // Indenting a fresh empty bullet under "item 2" leaves a nested list with a
    // single empty item. The serializer drops it (an empty `- ` under text has
    // no faithful markdown form), so this must NOT warn.
    const doc = pmSchema.nodeFromJSON({
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "item 2" }],
                },
                {
                  type: "bulletList",
                  content: [
                    { type: "listItem", content: [{ type: "paragraph" }] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(checkRoundTrip(doc).ok).toBe(true);
  });

  it("treats a trailing flat empty bullet as no loss", () => {
    const doc = pmSchema.nodeFromJSON({
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                { type: "paragraph", content: [{ type: "text", text: "a" }] },
              ],
            },
            { type: "listItem", content: [{ type: "paragraph" }] },
          ],
        },
      ],
    });
    expect(checkRoundTrip(doc).ok).toBe(true);
  });

  it("treats two same-type lists split by a blank line as one list", () => {
    // "two bullets, cursor at end of first, Enter twice" leaves two separate
    // lists with an empty paragraph between; markdown reflows them into one list
    // on reload. Every item is preserved, so this is not loss.
    const split = pmSchema.nodeFromJSON({
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                { type: "paragraph", content: [{ type: "text", text: "a" }] },
              ],
            },
          ],
        },
        { type: "paragraph" },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                { type: "paragraph", content: [{ type: "text", text: "b" }] },
              ],
            },
          ],
        },
      ],
    });
    expect(checkRoundTrip(split).ok).toBe(true);
  });

  it("treats adjacent paragraphs and a hard-break paragraph as equivalent", () => {
    const twoParas = pmSchema.nodeFromJSON({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "a" }] },
        { type: "paragraph", content: [{ type: "text", text: "b" }] },
      ],
    });
    const oneParaHardBreak = pmSchema.nodeFromJSON({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "a" },
            { type: "hardBreak" },
            { type: "text", text: "b" },
          ],
        },
      ],
    });
    expect(checkRoundTrip(twoParas).ok).toBe(true);
    expect(checkRoundTrip(oneParaHardBreak).ok).toBe(true);
  });
});

describe("checkRoundTrip: detects real loss", () => {
  it("flags a table cell that holds block content (a list)", () => {
    // GFM table cells cannot hold block content; the serializer flattens the
    // cell to a single line, so the bullet list cannot survive a reload.
    const lossy = pmSchema.nodeFromJSON({
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableHeader",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "H" }],
                    },
                  ],
                },
              ],
            },
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "bulletList",
                      content: [
                        {
                          type: "listItem",
                          content: [
                            {
                              type: "paragraph",
                              content: [{ type: "text", text: "item" }],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    const result = checkRoundTrip(lossy);
    expect(result.ok).toBe(false);
    expect(result.detail).toBeTruthy();
  });

  it("flags a multi-line table cell (hard break)", () => {
    const lossy = pmSchema.nodeFromJSON({
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableHeader",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "H" }],
                    },
                  ],
                },
              ],
            },
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "paragraph",
                      content: [
                        { type: "text", text: "a" },
                        { type: "hardBreak" },
                        { type: "text", text: "b" },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(checkRoundTrip(lossy).ok).toBe(false);
  });
});

// Calibration against the user's real notes (if a corpus is configured): every
// real note, parsed into a doc, must report ok. This is the guard the plan calls
// for before relying on approach A's user-facing warning.
describe("checkRoundTrip: corpus calibration", async () => {
  const config = await loadCorpus();

  if (!config) {
    it.skip("skipped: no tests/corpus.config.ts", () => {});
    return;
  }

  for (const vaultRoot of config.dirs) {
    describe(vaultRoot, () => {
      const files = collectMarkdown(vaultRoot);

      if (files.length === 0) {
        it.skip("no markdown files found", () => {});
        return;
      }

      it.each(files)("$relPath reports ok", ({ body }) => {
        expect(checkRoundTrip(parseMarkdown(body)).ok).toBe(true);
      });
    });
  }
});
