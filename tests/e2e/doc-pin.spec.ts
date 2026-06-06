import { test, expect } from "@playwright/test";
import * as path from "node:path";
import { setupApp, teardownApp } from "./helpers/app-setup";
import {
  pinButton,
  pinnedButton,
  sidebar,
  sidebarDocUnpinStar,
  sidebarDocPinStar,
} from "./helpers/selectors";
import { expectFrontmatter, readFrontmatter } from "./helpers/assertions";

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

  test("clicking the sidebar star unpins the doc", async ({ page }) => {
    // Project Plan is pinned in the fixture and shows a star in the sidebar
    const star = sidebarDocUnpinStar(page, "Project Plan");
    await expect(star).toBeVisible({ timeout: 10_000 });

    // Click the star to unpin (without navigating to the doc)
    await star.click();

    // Star disappears (doc no longer pinned)
    await expect(star).toHaveCount(0, { timeout: 5000 });

    // Frontmatter key removed on disk
    const fm = readFrontmatter(path.join(testRoot, "docs", "project-plan.md"));
    expect(fm["pinned"]).toBeUndefined();
  });

  test("clicking the sidebar star pins an unpinned doc", async ({ page }) => {
    // Meeting Template is unpinned in the fixture; its row exposes a "Pin doc" star
    const star = sidebarDocPinStar(page, "Meeting Template");
    await expect(star).toBeVisible({ timeout: 10_000 });

    // Click the star to pin (without navigating to the doc)
    await star.click();

    // Star flips to the unpin affordance (now pinned)
    await expect(
      sidebarDocUnpinStar(page, "Meeting Template"),
    ).toBeVisible({ timeout: 5000 });

    // Frontmatter written to disk
    expectFrontmatter(
      path.join(testRoot, "docs", "meeting-template.md"),
      "pinned",
      true,
    );
  });
});
