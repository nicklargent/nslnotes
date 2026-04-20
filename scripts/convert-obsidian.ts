#!/usr/bin/env npx tsx
/**
 * Convert Obsidian vault to NslNotes format.
 *
 * Usage: npx tsx scripts/convert-obsidian.ts <vault-dir> <target-dir>
 *
 * Folder mapping:
 *   Reference/{sub}/  → notes with #{sub} topic
 *   Radar/            → notes with #radar topic
 *   Inbox/            → notes with #inbox topic
 *   Log/              → notes (date from filename)
 *   Projects/         → tasks (status: open) with #{subfolder} or #projects topic
 *   Events/           → tasks (status: open) with #events topic, due date from filename
 *   Playground/       → skipped
 *   Root files        → skipped
 */

import * as fs from "fs";
import * as path from "path";
import { stringify as stringifyYaml } from "yaml";

// --- Config ---
const args = process.argv.slice(2);
if (args.length !== 2) {
  console.error("Usage: npx tsx scripts/convert-obsidian.ts <vault-dir> <target-dir>");
  process.exit(1);
}
const SOURCE = path.resolve(args[0]);
const TARGET = path.resolve(args[1]);

const SKIP_DIRS = new Set([".obsidian", ".trash", "Playground"]);
const SKIP_FILE_EXTENSIONS = new Set([".canvas", ".base"]);
const SKIP_FILE_PREFIXES = [".smtcmp_"];

// Load overrides from external file (not committed)
const overridesPath = path.join(path.dirname(new URL(import.meta.url).pathname), "obsidian-overrides.json");
const overrides = fs.existsSync(overridesPath)
  ? JSON.parse(fs.readFileSync(overridesPath, "utf-8"))
  : { titleMap: {}, referenceAsNotes: [] };
const REFERENCE_TITLE_MAP: Record<string, string> = overrides.titleMap;
const REFERENCE_AS_NOTES = new Set<string>(overrides.referenceAsNotes);

// --- Stats ---
const stats = {
  notes: 0,
  tasks: 0,
  docs: 0,
  skipped: 0,
  images: 0,
  wikiLinks: 0,
  wikiLinksResolved: 0,
  wikiLinksUnresolved: 0,
  imageEmbeds: 0,
  brokenEmbeds: 0,
  callouts: 0,
  dataviewQueries: 0,
  htmlBlocks: 0,
  inlineTags: 0,
};

const brokenEmbedFiles: string[] = [];
const skippedFiles: string[] = [];
const unresolvedWikilinks: string[] = [];

// --- Title → entity map (used for post-pass wikilink resolution) ---
type EntityType = "doc" | "note" | "task";
const titleMap = new Map<string, { type: EntityType; slug: string }>();

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase();
}

function registerEntity(title: string, type: EntityType, slug: string): void {
  titleMap.set(normalizeTitle(title), { type, slug });
}

/** Register one or more titles (aliases) pointing to the same entity. */
function registerEntityAliases(
  aliases: string[],
  type: EntityType,
  slug: string,
): void {
  for (const a of aliases) {
    if (!a) continue;
    // First writer wins — don't let an alias overwrite an earlier explicit registration
    const key = normalizeTitle(a);
    if (!titleMap.has(key)) titleMap.set(key, { type, slug });
  }
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

/** Get file mtime as YYYY-MM-DD */
function getFileMtime(filePath: string): string {
  const stat = fs.statSync(filePath);
  return stat.mtime.toISOString().slice(0, 10);
}

/** Strip existing YAML frontmatter from content */
function stripFrontmatter(content: string): string {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (match) {
    return content.slice(match[0].length);
  }
  return content;
}

/** Build an index of all image/attachment files in the vault for resolving embeds */
function buildAttachmentIndex(vaultDir: string): Map<string, string> {
  const index = new Map<string, string>(); // filename → full path
  function walk(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".pdf"].includes(ext)) {
          index.set(entry.name, full);
        }
      }
    }
  }
  walk(vaultDir);
  return index;
}

// --- Content transformations ---

/** Sanitize an attachment filename so it has no spaces or characters that break markdown links. */
function sanitizeAttachmentFilename(filename: string): string {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  const safeBase = base
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9.-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "") || "attachment";
  return `${safeBase}${ext.toLowerCase()}`;
}

