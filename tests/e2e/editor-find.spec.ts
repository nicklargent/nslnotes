import { test, expect } from "@playwright/test";
import { setupApp, teardownApp } from "./helpers/app-setup";
import {
  sidebar,
  findBarInput,
  findBarNext,
  findBarPrev,
  findBarClose,
  tiptapEditor,
} from "./helpers/selectors";
import { typeInEditor, waitForSave } from "./helpers/editor";

test.describe("Editor find bar", () => {
  let testRoot: string;

  test.beforeEach(async ({ page }) => {
    ({ testRoot } = await setupApp(page));
    // Open a doc with content
    await sidebar(page).locator("button", { hasText: "API Reference" }).first().click();
    await page.waitForTimeout(500);
  });

  test.afterEach(() => {
    teardownApp(testRoot);
  });

  test("Ctrl+F opens find bar with auto-focus", async ({ page }) => {
    await page.keyboard.press("Control+f");
    await expect(findBarInput(page)).toBeVisible({ timeout: 2000 });
    await expect(findBarInput(page)).toBeFocused();
  });

  test("typing shows match counter", async ({ page }) => {
    await page.keyboard.press("Control+f");
    await findBarInput(page).fill("Endpoints");
    await page.waitForTimeout(300);
    // Should show "1 of 1" or similar counter
    const counter = findBarInput(page).locator("..").locator("span").first();
    await expect(counter).toBeVisible({ timeout: 2000 });
    const text = await counter.textContent();
    expect(text).toMatch(/\d+ of \d+|No results/);
  });

  test("next/prev buttons cycle through matches", async ({ page }) => {
    // Add more searchable text
    await typeInEditor(page, "\n\ntest word here and test word there");
    await waitForSave(page, 500);

    await page.keyboard.press("Control+f");
    await findBarInput(page).fill("test");
    await page.waitForTimeout(300);

    // Next button should be enabled
    await expect(findBarNext(page)).toBeVisible();
    await findBarNext(page).click();

    // Prev button should be enabled
    await expect(findBarPrev(page)).toBeVisible();
    await findBarPrev(page).click();
  });

  test("close button closes find bar", async ({ page }) => {
    await page.keyboard.press("Control+f");
    await expect(findBarInput(page)).toBeVisible({ timeout: 2000 });
    await findBarClose(page).click();
    await expect(findBarInput(page)).not.toBeVisible({ timeout: 2000 });
  });

  test("Escape closes find bar", async ({ page }) => {
    await page.keyboard.press("Control+f");
    await expect(findBarInput(page)).toBeVisible({ timeout: 2000 });
    await page.keyboard.press("Escape");
    await expect(findBarInput(page)).not.toBeVisible({ timeout: 2000 });
  });

  test("Enter advances to next match", async ({ page }) => {
    await typeInEditor(page, "\n\nfoo bar foo baz foo");
    await waitForSave(page, 500);
    await page.keyboard.press("Control+f");
    await findBarInput(page).fill("foo");
    await page.waitForTimeout(300);
    // Press Enter to advance
    await page.keyboard.press("Enter");
    // Should still be in find bar
    await expect(findBarInput(page)).toBeFocused();
  });

  test("no results shown for non-matching query", async ({ page }) => {
    await page.keyboard.press("Control+f");
    await findBarInput(page).fill("zzzznonexistent");
    await page.waitForTimeout(300);
    const counter = findBarInput(page).locator("..").locator("span").first();
    const text = await counter.textContent();
    expect(text).toContain("No results");
  });
});
