import { test, expect } from "@playwright/test";
import * as path from "node:path";
import { setupApp, teardownApp } from "./helpers/app-setup";
import {
  rightPanel,
  centerPanel,
  openClosedToggle,
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
    await expect(rightPanel(page).getByText("Open Tasks")).toBeVisible({ timeout: 5000 });
    await expect(
      rightPanel(page).locator("button", { hasText: "Fix Login Bug" }),
    ).toBeVisible({ timeout: 5000 });
    await expect(
      rightPanel(page).locator("button", { hasText: "Write Docs" }),
    ).toBeVisible({ timeout: 5000 });
  });

  test("toggle switches to closed tasks", async ({ page }) => {
    await openClosedToggle(page).click();
    await expect(rightPanel(page).getByText("Closed Tasks")).toBeVisible({ timeout: 5000 });
    // Closed tasks: Old Feature (done) and Abandoned Work (cancelled)
    await expect(
      rightPanel(page).locator("button", { hasText: "Old Feature" }),
    ).toBeVisible({ timeout: 5000 });
    await expect(
      rightPanel(page).locator("button", { hasText: "Abandoned Work" }),
    ).toBeVisible({ timeout: 5000 });
  });

  test("toggle back to open tasks", async ({ page }) => {
    await openClosedToggle(page).click();
    await expect(rightPanel(page).getByText("Closed Tasks")).toBeVisible({ timeout: 3000 });
    await openClosedToggle(page).click();
    await expect(rightPanel(page).getByText("Open Tasks")).toBeVisible({ timeout: 3000 });
  });

  test("clicking task navigates to task detail", async ({ page }) => {
    const taskBtn = rightPanel(page).locator("button", { hasText: "Write Docs" });
    await taskBtn.first().click();
    await expect(centerPanel(page).getByText("Write Docs")).toBeVisible({ timeout: 5000 });
    // Should show task detail view
    await expect(
      centerPanel(page).locator("code", { hasText: "[[task:write-docs]]" }),
    ).toBeVisible({ timeout: 5000 });
  });

  test("clicking task navigates then can mark done via detail view", async ({ page }) => {
    // Navigate to task detail
    const taskBtn = rightPanel(page).locator("button", { hasText: "Fix Login Bug" });
    await taskBtn.first().click();
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
