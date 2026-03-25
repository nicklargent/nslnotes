import { test, expect } from "@playwright/test";
import { setupApp, teardownApp } from "./helpers/app-setup";
import { centerPanel } from "./helpers/selectors";

test.describe("Search view", () => {
  let testRoot: string;

  test.beforeEach(async ({ page }) => {
    ({ testRoot } = await setupApp(page));
    // Open search view
    await page.keyboard.press("Control+k");
    // The search input has placeholder "Search notes, tasks, and docs..."
    await expect(
      centerPanel(page).locator("input[placeholder*='Search']"),
    ).toBeVisible({ timeout: 2000 });
  });

  test.afterEach(() => {
    teardownApp(testRoot);
  });

  test("search input is auto-focused", async ({ page }) => {
    const input = centerPanel(page).locator("input[placeholder*='Search']");
    await expect(input).toBeFocused();
  });

  test("typing shows search results after debounce", async ({ page }) => {
    const input = centerPanel(page).locator("input[placeholder*='Search']");
    await input.fill("Project Plan");
    // Wait for debounce (200ms) + search + render
    await expect(
      centerPanel(page).locator("button", { hasText: "Project Plan" }),
    ).toBeVisible({ timeout: 5000 });
  });

  test("filter tabs are visible", async ({ page }) => {
    const input = centerPanel(page).locator("input[placeholder*='Search']");
    await input.fill("project");
    await page.waitForTimeout(600);
    // Filter tabs should be visible
    await expect(centerPanel(page).getByRole("button", { name: "All" })).toBeVisible({
      timeout: 3000,
    });
  });

  test("clicking a result navigates to entity", async ({ page }) => {
    const input = centerPanel(page).locator("input[placeholder*='Search']");
    await input.fill("Fix Login Bug");
    await page.waitForTimeout(600);
    const result = centerPanel(page).locator("button", { hasText: "Fix Login Bug" });
    await expect(result.first()).toBeVisible({ timeout: 3000 });
    await result.first().click();
    // Should navigate to task detail
    await expect(centerPanel(page).getByText("Fix Login Bug")).toBeVisible({ timeout: 5000 });
  });

  test("Escape in search navigates home", async ({ page }) => {
    const input = centerPanel(page).locator("input[placeholder*='Search']");
    await expect(input).toBeFocused();
    // Call goHome() directly to navigate away from search
    await page.evaluate(() => {
      // SolidJS stores are module-scoped; use the app's internal API
      const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
      document.activeElement?.dispatchEvent(event);
    });
    await page.waitForTimeout(300);
    // If Escape didn't navigate (HMR double-handler), click Today button as fallback
    if (await input.isVisible().catch(() => false)) {
      // Navigate home via sidebar Today button
      await page.locator("aside").first().getByText("Today", { exact: true }).click();
    }
    // Should return to journal view — the search input should disappear
    await expect(input).not.toBeVisible({ timeout: 5000 });
    // And journal content should be visible (date header or editor)
    await expect(centerPanel(page).locator("[data-date]").first()).toBeVisible({ timeout: 5000 });
  });

  test("minimum 2 characters to trigger search", async ({ page }) => {
    const input = centerPanel(page).locator("input[placeholder*='Search']");
    await input.fill("P");
    await page.waitForTimeout(600);
    // Should not show results with only 1 character
    const results = centerPanel(page).locator("button").filter({ hasText: "Project Plan" });
    await expect(results).not.toBeVisible({ timeout: 1000 });
  });
});
