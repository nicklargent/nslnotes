// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { parseMarkdown, serializeMarkdown } from "./index";
import { loadCorpus, collectMarkdown } from "../../../../tests/helpers/corpus";

/**
 * Round-trip every markdown file in the configured corpus through
 * parseMarkdown → serializeMarkdown → parseMarkdown → serializeMarkdown
 * and assert the second-pass output matches the first pass. Catches any
 * round-trip non-idempotency in the new pipeline against real notes.
 */
describe("pm-markdown corpus round-trip", async () => {
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

      it.each(files)("$relPath", ({ body }) => {
        const md1 = serializeMarkdown(parseMarkdown(body)).replace(/\n+$/, "");
        const md2 = serializeMarkdown(parseMarkdown(md1)).replace(/\n+$/, "");
        // After one full round-trip the content should be a fixed point.
        expect(md2).toBe(md1);
      });
    });
  }
});
