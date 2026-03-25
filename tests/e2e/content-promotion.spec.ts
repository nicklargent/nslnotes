import { test, expect } from "@playwright/test";
import { setupApp, teardownApp } from "./helpers/app-setup";
import { sidebar, tiptapEditor, bubbleMenu } from "./helpers/selectors";
import { typeInEditor, selectAllInEditor, waitForSave } from "./helpers/editor";

test.describe("Content promotion (extract)", () => {
  let testRoot: string;

  test.beforeEach(async ({ page }) => {
    ({ testRoot } = await setupApp(page));
    await sidebar(page).locator("button", { hasText: "Meeting Template" }).first().click();
    await page.waitForTimeout(500);
  });

  test.afterEach(() => {
    teardownApp(testRoot);
  });

  test("Extract button appears in bubble menu", async ({ page }) => {
    await typeInEditor(page, "Content to extract");
    await waitForSave(page, 500);
    await selectAllInEditor(page);
    await page.waitForTimeout(300);
    await expect(bubbleMenu(page)).toBeVisible({ timeout: 2000 });
    const extractBtn = bubbleMenu(page).getByRole("button", { name: "Extract" });
    await expect(extractBtn).toBeVisible();
  });

  test("Extract triggers promote flow", async ({ page }) => {
    await typeInEditor(page, "Promotable content here");
    await waitForSave(page, 500);
    await selectAllInEditor(page);
    await page.waitForTimeout(300);
    await expect(bubbleMenu(page)).toBeVisible({ timeout: 2000 });
    const extractBtn = bubbleMenu(page).getByRole("button", { name: "Extract" });
    await extractBtn.click();
    // After clicking extract, the bubble menu closes and the promote confirm bar appears
    // The confirm bar is a fixed z-50 element with animate-bubble-up
    // It should contain slug input and type buttons
    const confirmBar = page.locator(".animate-bubble-up").last();
    await expect(confirmBar).toBeVisible({ timeout: 3000 });
  });

  test("Escape cancels promote flow", async ({ page }) => {
    await typeInEditor(page, "Cancel this extraction");
    await waitForSave(page, 500);
    await selectAllInEditor(page);
    await page.waitForTimeout(300);
    await expect(bubbleMenu(page)).toBeVisible({ timeout: 2000 });
    await bubbleMenu(page).getByRole("button", { name: "Extract" }).click();
    const confirmBar = page.locator(".animate-bubble-up").last();
    await expect(confirmBar).toBeVisible({ timeout: 3000 });
    await page.keyboard.press("Escape");
    // The confirm bar should close (only the original bubble-up elements remain)
    await page.waitForTimeout(500);
    // Verify no promote bar is visible
    const promoteVisible = await page.locator(".animate-bubble-up").filter({ hasText: /Task|Doc|Note/ }).isVisible();
    expect(promoteVisible).toBe(false);
  });

  test("promote confirm bar has type buttons", async ({ page }) => {
    await typeInEditor(page, "Content for type buttons");
    await waitForSave(page, 500);
    // Select the typed line with Shift+Home to create a paragraph selection
    await page.keyboard.press("Shift+Home");
    await page.waitForTimeout(300);
    await expect(bubbleMenu(page)).toBeVisible({ timeout: 2000 });
    await bubbleMenu(page).getByRole("button", { name: "Extract" }).click();
    // PromoteConfirmBar contains a "slug:" label — use that to distinguish from BubbleMenu
    const confirmBar = page.locator(".animate-bubble-up").filter({ hasText: "slug:" });
    await expect(confirmBar).toBeVisible({ timeout: 3000 });
    // Check for the type buttons
    await expect(confirmBar.locator("button", { hasText: "Task" })).toBeVisible({ timeout: 2000 });
    await expect(confirmBar.locator("button", { hasText: "Doc" })).toBeVisible({ timeout: 2000 });
  });
});
