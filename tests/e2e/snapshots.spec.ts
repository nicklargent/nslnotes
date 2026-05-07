import { test, expect } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";
import { setupApp, teardownApp } from "./helpers/app-setup";
import {
  centerPanel,
  rightPanel,
  rightPanelTask,
  sidebar,
} from "./helpers/selectors";
import { typeInEditor, waitForFileContent } from "./helpers/editor";

function listSnapshots(testRoot: string, subdir: string, baseName: string): string[] {
  const dir = path.join(testRoot, ".backups", subdir);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(`${baseName}.`) && f.endsWith(".bak"));
}

function snapshotPath(testRoot: string, subdir: string, name: string): string {
  return path.join(testRoot, ".backups", subdir, name);
}

test.describe("Write snapshots", () => {
  let testRoot: string;

  test.beforeEach(async ({ page }) => {
    ({ testRoot } = await setupApp(page));
  });

  test.afterEach(() => {
    teardownApp(testRoot);
  });

  test("editing a task creates a .backups snapshot of the pre-edit content", async ({ page }) => {
    const taskFile = path.join(testRoot, "tasks", "fix-login-bug.md");
    const original = fs.readFileSync(taskFile, "utf-8");

    await rightPanelTask(page, "Fix Login Bug").first().click();
    await page.waitForTimeout(500);

    await typeInEditor(page, " more text");
    await waitForFileContent(page, taskFile, "more text", 5000);

    const snaps = listSnapshots(testRoot, "tasks", "fix-login-bug.md");
    expect(snaps.length).toBeGreaterThanOrEqual(1);
    const snapContent = fs.readFileSync(
      snapshotPath(testRoot, "tasks", snaps[0]!),
      "utf-8",
    );
    expect(snapContent).toBe(original);
  });

  test("frontmatter-only edits also produce snapshots", async ({ page }) => {
    const taskFile = path.join(testRoot, "tasks", "fix-login-bug.md");
    const original = fs.readFileSync(taskFile, "utf-8");

    await rightPanelTask(page, "Fix Login Bug").first().click();
    await page.waitForTimeout(500);

    // Mark Done writes only frontmatter — should still snapshot.
    await centerPanel(page).getByRole("button", { name: "Mark Done" }).click();
    await page.waitForTimeout(500);

    const snaps = listSnapshots(testRoot, "tasks", "fix-login-bug.md");
    expect(snaps.length).toBeGreaterThanOrEqual(1);
    const snapContent = fs.readFileSync(
      snapshotPath(testRoot, "tasks", snaps[0]!),
      "utf-8",
    );
    expect(snapContent).toBe(original);
  });

  test("editing a different file resets the rate-limit session", async ({ page }) => {
    const flbFile = path.join(testRoot, "tasks", "fix-login-bug.md");
    const wdFile = path.join(testRoot, "tasks", "write-docs.md");

    // First edit on task A → snapshot 1.
    await rightPanelTask(page, "Fix Login Bug").first().click();
    await page.waitForTimeout(500);
    await typeInEditor(page, " edit-1");
    await waitForFileContent(page, flbFile, "edit-1", 5000);
    expect(listSnapshots(testRoot, "tasks", "fix-login-bug.md").length).toBe(1);

    // Edit a different task → snapshot for that task (different path resets session).
    await rightPanelTask(page, "Write Docs").first().click();
    await page.waitForTimeout(500);
    await typeInEditor(page, "wd-edit");
    await waitForFileContent(page, wdFile, "wd-edit", 5000);
    expect(listSnapshots(testRoot, "tasks", "write-docs.md").length).toBe(1);

    // Back to A, edit → another snapshot of A (different from last-written-path).
    await rightPanelTask(page, "Fix Login Bug").first().click();
    await page.waitForTimeout(500);
    await typeInEditor(page, " edit-2");
    await waitForFileContent(page, flbFile, "edit-2", 5000);
    expect(listSnapshots(testRoot, "tasks", "fix-login-bug.md").length).toBe(2);
  });

  test("typing in a daily note produces only one snapshot, not one per debounce", async ({ page }) => {
    // Today's daily note exists in the fixture at notes/2026-03-24.md.
    const dailyFile = path.join(testRoot, "notes", "2026-03-24.md");

    // Click Today to navigate to the journal view.
    await sidebar(page).getByRole("button", { name: "Today" }).click();
    await page.waitForTimeout(500);

    // Find the daily-note editor (TipTap inside the center panel).
    const editor = centerPanel(page).locator(".tiptap").first();
    await editor.click();
    await page.keyboard.type(" first");
    await waitForFileContent(page, dailyFile, "first", 5000);
    await page.keyboard.type(" second");
    await waitForFileContent(page, dailyFile, "second", 5000);
    await page.keyboard.type(" third");
    await waitForFileContent(page, dailyFile, "third", 5000);

    const snaps = listSnapshots(testRoot, "notes", "2026-03-24.md");
    expect(snaps.length).toBe(1);
  });

  test("rapid consecutive edits within the rate-limit window produce only one snapshot", async ({ page }) => {
    const taskFile = path.join(testRoot, "tasks", "fix-login-bug.md");

    await rightPanelTask(page, "Fix Login Bug").first().click();
    await page.waitForTimeout(500);

    // First edit-and-save.
    await typeInEditor(page, " first");
    await waitForFileContent(page, taskFile, "first", 5000);

    // Second edit without leaving the file — within the 5-min rate limit.
    // Type via keyboard (no re-click) so we append at the cursor.
    await page.keyboard.type(" second");
    await waitForFileContent(page, taskFile, "second", 5000);

    const snaps = listSnapshots(testRoot, "tasks", "fix-login-bug.md");
    expect(snaps.length).toBe(1);
  });
});

