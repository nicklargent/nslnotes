import { parse, validateNote, validateTask, validateDoc } from "./frontmatter";
import type { Note, Task, Doc } from "../types/entities";
import type { TopicRef } from "../types/topics";

/**
 * Extract slug from a file path.
 * E.g., "/root/notes/2026-03-10.md" → "2026-03-10"
 */
function slugFromPath(path: string): string {
  const filename = path.split("/").pop() ?? "";
  return filename.replace(/\.md$/, "");
}

/**
 * Parse a note from file path and content.
 * Returns null if the file is not a valid note.
 */
export function parseNote(path: string, content: string): Note | null {
  const parsed = parse(content);
  if (!parsed) return null;

  const validation = validateNote(parsed.frontmatter);
  if (!validation.valid) return null;

  const fm = validation.data;
  const slug = slugFromPath(path);

  // A daily note has a slug that is just a date (YYYY-MM-DD)
  const isDaily = /^\d{4}-\d{2}-\d{2}$/.test(slug);

  return {
    type: "note",
    path,
    slug,
    topics: (fm.topics ?? []) as TopicRef[],
    frontmatter: parsed.frontmatter,
    content: parsed.body,
    modifiedAt: new Date(),
    date: fm.date,
    title: fm.title ?? null,
    isDaily,
  };
}

/**
 * Parse a task from file path and content.
 * Returns null if the file is not a valid task.
 */
export function parseTask(path: string, content: string): Task | null {
  const parsed = parse(content);
  if (!parsed) return null;

  const validation = validateTask(parsed.frontmatter);
  if (!validation.valid) return null;

  const fm = validation.data;
  const slug = slugFromPath(path);

  // Title: from frontmatter, or first non-empty line of body, or slug
  let title = fm.title ?? null;
  if (!title) {
    const firstLine = parsed.body.split("\n").find((l) => l.trim() !== "");
    title = firstLine?.replace(/^#+\s*/, "").trim() ?? slug;
  }

  return {
    type: "task",
    path,
    slug,
    topics: (fm.topics ?? []) as TopicRef[],
    frontmatter: parsed.frontmatter,
    content: parsed.body,
    modifiedAt: new Date(),
    status: fm.status,
    created: fm.created,
    due: fm.due ?? null,
    title,
  };
}

/**
 * Parse a doc from file path and content.
 * Returns null if the file is not a valid doc.
 */
export function parseDoc(path: string, content: string): Doc | null {
  const parsed = parse(content);
  if (!parsed) return null;

  const validation = validateDoc(parsed.frontmatter);
  if (!validation.valid) return null;

  const fm = validation.data;
  const slug = slugFromPath(path);

  return {
    type: "doc",
    path,
    slug,
    topics: (fm.topics ?? []) as TopicRef[],
    frontmatter: parsed.frontmatter,
    content: parsed.body,
    modifiedAt: new Date(),
    title: fm.title,
    created: fm.created,
    pinned: fm.pinned === true,
  };
}
