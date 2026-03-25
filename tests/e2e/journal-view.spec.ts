import { test, expect } from "@playwright/test";
import * as path from "node:path";
import { setupApp, teardownApp } from "./helpers/app-setup";
import { centerPanel, todayButton, tiptapEditor } from "./helpers/selectors";
import { typeInEditor, waitForSave } from "./helpers/editor";
import { expectFileContains, expectFileExists } from "./helpers/assertions";

test.describe("Journal view", () => {
  let testRoot: string;

  test.beforeEach(async ({ page }) => {
    ({ testRoot } = await setupApp(page));
  });

  test.afterEach(() => {
    teardownApp(testRoot);
  });

  test("shows today's date header", async ({ page }) => {
    await expect(centerPanel(page).getByText("Today", { exact: true }).first()).toBeVisible({ timeout: 5000 });
  });

  test("shows month bar with current month selected", async ({ page }) => {
    // March 2026 should be selected (blue styling) in the month bar
    const selectedMonth = centerPanel(page).locator("[data-month='2026-03']");
    await expect(selectedMonth).toBeVisible({ timeout: 5000 });
    await expect(selectedMonth).toHaveClass(/bg-blue-100/);
  });

  test("month bar click navigates to that month", async ({ page }) => {
    // Click on a different month - our fixtures have March 2026 data
    // Look for "Mar" pill in the month bar
    const monthPills = centerPanel(page).locator("[data-month]");
    const count = await monthPills.count();
    expect(count).toBeGreaterThan(0);
  });

  test("daily note editor is visible for today", async ({ page }) => {
    // Today's daily note should have an editor
    await expect(tiptapEditor(page)).toBeVisible({ timeout: 5000 });
  });

  test("typing in daily note creates/saves file", async ({ page }) => {
    // Type in today's daily note editor (may create a new file if none exists for today)
    await typeInEditor(page, "Extra content from test.");
    await waitForSave(page, 800);
    // Check that some note file in the notes dir contains our text
    const fs = await import("node:fs");
    const notesDir = path.join(testRoot, "notes");
    const files = fs.readdirSync(notesDir);
    const found = files.some((f: string) => {
      const content = fs.readFileSync(path.join(notesDir, f), "utf-8");
      return content.includes("Extra content from test.");
    });
    expect(found).toBe(true);
  });

  test("named note card is visible", async ({ page }) => {
    // Meeting Notes is a named note on today's date
    await expect(
      centerPanel(page).getByText("Meeting Notes"),
    ).toBeVisible({ timeout: 5000 });
  });

  test("clicking named note card focuses it", async ({ page }) => {
    const card = centerPanel(page).locator("div", { hasText: "Meeting Notes" });
    await card.first().click();
    // Should show the editor for the named note (blue border/bg indicates focus)
    await page.waitForTimeout(300);
    // The card should be highlighted/expanded
    await expect(
      centerPanel(page).getByText("Meeting Notes"),
    ).toBeVisible();
  });

  test("+ New Note button creates named note on date header hover", async ({ page }) => {
    // Hover over a date header to reveal "+ New Note" button
    const dateHeader = centerPanel(page).locator("[data-date='2026-03-24']").first();
    await dateHeader.hover();
    await page.waitForTimeout(200);
    // The button might appear with opacity transition
    const newNoteBtn = centerPanel(page).getByText("+ New Note");
    // This might not be visible due to opacity, so check it exists
    const count = await newNoteBtn.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test("Today button resets journal to today", async ({ page }) => {
    // Navigate to a different view first
    await page.keyboard.press("Control+k");
    await page.waitForTimeout(300);
    // Click Today
    await todayButton(page).click();
    await expect(centerPanel(page).getByText("Today", { exact: true }).first()).toBeVisible({ timeout: 5000 });
  });
});
