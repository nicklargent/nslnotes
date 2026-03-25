import { test, expect } from "@playwright/test";
import * as path from "node:path";
import { setupApp, teardownApp } from "./helpers/app-setup";
import {
  rightPanel,
  centerPanel,
  markDoneButton,
  cancelTaskButton,
  reopenButton,
  deleteButton,
  confirmDeleteButton,
  confirmModal,
} from "./helpers/selectors";
import { waitForSave } from "./helpers/editor";
import { expectFrontmatter } from "./helpers/assertions";

test.describe("Task detail", () => {
  let testRoot: string;

  test.beforeEach(async ({ page }) => {
    ({ testRoot } = await setupApp(page));
    // Open Fix Login Bug task
    const taskButton = rightPanel(page).locator("button", { hasText: "Fix Login Bug" });
    await expect(taskButton.first()).toBeVisible({ timeout: 10_000 });
    await taskButton.first().click();
    await page.waitForTimeout(500);
  });

  test.afterEach(() => {
    teardownApp(testRoot);
  });

  test("displays task title and metadata", async ({ page }) => {
    await expect(centerPanel(page).getByText("Fix Login Bug")).toBeVisible();
    // Should show wikilink slug
    await expect(centerPanel(page).locator("code", { hasText: "[[task:fix-login-bug]]" })).toBeVisible();
    // Should show status badge
    await expect(centerPanel(page).getByText("open")).toBeVisible();
    // Should show due date
    await expect(centerPanel(page).getByText("2026-03-28")).toBeVisible();
  });

  test("title is editable", async ({ page }) => {
    const titleSpan = centerPanel(page).locator("span", { hasText: "Fix Login Bug" }).first();
    await titleSpan.click();
    const input = centerPanel(page).locator("input[type='text']").first();
    await expect(input).toBeVisible({ timeout: 2000 });
    await input.fill("Fix Login Issue");
    await page.keyboard.press("Enter");
    await waitForSave(page);
    expectFrontmatter(
      path.join(testRoot, "tasks", "fix-login-bug.md"),
      "title",
      "Fix Login Issue",
    );
  });

  test("Mark Done changes status to done", async ({ page }) => {
    await expect(markDoneButton(page)).toBeVisible({ timeout: 2000 });
    await markDoneButton(page).click();
    await waitForSave(page);
    // Status badge should change
    await expect(centerPanel(page).getByText("done")).toBeVisible({ timeout: 3000 });
    // Should now show Reopen button
    await expect(reopenButton(page)).toBeVisible({ timeout: 2000 });
    expectFrontmatter(
      path.join(testRoot, "tasks", "fix-login-bug.md"),
      "status",
      "done",
    );
  });

  test("Cancel changes status to cancelled", async ({ page }) => {
    await expect(cancelTaskButton(page)).toBeVisible({ timeout: 2000 });
    await cancelTaskButton(page).click();
    await waitForSave(page);
    await expect(centerPanel(page).getByText("cancelled")).toBeVisible({ timeout: 3000 });
    await expect(reopenButton(page)).toBeVisible({ timeout: 2000 });
    expectFrontmatter(
      path.join(testRoot, "tasks", "fix-login-bug.md"),
      "status",
      "cancelled",
    );
  });

  test("Reopen changes status back to open", async ({ page }) => {
    // First mark done
    await markDoneButton(page).click();
    await waitForSave(page);
    await expect(reopenButton(page)).toBeVisible({ timeout: 3000 });
    // Then reopen
    await reopenButton(page).click();
    await waitForSave(page);
    await expect(centerPanel(page).getByText("open")).toBeVisible({ timeout: 3000 });
    await expect(markDoneButton(page)).toBeVisible({ timeout: 2000 });
    expectFrontmatter(
      path.join(testRoot, "tasks", "fix-login-bug.md"),
      "status",
      "open",
    );
  });

  test("delete removes the task", async ({ page }) => {
    await deleteButton(page).click();
    await expect(confirmModal(page)).toBeVisible({ timeout: 2000 });
    await confirmDeleteButton(page).click();
    await expect(
      rightPanel(page).locator("button", { hasText: "Fix Login Bug" }),
    ).not.toBeVisible({ timeout: 5000 });
  });

  test("due date is editable", async ({ page }) => {
    // Click the due date label to edit
    const dueLabel = centerPanel(page).locator("span", { hasText: "2026-03-28" });
    await expect(dueLabel.first()).toBeVisible({ timeout: 2000 });
    await dueLabel.first().click();
    // Date input should appear
    const dateInput = centerPanel(page).locator("input[type='date']");
    await expect(dateInput).toBeVisible({ timeout: 2000 });
    await dateInput.fill("2026-04-15");
    await waitForSave(page);
    expectFrontmatter(
      path.join(testRoot, "tasks", "fix-login-bug.md"),
      "due",
      "2026-04-15",
    );
  });
});
