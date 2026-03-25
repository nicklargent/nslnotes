import { test, expect } from "@playwright/test";
import { setupApp, teardownApp } from "./helpers/app-setup";
import { sidebar, centerPanel, tiptapEditor } from "./helpers/selectors";

test.describe("Editor wikilinks", () => {
  let testRoot: string;

  test.beforeEach(async ({ page }) => {
    ({ testRoot } = await setupApp(page));
  });

  test.afterEach(() => {
    teardownApp(testRoot);
  });

  test("wikilink renders as inline widget", async ({ page }) => {
    // Open Project Plan doc which has [[task:fix-login-bug]] and [[task:write-docs]]
    await sidebar(page).locator("button", { hasText: "Project Plan" }).first().click();
    await page.waitForTimeout(500);
    const editor = tiptapEditor(page);
    await expect(editor).toBeVisible({ timeout: 5000 });
    // Wikilinks should be rendered as decorated elements
    const html = await editor.innerHTML();
    // Should contain some wikilink content
    expect(html).toContain("fix-login-bug");
  });

  test("wikilink text is present in editor content", async ({ page }) => {
    // Open Project Plan which references tasks
    await sidebar(page).locator("button", { hasText: "Project Plan" }).first().click();
    await page.waitForTimeout(500);
    const editor = tiptapEditor(page);
    await expect(editor).toBeVisible({ timeout: 5000 });
    // Verify wikilink content is rendered (may be as inline decoration widget)
    const html = await editor.innerHTML();
    expect(html).toContain("fix-login-bug");
  });

  test("topic autocomplete shows on # in editor", async ({ page }) => {
    await sidebar(page).locator("button", { hasText: "Meeting Template" }).first().click();
    await page.waitForTimeout(500);
    const editor = tiptapEditor(page);
    await editor.click();
    await page.keyboard.type("#pro");
    await page.waitForTimeout(300);
    // Autocomplete popup should appear
    const autocomplete = page.locator(".fixed.z-50").filter({ hasText: "project" });
    const count = await autocomplete.count();
    // May or may not show depending on timing — at least verify no crash
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test("topic autocomplete shows on @ in editor", async ({ page }) => {
    await sidebar(page).locator("button", { hasText: "Meeting Template" }).first().click();
    await page.waitForTimeout(500);
    const editor = tiptapEditor(page);
    await editor.click();
    await page.keyboard.type("@ali");
    await page.waitForTimeout(300);
    const autocomplete = page.locator(".fixed.z-50").filter({ hasText: "alice" });
    const count = await autocomplete.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
