// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { htmlFromMarkdown } from "./markdownToHtml";
import { markdownFromHtml } from "./htmlToMarkdown";
import { loadCorpus, collectMarkdown } from "../../../tests/helpers/corpus";

/**
 * Round-trip every markdown file in the configured corpus through
 * htmlFromMarkdown → markdownFromHtml → htmlFromMarkdown and assert the
 * second-pass output matches the first pass. Any drift is a bug in either
 * the markdown renderer or the HTML-to-markdown serializer.
 *
 * To enable, copy tests/corpus.config.example.ts to tests/corpus.config.ts
 * and list your vault roots.
 */
describe("editor corpus round-trip", async () => {
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
        const html1 = htmlFromMarkdown(body);
        const md1 = markdownFromHtml(html1);
        const html2 = htmlFromMarkdown(md1);
        const md2 = markdownFromHtml(html2);
        // After one full round-trip the content should be a fixed point.
        expect(md2).toBe(md1);
      });
    });
  }
});
