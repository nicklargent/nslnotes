import { test, expect } from "@playwright/test";
import * as path from "node:path";
import { setupApp, teardownApp } from "./helpers/app-setup";
import { sidebar, tiptapEditor, wikilinkAutocomplete } from "./helpers/selectors";
import { typeInEditor, waitForSave } from "./helpers/editor";
import { expectFileContains } from "./helpers/assertions";

test.describe("Wikilink autocomplete", () => {
  let testRoot: string;

  test.beforeEach(async ({ page }) => {
    ({ testRoot } = await setupApp(page));
    // Navigate to a doc to have a clean editor
    await sidebar(page).locator("button", { hasText: "Meeting Template" }).first().click();
    await page.waitForTimeout(500);
  });

  test.afterEach(() => {
    teardownApp(testRoot);
  });

  test("[[ opens wikilink autocomplete popup", async ({ page }) => {
    const editor = tiptapEditor(page);
    await editor.click();
    await page.keyboard.type("[[");
    await expect(wikilinkAutocomplete(page)).toBeVisible({ timeout: 2000 });
  });

  test("shows tasks, docs, and notes in suggestions", async ({ page }) => {
    const editor = tiptapEditor(page);
    await editor.click();
    await page.keyboard.type("[[");
    await expect(wikilinkAutocomplete(page)).toBeVisible({ timeout: 2000 });
    // Should show type badges
    const popup = wikilinkAutocomplete(page);
    await expect(popup.locator("span", { hasText: "task" }).first()).toBeVisible();
    await expect(popup.locator("span", { hasText: "doc" }).first()).toBeVisible();
  });

  test("typing filters suggestions", async ({ page }) => {
    const editor = tiptapEditor(page);
    await editor.click();
    await page.keyboard.type("[[login");
    await page.waitForTimeout(300);
    const popup = wikilinkAutocomplete(page);
    await expect(popup).toBeVisible({ timeout: 2000 });
    // Should show "Fix Login Bug" task
    await expect(popup.locator("button", { hasText: "Fix Login Bug" })).toBeVisible();
    // Should NOT show unrelated items
    await expect(popup.locator("button", { hasText: "Write Docs" })).not.toBeVisible();
  });

  test("type prefix filters to specific type", async ({ page }) => {
    const editor = tiptapEditor(page);
    await editor.click();
    await page.keyboard.type("[[task:");
    await page.waitForTimeout(300);
    const popup = wikilinkAutocomplete(page);
    await expect(popup).toBeVisible({ timeout: 2000 });
    // All visible badges should be "task"
    const badges = popup.locator("span.inline-flex");
    const count = await badges.count();
    for (let i = 0; i < count; i++) {
      await expect(badges.nth(i)).toHaveText("task");
    }
  });

  test("Enter selects suggestion and inserts wikilink", async ({ page }) => {
    const editor = tiptapEditor(page);
    await editor.click();
    await page.keyboard.type("[[fix-login");
    await page.waitForTimeout(300);
    await expect(wikilinkAutocomplete(page)).toBeVisible({ timeout: 2000 });
    await page.keyboard.press("Enter");
    await expect(wikilinkAutocomplete(page)).not.toBeVisible({ timeout: 2000 });
    await waitForSave(page, 800);
    expectFileContains(
      path.join(testRoot, "docs", "meeting-template.md"),
      "[[task:fix-login-bug]]",
    );
  });

  test("Escape closes popup without inserting", async ({ page }) => {
    const editor = tiptapEditor(page);
    await editor.click();
    await page.keyboard.type("[[");
    await expect(wikilinkAutocomplete(page)).toBeVisible({ timeout: 2000 });
    await page.keyboard.press("Escape");
    await expect(wikilinkAutocomplete(page)).not.toBeVisible({ timeout: 2000 });
  });

  test("ArrowDown/ArrowUp navigate suggestions", async ({ page }) => {
    const editor = tiptapEditor(page);
    await editor.click();
    await page.keyboard.type("[[");
    await expect(wikilinkAutocomplete(page)).toBeVisible({ timeout: 2000 });
    // Navigate down then up — popup should remain open
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowUp");
    await expect(wikilinkAutocomplete(page)).toBeVisible();
  });

  test("Tab selects suggestion", async ({ page }) => {
    const editor = tiptapEditor(page);
    await editor.click();
    await page.keyboard.type("[[fix-login");
    await page.waitForTimeout(300);
    await expect(wikilinkAutocomplete(page)).toBeVisible({ timeout: 2000 });
    await page.keyboard.press("Tab");
    await expect(wikilinkAutocomplete(page)).not.toBeVisible({ timeout: 2000 });
    await waitForSave(page, 800);
    expectFileContains(
      path.join(testRoot, "docs", "meeting-template.md"),
      "[[task:fix-login-bug]]",
    );
  });

  test("spaces are allowed in filter", async ({ page }) => {
    const editor = tiptapEditor(page);
    await editor.click();
    await page.keyboard.type("[[Fix Login");
    await page.waitForTimeout(300);
    // Popup should still be visible (spaces don't close wikilink AC)
    await expect(wikilinkAutocomplete(page)).toBeVisible({ timeout: 2000 });
  });
});
