import { test, expect } from "@playwright/test";
import * as path from "node:path";
import { setupApp, teardownApp } from "./helpers/app-setup";
import { sidebar, centerPanel, rightPanel, rightPanelTask, todayButton, tiptapEditor } from "./helpers/selectors";
import { typeInEditor, waitForFileContent } from "./helpers/editor";

test.describe("Navigation history", () => {
  let testRoot: string;

  test.beforeEach(async ({ page }) => {
    ({ testRoot } = await setupApp(page));
  });

  test.afterEach(() => {
    teardownApp(testRoot);
  });

  test("browser back returns to previous view", async ({ page }) => {
    // Start at journal (home)
    await expect(centerPanel(page).getByText("Today", { exact: true }).first()).toBeVisible({ timeout: 5000 });

    // Navigate to a doc
    await sidebar(page).locator("button", { hasText: "API Reference" }).first().click();
    await expect(centerPanel(page).getByText("API Reference")).toBeVisible({ timeout: 5000 });

    // Go back
    await page.goBack();
    await expect(centerPanel(page).getByText("Today", { exact: true }).first()).toBeVisible({ timeout: 5000 });
  });

  test("browser forward returns to next view", async ({ page }) => {
    // Navigate to doc then back
    await sidebar(page).locator("button", { hasText: "API Reference" }).first().click();
    await expect(centerPanel(page).getByText("API Reference")).toBeVisible({ timeout: 5000 });
    await page.goBack();
    await expect(centerPanel(page).getByText("Today", { exact: true }).first()).toBeVisible({ timeout: 5000 });

    // Go forward
    await page.goForward();
    await expect(centerPanel(page).getByText("API Reference")).toBeVisible({ timeout: 5000 });
  });

  test("navigating through multiple entities creates history", async ({ page }) => {
    // Visit doc
    await sidebar(page).locator("button", { hasText: "API Reference" }).first().click();
    await expect(centerPanel(page).getByText("API Reference")).toBeVisible({ timeout: 5000 });

    // Visit task
    await rightPanelTask(page, "Fix Login Bug").first().click();
    await expect(centerPanel(page).getByText("Fix Login Bug")).toBeVisible({ timeout: 5000 });

    // Back should go to doc
    await page.goBack();
    await expect(centerPanel(page).getByText("API Reference")).toBeVisible({ timeout: 5000 });

    // Back again should go to journal
    await page.goBack();
    await expect(centerPanel(page).getByText("Today", { exact: true }).first()).toBeVisible({ timeout: 5000 });
  });

  test("back button shows fresh content for an edited entity, not the pre-edit snapshot", async ({ page }) => {
    const docFile = path.join(testRoot, "docs", "api-reference.md");

    // Navigate to a doc and edit it.
    await sidebar(page).locator("button", { hasText: "API Reference" }).first().click();
    await expect(centerPanel(page).getByText("API Reference")).toBeVisible({ timeout: 5000 });
    await typeInEditor(page, " FRESH-EDIT-MARKER");
    await waitForFileContent(page, docFile, "FRESH-EDIT-MARKER", 5000);

    // Navigate to a different entity (a task).
    await rightPanelTask(page, "Fix Login Bug").first().click();
    await expect(centerPanel(page).getByText("Fix Login Bug")).toBeVisible({ timeout: 5000 });

    // Back button should restore the doc with the EDITED content, not the
    // pre-edit snapshot that the history entry froze.
    await page.goBack();
    await expect(centerPanel(page).getByText("API Reference")).toBeVisible({ timeout: 5000 });
    await expect(tiptapEditor(page).getByText("FRESH-EDIT-MARKER")).toBeVisible({ timeout: 5000 });
  });

  test("Today button from journal resets to home state", async ({ page }) => {
    // Navigate away
    await sidebar(page).locator("button", { hasText: "API Reference" }).first().click();
    await page.waitForTimeout(300);
    // Click Today to go home
    await todayButton(page).click();
    await expect(centerPanel(page).getByText("Today", { exact: true }).first()).toBeVisible({ timeout: 5000 });
  });
});
