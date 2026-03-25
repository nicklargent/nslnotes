import { test, expect } from "@playwright/test";
import { setupApp, teardownApp } from "./helpers/app-setup";
import { blurActiveElement } from "./helpers/editor";
import {
  findBarInput,
  quickCaptureModal,
  quickCaptureTextarea,
  shortcutsModal,
  searchInput,
  sidebar,
} from "./helpers/selectors";

test.describe("Global keyboard shortcuts", () => {
  let testRoot: string;

  test.beforeEach(async ({ page }) => {
    ({ testRoot } = await setupApp(page));
  });

  test.afterEach(() => {
    teardownApp(testRoot);
  });

  test("Ctrl+F opens find bar", async ({ page }) => {
    await page.keyboard.press("Control+f");
    await expect(findBarInput(page)).toBeVisible({ timeout: 2000 });
    await expect(findBarInput(page)).toBeFocused();
  });

  test("Escape closes find bar", async ({ page }) => {
    await page.keyboard.press("Control+f");
    await expect(findBarInput(page)).toBeVisible({ timeout: 2000 });
    await page.keyboard.press("Escape");
    await expect(findBarInput(page)).not.toBeVisible({ timeout: 2000 });
  });

  test("Ctrl+N opens quick capture modal", async ({ page }) => {
    await page.keyboard.press("Control+n");
    await expect(quickCaptureModal(page)).toBeVisible({ timeout: 2000 });
    await expect(quickCaptureTextarea(page)).toBeFocused();
  });

  test("Ctrl+K navigates to search view", async ({ page }) => {
    await page.keyboard.press("Control+k");
    await expect(searchInput(page)).toBeVisible({ timeout: 2000 });
    await expect(searchInput(page)).toBeFocused();
  });

  test("? opens keyboard shortcuts modal", async ({ page }) => {
    // Blur the editor so ? isn't captured as text input
    await blurActiveElement(page);
    await page.keyboard.press("?");
    await expect(shortcutsModal(page)).toBeVisible({ timeout: 2000 });
  });

  test("Escape button closes shortcuts modal", async ({ page }) => {
    await blurActiveElement(page);
    await page.keyboard.press("?");
    await expect(shortcutsModal(page)).toBeVisible({ timeout: 2000 });
    await shortcutsModal(page).locator("button", { hasText: "Esc" }).click();
    await expect(shortcutsModal(page)).not.toBeVisible({ timeout: 2000 });
  });

  test("Ctrl+= increases font size", async ({ page }) => {
    const fontDisplay = sidebar(page).locator("span.min-w-\\[3ch\\]");
    const initialSize = await fontDisplay.textContent();
    await page.keyboard.press("Control+=");
    await page.waitForTimeout(200);
    const newSize = await fontDisplay.textContent();
    expect(Number(newSize)).toBe(Number(initialSize) + 1);
  });

  test("Ctrl+- decreases font size", async ({ page }) => {
    const fontDisplay = sidebar(page).locator("span.min-w-\\[3ch\\]");
    const initialSize = await fontDisplay.textContent();
    await page.keyboard.press("Control+-");
    await page.waitForTimeout(200);
    const newSize = await fontDisplay.textContent();
    expect(Number(newSize)).toBe(Number(initialSize) - 1);
  });
});
