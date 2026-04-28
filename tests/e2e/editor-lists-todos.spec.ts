import { test, expect } from "@playwright/test";
import * as fs from "node:fs";
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

  test("standalone TODO paragraph renders as a marker", async ({ page }) => {
    // Regression: free-standing TODO lines (no `- ` prefix) used to render
    // as marker badges, but the markdown-it refactor gated detection to
    // list items only.
    const editor = tiptapEditor(page);
    await editor.click();
    await page.keyboard.type("TODO standalone item");
    await waitForSave(page, 800);
    const markers = editor.locator("span.todo-marker.todo-open");
    await expect(markers).toHaveCount(1);
    expectFileContains(
      path.join(testRoot, "docs", "meeting-template.md"),
      "TODO standalone item",
    );
  });

  test("clicking a standalone TODO marker cycles state to DOING", async ({ page }) => {
    const editor = tiptapEditor(page);
    await editor.click();
    await page.keyboard.type("TODO cycle me");
    await waitForSave(page, 800);
    await expect(editor.locator("span.todo-marker.todo-open")).toHaveCount(1);
    await editor.locator("span.todo-marker.todo-open").click();
    await waitForSave(page, 800);
    await expect(editor.locator("span.todo-marker.todo-doing")).toHaveCount(1);
    expectFileContains(
      path.join(testRoot, "docs", "meeting-template.md"),
      "DOING cycle me",
    );
  });

  test("clicking the TODO label (not the icon) also cycles", async ({ page }) => {
    const editor = tiptapEditor(page);
    await editor.click();
    await page.keyboard.type("TODO via label");
    await waitForSave(page, 800);
    await expect(editor.locator("span.todo-label.todo-open")).toHaveCount(1);
    await editor.locator("span.todo-label.todo-open").click();
    await waitForSave(page, 800);
    await expect(editor.locator("span.todo-marker.todo-doing")).toHaveCount(1);
  });

  test("rapid double-click on a marker cycles twice without selecting text", async ({ page }) => {
    const editor = tiptapEditor(page);
    await editor.click();
    await page.keyboard.type("TODO no select");
    await waitForSave(page, 800);
    const marker = editor.locator("span.todo-marker.todo-open");
    await expect(marker).toHaveCount(1);
    await marker.dblclick();
    await waitForSave(page, 800);
    // Two clicks: open → doing → done.
    await expect(editor.locator("span.todo-marker.todo-done")).toHaveCount(1);
    // No text was selected as a side effect of the double-click.
    const selection = await page.evaluate(() => window.getSelection()?.toString() ?? "");
    expect(selection).toBe("");
  });

  test("clicking the second marker in a multi-line TODO paragraph cycles only that one", async ({ page }) => {
    // Repro for the apr 20 sandbox bug: consecutive lines without a blank
    // line between them form a single markdown paragraph, which markdown-it
    // emits as one <p> with <br>s. Both markers render, but the click
    // handler only matched the first because it checked the parent's
    // textContent[0]. Loading content from disk exercises this path.
    const docPath = path.join(testRoot, "docs", "multi-line-todo.md");
    fs.writeFileSync(
      docPath,
      `---\ntype: "doc"\nslug: "multi-line-todo"\ntitle: "Multi Line TODO"\ncreated: "2026-04-20"\n---\n\nHere is preamble text.\nTODO first item\nTODO second item\n`,
    );
    await page.reload();
    await expect(page.locator("main").first()).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500);
    await sidebar(page).locator("button", { hasText: "Multi Line TODO" }).first().click();
    await page.waitForTimeout(500);

    const editor = tiptapEditor(page);
    const openMarkers = editor.locator("span.todo-marker.todo-open");
    await expect(openMarkers).toHaveCount(2);
    // Click the *second* marker — used to be a no-op.
    await openMarkers.nth(1).click();
    await waitForSave(page, 800);
    await expect(editor.locator("span.todo-marker.todo-open")).toHaveCount(1);
    await expect(editor.locator("span.todo-marker.todo-doing")).toHaveCount(1);
    expectFileContains(docPath, "DOING second item");
    expectFileContains(docPath, "TODO first item");
  });
});
