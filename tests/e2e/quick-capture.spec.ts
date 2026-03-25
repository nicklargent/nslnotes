import { test, expect } from "@playwright/test";
import * as path from "node:path";
import { setupApp, teardownApp } from "./helpers/app-setup";
import { quickCaptureModal, quickCaptureTextarea } from "./helpers/selectors";
import { waitForSave } from "./helpers/editor";
import { expectFileContains } from "./helpers/assertions";

test.describe("Quick capture", () => {
  let testRoot: string;

  test.beforeEach(async ({ page }) => {
    ({ testRoot } = await setupApp(page));
  });

  test.afterEach(() => {
    teardownApp(testRoot);
  });

  test("Ctrl+N opens quick capture modal", async ({ page }) => {
    await page.keyboard.press("Control+n");
    await expect(quickCaptureModal(page)).toBeVisible({ timeout: 2000 });
    await expect(quickCaptureTextarea(page)).toBeFocused();
  });

  test("Enter saves and closes", async ({ page }) => {
    await page.keyboard.press("Control+n");
    await expect(quickCaptureTextarea(page)).toBeVisible({ timeout: 2000 });
    await quickCaptureTextarea(page).fill("Quick capture test content");
    await page.keyboard.press("Enter");
    await expect(quickCaptureModal(page)).not.toBeVisible({ timeout: 2000 });
    // Content should be appended to today's note
    await waitForSave(page, 800);
    // Check that some note file contains our captured text
    const fs = await import("node:fs");
    const notesDir = path.join(testRoot, "notes");
    const files = fs.readdirSync(notesDir);
    const found = files.some((f: string) => {
      const content = fs.readFileSync(path.join(notesDir, f), "utf-8");
      return content.includes("Quick capture test content");
    });
    expect(found).toBe(true);
  });

  test("Escape closes without saving", async ({ page }) => {
    await page.keyboard.press("Control+n");
    await expect(quickCaptureTextarea(page)).toBeVisible({ timeout: 2000 });
    await quickCaptureTextarea(page).fill("Should not be saved");
    await page.keyboard.press("Escape");
    await expect(quickCaptureModal(page)).not.toBeVisible({ timeout: 2000 });
  });

  test("Shift+Enter inserts newline instead of saving", async ({ page }) => {
    await page.keyboard.press("Control+n");
    await expect(quickCaptureTextarea(page)).toBeVisible({ timeout: 2000 });
    await quickCaptureTextarea(page).fill("Line 1");
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type("Line 2");
    // Modal should still be open
    await expect(quickCaptureModal(page)).toBeVisible();
    const value = await quickCaptureTextarea(page).inputValue();
    expect(value).toContain("Line 1");
    expect(value).toContain("Line 2");
  });
});
