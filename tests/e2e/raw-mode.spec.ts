import { test, expect } from "@playwright/test";
import * as path from "node:path";
import { setupApp, teardownApp } from "./helpers/app-setup";
import { sidebar, centerPanel, rawModeToggle, tiptapEditor } from "./helpers/selectors";
import { waitForSave, fillTextarea, waitForFileContent } from "./helpers/editor";
import { expectFileContains } from "./helpers/assertions";

test.describe("Raw mode", () => {
  let testRoot: string;

  test.beforeEach(async ({ page }) => {
    ({ testRoot } = await setupApp(page));
    await sidebar(page).locator("button", { hasText: "API Reference" }).first().click();
    await page.waitForTimeout(500);
  });

  test.afterEach(() => {
    teardownApp(testRoot);
  });

  test("toggle button switches to raw markdown textarea", async ({ page }) => {
    const toggle = rawModeToggle(page);
    await expect(toggle).toBeVisible({ timeout: 2000 });
    await toggle.click();
    // Should show a textarea instead of TipTap
    const textarea = centerPanel(page).locator("textarea");
    await expect(textarea).toBeVisible({ timeout: 2000 });
  });

  test("raw textarea shows file content", async ({ page }) => {
    await rawModeToggle(page).click();
    const textarea = centerPanel(page).locator("textarea");
    await expect(textarea).toBeVisible({ timeout: 2000 });
    const value = await textarea.inputValue();
    // Should contain the markdown content
    expect(value).toContain("Endpoints");
  });

  test("edits in raw mode save to disk", async ({ page }) => {
    await rawModeToggle(page).click();
    const textarea = centerPanel(page).locator("textarea");
    await expect(textarea).toBeVisible({ timeout: 2000 });
    // Append text
    const currentValue = await textarea.inputValue();
    const filePath = path.join(testRoot, "docs", "api-reference.md");
    await fillTextarea(page, textarea, currentValue + "\n\nRaw mode addition.");
    await waitForFileContent(page, filePath, "Raw mode addition.", 5000);
    expectFileContains(filePath, "Raw mode addition.");
  });

  test("switching back to rendered mode preserves content", async ({ page }) => {
    // Switch to raw
    await rawModeToggle(page).click();
    const textarea = centerPanel(page).locator("textarea");
    await expect(textarea).toBeVisible({ timeout: 2000 });
    // Add content in raw mode
    const currentValue = await textarea.inputValue();
    const filePath = path.join(testRoot, "docs", "api-reference.md");
    await fillTextarea(page, textarea, currentValue + "\n\nPersistence test.");
    await waitForFileContent(page, filePath, "Persistence test.", 5000);
    // Switch back to rendered
    await rawModeToggle(page).click();
    await expect(tiptapEditor(page)).toBeVisible({ timeout: 5000 });
    // Verify content is visible in rendered mode
    const html = await tiptapEditor(page).innerHTML();
    expect(html).toContain("Persistence test.");
  });

  test("Tab at cursor inserts two spaces", async ({ page }) => {
    await rawModeToggle(page).click();
    const textarea = centerPanel(page).locator("textarea");
    await expect(textarea).toBeVisible({ timeout: 2000 });
    await fillTextarea(page, textarea, "alpha\nbeta\ngamma");
    // Place cursor between "al" and "pha"
    await textarea.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(2, 2));
    await page.keyboard.press("Tab");
    expect(await textarea.inputValue()).toBe("al  pha\nbeta\ngamma");
    const caret = await textarea.evaluate((el: HTMLTextAreaElement) => el.selectionStart);
    expect(caret).toBe(4);
  });

  test("Shift+Tab removes leading two spaces from current line", async ({ page }) => {
    await rawModeToggle(page).click();
    const textarea = centerPanel(page).locator("textarea");
    await expect(textarea).toBeVisible({ timeout: 2000 });
    await fillTextarea(page, textarea, "alpha\n  beta\ngamma");
    // Cursor inside "beta" line (after the two leading spaces, position "be|ta")
    await textarea.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(10, 10));
    await page.keyboard.press("Shift+Tab");
    expect(await textarea.inputValue()).toBe("alpha\nbeta\ngamma");
    const caret = await textarea.evaluate((el: HTMLTextAreaElement) => el.selectionStart);
    expect(caret).toBe(8);
  });

  test("Tab indents all lines in multi-line selection", async ({ page }) => {
    await rawModeToggle(page).click();
    const textarea = centerPanel(page).locator("textarea");
    await expect(textarea).toBeVisible({ timeout: 2000 });
    await fillTextarea(page, textarea, "alpha\nbeta\ngamma");
    // Select from middle of "alpha" through middle of "gamma"
    await textarea.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(2, 14));
    await page.keyboard.press("Tab");
    expect(await textarea.inputValue()).toBe("  alpha\n  beta\n  gamma");
    const range = await textarea.evaluate((el: HTMLTextAreaElement) => ({
      start: el.selectionStart,
      end: el.selectionEnd,
    }));
    // First line shifted by 2; total lines indented = 3, so end shifts by 6
    expect(range.start).toBe(4);
    expect(range.end).toBe(20);
  });

  test("Shift+Tab outdents all lines in multi-line selection", async ({ page }) => {
    await rawModeToggle(page).click();
    const textarea = centerPanel(page).locator("textarea");
    await expect(textarea).toBeVisible({ timeout: 2000 });
    await fillTextarea(page, textarea, "  alpha\n  beta\n  gamma");
    // Select from inside "alpha" through inside "gamma"
    await textarea.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(4, 20));
    await page.keyboard.press("Shift+Tab");
    expect(await textarea.inputValue()).toBe("alpha\nbeta\ngamma");
    const range = await textarea.evaluate((el: HTMLTextAreaElement) => ({
      start: el.selectionStart,
      end: el.selectionEnd,
    }));
    // start shifted left by 2 (one line indent removed before cursor),
    // end shifted left by 6 (3 lines * 2 spaces removed)
    expect(range.start).toBe(2);
    expect(range.end).toBe(14);
  });

  test("Tab edits in raw mode persist to disk", async ({ page }) => {
    await rawModeToggle(page).click();
    const textarea = centerPanel(page).locator("textarea");
    await expect(textarea).toBeVisible({ timeout: 2000 });
    const currentValue = await textarea.inputValue();
    const filePath = path.join(testRoot, "docs", "api-reference.md");
    await fillTextarea(page, textarea, currentValue + "\nINDENT_ME");
    // Place cursor at the start of INDENT_ME
    const idx = (currentValue + "\n").length;
    await textarea.evaluate(
      (el: HTMLTextAreaElement, i: number) => el.setSelectionRange(i, i),
      idx,
    );
    await page.keyboard.press("Tab");
    await waitForFileContent(page, filePath, "  INDENT_ME", 5000);
  });
});
