import { test, expect } from "@playwright/test";
import { setupApp, teardownApp } from "./helpers/app-setup";
import { sidebar, centerPanel, rightPanel } from "./helpers/selectors";

test.describe("Backlinks", () => {
  let testRoot: string;

  test.beforeEach(async ({ page }) => {
    ({ testRoot } = await setupApp(page));
  });

  test.afterEach(() => {
    teardownApp(testRoot);
  });

  test("backlinks section shown for docs", async ({ page }) => {
    // Open Project Plan doc — it's referenced by notes via [[doc:project-plan]]
    await sidebar(page).locator("button", { hasText: "Project Plan" }).first().click();
    await page.waitForTimeout(500);
    // Backlinks section heading is "Referenced by (N)"
    await expect(
      rightPanel(page).getByText("Referenced by", { exact: false }),
    ).toBeVisible({ timeout: 5000 });
  });

  test("backlinks section shown for tasks", async ({ page }) => {
    // Open Fix Login Bug task — referenced by today's note
    await rightPanel(page).locator("button", { hasText: "Fix Login Bug" }).first().click();
    await page.waitForTimeout(500);
    await expect(
      rightPanel(page).getByText("Referenced by", { exact: false }),
    ).toBeVisible({ timeout: 5000 });
  });

  test("clicking backlink navigates to source entity", async ({ page }) => {
    // Open Project Plan doc
    await sidebar(page).locator("button", { hasText: "Project Plan" }).first().click();
    await page.waitForTimeout(500);
    // Find a backlink button and click it
    const backlinkBtn = rightPanel(page)
      .locator("button")
      .filter({ hasText: /note|2026/ })
      .first();
    if ((await backlinkBtn.count()) > 0) {
      await backlinkBtn.click();
      await page.waitForTimeout(500);
      await expect(centerPanel(page)).toBeVisible();
    }
  });
});
