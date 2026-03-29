#!/usr/bin/env npx tsx
/**
 * Convert Logseq files to NslNotes format.
 *
 * Usage: npx tsx scripts/convert-logseq.ts
 */

import * as fs from "fs";
import * as path from "path";
import { stringify as stringifyYaml } from "yaml";

// --- Config ---
const SOURCE = "/home/nsl/docs/logseq-copy";
const TARGET = "/home/nsl/docs/nslnotes2";

const SKIP_PAGES = new Set([
  "contents.md",
  "Templates.md",
  "Tasks Dashboard.md",
  "task.md",
  "Queries.md",
  "TODO draft cvi adr about new COAT direction and change in requirement about interstate.___.md",
]);

const SKIP_WIKILINKS = new Set([
  "todo", "now", "later", "done", "doing", "waiting",
  "priority categories", "templates", "tasks dashboard", "contents",
]);

/** Names that look like people but are actually topics */
const KNOWN_TOPICS = new Set(["progress check"]);

/** Heuristic: 1-3 capitalized words with only letters = person */
function classifyReference(name: string): "@" | "#" {
  if (KNOWN_TOPICS.has(name.toLowerCase())) return "#";
  return /^[A-Z][a-zA-Z']+(\s+[A-Z][a-zA-Z']+){0,2}$/.test(name) ? "@" : "#";
}

// --- Slug generation (mirrors src/lib/slug.ts) ---
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
}

// Track used slugs per directory for collision avoidance
const usedSlugs: Record<string, Set<string>> = {};

function uniqueSlug(title: string, dir: string): string {
  if (!usedSlugs[dir]) usedSlugs[dir] = new Set();
  const base = generateSlug(title) || "untitled";
  let slug = base;
  let n = 2;
  while (usedSlugs[dir].has(slug)) {
    slug = `${base}-${n}`;
    n++;
  }
  usedSlugs[dir].add(slug);
  return slug;
}

// --- Frontmatter serialization (mirrors src/lib/frontmatter.ts serialize()) ---
function serialize(
  frontmatter: Record<string, unknown>,
  body: string,
): string {
  const yaml = stringifyYaml(frontmatter, {
    lineWidth: 0,
    defaultStringType: "QUOTE_DOUBLE",
    defaultKeyType: "PLAIN",
  }).trim();

  const normalizedBody = body.trim();
  if (normalizedBody === "") {
    return `---\n${yaml}\n---\n`;
  }
  return `---\n${yaml}\n---\n\n${normalizedBody}\n`;
}

// --- Content transformations ---

/** Strip top-level Logseq properties (tags::, query-sort-by::, etc). Return extracted tags. */
function stripTopLevelProperties(content: string): {
  content: string;
  tags: string[];
} {
  const tags: string[] = [];
  const lines = content.split("\n");
  const result: string[] = [];

  for (const line of lines) {
    const tagMatch = line.match(/^tags::\s*(.+)$/);
    if (tagMatch) {
      // Extract [[...]] values first, fall back to comma-split
      const raw = tagMatch[1];
      const wikiMatches = [...raw.matchAll(/\[\[([^\]]+)\]\]/g)].map(m => m[1]);
      if (wikiMatches.length > 0) {
        tags.push(...wikiMatches);
      } else {
        tags.push(...raw.split(",").map((t) => t.trim()).filter(Boolean));
      }
      continue;
    }
    // Skip other top-level properties
    if (/^[a-z][a-z-]*::\s/.test(line)) {
      continue;
    }
    result.push(line);
  }

  return { content: result.join("\n"), tags };
}

/** Parse task header: # TODO|DOING|DONE Title and SCHEDULED line */
function parseTaskHeader(content: string): {
  status: "open" | "done";
  title: string;
  due: string | null;
  body: string;
} {
  const lines = content.split("\n");
  let status: "open" | "done" = "open";
  let title = "";
  let due: string | null = null;
  const bodyLines: string[] = [];
  let headerParsed = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match # STATUS Title (always check, consume once)
    if (!headerParsed) {
      const taskMatch = line.match(
        /^#\s+(TODO|DOING|DONE|NOW|LATER|WAITING)\s+(.+)$/,
      );
      if (taskMatch) {
        status = taskMatch[1] === "DONE" ? "done" : "open";
        title = taskMatch[2].trim();
        headerParsed = true;
        continue;
      }
    }

    // Match SCHEDULED line (can appear before or after heading)
    const schedMatch = line.match(
      /^SCHEDULED:\s*<(\d{4})-(\d{2})-(\d{2})\s/,
    );
    if (schedMatch) {
      due = `${schedMatch[1]}-${schedMatch[2]}-${schedMatch[3]}`;
      continue;
    }

    bodyLines.push(line);
  }

  return { status, title, due, body: bodyLines.join("\n") };
}

