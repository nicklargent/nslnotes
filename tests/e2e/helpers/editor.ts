/**
 * TipTap editor helpers for E2E tests.
 */
import type { Page } from "@playwright/test";
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
 * Wait for the editor save debounce to complete.
 */
export async function waitForSave(page: Page, ms = 500): Promise<void> {
  await page.waitForTimeout(ms);
}
