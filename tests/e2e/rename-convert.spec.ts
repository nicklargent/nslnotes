import { test, expect } from "@playwright/test";
import * as path from "node:path";
import { setupApp, teardownApp } from "./helpers/app-setup";
import { sidebar, todayButton } from "./helpers/selectors";
import {
  expectFileExists,
  expectFileNotExists,
  expectFrontmatter,
  expectFileContains,
  readFile,
} from "./helpers/assertions";

test.describe("Rename / Convert tool", () => {
  let testRoot: string;

  test.beforeEach(async ({ page }) => {
    ({ testRoot } = await setupApp(page));
  });

  test.afterEach(() => {
    teardownApp(testRoot);
  });

  test("Doc → Task: file moves, type changes, inbound wikilink rewritten", async ({
    page,
  }) => {
    // Open Project Plan (a doc that is referenced by [[doc:project-plan]] in older note)
    const docButton = sidebar(page).locator("button", { hasText: "Project Plan" });
    await expect(docButton.first()).toBeVisible({ timeout: 10_000 });
    await docButton.first().click();
    await page.waitForTimeout(300);

    // Open the Rename / Convert dialog
    await page.locator('button[title="Rename / Convert"]').click();
    const dialog = page.locator(".fixed.inset-0").filter({ hasText: "Rename / Convert" });
    await expect(dialog).toBeVisible();

    // Switch to Task type
    await dialog.getByRole("radio", { name: "Task" }).click();
    await expect(dialog).toContainText("/tasks/project-plan.md");

    // Confirm: button label becomes "Convert"
    await dialog.getByRole("button", { name: "Convert" }).click();

    // Wait for the move to complete
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(500);

    // File system: doc gone, task exists
    expectFileNotExists(path.join(testRoot, "docs", "project-plan.md"));
    expectFileExists(path.join(testRoot, "tasks", "project-plan.md"));
    expectFrontmatter(
      path.join(testRoot, "tasks", "project-plan.md"),
      "type",
      "task"
    );
    expectFrontmatter(
      path.join(testRoot, "tasks", "project-plan.md"),
      "status",
      "open"
    );
    // Pinned should be stashed under _doc
    const taskFile = readFile(path.join(testRoot, "tasks", "project-plan.md"));
    expect(taskFile).toContain("_doc:");
    expect(taskFile).toContain("pinned: true");

    // Inbound link in older note should now read [[task:project-plan]]
    expectFileContains(
      path.join(testRoot, "notes", "2026-03-01.md"),
      "[[task:project-plan]]"
    );
  });

  test("Daily note: rename/convert button is not rendered", async ({ page }) => {
    // Use empty preset (no fixture notes), then click Today to create a fresh daily note
    teardownApp(testRoot);
    ({ testRoot } = await setupApp(page, { preset: "empty" }));
    await todayButton(page).click();
    await page.waitForTimeout(500);

    // No named notes exist, so no rename/convert buttons should appear anywhere
    const renameBtns = page.locator('button[title="Rename / Convert"]');
    await expect(renameBtns).toHaveCount(0);
  });

  test("Same-type slug rename: file moves, frontmatter preserved", async ({
    page,
  }) => {
    const docButton = sidebar(page).locator("button", { hasText: "API Reference" });
    await expect(docButton.first()).toBeVisible({ timeout: 10_000 });
    await docButton.first().click();
    await page.waitForTimeout(300);

    await page.locator('button[title="Rename / Convert"]').click();
    const dialog = page
      .locator(".fixed.inset-0")
      .filter({ hasText: "Rename / Convert" });
    await expect(dialog).toBeVisible();

    // Type stays Doc; change slug
    const slugInput = dialog.locator("#rename-slug");
    await slugInput.fill("api-docs");
    await expect(dialog).toContainText("/docs/api-docs.md");

    await dialog.getByRole("button", { name: "Rename" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(500);

    expectFileNotExists(path.join(testRoot, "docs", "api-reference.md"));
    expectFileExists(path.join(testRoot, "docs", "api-docs.md"));
    // Type still doc, title and topics preserved
    expectFrontmatter(
      path.join(testRoot, "docs", "api-docs.md"),
      "type",
      "doc"
    );
    expectFrontmatter(
      path.join(testRoot, "docs", "api-docs.md"),
      "title",
      "API Reference"
    );
    expectFrontmatter(
      path.join(testRoot, "docs", "api-docs.md"),
      "topics",
      ["#frontend"]
    );
  });
});