// Must match TEST_TODAY in tests/e2e/helpers/app-setup.ts — the app uses a
// frozen clock at this instant, so all seeded snapshot timestamps must be
// computed relative to it (NOT the real Node-side Date.now()).
const TEST_TODAY_MS = Date.parse("2026-03-24T12:00:00Z");

function isoFsSafe(d: Date): string {
  return d.toISOString().replace(/:/g, "-");
}

function seedSnapshotName(daysAgo: number): string {
  const d = new Date(TEST_TODAY_MS - daysAgo * 24 * 60 * 60 * 1000);
  return `fix-login-bug.md.${isoFsSafe(d)}.bak`;
}

test.describe("Snapshot cleanup", () => {
  let testRoot: string;

  test.beforeEach(async ({ page }) => {
    ({ testRoot } = await setupApp(page));
  });

  test.afterEach(() => {
    teardownApp(testRoot);
  });

  test("keeps 2 most recent and deletes older >30 days on new snapshot", async ({ page }) => {
    const backupDir = path.join(testRoot, ".backups", "tasks");
    fs.mkdirSync(backupDir, { recursive: true });

    // Seed: 1 fresh (5 days), 1 fresh (10 days), 3 old (60/61/62 days).
    const seeds = [
      seedSnapshotName(5),
      seedSnapshotName(10),
      seedSnapshotName(60),
      seedSnapshotName(61),
      seedSnapshotName(62),
    ];
    for (const s of seeds) {
      fs.writeFileSync(path.join(backupDir, s), "stub-backup-content");
    }

    const taskFile = path.join(testRoot, "tasks", "fix-login-bug.md");
    await rightPanelTask(page, "Fix Login Bug").first().click();
    await page.waitForTimeout(500);
    await typeInEditor(page, " trigger-cleanup");
    await waitForFileContent(page, taskFile, "trigger-cleanup", 5000);

    const remaining = fs
      .readdirSync(backupDir)
      .filter((f) => f.startsWith("fix-login-bug.md.") && f.endsWith(".bak"))
      .sort();

    // After cleanup we expect: the new snapshot at TEST_TODAY + the 5d + the 10d
    // (all <30 days, so none deletable), and the three 60+ day-olds removed.
    expect(remaining.length).toBe(3);
    expect(remaining.some((f) => f.includes(seedSnapshotName(5).slice(17, 27)))).toBeTruthy();
    expect(remaining.some((f) => f.includes(seedSnapshotName(10).slice(17, 27)))).toBeTruthy();
    expect(remaining.every((f) => !f.includes(seedSnapshotName(60).slice(17, 27)))).toBeTruthy();
  });

  test("keeps 2 newest even when both are >30 days old", async ({ page }) => {
    const backupDir = path.join(testRoot, ".backups", "tasks");
    fs.mkdirSync(backupDir, { recursive: true });

    const seeds = [seedSnapshotName(60), seedSnapshotName(70), seedSnapshotName(80)];
    for (const s of seeds) {
      fs.writeFileSync(path.join(backupDir, s), "stub-backup-content");
    }

    const taskFile = path.join(testRoot, "tasks", "fix-login-bug.md");
    await rightPanelTask(page, "Fix Login Bug").first().click();
    await page.waitForTimeout(500);
    await typeInEditor(page, " edit");
    await waitForFileContent(page, taskFile, "edit", 5000);

    const remaining = fs
      .readdirSync(backupDir)
      .filter((f) => f.startsWith("fix-login-bug.md.") && f.endsWith(".bak"))
      .sort();

    // Expected: the new snapshot at TEST_TODAY + the 60-day-old (the most recent
    // of the seeds, protected by KEEP_NEWEST=2). The 70- and 80-day-olds are >30
    // days AND past the keep-2 window, so they're deleted.
    expect(remaining.length).toBe(2);
  });
});