/** Strip inline Logseq properties: id:: UUID, logseq.order-list-type::, template::, etc */
function stripInlineProperties(content: string): string {
  return content
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      // Remove lines that are purely logseq properties
      if (/^id::\s+[0-9a-f-]+$/.test(trimmed)) return false;
      if (/^collapsed::\s/.test(trimmed)) return false;
      if (/^logseq\.[a-z.-]+::\s/.test(trimmed)) return false;
      if (/^template::\s/.test(trimmed)) return false;
      if (/^template-including-parent::\s/.test(trimmed)) return false;
      return true;
    })
    .map((line) => {
      // Remove inline logseq properties appended to content lines
      return line
        .replace(/\s+id::\s+[0-9a-f-]+$/, "")
        .replace(/\s+logseq\.[a-z.-]+::\s+\S+$/, "");
    })
    .join("\n");
}

/** Strip query blocks: #+BEGIN_QUERY...#+END_QUERY and {{query ...}} */
function stripQueryBlocks(content: string): string {
  // Multi-line query blocks
  content = content.replace(
    /\+BEGIN_QUERY[\s\S]*?#\+END_QUERY/g,
    "",
  );
  // Inline queries
  content = content.replace(/\{\{query\s[^}]*\}\}/g, "");
  return content;
}

/** Convert wikilinks: [[page-name]] → [[type:slug]] or strip brackets */
function convertWikilinks(
  content: string,
  entityMap: Map<string, { type: "task" | "doc"; slug: string }>,
  topicRegistry: Map<string, { label: string; prefix: "@" | "#" }>,
): { content: string; inlineTopics: string[] } {
  const inlineTopics: string[] = [];

  const result = content.replace(/\[\[([^\]]+)\]\]/g, (_match, inner: string) => {
    // Handle task/slug and doc/slug prefixed references
    const slashIdx = inner.indexOf("/");
    if (slashIdx !== -1) {
      const prefix = inner.substring(0, slashIdx).toLowerCase();
      const target = inner.substring(slashIdx + 1);
      if (prefix === "task" || prefix === "doc") {
        return `[[${prefix}:${generateSlug(target)}]]`;
      }
    }

    // Look up plain page name in entity map
    const entry = entityMap.get(inner.toLowerCase());
    if (entry) {
      return `[[${entry.type}:${entry.slug}]]`;
    }

    // Skip Logseq artifacts
    if (SKIP_WIKILINKS.has(inner.toLowerCase())) return inner;

    // Classify and register as topic/person
    const slug = generateSlug(inner);
    if (!slug) return inner;
    const prefix = classifyReference(inner);
    const ref = `${prefix}${slug}`;
    topicRegistry.set(slug, { label: inner, prefix });
    inlineTopics.push(ref);
    return ref; // replace with topic ref for inline decoration
  });

  return { content: result, inlineTopics };
}

/** Strip block references: ((uuid)) */
function stripBlockReferences(content: string): string {
  return content.replace(/\(\([0-9a-f-]+\)\)/g, "");
}

/** Convert image refs and return list of referenced asset filenames */
function convertImageRefs(
  content: string,
  slug: string,
): { content: string; assets: string[] } {
  const assets: string[] = [];

  const converted = content.replace(
    /!\[([^\]]*)\]\(\.\.\/assets\/([^)]+)\)(\{[^}]*\})?/g,
    (_match, alt: string, filename: string, _attrs: string) => {
      assets.push(filename);
      return `![${alt}](./${slug}.assets/${filename})`;
    },
  );

  return { content: converted, assets };
}

