import { test, expect } from "@playwright/test";
import * as path from "node:path";
import { setupApp, teardownApp } from "./helpers/app-setup";
import {
  rightPanel,
  centerPanel,
  taskViewTab,
  createTaskButton,
} from "./helpers/selectors";
import { waitForSave } from "./helpers/editor";
import { expectFrontmatter } from "./helpers/assertions";

test.describe("Task list (right panel)", () => {
  let testRoot: string;

  test.beforeEach(async ({ page }) => {
    ({ testRoot } = await setupApp(page));
  });

  test.afterEach(() => {
    teardownApp(testRoot);
  });

  test("shows open tasks by default", async ({ page }) => {
    await expect(
      rightPanel(page).getByText("Fix Login Bug"),
    ).toBeVisible({ timeout: 5000 });
    await expect(
      rightPanel(page).getByText("Write Docs"),
    ).toBeVisible({ timeout: 5000 });
  });

  test("Closed tab switches to closed tasks", async ({ page }) => {
    await taskViewTab(page, "Closed").click();
    // Closed tasks: Old Feature (done) and Abandoned Work (cancelled)
    await expect(
      rightPanel(page).getByText("Old Feature"),
    ).toBeVisible({ timeout: 5000 });
    await expect(
      rightPanel(page).getByText("Abandoned Work"),
    ).toBeVisible({ timeout: 5000 });
    // Open task no longer shown
    await expect(rightPanel(page).getByText("Fix Login Bug")).toHaveCount(0);
  });

  test("tabs switch back to open tasks", async ({ page }) => {
    await taskViewTab(page, "Closed").click();
    await expect(rightPanel(page).getByText("Old Feature")).toBeVisible({ timeout: 3000 });
    await taskViewTab(page, "Open").click();
    await expect(rightPanel(page).getByText("Fix Login Bug")).toBeVisible({ timeout: 3000 });
  });

  test("clicking task navigates to task detail", async ({ page }) => {
    const taskRow = rightPanel(page).getByText("Write Docs");
    await taskRow.first().click();
    await expect(centerPanel(page).getByText("Write Docs")).toBeVisible({ timeout: 5000 });
    // Should show task detail view (SlugBadge code is hidden via opacity:0 until hover —
    // assert presence via text content rather than visibility)
    await expect(
      centerPanel(page).locator("code").filter({ hasText: "[[task:write-docs]]" }),
    ).toHaveCount(1, { timeout: 5000 });
  });

  test("clicking task navigates then can mark done via detail view", async ({ page }) => {
    // Navigate to task detail
    const taskRow = rightPanel(page).getByText("Fix Login Bug");
    await taskRow.first().click();
    await page.waitForTimeout(500);
    // Mark done via detail button
    const markDone = page.getByRole("button", { name: "Mark Done" });
    await expect(markDone).toBeVisible({ timeout: 3000 });
    await markDone.click();
    await waitForSave(page);
    expectFrontmatter(
      path.join(testRoot, "tasks", "fix-login-bug.md"),
      "status",
      "done",
    );
  });

  test("+ button opens task draft", async ({ page }) => {
    await createTaskButton(page).click();
    const input = centerPanel(page).locator("input[placeholder*='title']");
    await expect(input).toBeVisible({ timeout: 2000 });
  });
});
