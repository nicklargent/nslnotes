import { test, expect } from "@playwright/test";
import { setupApp, teardownApp } from "./helpers/app-setup";
import { sidebar, centerPanel, rightPanel, todayButton } from "./helpers/selectors";

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
    await rightPanel(page).locator("button", { hasText: "Fix Login Bug" }).first().click();
    await expect(centerPanel(page).getByText("Fix Login Bug")).toBeVisible({ timeout: 5000 });

    // Back should go to doc
    await page.goBack();
    await expect(centerPanel(page).getByText("API Reference")).toBeVisible({ timeout: 5000 });

    // Back again should go to journal
    await page.goBack();
    await expect(centerPanel(page).getByText("Today", { exact: true }).first()).toBeVisible({ timeout: 5000 });
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
