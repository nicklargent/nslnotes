import { test, expect } from "@playwright/test";
import { setupApp, teardownApp } from "./helpers/app-setup";
import { sidebar, tiptapEditor, tableToolbar, commandMenu } from "./helpers/selectors";
import { waitForSave } from "./helpers/editor";

test.describe("Table editing", () => {
  let testRoot: string;

  test.beforeEach(async ({ page }) => {
    ({ testRoot } = await setupApp(page));
    // Navigate to a doc to get an editor
    await sidebar(page).locator("button", { hasText: "Meeting Template" }).first().click();
    await page.waitForTimeout(500);
  });

  test.afterEach(() => {
    teardownApp(testRoot);
  });

  test("/table slash command inserts a 3x3 table with header row", async ({ page }) => {
    const editor = tiptapEditor(page);
    await editor.click();
    await page.keyboard.type("/");
    await expect(commandMenu(page)).toBeVisible({ timeout: 2000 });
    await page.keyboard.type("table");
    await page.waitForTimeout(200);
    await page.keyboard.press("Enter");
    await expect(commandMenu(page)).not.toBeVisible({ timeout: 2000 });

    // Table should be inserted
    const table = editor.locator("table");
    await expect(table).toBeVisible({ timeout: 2000 });

    // Should have header row (th elements) and body rows (td elements)
    const headerCells = table.locator("th");
    await expect(headerCells).toHaveCount(3);

    const bodyCells = table.locator("td");
    // 2 body rows * 3 cols = 6
    await expect(bodyCells).toHaveCount(6);
  });

  test("Tab navigates to next cell in table", async ({ page }) => {
    const editor = tiptapEditor(page);
    await editor.click();

    // Insert table via slash command
    await page.keyboard.type("/");
    await expect(commandMenu(page)).toBeVisible({ timeout: 2000 });
    await page.keyboard.type("table");
    await page.waitForTimeout(200);
    await page.keyboard.press("Enter");
    await expect(commandMenu(page)).not.toBeVisible({ timeout: 2000 });
    await page.waitForTimeout(300);

    // Type in first cell
    await page.keyboard.type("Cell1");
    // Tab to next cell
    await page.keyboard.press("Tab");
    await page.keyboard.type("Cell2");

    // Verify content is in different cells
    const table = editor.locator("table");
    const firstHeader = table.locator("th").first();
    await expect(firstHeader).toHaveText("Cell1");
    const secondHeader = table.locator("th").nth(1);
    await expect(secondHeader).toHaveText("Cell2");
  });

  test("Shift+Tab navigates to previous cell in table", async ({ page }) => {
    const editor = tiptapEditor(page);
    await editor.click();

    // Insert table
    await page.keyboard.type("/");
    await expect(commandMenu(page)).toBeVisible({ timeout: 2000 });
    await page.keyboard.type("table");
    await page.waitForTimeout(200);
    await page.keyboard.press("Enter");
    await expect(commandMenu(page)).not.toBeVisible({ timeout: 2000 });
    await page.waitForTimeout(300);

    // Type in first cell, tab forward, then shift+tab back
    await page.keyboard.type("First");
    await page.keyboard.press("Tab");
    await page.keyboard.type("Second");
    await page.keyboard.press("Shift+Tab");
    // Now we should be back in first cell — type more
    await page.keyboard.type(" updated");

    const firstHeader = editor.locator("table th").first();
    await expect(firstHeader).toHaveText("First updated");
  });

  test("Ctrl+Shift+Enter escapes table by inserting paragraph after", async ({ page }) => {
    const editor = tiptapEditor(page);
    await editor.click();

    // Insert table
    await page.keyboard.type("/");
    await expect(commandMenu(page)).toBeVisible({ timeout: 2000 });
    await page.keyboard.type("table");
    await page.waitForTimeout(200);
    await page.keyboard.press("Enter");
    await expect(commandMenu(page)).not.toBeVisible({ timeout: 2000 });
    await page.waitForTimeout(300);

    // Escape from table
    await page.keyboard.press("Control+Shift+Enter");
    await page.waitForTimeout(200);

    // Type text — should be outside the table
    await page.keyboard.type("Outside text");
    await waitForSave(page, 800);

    // The text should be in a paragraph after the table, not inside a cell
    const paragraphs = editor.locator("p");
    const outsideParagraph = editor.locator("p", { hasText: "Outside text" });
    await expect(outsideParagraph).toBeVisible();

    // Verify it's not inside a table cell
    const cellWithText = editor.locator("td", { hasText: "Outside text" });
    await expect(cellWithText).toHaveCount(0);
    const headerWithText = editor.locator("th", { hasText: "Outside text" });
    await expect(headerWithText).toHaveCount(0);
  });

  test("table toolbar appears when cursor is in table cell", async ({ page }) => {
    const editor = tiptapEditor(page);
    await editor.click();

    // Insert table
    await page.keyboard.type("/");
    await expect(commandMenu(page)).toBeVisible({ timeout: 2000 });
    await page.keyboard.type("table");
    await page.waitForTimeout(200);
    await page.keyboard.press("Enter");
    await expect(commandMenu(page)).not.toBeVisible({ timeout: 2000 });
    await page.waitForTimeout(300);

    // Click into a cell — toolbar should appear
    const firstCell = editor.locator("table th").first();
    await firstCell.click();
    await page.waitForTimeout(300);

    await expect(tableToolbar(page)).toBeVisible({ timeout: 2000 });
  });

  test("table toolbar add row button adds a row", async ({ page }) => {
    const editor = tiptapEditor(page);
    await editor.click();

    // Insert table
    await page.keyboard.type("/");
    await expect(commandMenu(page)).toBeVisible({ timeout: 2000 });
    await page.keyboard.type("table");
    await page.waitForTimeout(200);
    await page.keyboard.press("Enter");
    await expect(commandMenu(page)).not.toBeVisible({ timeout: 2000 });
    await page.waitForTimeout(300);

    // Click into a body cell
    const firstBodyCell = editor.locator("table td").first();
    await firstBodyCell.click();
    await page.waitForTimeout(300);

    const toolbar = tableToolbar(page);
    await expect(toolbar).toBeVisible({ timeout: 2000 });

    // Count rows before
    const rowsBefore = await editor.locator("table tr").count();

    // Click add row below
    await toolbar.getByRole("button", { name: "+Row↓" }).click();
    await page.waitForTimeout(300);

    // Should have one more row
    const rowsAfter = await editor.locator("table tr").count();
    expect(rowsAfter).toBe(rowsBefore + 1);
  });

  test("table toolbar add column button adds a column", async ({ page }) => {
    const editor = tiptapEditor(page);
    await editor.click();

    // Insert table
    await page.keyboard.type("/");
    await expect(commandMenu(page)).toBeVisible({ timeout: 2000 });
    await page.keyboard.type("table");
    await page.waitForTimeout(200);
    await page.keyboard.press("Enter");
    await expect(commandMenu(page)).not.toBeVisible({ timeout: 2000 });
    await page.waitForTimeout(300);

    // Click into a cell
    const firstCell = editor.locator("table th").first();
    await firstCell.click();
    await page.waitForTimeout(300);

    const toolbar = tableToolbar(page);
    await expect(toolbar).toBeVisible({ timeout: 2000 });

    // Count columns before (header cells = column count)
    const colsBefore = await editor.locator("table th").count();

    // Click add column after
    await toolbar.getByRole("button", { name: "+Col→" }).click();
    await page.waitForTimeout(300);

    const colsAfter = await editor.locator("table th").count();
    expect(colsAfter).toBe(colsBefore + 1);
  });

  test("table toolbar delete table removes the table", async ({ page }) => {
    const editor = tiptapEditor(page);
    await editor.click();

    // Insert table
    await page.keyboard.type("/");
    await expect(commandMenu(page)).toBeVisible({ timeout: 2000 });
    await page.keyboard.type("table");
    await page.waitForTimeout(200);
    await page.keyboard.press("Enter");
    await expect(commandMenu(page)).not.toBeVisible({ timeout: 2000 });
    await page.waitForTimeout(300);

    // Verify table exists
    await expect(editor.locator("table")).toBeVisible();

    // Click into a cell
    const firstCell = editor.locator("table th").first();
    await firstCell.click();
    await page.waitForTimeout(300);

    const toolbar = tableToolbar(page);
    await expect(toolbar).toBeVisible({ timeout: 2000 });

    // Click delete
    await toolbar.getByRole("button", { name: "Delete" }).click();
    await page.waitForTimeout(300);

    // Table should be gone
    await expect(editor.locator("table")).toHaveCount(0);
  });

  test("column resize handle appears on table cell border hover", async ({ page }) => {
    const editor = tiptapEditor(page);
    await editor.click();

    // Insert table
    await page.keyboard.type("/");
    await expect(commandMenu(page)).toBeVisible({ timeout: 2000 });
    await page.keyboard.type("table");
    await page.waitForTimeout(200);
    await page.keyboard.press("Enter");
    await expect(commandMenu(page)).not.toBeVisible({ timeout: 2000 });
    await page.waitForTimeout(300);

    // Table should be wrapped in tableWrapper div
    const tableWrapper = editor.locator(".tableWrapper");
    await expect(tableWrapper).toBeVisible({ timeout: 2000 });

    // Table should have colgroup for column widths
    const colgroup = editor.locator("table colgroup");
    await expect(colgroup).toBeVisible();

    // Hover near the right border of the first header cell to trigger resize handle
    const firstHeader = editor.locator("table th").first();
    const box = await firstHeader.boundingBox();
    expect(box).toBeTruthy();
    // Hover near the right edge of the cell
    await page.mouse.move(box!.x + box!.width - 2, box!.y + box!.height / 2);

    // The column-resize-handle should appear
    const resizeHandle = editor.locator(".column-resize-handle");
    await expect(resizeHandle).toBeVisible({ timeout: 2000 });
  });

  test("table toolbar paragraph before/after buttons escape table", async ({ page }) => {
    const editor = tiptapEditor(page);
    await editor.click();

    // Insert table
    await page.keyboard.type("/");
    await expect(commandMenu(page)).toBeVisible({ timeout: 2000 });
    await page.keyboard.type("table");
    await page.waitForTimeout(200);
    await page.keyboard.press("Enter");
    await expect(commandMenu(page)).not.toBeVisible({ timeout: 2000 });
    await page.waitForTimeout(300);

    // Click into a cell
    const firstCell = editor.locator("table th").first();
    await firstCell.click();
    await page.waitForTimeout(300);

    const toolbar = tableToolbar(page);
    await expect(toolbar).toBeVisible({ timeout: 2000 });

    // Click paragraph after
    await toolbar.getByRole("button", { name: "¶↓" }).click();
    await page.waitForTimeout(200);

    // Type text — should be outside the table
    await page.keyboard.type("After table");
    await waitForSave(page, 800);

    // Verify text is not in a cell
    const cellWithText = editor.locator("td", { hasText: "After table" });
    await expect(cellWithText).toHaveCount(0);
    const outsideParagraph = editor.locator("p", { hasText: "After table" });
    await expect(outsideParagraph).toBeVisible();
  });
});
