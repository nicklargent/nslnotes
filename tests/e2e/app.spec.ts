import { test, expect } from "@playwright/test";
import { setupApp, teardownApp } from "./helpers/app-setup";
import { sidebar, centerPanel, rightPanel } from "./helpers/selectors";

test.describe("App launch", () => {
  let testRoot: string;

  test.beforeEach(async ({ page }) => {
    ({ testRoot } = await setupApp(page));
  });

  test.afterEach(() => {
    teardownApp(testRoot);
  });

  test("shows three-column layout with content", async ({ page }) => {
    await expect(sidebar(page)).toBeVisible();
    await expect(centerPanel(page)).toBeVisible();
    await expect(rightPanel(page)).toBeVisible();
  });

  test("sidebar shows docs from fixtures", async ({ page }) => {
    await expect(sidebar(page).locator("button", { hasText: "Project Plan" })).toBeVisible({
      timeout: 5000,
    });
  });

  test("right panel shows tasks", async ({ page }) => {
    await expect(rightPanel(page).locator("button", { hasText: "Fix Login Bug" })).toBeVisible({
      timeout: 5000,
    });
  });

  test("journal view is shown by default", async ({ page }) => {
    // Today's date should appear in the journal
    await expect(centerPanel(page).getByText("Today", { exact: true }).first()).toBeVisible({ timeout: 5000 });
  });
});
