/**
 * Test data factory — creates isolated temp directories with markdown fixtures.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { makeNote, makeTask, makeDoc } from "./markdown-templates";

export type Preset = "full" | "minimal" | "empty";

function writeFile(root: string, subdir: string, filename: string, content: string): void {
  fs.writeFileSync(path.join(root, subdir, filename), content);
}

function populateFull(root: string): void {
  // --- Notes ---
  const todayNote = makeNote({
    date: "2026-03-24",
    body: "Today's daily note.\n\nReference to [[task:fix-login-bug]] and @alice.",
  });
  writeFile(root, "notes", todayNote.filename, todayNote.content);

  const meetingNote = makeNote({
    date: "2026-03-24",
    title: "Meeting Notes",
    topics: ["#project"],
    body: "## Agenda\n\n- **Review** sprint progress\n- Plan next iteration\n\n1. Item one\n2. Item two",
  });
  writeFile(root, "notes", meetingNote.filename, meetingNote.content);

  const yesterdayNote = makeNote({
    date: "2026-03-23",
    body: "Yesterday's note about #frontend work.",
  });
  writeFile(root, "notes", yesterdayNote.filename, yesterdayNote.content);

  const oldNote = makeNote({
    date: "2026-03-01",
    body: "Older note referencing [[doc:project-plan]].",
  });
  writeFile(root, "notes", oldNote.filename, oldNote.content);

  // --- Tasks ---
  const task1 = makeTask({
    slug: "fix-login-bug",
    title: "Fix Login Bug",
    status: "open",
    created: "2026-03-20",
    due: "2026-03-28",
    topics: ["#project", "@alice"],
    body: "- [ ] Reproduce the issue\n- [ ] Write failing test\n- [ ] Fix the bug",
  });
  writeFile(root, "tasks", task1.filename, task1.content);

  const task2 = makeTask({
    slug: "write-docs",
    title: "Write Docs",
    status: "open",
    created: "2026-03-15",
    topics: ["#project"],
  });
  writeFile(root, "tasks", task2.filename, task2.content);

  const task3 = makeTask({
    slug: "old-feature",
    title: "Old Feature",
    status: "done",
    created: "2026-02-01",
  });
  writeFile(root, "tasks", task3.filename, task3.content);

  const task4 = makeTask({
    slug: "abandoned-work",
    title: "Abandoned Work",
    status: "cancelled",
    created: "2026-02-15",
  });
  writeFile(root, "tasks", task4.filename, task4.content);

  // --- Docs ---
  const doc1 = makeDoc({
    slug: "project-plan",
    title: "Project Plan",
    created: "2026-01-15",
    pinned: true,
    topics: ["#project"],
    body: "The main project plan.\n\nSee [[task:fix-login-bug]] and [[task:write-docs]].",
  });
  writeFile(root, "docs", doc1.filename, doc1.content);

  const doc2 = makeDoc({
    slug: "meeting-template",
    title: "Meeting Template",
    created: "2026-02-01",
  });
  writeFile(root, "docs", doc2.filename, doc2.content);

  const doc3 = makeDoc({
    slug: "api-reference",
    title: "API Reference",
    created: "2026-02-10",
    topics: ["#frontend"],
    body: "## Endpoints\n\n```json\n{ \"url\": \"/api/v1\" }\n```",
  });
  writeFile(root, "docs", doc3.filename, doc3.content);
}

function populateMinimal(root: string): void {
  const note = makeNote({ date: "2026-03-24", body: "A simple note." });
  writeFile(root, "notes", note.filename, note.content);

  const task = makeTask({
    slug: "sample-task",
    title: "Sample Task",
    status: "open",
    created: "2026-03-20",
  });
  writeFile(root, "tasks", task.filename, task.content);

  const doc = makeDoc({
    slug: "sample-doc",
    title: "Sample Doc",
    created: "2026-03-01",
  });
  writeFile(root, "docs", doc.filename, doc.content);
}

export function createTestRoot(preset: Preset = "full"): string {
  const id = crypto.randomBytes(4).toString("hex");
  const root = `/tmp/nslnotes-test-${id}`;
  fs.mkdirSync(path.join(root, "notes"), { recursive: true });
  fs.mkdirSync(path.join(root, "tasks"), { recursive: true });
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });

  if (preset === "full") populateFull(root);
  else if (preset === "minimal") populateMinimal(root);
  // "empty" — just the directory structure

  return root;
}

export function removeTestRoot(root: string): void {
  fs.rmSync(root, { recursive: true, force: true });
}