/** Convert Obsidian image embeds: ![[filename.png]] → ![filename](./slug.assets/filename.png) */
function convertImageEmbeds(
  content: string,
  slug: string,
  targetDir: string,
  attachmentIndex: Map<string, string>,
): string {
  return content.replace(/!\[\[([^\]]+)\]\]/g, (_match, inner: string) => {
    // Handle optional |width syntax: ![[file.png|400]]
    const parts = inner.split("|");
    const filename = parts[0].trim();
    const ext = path.extname(filename).toLowerCase();

    if (![".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"].includes(ext)) {
      // Non-image embed (e.g. PDF)
      const srcPath = attachmentIndex.get(filename);
      if (!srcPath) {
        stats.brokenEmbeds++;
        brokenEmbedFiles.push(filename);
        return `[${filename} (missing)]`;
      }
      // Copy non-image file and link to it
      const safeName = sanitizeAttachmentFilename(filename);
      const assetsDir = path.join(targetDir, `${slug}.assets`);
      fs.mkdirSync(assetsDir, { recursive: true });
      fs.copyFileSync(srcPath, path.join(assetsDir, safeName));
      stats.images++;
      stats.imageEmbeds++;
      return `[${filename}](./${slug}.assets/${safeName})`;
    }

    const srcPath = attachmentIndex.get(filename);
    if (!srcPath) {
      stats.brokenEmbeds++;
      brokenEmbedFiles.push(filename);
      return `[${filename} (missing)]`;
    }

    // Copy the image under a sanitized filename
    const safeName = sanitizeAttachmentFilename(filename);
    const assetsDir = path.join(targetDir, `${slug}.assets`);
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.copyFileSync(srcPath, path.join(assetsDir, safeName));
    stats.images++;
    stats.imageEmbeds++;

    const alt = path.basename(filename, ext);
    const widthAttr = parts[1] ? `{width=${parts[1].trim()}}` : "";
    return `![${alt}](./${slug}.assets/${safeName})${widthAttr}`;
  });
}

/** Count wikilinks (they are resolved in a post-pass after all entities are written). */
function countWikiLinks(content: string): void {
  const matches = content.match(/(?<!!)\[\[([^\]]+)\]\]/g);
  if (matches) stats.wikiLinks += matches.length;
}

/** Convert Obsidian callouts: > [!info] Title → > **Info:** Title */
function convertCallouts(content: string): string {
  return content.replace(
    /^(>\s*)\[!(\w+)\]\s*(.*)/gm,
    (_match, prefix: string, type: string, title: string) => {
      stats.callouts++;
      const label = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
      return title
        ? `${prefix}**${label}:** ${title}`
        : `${prefix}**${label}**`;
    },
  );
}

