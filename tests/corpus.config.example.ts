/**
 * Copy this file to `tests/corpus.config.ts` (gitignored) and adjust.
 * The corpus round-trip test walks each directory and verifies that every
 * .md file survives htmlFromMarkdown → markdownFromHtml → htmlFromMarkdown
 * without changing.
 *
 * Each entry in `dirs` is an absolute path to a directory containing
 * `notes/`, `tasks/`, `docs/` subdirs (i.e. the root of an nslnotes vault).
 */
import type { CorpusConfig } from "./helpers/corpus";

export const corpus: CorpusConfig = {
  dirs: [
    // "/home/you/docs/nslnotes3",
    // "/home/you/docs/nslnotes2",
  ],
};
