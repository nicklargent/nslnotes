/**
 * TipTap editor helpers for E2E tests.
 */
import * as fs from "node:fs";
import type { Page, Locator } from "@playwright/test";
import { expect } from "@playwright/test";
import { tiptapEditor } from "./selectors";

/**
 * Click into the TipTap editor and type text.
 */
export async function typeInEditor(page: Page, text: string): Promise<void> {
  const editor = tiptapEditor(page);
  await editor.click();
  await expect(editor).toBeFocused();
  await page.keyboard.type(text);
}

/**
 * Select all text in the TipTap editor.
 */
export async function selectAllInEditor(page: Page): Promise<void> {
  const editor = tiptapEditor(page);
  await editor.click();
  await page.keyboard.press("Control+a");
}

/**
 * Type text in the editor, then select a portion of it.
 * Assumes the cursor is at the end of the typed text.
 */
export async function selectTextByShiftArrow(
  page: Page,
  charCount: number,
): Promise<void> {
  for (let i = 0; i < charCount; i++) {
    await page.keyboard.press("Shift+ArrowLeft");
  }
}

/**
 * Trigger the slash command menu by typing "/" then selecting a command.
 */
export async function triggerSlashCommand(
  page: Page,
  commandLabel: string,
): Promise<void> {
  await page.keyboard.type("/");
  // Wait for command menu to appear
  const menu = page.locator(".fixed.z-50.w-56");
  await expect(menu).toBeVisible({ timeout: 2000 });
  // Filter by typing part of the command name
  await page.keyboard.type(commandLabel.toLowerCase());
  await page.waitForTimeout(100);
  await page.keyboard.press("Enter");
  // Wait for menu to close
  await expect(menu).not.toBeVisible({ timeout: 2000 });
}

/**
 * Blur the active element (typically the TipTap editor) so that a global
 * shortcut key like "?" is not captured as text input.
 */
export async function blurActiveElement(page: Page): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
}

/**
 * Wait a fixed duration for the editor save debounce to flush.
 */
export async function waitForSave(page: Page, ms = 500): Promise<void> {
  await page.waitForTimeout(ms);
}

/**
 * Wait until a file on disk contains the expected substring.
 * Polls every 100ms, fails after `timeoutMs`.
 */
export async function waitForFileContent(
  page: Page,
  filePath: string,
  expected: string,
  timeoutMs = 5000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      if (content.includes(expected)) return;
    } catch {
      // file may not exist yet
    }
    await page.waitForTimeout(100);
  }
  const content = fs.readFileSync(filePath, "utf-8");
  expect(
    content,
    `File ${filePath} did not contain "${expected.slice(0, 60)}" after ${timeoutMs}ms. ` +
    `File length: ${content.length}. First 200 chars: ${content.slice(0, 200)}`,
  ).toContain(expected);
}

/**
 * Wait for a textarea to have non-empty content (i.e., the async file read
 * in SolidJS's RawEditor has completed and called setText).
 */
export async function waitForTextareaLoaded(
  page: Page,
  textarea: Locator,
  timeoutMs = 5000,
): Promise<string> {
  const start = Date.now();
  let value = "";
  while (Date.now() - start < timeoutMs) {
    value = await textarea.inputValue();
    if (value.length > 0 && value.includes("---")) return value;
    await page.waitForTimeout(50);
  }
  return value;
}

/**
 * Fill a textarea reliably for SolidJS.
 *
 * Playwright's fill() dispatches synthetic events that SolidJS's event
 * delegation sometimes misses on controlled inputs (value={signal()}).
 * We use pressSequentially() after select-all, which fires real keyboard
 * InputEvents that SolidJS always catches.
 *
 * Also waits for the textarea to be populated first, since RawEditor
 * loads content asynchronously and would overwrite early input.
 */
export async function fillTextarea(
  page: Page,
  textarea: Locator,
  value: string,
): Promise<void> {
  await waitForTextareaLoaded(page, textarea);

  await textarea.click();
  await page.keyboard.press("Control+a");
  await textarea.pressSequentially(value, { delay: 0 });
}