/** Remove Dataview inline queries */
function removeDataviewQueries(content: string): string {
  // Inline dataview: `$=dv.xxx(...)` or `=this.xxx`
  const result = content.replace(/`\$=dv\.[^`]+`/g, () => {
    stats.dataviewQueries++;
    return "";
  });
  // Dataview code blocks
  return result.replace(/```dataview[\s\S]*?```/g, () => {
    stats.dataviewQueries++;
    return "";
  });
}

/** Remove HTML blocks */
function removeHtmlBlocks(content: string): string {
  return content.replace(/<(?:div|style|script)[^>]*>[\s\S]*?<\/(?:div|style|script)>/gi, () => {
    stats.htmlBlocks++;
    return "";
  });
}

/** Clean whitespace: collapse 3+ blank lines to 2 */
function cleanWhitespace(content: string): string {
  const lines = content.split("\n");
  const result: string[] = [];
  let blankCount = 0;
  for (const line of lines) {
    if (line.trim() === "") {
      blankCount++;
      // Normalize whitespace-only lines to truly empty — editor round-trips
      // `"    "` to `""`, so emit that canonical form at conversion time.
      if (blankCount <= 2) result.push("");
    } else {
      blankCount = 0;
      result.push(line);
    }
  }
  return result.join("\n").trim();
}

/**
 * Normalize GFM table separator rows (`|-------|--------|`) to the form the
 * editor round-trips to: `| --- | --- |`. Only rewrites rows that appear
 * between a header row and at least one body row, to avoid false matches.
 */
function normalizeTableSeparators(content: string): string {
  const lines = content.split("\n");
  for (let i = 1; i < lines.length - 1; i++) {
    const line = lines[i]!;
    if (!/^\|[\s\-:|]+\|$/.test(line)) continue;
    const prev = lines[i - 1]!;
    const next = lines[i + 1]!;
    if (!prev.trim().startsWith("|") || !next.trim().startsWith("|")) continue;
    const cols = line
      .slice(1, -1)
      .split("|")
      .map((c) => c.trim());
    if (cols.some((c) => !/^:?-+:?$/.test(c))) continue;
    const normalized = cols
      .map((c) => {
        const hasLeft = c.startsWith(":");
        const hasRight = c.endsWith(":");
        if (hasLeft && hasRight) return ":---:";
        if (hasLeft) return ":---";
        if (hasRight) return "---:";
        return "---";
      })
      .join(" | ");
    lines[i] = `| ${normalized} |`;
  }
  return lines.join("\n");
}

/**
 * Ensure blank lines around block transitions that Obsidian handles loosely
 * but CommonMark does not. Inserts a blank line between a bullet item and
 * a non-bullet text line (and vice versa) when one is missing.
 */
function fixBlockTransitions(content: string): string {
  const lines = content.split("\n");
  const result: string[] = [];

  const isBullet = (line: string) => /^\s*[-*+]\s/.test(line) || /^\s*\d+\.\s/.test(line);
  const isIndented = (line: string) => /^[\t ]+\S/.test(line);
  const isBlank = (line: string) => line.trim() === "";
  const isHeading = (line: string) => /^#{1,6}\s/.test(line);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const prev = i > 0 ? lines[i - 1]! : "";

    if (i > 0 && !isBlank(line) && !isBlank(prev)) {
      const prevIsList = isBullet(prev) || isIndented(prev);
      const curIsList = isBullet(line) || isIndented(line);

      // Plain text after a list line → needs blank line
      if (prevIsList && !curIsList && !isHeading(line)) {
        result.push("");
      }
      // Bullet line after plain text (not a heading) → needs blank line
      if (!prevIsList && !isHeading(prev) && isBullet(line)) {
        result.push("");
      }
    }

    result.push(line);
  }

  return result.join("\n");
}

/** Apply all content transformations. Wikilinks are preserved as `[[X]]` for a post-pass. */
function transformContent(
  content: string,
  slug: string,
  targetDir: string,
  attachmentIndex: Map<string, string>,
): string {
  let c = stripFrontmatter(content);
  c = convertImageEmbeds(c, slug, targetDir, attachmentIndex);
  c = convertCallouts(c);
  c = removeDataviewQueries(c);
  c = removeHtmlBlocks(c);
  c = normalizeTableSeparators(c);
  countWikiLinks(c);
  c = fixBlockTransitions(c);
  c = cleanWhitespace(c);
  return c;
}

/** Get title from filename (strip .md extension and date prefix for events) */
function titleFromFilename(filename: string): string {
  return filename.replace(/\.md$/, "");
}

/** Parse event filename: "YYYY-MM-DD - Event Name.md" → { date, title } */
function parseEventFilename(filename: string): { date: string | null; title: string } {
  const match = filename.match(/^(\d{4}-\d{2}-\d{2})\s*-\s*(.+)\.md$/);
  if (match) {
    // Keep full "YYYY-MM-DD - Event Name" as title so similar trips are distinguishable
    return { date: match[1], title: `${match[1]} - ${match[2].trim()}` };
  }
  return { date: null, title: filename.replace(/\.md$/, "") };
}

/** Get the top-level folder relative to vault */
function getTopFolder(filePath: string, vaultDir: string): string | null {
  const rel = path.relative(vaultDir, filePath);
  const parts = rel.split(path.sep);
  return parts.length > 1 ? parts[0] : null;
}

/** Check if file content is trivial (empty or just whitespace) */
function isTrivial(content: string): boolean {
  return content.trim().length === 0;
}

/** Walk a directory recursively and return all .md files */
function walkMarkdownFiles(dir: string): string[] {
  const files: string[] = [];
  if (!fs.existsSync(dir)) return files;

  function walk(d: string): void {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
        // Skip attachment directories
        if (entry.name === "attachments" || entry.name === ".attachments") continue;
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        // Skip non-markdown and system files
        if (SKIP_FILE_EXTENSIONS.has(path.extname(entry.name))) continue;
        if (SKIP_FILE_PREFIXES.some((p) => entry.name.startsWith(p))) continue;
        files.push(full);
      }
    }
  }
  walk(dir);
  return files;
}

// --- Main conversion ---

function main(): void {
  console.log(`Source vault: ${SOURCE}`);
  console.log(`Target:       ${TARGET}\n`);

  // Create target directories
  const notesDir = path.join(TARGET, "notes");
  const tasksDir = path.join(TARGET, "tasks");
  const docsDir = path.join(TARGET, "docs");
  fs.mkdirSync(notesDir, { recursive: true });
  fs.mkdirSync(tasksDir, { recursive: true });
  fs.mkdirSync(docsDir, { recursive: true });

  // Build attachment index for resolving ![[image]] embeds
  const attachmentIndex = buildAttachmentIndex(SOURCE);
  console.log(`Attachment index: ${attachmentIndex.size} files found\n`);

  // Topic registry for topics.yaml
  const topicRegistry = new Map<string, string>(); // slug → label

  function registerTopic(slug: string, label: string): string {
    const topicSlug = generateSlug(slug);
    if (!topicRegistry.has(topicSlug)) {
      topicRegistry.set(topicSlug, label);
    }
    return `#${topicSlug}`;
  }

  // Collect all markdown files organized by top-level folder
  const allFiles = walkMarkdownFiles(SOURCE);

  for (const filePath of allFiles) {
    const topFolder = getTopFolder(filePath, SOURCE);
    const filename = path.basename(filePath);

    // Skip root-level files
    if (!topFolder) {
      stats.skipped++;
      skippedFiles.push(path.relative(SOURCE, filePath));
      continue;
    }

    const rawContent = fs.readFileSync(filePath, "utf-8");

    // --- Reference/ → docs (or named notes for bookmark-like stubs) ---
    if (topFolder === "Reference") {
      const relPath = path.relative(SOURCE, filePath).replace(/\\/g, "/");
      const rel = path.relative(SOURCE, path.dirname(filePath));
      const parts = rel.split(path.sep).filter(Boolean); // ["Reference", "Linux", "KDE"]
      const folderTopics = parts.slice(1); // drop "Reference" itself
      const topicRefs = folderTopics.length > 0
        ? folderTopics.map((f) => registerTopic(f, f))
        : [registerTopic("reference", "Reference")];

      const rawTitle = titleFromFilename(filename);
      const title = REFERENCE_TITLE_MAP[relPath] ?? rawTitle;

      if (REFERENCE_AS_NOTES.has(relPath)) {
        // Bookmark/stub → named note on the journal
        const date = getFileMtime(filePath);
        const slug = uniqueSlug(title, notesDir);
        const body = transformContent(rawContent, slug, notesDir, attachmentIndex);
        if (isTrivial(body)) {
          stats.skipped++;
          skippedFiles.push(path.relative(SOURCE, filePath));
          continue;
        }
        const fm: Record<string, unknown> = {
          type: "note",
          date,
          title,
          topics: topicRefs,
        };
        fs.writeFileSync(path.join(notesDir, `${date}-${slug}.md`), serialize(fm, body));
        registerEntityAliases([title, rawTitle], "note", `${date}-${slug}`);
        stats.notes++;
        continue;
      }

      // Real reference → doc
      const created = getFileMtime(filePath);
      const slug = uniqueSlug(title, docsDir);

      const body = transformContent(rawContent, slug, docsDir, attachmentIndex);
      if (isTrivial(body)) {
        stats.skipped++;
        skippedFiles.push(path.relative(SOURCE, filePath));
        continue;
      }

      const fm: Record<string, unknown> = {
        type: "doc",
        title,
        created,
        topics: topicRefs,
      };

      fs.writeFileSync(path.join(docsDir, `${slug}.md`), serialize(fm, body));
      registerEntityAliases([title, rawTitle], "doc", slug);
      stats.docs++;
      continue;
    }

    // --- Radar/ → notes with #radar topic ---
    if (topFolder === "Radar") {
      const topicRef = registerTopic("radar", "Radar");
      const title = titleFromFilename(filename);
      const date = getFileMtime(filePath);
      const slug = uniqueSlug(title, notesDir);

      const body = transformContent(rawContent, slug, notesDir, attachmentIndex);
      if (isTrivial(body)) {
        stats.skipped++;
        skippedFiles.push(path.relative(SOURCE, filePath));
        continue;
      }

      const fm: Record<string, unknown> = {
        type: "note",
        date,
        title,
        topics: [topicRef],
      };

      fs.writeFileSync(path.join(notesDir, `${date}-${slug}.md`), serialize(fm, body));
      registerEntity(title, "note", `${date}-${slug}`);
      stats.notes++;
      continue;
    }

    // --- Inbox/ → notes with #inbox topic (+ #archive for Inbox/Archive/) ---
    if (topFolder === "Inbox") {
      const inboxTopic = registerTopic("inbox", "Inbox");
      const rel = path.relative(SOURCE, filePath);
      const parts = rel.split(path.sep);
      const topics = [inboxTopic];
      if (parts[1] === "Archive") {
        topics.push(registerTopic("archive", "Archive"));
      }

      const title = titleFromFilename(filename);
      const date = getFileMtime(filePath);
      const slug = uniqueSlug(title, notesDir);

      const body = transformContent(rawContent, slug, notesDir, attachmentIndex);
      if (isTrivial(body)) {
        stats.skipped++;
        skippedFiles.push(path.relative(SOURCE, filePath));
        continue;
      }

      const fm: Record<string, unknown> = {
        type: "note",
        date,
        title,
        topics,
      };

      fs.writeFileSync(path.join(notesDir, `${date}-${slug}.md`), serialize(fm, body));
      registerEntity(title, "note", `${date}-${slug}`);
      stats.notes++;
      continue;
    }

    // --- Log/ → notes (date from filename) ---
    if (topFolder === "Log") {
      const dateMatch = filename.match(/^(\d{4}-\d{2}-\d{2})\.md$/);
      const date = dateMatch ? dateMatch[1] : getFileMtime(filePath);
      const slug = date; // daily notes use date as slug
      // Reserve the date slug
      if (!usedSlugs[notesDir]) usedSlugs[notesDir] = new Set();
      usedSlugs[notesDir].add(slug);

      const body = transformContent(rawContent, slug, notesDir, attachmentIndex);
      if (isTrivial(body)) {
        stats.skipped++;
        skippedFiles.push(path.relative(SOURCE, filePath));
        continue;
      }

      const fm: Record<string, unknown> = {
        type: "note",
        date,
      };

      fs.writeFileSync(path.join(notesDir, `${date}.md`), serialize(fm, body));
      registerEntity(date, "note", date);
      stats.notes++;
      continue;
    }

    // --- Projects/ handled in second pass below ---
    if (topFolder === "Projects") {
      continue;
    }

    // --- Events/ → tasks with #events topic, due date from filename ---
    if (topFolder === "Events") {
      const topicRef = registerTopic("events", "Events");
      const parsed = parseEventFilename(filename);
      const created = getFileMtime(filePath);
      const slug = uniqueSlug(parsed.title, tasksDir);

      const body = transformContent(rawContent, slug, tasksDir, attachmentIndex);
      if (isTrivial(body)) {
        stats.skipped++;
        skippedFiles.push(path.relative(SOURCE, filePath));
        continue;
      }

      const fm: Record<string, unknown> = {
        type: "task",
        title: parsed.title,
        status: "open",
        created,
        topics: [topicRef],
      };
      if (parsed.date) {
        fm.due = parsed.date;
      }

      fs.writeFileSync(path.join(tasksDir, `${slug}.md`), serialize(fm, body));
      registerEntity(parsed.title, "task", slug);
      stats.tasks++;
      continue;
    }

    // --- Skip everything else ---
    stats.skipped++;
    skippedFiles.push(path.relative(SOURCE, filePath));
  }

  // --- Projects/ second pass ---
  // Filenames that should be folded into the project task body
  const FOLD_PATTERNS = new Set([
    "todo list", "open issues", "next steps", "readme", "todo",
  ]);

  const projectsDir = path.join(SOURCE, "Projects");
  if (fs.existsSync(projectsDir)) {
    const projectsTopicRef = registerTopic("projects", "Projects");

    // Collect subfolder structures: { subfolderName → { rootFiles, nestedFiles } }
    const subfolders = new Map<string, { files: string[]; foldFiles: string[] }>();

    for (const filePath of allFiles) {
      const topFolder = getTopFolder(filePath, SOURCE);
      if (topFolder !== "Projects") continue;

      const rel = path.relative(SOURCE, filePath);
      const parts = rel.split(path.sep); // ["Projects", ...]
      const filename = path.basename(filePath);

      if (parts.length === 2) {
        // Root-level project file: Projects/NslAgent.md → task with #projects
        const rawContent = fs.readFileSync(filePath, "utf-8");
        const title = titleFromFilename(filename);
        const created = getFileMtime(filePath);
        const slug = uniqueSlug(title, tasksDir);

        const body = transformContent(rawContent, slug, tasksDir, attachmentIndex);
        if (isTrivial(body)) {
          stats.skipped++;
          skippedFiles.push(rel);
          continue;
        }

        const fm: Record<string, unknown> = {
          type: "task",
          title,
          status: "open",
          created,
          topics: [projectsTopicRef],
        };

        fs.writeFileSync(path.join(tasksDir, `${slug}.md`), serialize(fm, body));
        registerEntity(title, "task", slug);
        stats.tasks++;
      } else if (parts.length >= 3) {
        // Nested file: Projects/HomeLab/something.md
        const sub = parts[1];
        if (!subfolders.has(sub)) {
          subfolders.set(sub, { files: [], foldFiles: [] });
        }
        const titleLower = titleFromFilename(filename).toLowerCase();
        if (FOLD_PATTERNS.has(titleLower)) {
          subfolders.get(sub)!.foldFiles.push(filePath);
        } else {
          subfolders.get(sub)!.files.push(filePath);
        }
      }
    }

    // Process each subfolder: create docs first, then task (with wikilinks to docs)
    for (const [sub, { files, foldFiles }] of subfolders) {
      const projectTopicRef = registerTopic(sub, sub);
      const taskSlug = uniqueSlug(sub, tasksDir);

      // Build task body from folded files
      const foldedSections: string[] = [];
      let earliestDate = "9999-99-99";

      for (const fp of foldFiles) {
        const rawContent = fs.readFileSync(fp, "utf-8");
        const body = transformContent(rawContent, taskSlug, tasksDir, attachmentIndex);
        if (!isTrivial(body)) {
          const sectionTitle = titleFromFilename(path.basename(fp));
          foldedSections.push(`## ${sectionTitle}\n\n${body}`);
        }
        const mtime = getFileMtime(fp);
        if (mtime < earliestDate) earliestDate = mtime;
      }

      // Also check dates of doc files for the earliest created date
      for (const fp of files) {
        const mtime = getFileMtime(fp);
        if (mtime < earliestDate) earliestDate = mtime;
      }

      if (earliestDate === "9999-99-99") earliestDate = getFileMtime(projectsDir);

      // Write docs first so we can collect their slugs for wikilinks
      const docSlugs: string[] = [];
      for (const fp of files) {
        const filename = path.basename(fp);
        const rawContent = fs.readFileSync(fp, "utf-8");
        const rawTitle = titleFromFilename(filename);
        const title = REFERENCE_TITLE_MAP[path.relative(SOURCE, fp).replace(/\\/g, "/")] ?? rawTitle;
        const created = getFileMtime(fp);
        const docSlug = uniqueSlug(title, docsDir);

        const body = transformContent(rawContent, docSlug, docsDir, attachmentIndex);
        if (isTrivial(body)) {
          stats.skipped++;
          skippedFiles.push(path.relative(SOURCE, fp));
          continue;
        }

        const docFm: Record<string, unknown> = {
          type: "doc",
          title,
          created,
          topics: [projectTopicRef],
        };

        fs.writeFileSync(path.join(docsDir, `${docSlug}.md`), serialize(docFm, body));
        registerEntityAliases([title, rawTitle], "doc", docSlug);
        docSlugs.push(docSlug);
        stats.docs++;
      }

      // Build task body: folded sections + wikilinks to child docs
      const wikilinks = docSlugs.map((s) => `[[doc:${s}]]`).join("\n");
      const sections = [...foldedSections];
      if (wikilinks) {
        sections.push(`## Docs\n\n${wikilinks}`);
      }
      const taskBody = sections.join("\n\n");

      const fm: Record<string, unknown> = {
        type: "task",
        title: sub,
        status: "open",
        created: earliestDate,
        topics: [projectsTopicRef, projectTopicRef],
      };

      fs.writeFileSync(path.join(tasksDir, `${taskSlug}.md`), serialize(fm, taskBody));
      registerEntity(sub, "task", taskSlug);
      stats.tasks++;
    }
  }

  // --- Resolve wikilinks in all written files ---
  resolveWikilinksInDir(notesDir);
  resolveWikilinksInDir(tasksDir);
  resolveWikilinksInDir(docsDir);

  // --- Generate topics.yaml ---
  const topicEntries = [...topicRegistry.entries()]
    .map(([slug, label]) => ({ id: `#${slug}`, label }))
    .sort((a, b) => a.id.localeCompare(b.id));

  fs.writeFileSync(path.join(TARGET, "topics.yaml"), stringifyYaml(topicEntries));

  // --- Print summary ---
  console.log("=== Conversion Summary ===");
  console.log(`  Notes created:          ${stats.notes}`);
  console.log(`  Tasks created:          ${stats.tasks}`);
  console.log(`  Docs created:           ${stats.docs}`);
  console.log(`  Topics discovered:      ${topicEntries.length}`);
  console.log(`  Images copied:          ${stats.images}`);
  console.log(`  Wiki-links seen:        ${stats.wikiLinks}`);
  console.log(`    resolved:             ${stats.wikiLinksResolved}`);
  console.log(`    unresolved (flat):    ${stats.wikiLinksUnresolved}`);
  if (unresolvedWikilinks.length > 0) {
    const unique = [...new Set(unresolvedWikilinks)];
    for (const w of unique) console.log(`      - [[${w}]]`);
  }
  console.log(`  Image embeds converted: ${stats.imageEmbeds}`);
  console.log(`  Callouts converted:     ${stats.callouts}`);
  console.log(`  Dataview queries removed: ${stats.dataviewQueries}`);
  console.log(`  HTML blocks removed:    ${stats.htmlBlocks}`);
  console.log(`  Broken embeds:          ${stats.brokenEmbeds}`);
  if (brokenEmbedFiles.length > 0) {
    for (const f of brokenEmbedFiles) {
      console.log(`    - ${f}`);
    }
  }
  console.log(`  Skipped files:          ${stats.skipped}`);
  if (skippedFiles.length > 0) {
    for (const f of skippedFiles) {
      console.log(`    - ${f}`);
    }
  }
  console.log(`\nOutput: ${TARGET}`);
}

