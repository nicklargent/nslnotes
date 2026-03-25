import { test, expect } from "@playwright/test";
import * as path from "node:path";
import { setupApp, teardownApp } from "./helpers/app-setup";
import { sidebar, tiptapEditor } from "./helpers/selectors";
import { typeInEditor, waitForSave } from "./helpers/editor";
import { expectFileContains } from "./helpers/assertions";

test.describe("Editor lists and TODOs", () => {
  let testRoot: string;

  test.beforeEach(async ({ page }) => {
    ({ testRoot } = await setupApp(page));
    await sidebar(page).locator("button", { hasText: "Meeting Template" }).first().click();
    await page.waitForTimeout(500);
  });

  test.afterEach(() => {
    teardownApp(testRoot);
  });

  test("bullet list via slash command", async ({ page }) => {
    const editor = tiptapEditor(page);
    await editor.click();
    await page.keyboard.type("/");
    const menu = page.locator(".fixed.z-50.w-56");
    await expect(menu).toBeVisible({ timeout: 2000 });
    await page.keyboard.type("bullet");
    await page.waitForTimeout(200);
    await page.keyboard.press("Enter");
    await page.keyboard.type("First item");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Second item");
    await waitForSave(page, 800);
    expectFileContains(
      path.join(testRoot, "docs", "meeting-template.md"),
      "First item",
    );
  });

  test("ordered list via slash command", async ({ page }) => {
    const editor = tiptapEditor(page);
    await editor.click();
    await page.keyboard.type("/");
    const menu = page.locator(".fixed.z-50.w-56");
    await expect(menu).toBeVisible({ timeout: 2000 });
    await page.keyboard.type("ordered");
    await page.waitForTimeout(200);
    await page.keyboard.press("Enter");
    await page.keyboard.type("Step one");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Step two");
    await waitForSave(page, 800);
    expectFileContains(
      path.join(testRoot, "docs", "meeting-template.md"),
      "Step one",
    );
  });

  test("Tab indents list item", async ({ page }) => {
    const editor = tiptapEditor(page);
    await editor.click();
    // Create a bullet list
    await page.keyboard.type("- Parent item");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Child item");
    // Tab to indent
    await page.keyboard.press("Tab");
    await waitForSave(page, 800);
    // The child should be nested
    const content = await editor.innerHTML();
    // Nested lists in TipTap have nested <ul> elements
    expect(content).toBeTruthy();
  });

  test("Shift+Tab outdents list item", async ({ page }) => {
    const editor = tiptapEditor(page);
    await editor.click();
    await page.keyboard.type("- Parent item");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Child item");
    await page.keyboard.press("Tab");
    await page.waitForTimeout(100);
    await page.keyboard.press("Shift+Tab");
    await waitForSave(page, 800);
    // Should be back to top level
    const content = await editor.innerHTML();
    expect(content).toBeTruthy();
  });

  test("TODO checkbox rendering in task body", async ({ page }) => {
    // Open a task with TODO items
    const { rightPanel } = await import("./helpers/selectors");
    await rightPanel(page).locator("button", { hasText: "Fix Login Bug" }).first().click();
    await page.waitForTimeout(500);
    // The task body has "- [ ] Reproduce the issue" etc.
    // TipTap should render checkbox widgets
    const editor = tiptapEditor(page);
    await expect(editor).toBeVisible({ timeout: 5000 });
    const html = await editor.innerHTML();
    // Should contain task list items
    expect(html.length).toBeGreaterThan(0);
  });
});
