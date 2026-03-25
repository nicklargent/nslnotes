/**
 * Markdown file builders matching frontmatter schemas from src/lib/frontmatter.ts.
 */

export interface NoteOptions {
  date: string;
  title?: string;
  topics?: string[];
  body?: string;
}

export interface TaskOptions {
  slug: string;
  title: string;
  status?: "open" | "done" | "cancelled";
  created?: string;
  due?: string;
  topics?: string[];
  body?: string;
}

export interface DocOptions {
  slug: string;
  title: string;
  created?: string;
  pinned?: boolean;
  topics?: string[];
  body?: string;
}

function yamlArray(items: string[]): string {
  return `\n${items.map((i) => `  - "${i}"`).join("\n")}`;
}

export function makeNote(opts: NoteOptions): { filename: string; content: string } {
  const lines = ["---", 'type: "note"', `date: "${opts.date}"`];
  if (opts.title) lines.push(`title: "${opts.title}"`);
  if (opts.topics?.length) lines.push(`topics:${yamlArray(opts.topics)}`);
  lines.push("---");
  if (opts.body) lines.push("", opts.body);
  lines.push("");

  const slug = opts.title
    ? `${opts.date}-${opts.title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")}`
    : opts.date;
  return { filename: `${slug}.md`, content: lines.join("\n") };
}

export function makeTask(opts: TaskOptions): { filename: string; content: string } {
  const status = opts.status ?? "open";
  const created = opts.created ?? "2026-03-01";
  const lines = [
    "---",
    'type: "task"',
    `title: "${opts.title}"`,
    `status: "${status}"`,
    `created: "${created}"`,
  ];
  if (opts.due) lines.push(`due: "${opts.due}"`);
  if (opts.topics?.length) lines.push(`topics:${yamlArray(opts.topics)}`);
  lines.push("---");
  if (opts.body) lines.push("", opts.body);
  lines.push("");

  return { filename: `${opts.slug}.md`, content: lines.join("\n") };
}

export function makeDoc(opts: DocOptions): { filename: string; content: string } {
  const created = opts.created ?? "2026-03-01";
  const lines = [
    "---",
    'type: "doc"',
    `title: "${opts.title}"`,
    `created: "${created}"`,
  ];
  if (opts.pinned) lines.push("pinned: true");
  if (opts.topics?.length) lines.push(`topics:${yamlArray(opts.topics)}`);
  lines.push("---");
  if (opts.body) lines.push("", opts.body);
  lines.push("");

  return { filename: `${opts.slug}.md`, content: lines.join("\n") };
}
