import { test, expect } from "@playwright/test";
import { setupApp, teardownApp } from "./helpers/app-setup";
import {
  findBarInput,
  quickCaptureModal,
  quickCaptureTextarea,
  shortcutsModal,
  searchInput,
  sidebar,
} from "./helpers/selectors";

/**
 * Open the shortcuts modal. In dev mode, the ? key handler is double-registered
 * by Vite HMR, causing toggle to fire twice (cancelling out). Work around by
 * dispatching a synthetic keydown from the capture-phase handler directly.
 */
async function openShortcutsModal(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(() => {
    // Dispatch a one-shot keydown that only fires once
    const handler = (e: KeyboardEvent) => {
      if (e.key === "?" && e.isTrusted === false) {
        e.stopImmediatePropagation();
      }
    };
    document.addEventListener("keydown", handler, { capture: true, once: true });
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "?", code: "Slash", bubbles: true, cancelable: true }),
    );
  });
}

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
    await openShortcutsModal(page);
    await expect(shortcutsModal(page)).toBeVisible({ timeout: 2000 });
  });

  test("Escape button closes shortcuts modal", async ({ page }) => {
    await openShortcutsModal(page);
    await expect(shortcutsModal(page)).toBeVisible({ timeout: 2000 });
    // Click the Esc button in the modal header (keyboard Escape is affected by HMR in dev)
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
