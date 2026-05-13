import { test, expect, type Page } from "@playwright/test";
import * as path from "node:path";
import * as fs from "node:fs";
import { setupApp, teardownApp } from "./helpers/app-setup";
import { sidebar, tiptapEditor } from "./helpers/selectors";
import { waitForFileContent, waitForSave } from "./helpers/editor";

async function pasteText(page: Page, text: string): Promise<void> {
  await page.evaluate((t) => {
    const target = document.querySelector(
      "[contenteditable='true']",
    ) as HTMLElement | null;
    if (!target) throw new Error("no contenteditable target");
    const dt = new DataTransfer();
    dt.setData("text/plain", t);
    target.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, text);
}

test.describe("Editor URL paste", () => {
  let testRoot: string;
  const URL = "http://example.com";

  test.beforeEach(async ({ page }) => {
    ({ testRoot } = await setupApp(page));
    await sidebar(page)
      .locator("button", { hasText: "Meeting Template" })
      .first()
      .click();
    await page.waitForTimeout(500);
    // Start from a known clean state: select all body content and delete.
    const editor = tiptapEditor(page);
    await editor.click();
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Delete");
  });

  test.afterEach(() => {
    teardownApp(testRoot);
  });

  test("paste URL with no selection inserts [url](url)", async ({ page }) => {
    await pasteText(page, URL);
    await waitForSave(page, 800);
    await waitForFileContent(
      page,
      path.join(testRoot, "docs", "meeting-template.md"),
      `[${URL}](${URL})`,
    );
  });

  test("paste URL onto selected text wraps it as the label", async ({
    page,
  }) => {
    const label = "example text";
    await page.keyboard.type(label);
    for (let i = 0; i < label.length; i++) {
      await page.keyboard.press("Shift+ArrowLeft");
    }
    await pasteText(page, URL);
    await waitForSave(page, 800);
    await waitForFileContent(
      page,
      path.join(testRoot, "docs", "meeting-template.md"),
      `[${label}](${URL})`,
    );
  });

  test("paste URL while cursor is inside an existing link does not nest", async ({
    page,
  }) => {
    // Type a literal markdown link, then move the cursor just inside the
    // closing paren — `handlePaste` should detect the link and insert the
    // URL raw, with no [url](url) wrapping.
    await page.keyboard.type("[foo](http://bar.com)");
    await page.keyboard.press("ArrowLeft");
    await pasteText(page, "http://second.com");
    await waitForSave(page, 800);
    const filePath = path.join(testRoot, "docs", "meeting-template.md");
    // Wait until the post-paste content has been written.
    await waitForFileContent(page, filePath, "http://second.com");
    const content = fs.readFileSync(filePath, "utf-8");
    // No nested wrapping — the new URL must not have been wrapped as a link.
    expect(content).not.toContain("[http://second.com]");
  });
});
