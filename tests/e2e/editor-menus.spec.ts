import { test, expect } from "@playwright/test";
import * as path from "node:path";
import { setupApp, teardownApp } from "./helpers/app-setup";
import { sidebar, tiptapEditor, bubbleMenu, commandMenu } from "./helpers/selectors";
import { typeInEditor, selectAllInEditor, waitForSave } from "./helpers/editor";
import { expectFileContains } from "./helpers/assertions";

test.describe("Bubble menu", () => {
  let testRoot: string;

  test.beforeEach(async ({ page }) => {
    ({ testRoot } = await setupApp(page));
    await sidebar(page).locator("button", { hasText: "Meeting Template" }).first().click();
    await page.waitForTimeout(500);
  });

  test.afterEach(() => {
    teardownApp(testRoot);
  });

  test("appears when text is selected", async ({ page }) => {
    await typeInEditor(page, "Some selectable text");
    await waitForSave(page, 500);
    // Select the text
    await selectAllInEditor(page);
    await page.waitForTimeout(300);
    // Bubble menu should appear
    await expect(bubbleMenu(page)).toBeVisible({ timeout: 2000 });
  });

  test("bold button applies bold", async ({ page }) => {
    await typeInEditor(page, "Make this bold");
    await waitForSave(page, 500);
    await selectAllInEditor(page);
    await page.waitForTimeout(300);
    await expect(bubbleMenu(page)).toBeVisible({ timeout: 2000 });
    // Click Bold button ("B")
    const boldBtn = bubbleMenu(page).getByRole("button", { name: "B" }).first();
    await boldBtn.click();
    await waitForSave(page, 800);
    expectFileContains(
      path.join(testRoot, "docs", "meeting-template.md"),
      "**Make this bold**",
    );
  });

  test("Escape closes bubble menu", async ({ page }) => {
    await typeInEditor(page, "Some text");
    await selectAllInEditor(page);
    await page.waitForTimeout(300);
    await expect(bubbleMenu(page)).toBeVisible({ timeout: 2000 });
    await page.keyboard.press("Escape");
    await expect(bubbleMenu(page)).not.toBeVisible({ timeout: 2000 });
  });

  test("triple-click on a line keeps the menu visible", async ({ page }) => {
    await typeInEditor(page, "first second third");
    await waitForSave(page, 500);
    const editor = tiptapEditor(page);
    // Triple-click selects the line/paragraph. The third click previously
    // dismissed the menu (handleClickOutside fired before the selection
    // could re-open it); now it must stay visible.
    await editor.click({ clickCount: 3, position: { x: 30, y: 10 } });
    await page.waitForTimeout(300);
    await expect(bubbleMenu(page)).toBeVisible({ timeout: 2000 });
  });

  test("selection ending at the start of next line still shows the menu", async ({ page }) => {
    await typeInEditor(page, "Line one");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Line two");
    await waitForSave(page, 500);

    // Build a forward selection that starts in the middle of line 1 and
    // ends at the start of line 2 — the case where `to` resolves to a
    // position whose coordsAtPos(to) lands on line 2 (below the visible
    // selection). Without the -1 bias fix the menu's centerX uses line 2's
    // left edge and the menu ends up far off to the left.
    await page.keyboard.press("Control+Home");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Shift+End");
    await page.keyboard.press("Shift+ArrowRight");
    await page.waitForTimeout(300);

    await expect(bubbleMenu(page)).toBeVisible({ timeout: 2000 });
    // And it should be positioned roughly above the editor content,
    // not way off to the left from the line-2 start coords.
    const editorBox = await tiptapEditor(page).boundingBox();
    const menuBox = await bubbleMenu(page).boundingBox();
    expect(menuBox).not.toBeNull();
    expect(editorBox).not.toBeNull();
    // The menu's center should be horizontally inside the editor area —
    // a regression to the line-2 left edge would put the menu far left.
    const menuCenterX = menuBox!.x + menuBox!.width / 2;
    expect(menuCenterX).toBeGreaterThan(editorBox!.x);
    expect(menuCenterX).toBeLessThan(editorBox!.x + editorBox!.width);
  });
});

test.describe("Command menu", () => {
  let testRoot: string;

  test.beforeEach(async ({ page }) => {
    ({ testRoot } = await setupApp(page));
    await sidebar(page).locator("button", { hasText: "Meeting Template" }).first().click();
    await page.waitForTimeout(500);
  });

  test.afterEach(() => {
    teardownApp(testRoot);
  });

  test("/ keystroke opens command menu", async ({ page }) => {
    const editor = tiptapEditor(page);
    await editor.click();
    await page.keyboard.type("/");
    await expect(commandMenu(page)).toBeVisible({ timeout: 2000 });
  });

  test("filter narrows commands as user types", async ({ page }) => {
    const editor = tiptapEditor(page);
    await editor.click();
    await page.keyboard.type("/");
    await expect(commandMenu(page)).toBeVisible({ timeout: 2000 });
    await page.keyboard.type("head");
    await page.waitForTimeout(200);
    // Should show heading commands, not others
    await expect(commandMenu(page).getByText("Heading 1")).toBeVisible();
  });

  test("Enter selects current command", async ({ page }) => {
    const editor = tiptapEditor(page);
    await editor.click();
    await page.keyboard.type("/");
    await expect(commandMenu(page)).toBeVisible({ timeout: 2000 });
    await page.keyboard.type("bold");
    await page.waitForTimeout(200);
    await page.keyboard.press("Enter");
    await expect(commandMenu(page)).not.toBeVisible({ timeout: 2000 });
  });

  test("Escape closes command menu", async ({ page }) => {
    const editor = tiptapEditor(page);
    await editor.click();
    await page.keyboard.type("/");
    await expect(commandMenu(page)).toBeVisible({ timeout: 2000 });
    await page.keyboard.press("Escape");
    await expect(commandMenu(page)).not.toBeVisible({ timeout: 2000 });
  });

  test("ArrowDown/ArrowUp navigate commands", async ({ page }) => {
    const editor = tiptapEditor(page);
    await editor.click();
    await page.keyboard.type("/");
    await expect(commandMenu(page)).toBeVisible({ timeout: 2000 });
    // Navigate down
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    // Navigate back up
    await page.keyboard.press("ArrowUp");
    // Menu should still be open
    await expect(commandMenu(page)).toBeVisible();
  });
});