/**
 * Convert Logseq outliner markdown to standard markdown.
 *
 * In Logseq, everything lives inside bullets. This means:
 * - Headings appear as "- ## Heading"
 * - Code blocks appear as "- ```lang" with continuation-indented content
 * - Multi-line text appears as continuation lines (indented 2 spaces past the bullet)
 *
 * This function:
 * 1. Extracts headings from bullets
 * 2. Extracts code blocks from bullets, stripping continuation indent from content
 * 3. Strips continuation indent (leading 2 spaces) from non-bullet text lines
 * 4. Ensures blank lines around code fences so parsers recognize them
 */
function convertOutlinerMarkdown(content: string): string {
  const lines = content.split("\n");
  const result: string[] = [];
  let inCodeBlock = false;
  let codeBlockContinuationPrefix = ""; // the full continuation indent to strip from code lines
  let codeBlockOutputIndent = ""; // indent to prepend to emitted code block lines

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // --- Handle code block state ---
    if (inCodeBlock) {
      // Check for closing fence: matches the same continuation prefix, or bullet at same level
      if (isClosingFence(line, codeBlockContinuationPrefix)) {
        result.push(codeBlockOutputIndent + "```");
        // Ensure blank line after closing fence if next line is non-blank (top-level only)
        if (!codeBlockOutputIndent && i + 1 < lines.length && lines[i + 1].trim() !== "") {
          result.push("");
        }
        inCodeBlock = false;
        continue;
      }
      // Strip the continuation indent from code content
      if (line.startsWith(codeBlockContinuationPrefix)) {
        result.push(codeBlockOutputIndent + line.slice(codeBlockContinuationPrefix.length));
      } else if (line.trim() === "") {
        result.push("");
      } else {
        result.push(codeBlockOutputIndent + line);
      }
      continue;
    }

    // --- Check for code block opening as a bullet ---
    // Pattern: "<indent>- ```lang" or "<indent>- ```"
    const codeOpenBullet = line.match(/^(\s*)- (```.*)$/);
    if (codeOpenBullet) {
      const bulletIndent = codeOpenBullet[1];
      // Continuation prefix: bulletIndent + "  " (2 spaces past the "- " marker)
      codeBlockContinuationPrefix = bulletIndent + "  ";
      // If inside a list (has indent), keep code block indented to preserve list flow
      // Convert tab indent to spaces: each tab = one list level = 2 spaces for content
      if (bulletIndent) {
        const tabCount = (bulletIndent.match(/\t/g) ?? []).length;
        codeBlockOutputIndent = "  ".repeat(tabCount);
      } else {
        codeBlockOutputIndent = "";
        ensureBlankBefore(result);
      }
      result.push(codeBlockOutputIndent + codeOpenBullet[2]);
      inCodeBlock = true;
      continue;
    }

    // --- Check for code block opening as continuation (attached to previous bullet) ---
    // Pattern: "  ```lang" or "\t  ```lang" where indent matches continuation
    // This happens when code is on the same "block" as the bullet text:
    //   - some text
    //     ```console
    //     code
    //     ```
    const codeOpenContinuation = line.match(/^(\s+)(```.*)$/);
    if (codeOpenContinuation) {
      codeBlockContinuationPrefix = codeOpenContinuation[1];
      // Preserve indent for list context
      const tabCount = (codeOpenContinuation[1].match(/\t/g) ?? []).length;
      codeBlockOutputIndent = tabCount ? "  ".repeat(tabCount) : "";
      ensureBlankBefore(result);
      result.push(codeBlockOutputIndent + codeOpenContinuation[2]);
      inCodeBlock = true;
      continue;
    }

    // --- Headings in bullets: "- ## Heading" or "\t- ## Heading" ---
    const headingMatch = line.match(/^(\s*)-\s+(#{1,6}\s+.+)$/);
    if (headingMatch) {
      result.push(headingMatch[2]);
      continue;
    }

    // --- Keep continuation lines indented so they stay attached to their bullet ---
    // Logseq continuation lines are indented 2 spaces past the bullet marker.
    // We preserve this indent so the editor's list parser treats them as
    // continuation content of the preceding list item.
    // Only strip the indent for lines that aren't following a bullet context
    // (i.e., standalone paragraphs that were Logseq top-level bullets).
    if (!line.startsWith("\t") && !line.startsWith("-") && !line.startsWith("|")) {
      result.push(line);
      continue;
    }

    result.push(line);
  }

  return result.join("\n");
}

/** Check if a line is a closing code fence for the current block */
function isClosingFence(line: string, continuationPrefix: string): boolean {
  const trimmed = line.trim();
  if (trimmed !== "```") return false;
  // Accept if it matches the continuation prefix
  if (line.startsWith(continuationPrefix)) return true;
  // Accept if it's a bullet at any level with just ```
  if (/^\s*-\s*```\s*$/.test(line)) return true;
  // Accept if it's at column 0
  if (line.trimStart() === "```") return true;
  return false;
}

/** Ensure the last line in result is blank (for spacing around code blocks) */
function ensureBlankBefore(result: string[]): void {
  if (result.length > 0 && result[result.length - 1].trim() !== "") {
    result.push("");
  }
}

/**
 * Fix Logseq tables: Logseq puts an empty header row first, then separator,
 * then data. Standard markdown needs: header row, separator, data rows.
 * Detects pattern: empty-cells row → separator row → first data row,
 * and swaps the empty header with the first data row.
 */
function fixTables(content: string): string {
  const lines = content.split("\n");
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    // Detect: empty table row followed by separator row followed by data row
    if (
      i + 2 < lines.length &&
      isEmptyTableRow(lines[i]) &&
      isTableSeparator(lines[i + 1]) &&
      isTableDataRow(lines[i + 2])
    ) {
      // Swap: put the first data row as header, then separator, skip the empty row
      result.push(lines[i + 2]); // first data row becomes header
      result.push(lines[i + 1]); // separator stays
      i += 2; // skip the original empty row + separator + data row (data row consumed)
      continue;
    }
    result.push(lines[i]);
  }

  return result.join("\n");
}

function isEmptyTableRow(line: string): boolean {
  // A table row where all cells are empty/whitespace: | | | |
  return /^\|[\s|]+\|$/.test(line.trim());
}

function isTableSeparator(line: string): boolean {
  // | --- | --- | --- |
  return /^\|[\s:|-]+\|$/.test(line.trim()) && line.includes("---");
}

function isTableDataRow(line: string): boolean {
  // A table row with actual content in at least one cell
  return /^\|/.test(line.trim()) && !isEmptyTableRow(line) && !isTableSeparator(line);
}

/**
 * Normalize indentation of bullet groups after heading extraction.
 *
 * When headings are extracted from bullets ("- ## Heading" → "## Heading"),
 * child bullets keep their original deep indentation. This finds groups of
 * consecutive tab-indented bullet lines and reduces their indent so the
 * shallowest bullet in each group starts at column 0.
 */
function normalizeIndentation(content: string): string {
  const lines = content.split("\n");
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    // Check if this line starts a tab-indented bullet group
    if (/^\t+- /.test(lines[i]) || /^\t+\d+\. /.test(lines[i])) {
      // Collect the group: tab-indented bullet lines and any continuation lines between them
      const group: number[] = []; // indices into lines[]
      let j = i;
      while (j < lines.length) {
        if (/^\t+- /.test(lines[j]) || /^\t+\d+\. /.test(lines[j])) {
          group.push(j);
          j++;
        } else if (/^\s+```/.test(lines[j]) && lines[j].trim().startsWith("```")) {
          // Indented code block — include all lines through the closing fence
          group.push(j);
          j++;
          while (j < lines.length && lines[j].trim() !== "```") {
            group.push(j);
            j++;
          }
          if (j < lines.length) {
            group.push(j); // closing fence
            j++;
          }
        } else if (
          j > i &&
          lines[j].trim() !== "" &&
          /^\t/.test(lines[j]) &&
          !/^#{1,6}\s/.test(lines[j])
        ) {
          // Continuation line (indented, non-empty, not a heading)
          group.push(j);
          j++;
        } else if (lines[j].trim() === "" && j + 1 < lines.length && (/^\t+- /.test(lines[j + 1]) || /^\t+\d+\. /.test(lines[j + 1]) || /^\s+```/.test(lines[j + 1]) || (/^\t/.test(lines[j + 1]) && !/^#{1,6}\s/.test(lines[j + 1])))) {
          // Blank line before next bullet, code block, or continuation line — include it
          group.push(j);
          j++;
        } else {
          break;
        }
      }

      // Find minimum tab depth among actual bullet lines (not continuation/separator lines)
      let minTabs = Infinity;
      for (const idx of group) {
        if (/^\t+- /.test(lines[idx]) || /^\t+\d+\. /.test(lines[idx])) {
          const tabMatch = lines[idx].match(/^(\t+)/);
          if (tabMatch) {
            minTabs = Math.min(minTabs, tabMatch[1].length);
          }
        }
      }

      // Only normalize if this group follows a heading (orphaned children
      // from heading extraction). Regular nested bullets under a parent
      // bullet should keep their indentation.
      const afterHeading = i > 0 && /^#{1,6}\s/.test(result[result.length - 1] ?? "");

      if (minTabs === Infinity || minTabs === 0 || !afterHeading) {
        // No adjustment needed — keep original indentation
        for (const idx of group) {
          result.push(lines[idx]);
        }
      } else {
        // Subtract minTabs from each line's leading tabs
        for (const idx of group) {
          const tabMatch = lines[idx].match(/^(\t+)/);
          if (tabMatch) {
            result.push(lines[idx].slice(minTabs));
          } else {
            result.push(lines[idx]);
          }
        }
      }

      i = j;
    } else {
      result.push(lines[i]);
      i++;
    }
  }

  return result.join("\n");
}

/** Clean whitespace: remove empty bullets, collapse blank lines */
function cleanWhitespace(content: string): string {
  let lines = content.split("\n");

  // Convert empty bullets to blank lines (they serve as visual separators in Logseq)
  lines = lines.map((line) => (/^\s*-\s*$/.test(line) ? "" : line));

  // Collapse 3+ consecutive blank lines to 2
  const result: string[] = [];
  let blankCount = 0;
  for (const line of lines) {
    if (line.trim() === "") {
      blankCount++;
      if (blankCount <= 2) result.push(line);
    } else {
      blankCount = 0;
      result.push(line);
    }
  }

  return result.join("\n").trim();
}

/** Get file mtime as YYYY-MM-DD */
function getFileMtime(filePath: string): string {
  const stat = fs.statSync(filePath);
  return stat.mtime.toISOString().slice(0, 10);
}

/** Merge tags and inline topics into deduplicated, sorted topic refs */
function buildTopicRefs(
  rawTags: string[],
  inlineTopics: string[],
  topicRegistry: Map<string, { label: string; prefix: "@" | "#" }>,
): string[] {
  const refs = new Set<string>();
  for (const tag of rawTags) {
    if (SKIP_WIKILINKS.has(tag.toLowerCase())) continue;
    const slug = generateSlug(tag);
    if (!slug) continue;
    const prefix = classifyReference(tag);
    topicRegistry.set(slug, { label: tag, prefix });
    refs.add(`${prefix}${slug}`);
  }
  for (const ref of inlineTopics) refs.add(ref);
  return [...refs].sort();
}

/** Apply all content transformations */
function transformContent(
  content: string,
  slug: string,
  entityMap: Map<string, { type: "task" | "doc"; slug: string }>,
  topicRegistry: Map<string, { label: string; prefix: "@" | "#" }>,
): { body: string; tags: string[]; inlineTopics: string[]; assets: string[] } {
  // 1. Strip top-level properties
  const { content: c1, tags } = stripTopLevelProperties(content);
  // 3. Strip inline properties
  const c2 = stripInlineProperties(c1);
  // 4. Strip query blocks
  const c3 = stripQueryBlocks(c2);
  // 5. Convert wikilinks
  const { content: c4, inlineTopics } = convertWikilinks(c3, entityMap, topicRegistry);
  // 5b. Convert bare task/slug and doc/slug references to wikilinks
  const c4b = c4.replace(
    /(?<!\[)\b(task|doc)\/([a-zA-Z0-9_-]+)\b/g,
    (_match, type: string, slug2: string) => `[[${type}:${generateSlug(slug2)}]]`,
  );
  // 6. Strip block references
  const c5 = stripBlockReferences(c4b);
  // 7. Convert image refs
  const { content: c6, assets } = convertImageRefs(c5, slug);
  // 7b. Fix malformed [text](![](url)) → [text](url)
  const c6b = c6.replace(/\[([^\]]+)\]\(!\[[^\]]*\]\(([^)]+)\)\)/g, '[$1]($2)');
  // 8. Convert outliner markdown (headings in bullets, code blocks)
  const c7 = convertOutlinerMarkdown(c6b);
  // 8b. Normalize indentation (fix orphaned deep bullets after heading extraction)
  const c7b = normalizeIndentation(c7);
  // 9. Fix Logseq tables
  const c8 = fixTables(c7b);
  // 10. Clean whitespace
  const body = cleanWhitespace(c8);

  return { body, tags, inlineTopics, assets };
}

/** Copy assets for an entity */
function copyAssets(
  assets: string[],
  slug: string,
  targetDir: string,
): void {
  if (assets.length === 0) return;

  const assetsDir = path.join(targetDir, `${slug}.assets`);
  fs.mkdirSync(assetsDir, { recursive: true });

  for (const filename of assets) {
    const src = path.join(SOURCE, "assets", filename);
    const dest = path.join(assetsDir, filename);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
    } else {
      console.warn(`  WARNING: Asset not found: ${src}`);
    }
  }
}

/** Check if file content is trivial (empty or just bullets/whitespace) */
function isTrivial(content: string): boolean {
  const stripped = content
    .split("\n")
    .filter((l) => !/^\s*-?\s*$/.test(l))
    .join("")
    .trim();
  return stripped.length === 0;
}

// --- Main conversion ---

function main(): void {
  const stats = { notes: 0, tasks: 0, docs: 0, skipped: 0, images: 0 };

  // Create target directories
  const notesDir = path.join(TARGET, "notes");
  const tasksDir = path.join(TARGET, "tasks");
  const docsDir = path.join(TARGET, "docs");
  fs.mkdirSync(notesDir, { recursive: true });
  fs.mkdirSync(tasksDir, { recursive: true });
  fs.mkdirSync(docsDir, { recursive: true });

  // Build mapping of Logseq page names → entity type + slug
  // Used by convertWikilinks() to emit proper [[type:slug]] references
  const pagesDir = path.join(SOURCE, "pages");
  const pageEntityMap = new Map<string, { type: "task" | "doc"; slug: string }>();

  if (fs.existsSync(pagesDir)) {
    for (const file of fs.readdirSync(pagesDir).filter((f) => f.endsWith(".md"))) {
      if (SKIP_PAGES.has(file)) continue;
      const content = fs.readFileSync(path.join(pagesDir, file), "utf-8");
      if (isTrivial(content)) continue;

      if (file.startsWith("task___")) {
        const rawName = file.slice("task___".length, -3);
        const slug = generateSlug(rawName);
        pageEntityMap.set(rawName.toLowerCase(), { type: "task", slug });
      } else {
        const rawName = file.slice(0, -3);
        const slug = generateSlug(rawName);
        pageEntityMap.set(rawName.toLowerCase(), { type: "doc", slug });
      }
    }
  }

  console.log(`  Page entity map: ${pageEntityMap.size} entries`);

  const topicRegistry = new Map<string, { label: string; prefix: "@" | "#" }>();

  // --- Convert journals → daily notes ---
  const journalsDir = path.join(SOURCE, "journals");
  if (fs.existsSync(journalsDir)) {
    const journals = fs.readdirSync(journalsDir).filter((f) =>
      f.endsWith(".md")
    );

    for (const file of journals) {
      const filePath = path.join(journalsDir, file);
      const content = fs.readFileSync(filePath, "utf-8");

      // Parse date from filename: YYYY_MM_DD.md
      const dateMatch = file.match(/^(\d{4})_(\d{2})_(\d{2})\.md$/);
      if (!dateMatch) {
        console.warn(`  Skipping journal (bad filename): ${file}`);
        stats.skipped++;
        continue;
      }

      const date = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
      const slug = date; // daily notes use date as slug

      if (isTrivial(content)) {
        stats.skipped++;
        continue;
      }

      const { body, tags, assets } = transformContent(content, slug, pageEntityMap, topicRegistry);

      if (body.trim() === "") {
        stats.skipped++;
        continue;
      }

      // Only add frontmatter topics from tags:: (inline refs are already in body)
      const topics = buildTopicRefs(tags, [], topicRegistry);
      const frontmatter: Record<string, unknown> = {
        type: "note",
        date,
      };
      if (topics.length > 0) frontmatter.topics = topics;

      const output = serialize(frontmatter, body);
      fs.writeFileSync(path.join(notesDir, `${date}.md`), output);

      if (assets.length > 0) {
        copyAssets(assets, slug, notesDir);
        stats.images += assets.length;
      }

      stats.notes++;
    }
  }

  // --- Convert pages ---
  if (fs.existsSync(pagesDir)) {
    const pages = fs.readdirSync(pagesDir).filter((f) => f.endsWith(".md"));

    for (const file of pages) {
      // Skip known files
      if (SKIP_PAGES.has(file)) {
        stats.skipped++;
        continue;
      }

      const filePath = path.join(pagesDir, file);
      const content = fs.readFileSync(filePath, "utf-8");
      const created = getFileMtime(filePath);

      if (isTrivial(content)) {
        stats.skipped++;
        continue;
      }

      // Determine type: task___ prefix → task, otherwise → doc
      if (file.startsWith("task___")) {
        // --- Task ---
        const rawName = file.slice("task___".length, -3); // Remove prefix and .md
        const slug = uniqueSlug(rawName, tasksDir);

        const { status, title, due, body: taskBody } = parseTaskHeader(
          content,
        );
        const { body, tags, assets } = transformContent(taskBody, slug, pageEntityMap, topicRegistry);

        const topics = buildTopicRefs(tags, [], topicRegistry);
        const frontmatter: Record<string, unknown> = {
          type: "task",
          status,
          created,
        };
        if (due) frontmatter.due = due;
        if (title) frontmatter.title = title;
        if (topics.length > 0) frontmatter.topics = topics;

        const output = serialize(frontmatter, body);
        fs.writeFileSync(path.join(tasksDir, `${slug}.md`), output);

        if (assets.length > 0) {
          copyAssets(assets, slug, tasksDir);
          stats.images += assets.length;
        }

        stats.tasks++;
      } else {
        // --- Doc ---
        // Title from filename (without .md)
        const rawTitle = file.slice(0, -3);
        const slug = uniqueSlug(rawTitle, docsDir);

        const title = rawTitle;

        const { body, tags, assets } = transformContent(content, slug, pageEntityMap, topicRegistry);

        if (body.trim() === "") {
          stats.skipped++;
          continue;
        }

        const topics = buildTopicRefs(tags, [], topicRegistry);
        const frontmatter: Record<string, unknown> = {
          type: "doc",
          title,
          created,
        };
        if (topics.length > 0) frontmatter.topics = topics;

        const output = serialize(frontmatter, body);
        fs.writeFileSync(path.join(docsDir, `${slug}.md`), output);

        if (assets.length > 0) {
          copyAssets(assets, slug, docsDir);
          stats.images += assets.length;
        }

        stats.docs++;
      }
    }
  }

  // Generate topics.yaml
  const topicEntries = [...topicRegistry.entries()]
    .map(([slug, { label, prefix }]) => ({ id: `${prefix}${slug}`, label }))
    .sort((a, b) => {
      if (a.id[0] !== b.id[0]) return a.id[0] === "@" ? -1 : 1;
      return a.id.localeCompare(b.id);
    });
  fs.writeFileSync(path.join(TARGET, "topics.yaml"), stringifyYaml(topicEntries));
  console.log(`  Topics:      ${topicEntries.length} (${topicEntries.filter(t => t.id[0] === "@").length} people, ${topicEntries.filter(t => t.id[0] === "#").length} topics)`);

  console.log("\n=== Conversion Complete ===");
  console.log(`  Daily notes: ${stats.notes}`);
  console.log(`  Tasks:       ${stats.tasks}`);
  console.log(`  Docs:        ${stats.docs}`);
  console.log(`  Skipped:     ${stats.skipped}`);
  console.log(`  Images:      ${stats.images}`);
  console.log(`\nOutput: ${TARGET}`);
}

main();
