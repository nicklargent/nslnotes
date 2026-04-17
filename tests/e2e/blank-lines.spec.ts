import { test, expect, type Page } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";
import { setupApp, teardownApp } from "./helpers/app-setup";
import {
  sidebar,
  centerPanel,
  rawModeToggle,
  tiptapEditor,
} from "./helpers/selectors";
import { waitForSave, fillTextarea, waitForFileContent } from "./helpers/editor";

test.describe("Blank line round-trip", () => {
  let testRoot: string;
  let filePath: string;

  test.beforeEach(async ({ page }) => {
    ({ testRoot } = await setupApp(page));
    filePath = path.join(testRoot, "docs", "api-reference.md");
    await sidebar(page).locator("button", { hasText: "API Reference" }).first().click();
    await expect(tiptapEditor(page)).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(500);
  });

  test.afterEach(() => {
    teardownApp(testRoot);
  });

  /**
   * Set the doc body via raw mode. Verifies the file was actually written
   * to disk before switching back to the editor.
   */
  async function setBodyViaRaw(page: Page, body: string) {
    const toggle = rawModeToggle(page);
    await toggle.click();

    const textarea = centerPanel(page).locator("textarea");
    await expect(textarea).toBeVisible({ timeout: 3000 });

    // Extract frontmatter from current content
    const current = await textarea.inputValue();
    const fmEnd = current.indexOf("---", 4);
    expect(fmEnd).toBeGreaterThan(0);
    const frontmatter = current.slice(0, fmEnd + 3);
    const newContent = `${frontmatter}\n\n${body}\n`;

    await fillTextarea(page, textarea, newContent);

    // CRITICAL: wait until the file on disk actually has the new content.
    // This replaces the old waitForSave(page, 800) which was a race condition.
    await waitForFileContent(page, filePath, body, 5000);

    // Switch back to rendered mode
    await toggle.click();
    await expect(tiptapEditor(page)).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(300);
  }

  /** Read the body (after frontmatter) from the file on disk. */
  function readBody(): string {
    const raw = fs.readFileSync(filePath, "utf-8");
    const bodyMatch = raw.match(/^---\n[\s\S]*?\n---\n\n?([\s\S]*)$/);
    return (bodyMatch?.[1] ?? raw).trim();
  }

  /** Toggle to raw mode and back, forcing a full markdown round-trip. */
  async function toggleRawAndBack(page: Page) {
    const toggle = rawModeToggle(page);
    await toggle.click();
    await expect(centerPanel(page).locator("textarea")).toBeVisible({ timeout: 3000 });
    await waitForSave(page, 500);
    await toggle.click();
    await expect(tiptapEditor(page)).toBeVisible({ timeout: 5000 });
    await waitForSave(page, 800);
  }

  // -----------------------------------------------------------------------
  // Tests
  // -----------------------------------------------------------------------

  test("setBodyViaRaw actually changes the file on disk", async ({ page }) => {
    await setBodyViaRaw(page, "hello from test");
    const body = readBody();
    expect(body).toBe("hello from test");
  });

  test("consecutive lines without blank line stay together", async ({ page }) => {
    await setBodyViaRaw(page, "line 1\nline 2\nline 3");

    // Verify the editor shows all three lines
    const editor = tiptapEditor(page);
    await expect(editor).toContainText("line 1");
    await expect(editor).toContainText("line 2");
    await expect(editor).toContainText("line 3");

    // Round-trip should not introduce blank lines
    const before = readBody();
    await toggleRawAndBack(page);
    const after = readBody();
    expect(after).toBe(before);
    expect(after).not.toContain("\n\n");
  });

  test("one blank line creates visible gap and persists", async ({ page }) => {
    await setBodyViaRaw(page, "above\n\nbelow");

    // Editor should show both texts
    const editor = tiptapEditor(page);
    await expect(editor).toContainText("above");
    await expect(editor).toContainText("below");

    // They should be in separate paragraphs (visible gap)
    const paragraphs = await editor.locator("p").allTextContents();
    const aboveIdx = paragraphs.findIndex((t) => t.includes("above"));
    const belowIdx = paragraphs.findIndex((t) => t.includes("below"));
    expect(aboveIdx).toBeGreaterThanOrEqual(0);
    expect(belowIdx).toBeGreaterThan(aboveIdx);

    // Round-trip should preserve the blank line
    const before = readBody();
    expect(before).toContain("above\n\nbelow");
    await toggleRawAndBack(page);
    const after = readBody();
    expect(after).toContain("above\n\nbelow");
  });

  test("blank line persists across multiple round-trips", async ({ page }) => {
    await setBodyViaRaw(page, "first\n\nsecond");
    const initial = readBody();
    expect(initial).toContain("first\n\nsecond");

    for (let i = 0; i < 3; i++) {
      await toggleRawAndBack(page);
    }
    const final = readBody();
    expect(final).toBe(initial);
  });

  test("editor-typed blank line round-trips correctly", async ({ page }) => {
    await setBodyViaRaw(page, "placeholder");

    const editor = tiptapEditor(page);
    await editor.click();
    await page.keyboard.press("Control+a");
    await page.keyboard.type("line 1");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter"); // blank line
    await page.keyboard.type("line 2");
    await page.keyboard.press("Enter");
    await page.keyboard.type("line 3");
    await waitForSave(page, 1000);

    const mdBefore = readBody();
    await toggleRawAndBack(page);
    const mdAfter = readBody();

    expect(mdAfter).toBe(mdBefore);
  });

  test("list followed by paragraph preserves spacing", async ({ page }) => {
    await setBodyViaRaw(page, "- item 1\n- item 2\n\nSome text after");

    const before = readBody();
    await toggleRawAndBack(page);
    const after = readBody();
    expect(after).toBe(before);
  });

  test("heading after list preserves spacing", async ({ page }) => {
    await setBodyViaRaw(page, "- item\n\n## Heading\n\ntext");

    const before = readBody();
    await toggleRawAndBack(page);
    const after = readBody();
    expect(after).toBe(before);
  });
});
