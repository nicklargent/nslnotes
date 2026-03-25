import { test, expect } from "@playwright/test";
import * as path from "node:path";
import { setupApp, teardownApp } from "./helpers/app-setup";
import { sidebar, centerPanel, tiptapEditor } from "./helpers/selectors";
import { typeInEditor, selectAllInEditor, waitForSave } from "./helpers/editor";
import { expectFileContains } from "./helpers/assertions";

test.describe("Editor formatting", () => {
  let testRoot: string;

  test.beforeEach(async ({ page }) => {
    ({ testRoot } = await setupApp(page));
    // Open a doc with existing content
    await sidebar(page).locator("button", { hasText: "Meeting Template" }).first().click();
    await page.waitForTimeout(500);
  });

  test.afterEach(() => {
    teardownApp(testRoot);
  });

  test("typing text in editor", async ({ page }) => {
    await typeInEditor(page, "Hello world");
    await waitForSave(page, 800);
    expectFileContains(
      path.join(testRoot, "docs", "meeting-template.md"),
      "Hello world",
    );
  });

  test("Ctrl+B applies bold formatting", async ({ page }) => {
    const editor = tiptapEditor(page);
    await editor.click();
    await page.keyboard.press("Control+b");
    await page.keyboard.type("bold text");
    await page.keyboard.press("Control+b");
    await waitForSave(page, 800);
    expectFileContains(
      path.join(testRoot, "docs", "meeting-template.md"),
      "**bold text**",
    );
  });

  test("Ctrl+I applies italic formatting", async ({ page }) => {
    const editor = tiptapEditor(page);
    await editor.click();
    await page.keyboard.press("Control+i");
    await page.keyboard.type("italic text");
    await page.keyboard.press("Control+i");
    await waitForSave(page, 800);
    expectFileContains(
      path.join(testRoot, "docs", "meeting-template.md"),
      "*italic text*",
    );
  });

  test("heading formatting via keyboard", async ({ page }) => {
    const editor = tiptapEditor(page);
    await editor.click();
    // Go to start of content and type heading syntax
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Home");
    await page.keyboard.press("Enter");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.type("# Test Heading");
    await waitForSave(page, 800);
    expectFileContains(
      path.join(testRoot, "docs", "meeting-template.md"),
      "# Test Heading",
    );
  });
});
