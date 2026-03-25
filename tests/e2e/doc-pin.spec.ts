import { test, expect } from "@playwright/test";
import * as path from "node:path";
import { setupApp, teardownApp } from "./helpers/app-setup";
import { pinButton, pinnedButton, sidebar } from "./helpers/selectors";
import { expectFrontmatter } from "./helpers/assertions";

test.describe("Doc pinning", () => {
  let testRoot: string;

  test.beforeEach(async ({ page }) => {
    ({ testRoot } = await setupApp(page));
  });

  test.afterEach(() => {
    teardownApp(testRoot);
  });

  test("pin button toggles pinned state and sidebar shows Pinned section", async ({
    page,
  }) => {
    // Click the doc to open it
    const docButton = sidebar(page).locator("button", { hasText: "Project Plan" });
    await expect(docButton.first()).toBeVisible({ timeout: 10_000 });
    await docButton.first().click();

    // Project Plan is already pinned in full fixture, so check Pinned state
    await expect(pinnedButton(page)).toBeVisible({ timeout: 5000 });
    await expect(pinnedButton(page)).toHaveClass(/text-amber/);

    // Verify the sidebar shows the "Pinned" section label
    const pinnedLabel = sidebar(page).locator("div", { hasText: /^Pinned$/ });
    await expect(pinnedLabel.first()).toBeVisible();

    // Verify the file on disk
    expectFrontmatter(path.join(testRoot, "docs", "project-plan.md"), "pinned", true);

    // Unpin
    await pinnedButton(page).click();

    // Verify it reverts to "Pin"
    await expect(pinButton(page)).toBeVisible({ timeout: 5000 });
  });

  test("pinned state persists after page reload", async ({ page }) => {
    // Open the Meeting Template doc (unpinned)
    const docButton = sidebar(page).locator("button", { hasText: "Meeting Template" });
    await expect(docButton.first()).toBeVisible({ timeout: 10_000 });
    await docButton.first().click();

    // Pin it
    await expect(pinButton(page)).toBeVisible({ timeout: 5000 });
    await pinButton(page).click();
    await expect(pinnedButton(page)).toBeVisible({ timeout: 5000 });

    // Reload
    await page.reload();

    // Verify the sidebar still shows "Pinned" section
    await expect(
      sidebar(page).locator(".text-\\[10px\\]", { hasText: "Pinned" }),
    ).toBeVisible({ timeout: 10_000 });

    // Click to re-open doc
    const docButton2 = sidebar(page).locator("button", { hasText: "Meeting Template" });
    await expect(docButton2.first()).toBeVisible({ timeout: 10_000 });
    await docButton2.first().click();

    // Verify still pinned
    await expect(pinnedButton(page)).toBeVisible({ timeout: 5000 });
  });
});
