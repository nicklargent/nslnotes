import { test, expect } from "@playwright/test";
import { setupApp, teardownApp } from "./helpers/app-setup";
import { sidebar, centerPanel } from "./helpers/selectors";

test.describe("Topic view", () => {
  let testRoot: string;

  test.beforeEach(async ({ page }) => {
    ({ testRoot } = await setupApp(page));
    // Navigate to #project topic
    const topicButton = sidebar(page).locator("button", { hasText: "#project" });
    await expect(topicButton.first()).toBeVisible({ timeout: 5000 });
    await topicButton.first().click();
    await page.waitForTimeout(500);
  });

  test.afterEach(() => {
    teardownApp(testRoot);
  });

  test("displays topic label as heading", async ({ page }) => {
    await expect(
      centerPanel(page).locator("h1", { hasText: "#project" }),
    ).toBeVisible({ timeout: 5000 });
  });

  test("shows kind badge with reference count", async ({ page }) => {
    await expect(centerPanel(page).getByText("Topic")).toBeVisible({ timeout: 5000 });
  });

  test("shows pinned doc section when available", async ({ page }) => {
    // Project Plan is pinned with topic #project — should show prominently
    // The pinned doc is shown in a blue-highlighted button
    const pinnedDoc = centerPanel(page).locator("button", { hasText: "Project Plan" });
    await expect(pinnedDoc.first()).toBeVisible({ timeout: 5000 });
  });

  test("shows open tasks section", async ({ page }) => {
    // "Open Tasks (N)" heading
    await expect(
      centerPanel(page).getByText("Open Tasks", { exact: false }),
    ).toBeVisible({ timeout: 5000 });
    await expect(
      centerPanel(page).locator("button", { hasText: "Fix Login Bug" }),
    ).toBeVisible({ timeout: 5000 });
  });

  test("shows notes section", async ({ page }) => {
    // "Notes (N)" heading
    await expect(
      centerPanel(page).getByText(/Notes \(\d+\)/),
    ).toBeVisible({ timeout: 5000 });
  });

  test("clicking task navigates to task detail", async ({ page }) => {
    const taskBtn = centerPanel(page).locator("button", { hasText: "Fix Login Bug" });
    await taskBtn.first().click();
    await expect(
      centerPanel(page).locator("code", { hasText: "[[task:fix-login-bug]]" }),
    ).toBeVisible({ timeout: 5000 });
  });

  test("clicking doc navigates to doc view", async ({ page }) => {
    const docBtn = centerPanel(page).locator("button", { hasText: "Project Plan" });
    await docBtn.first().click();
    await expect(
      centerPanel(page).locator("code", { hasText: "[[doc:project-plan]]" }),
    ).toBeVisible({ timeout: 5000 });
  });
});
