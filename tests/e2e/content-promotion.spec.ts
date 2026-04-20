import { test, expect } from "@playwright/test";
import { setupApp, teardownApp } from "./helpers/app-setup";
import { sidebar, tiptapEditor, bubbleMenu } from "./helpers/selectors";
import {
  typeInEditor,
  selectAllInEditor,
  selectTextByShiftArrow,
  waitForSave,
} from "./helpers/editor";

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

  test("Multi-line selection uses first selected line as title", async ({ page }) => {
    await typeInEditor(page, "FIRST-LINE-HEADING");
    await page.keyboard.press("Enter");
    await page.keyboard.type("SECOND-LINE-BODY");
    await waitForSave(page, 500);
    await selectAllInEditor(page);
    await page.waitForTimeout(300);
    await expect(bubbleMenu(page)).toBeVisible({ timeout: 2000 });
    await bubbleMenu(page).getByRole("button", { name: "Extract" }).click();
    const confirmBar = page.locator(".animate-bubble-up").filter({ hasText: "slug:" });
    await expect(confirmBar).toBeVisible({ timeout: 3000 });
    await expect(confirmBar).toContainText("FIRST-LINE-HEADING");
    await expect(confirmBar).toContainText("+ content");
  });

  test("Within-paragraph selection falls back to block auto-detect", async ({ page }) => {
    await typeInEditor(page, "WHOLE-PARAGRAPH-WITH-TRAILING-XYZ");
    await waitForSave(page, 500);
    // Select only the trailing 3 chars "XYZ" — single-line selection (no newline)
    await selectTextByShiftArrow(page, 3);
    await page.waitForTimeout(300);
    await expect(bubbleMenu(page)).toBeVisible({ timeout: 2000 });
    await bubbleMenu(page).getByRole("button", { name: "Extract" }).click();
    const confirmBar = page.locator(".animate-bubble-up").filter({ hasText: "slug:" });
    await expect(confirmBar).toBeVisible({ timeout: 3000 });
    // Auto-detect picks the whole paragraph, not the 3-char selection
    await expect(confirmBar).toContainText("WHOLE-PARAGRAPH-WITH-TRAILING-XYZ");
  });

  test("Multi-line selection across list items uses first item as title", async ({ page }) => {
    // "* " triggers TipTap's bullet-list input rule
    await typeInEditor(page, "* BULLET-ALPHA");
    await page.keyboard.press("Enter");
    await page.keyboard.type("BULLET-BETA");
    await waitForSave(page, 500);
    await selectAllInEditor(page);
    await page.waitForTimeout(300);
    await expect(bubbleMenu(page)).toBeVisible({ timeout: 2000 });
    await bubbleMenu(page).getByRole("button", { name: "Extract" }).click();
    const confirmBar = page.locator(".animate-bubble-up").filter({ hasText: "slug:" });
    await expect(confirmBar).toBeVisible({ timeout: 3000 });
    await expect(confirmBar).toContainText("BULLET-ALPHA");
    await expect(confirmBar).toContainText("+ content");
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
