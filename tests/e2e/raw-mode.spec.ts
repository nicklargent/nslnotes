import { test, expect } from "@playwright/test";
import * as path from "node:path";
import { setupApp, teardownApp } from "./helpers/app-setup";
import { sidebar, centerPanel, rawModeToggle, tiptapEditor } from "./helpers/selectors";
import { waitForSave } from "./helpers/editor";
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
    await textarea.click();
    await page.keyboard.press("Control+a");
    const currentValue = await textarea.inputValue();
    await textarea.fill(currentValue + "\n\nRaw mode addition.");
    await waitForSave(page, 800);
    expectFileContains(
      path.join(testRoot, "docs", "api-reference.md"),
      "Raw mode addition.",
    );
  });

  test("switching back to rendered mode preserves content", async ({ page }) => {
    // Switch to raw
    await rawModeToggle(page).click();
    const textarea = centerPanel(page).locator("textarea");
    await expect(textarea).toBeVisible({ timeout: 2000 });
    // Add content in raw mode
    const currentValue = await textarea.inputValue();
    await textarea.fill(currentValue + "\n\nPersistence test.");
    await waitForSave(page, 800);
    // Switch back to rendered
    await rawModeToggle(page).click();
    await expect(tiptapEditor(page)).toBeVisible({ timeout: 2000 });
    // Verify content is visible in rendered mode
    const html = await tiptapEditor(page).innerHTML();
    expect(html).toContain("Persistence test.");
  });
});
