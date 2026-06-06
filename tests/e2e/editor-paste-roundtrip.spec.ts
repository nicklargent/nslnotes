import { test, expect, type Page } from "@playwright/test";
import * as path from "node:path";
import * as fs from "node:fs";
import { setupApp, teardownApp } from "./helpers/app-setup";
import { sidebar, tiptapEditor } from "./helpers/selectors";
import { waitForSave } from "./helpers/editor";

/**
 * Approach B — normalize-on-paste. A rich HTML paste (e.g. an Outlook table)
 * can parse into schema-valid content the markdown serializer cannot represent
 * — most commonly a table cell holding a line break or block content. Those
 * parts are silently dropped on save and only surface as missing content on the
 * next reload. transformPasted runs the paste through a markdown round trip and,
 * when content would not survive, inserts the savable form immediately so the
 * editor and the file always agree.
 */
async function pasteHtml(page: Page, html: string): Promise<void> {
  await page.evaluate((h) => {
    const target = document.querySelector(
      "[contenteditable='true']",
    ) as HTMLElement | null;
    if (!target) throw new Error("no contenteditable target");
    const dt = new DataTransfer();
    dt.setData("text/html", h);
    dt.setData("text/plain", "fallback");
    target.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, html);
}

test.describe("Editor paste round-trip normalization", () => {
  let testRoot: string;

  test.beforeEach(async ({ page }) => {
    ({ testRoot } = await setupApp(page));
    await sidebar(page)
      .locator("button", { hasText: "Meeting Template" })
      .first()
      .click();
    await page.waitForTimeout(500);
    const editor = tiptapEditor(page);
    await editor.click();
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Delete");
  });

  test.afterEach(() => {
    teardownApp(testRoot);
  });

  test("a lossy HTML table cell is normalized to its savable form on paste", async ({
    page,
  }) => {
    // The cell line break (<br>) cannot survive a GFM-table round trip: the
    // serializer flattens the cell to a single line. Without normalization the
    // editor would show "first" / "second" on two lines while the file only has
    // "firstsecond" — silent loss. With it, the editor shows the savable form.
    const html =
      "<table><thead><tr><th>H1</th><th>H2</th></tr></thead>" +
      "<tbody><tr><td>first<br>second</td><td>x</td></tr></tbody></table>";
    await pasteHtml(page, html);

    const editor = tiptapEditor(page);
    const table = editor.locator("table");
    await expect(table).toBeVisible({ timeout: 2000 });

    // The savable form has no line break left in the cell — the editor reflects
    // exactly what will persist.
    await expect(table.locator("br")).toHaveCount(0);
    await expect(table).toContainText("firstsecond");

    // And the file on disk agrees: content was preserved in its savable form,
    // not silently dropped.
    await waitForSave(page, 800);
    const filePath = path.join(testRoot, "docs", "meeting-template.md");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("firstsecond");
  });

  test("a clean HTML paste is inserted unchanged", async ({ page }) => {
    // Markdown-representable content round-trips intact, so normalization is a
    // no-op and ordinary pastes are untouched.
    await pasteHtml(
      page,
      "<p>hello <strong>bold</strong> world</p>",
    );
    const editor = tiptapEditor(page);
    await expect(editor).toContainText("hello bold world");
    await expect(editor.locator("strong")).toHaveText("bold");

    await waitForSave(page, 800);
    const filePath = path.join(testRoot, "docs", "meeting-template.md");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("hello **bold** world");
  });
});