// --- Wikilink post-pass (code-fence-aware) ---

/**
 * Resolve `[[Page Name]]` wikilinks in every .md file under dir.
 * Already-typed `[[doc:...]]`, `[[note:...]]`, `[[task:...]]` are left alone.
 * Unresolved targets are flattened to plain text (display alias preferred).
 * Lines inside fenced code blocks (```) and inline code (`...`) are skipped.
 */
function resolveWikilinksInDir(dir: string): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const full = path.join(dir, entry.name);
    const content = fs.readFileSync(full, "utf-8");
    const updated = resolveWikilinksInContent(content);
    if (updated !== content) {
      fs.writeFileSync(full, updated);
    }
  }
}

function resolveWikilinksInContent(content: string): string {
  const lines = content.split("\n");
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    lines[i] = replaceOutsideInlineCode(line, resolveWikilinksInText);
  }
  return lines.join("\n");
}

function replaceOutsideInlineCode(line: string, fn: (s: string) => string): string {
  const parts = line.split(/(`[^`]+`)/);
  return parts
    .map((p) => (p.startsWith("`") && p.endsWith("`") ? p : fn(p)))
    .join("");
}

function resolveWikilinksInText(text: string): string {
  return text.replace(/(?<!!)\[\[([^\]\n]+)\]\]/g, (_match, inner: string) => {
    // Leave already-typed wikilinks alone
    if (/^(doc|note|task):/.test(inner)) return `[[${inner}]]`;
    const parts = inner.split("|");
    const target = parts[0]!.trim();
    const display = parts.length > 1 ? parts.slice(1).join("|").trim() : null;
    const targetNoAnchor = target.split("#")[0]!.trim();
    const entry = titleMap.get(normalizeTitle(targetNoAnchor));
    if (entry) {
      stats.wikiLinksResolved++;
      return `[[${entry.type}:${entry.slug}]]`;
    }
    stats.wikiLinksUnresolved++;
    unresolvedWikilinks.push(inner);
    return display ?? target;
  });
}

main();
