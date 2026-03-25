import { test, expect } from "@playwright/test";
import * as path from "node:path";
import { setupApp, teardownApp } from "./helpers/app-setup";
import { sidebar, centerPanel, rightPanel } from "./helpers/selectors";
import { waitForSave } from "./helpers/editor";
import { expectFrontmatter } from "./helpers/assertions";

test.describe("Metadata editing", () => {
  let testRoot: string;

  test.beforeEach(async ({ page }) => {
    ({ testRoot } = await setupApp(page));
  });

  test.afterEach(() => {
    teardownApp(testRoot);
  });

  test.describe("EditableText", () => {
    test("click to edit, Enter saves", async ({ page }) => {
      // Open a doc
      await sidebar(page).locator("button", { hasText: "Meeting Template" }).first().click();
      await page.waitForTimeout(500);
      // Click title to edit
      const title = centerPanel(page).locator("span", { hasText: "Meeting Template" }).first();
      await title.click();
      const input = centerPanel(page).locator("input[type='text']").first();
      await expect(input).toBeVisible({ timeout: 2000 });
      await input.fill("Updated Template");
      await page.keyboard.press("Enter");
      await waitForSave(page);
      expectFrontmatter(
        path.join(testRoot, "docs", "meeting-template.md"),
        "title",
        "Updated Template",
      );
    });

    test("Escape cancels edit", async ({ page }) => {
      await sidebar(page).locator("button", { hasText: "Meeting Template" }).first().click();
      await page.waitForTimeout(500);
      const title = centerPanel(page).locator("span", { hasText: "Meeting Template" }).first();
      await title.click();
      const input = centerPanel(page).locator("input[type='text']").first();
      await input.fill("Should Not Save");
      await page.keyboard.press("Escape");
      await waitForSave(page);
      // Title should revert
      expectFrontmatter(
        path.join(testRoot, "docs", "meeting-template.md"),
        "title",
        "Meeting Template",
      );
    });

    test("blur saves if changed", async ({ page }) => {
      await sidebar(page).locator("button", { hasText: "Meeting Template" }).first().click();
      await page.waitForTimeout(500);
      const title = centerPanel(page).locator("span", { hasText: "Meeting Template" }).first();
      await title.click();
      const input = centerPanel(page).locator("input[type='text']").first();
      await input.fill("Blur Saved Title");
      await input.blur();
      await waitForSave(page);
      expectFrontmatter(
        path.join(testRoot, "docs", "meeting-template.md"),
        "title",
        "Blur Saved Title",
      );
    });
  });

  test.describe("EditableDate", () => {
    test("click to edit due date", async ({ page }) => {
      // Open a task with a due date
      await rightPanel(page).locator("button", { hasText: "Fix Login Bug" }).first().click();
      await page.waitForTimeout(500);
      // Click the due date to edit
      const dueLabel = centerPanel(page).locator("span", { hasText: "2026-03-28" });
      await expect(dueLabel.first()).toBeVisible({ timeout: 2000 });
      await dueLabel.first().click();
      const dateInput = centerPanel(page).locator("input[type='date']");
      await expect(dateInput).toBeVisible({ timeout: 2000 });
    });

    test("onChange saves new date", async ({ page }) => {
      await rightPanel(page).locator("button", { hasText: "Fix Login Bug" }).first().click();
      await page.waitForTimeout(500);
      const dueLabel = centerPanel(page).locator("span", { hasText: "2026-03-28" });
      await dueLabel.first().click();
      const dateInput = centerPanel(page).locator("input[type='date']");
      await expect(dateInput).toBeVisible({ timeout: 2000 });
      // fill() triggers onInput and onChange, which saves and exits edit mode
      await dateInput.fill("2026-05-01");
      await waitForSave(page);
      expectFrontmatter(
        path.join(testRoot, "tasks", "fix-login-bug.md"),
        "due",
        "2026-05-01",
      );
    });

    test("blur saves date and exits edit mode", async ({ page }) => {
      await rightPanel(page).locator("button", { hasText: "Fix Login Bug" }).first().click();
      await page.waitForTimeout(500);
      const dueLabel = centerPanel(page).locator("span", { hasText: "2026-03-28" });
      await dueLabel.first().click();
      const dateInput = centerPanel(page).locator("input[type='date']");
      await expect(dateInput).toBeVisible({ timeout: 2000 });
      // Blur triggers save and exits edit mode
      await dateInput.evaluate((el) => (el as HTMLInputElement).blur());
      await page.waitForTimeout(300);
      // Should be back to label mode
      await expect(dateInput).not.toBeVisible({ timeout: 2000 });
    });
  });

  test.describe("EditableTopics", () => {
    test("click to edit topics, Enter saves", async ({ page }) => {
      await sidebar(page).locator("button", { hasText: "API Reference" }).first().click();
      await page.waitForTimeout(500);
      const topicChip = centerPanel(page).locator("span", { hasText: "#frontend" });
      await topicChip.click();
      const input = centerPanel(page).locator("input[placeholder='#topic1, @person']");
      await expect(input).toBeVisible({ timeout: 2000 });
      // Trailing space prevents autocomplete from opening on last token
      await input.fill("#frontend, #api ");
      await page.keyboard.press("Enter");
      await waitForSave(page);
      // Topics are stored in frontmatter — verify the file contains both
      const { expectFileContains } = await import("./helpers/assertions");
      expectFileContains(
        path.join(testRoot, "docs", "api-reference.md"),
        "#frontend",
      );
      expectFileContains(
        path.join(testRoot, "docs", "api-reference.md"),
        "#api",
      );
    });

    test("Escape cancels topic edit", async ({ page }) => {
      await sidebar(page).locator("button", { hasText: "API Reference" }).first().click();
      await page.waitForTimeout(500);
      const topicChip = centerPanel(page).locator("span", { hasText: "#frontend" });
      await topicChip.click();
      const input = centerPanel(page).locator("input[placeholder='#topic1, @person']");
      await input.fill("#should-not-save");
      await page.keyboard.press("Escape");
      await waitForSave(page);
      expectFrontmatter(
        path.join(testRoot, "docs", "api-reference.md"),
        "topics",
        ["#frontend"],
      );
    });

    test("+ Add topics shown when no topics", async ({ page }) => {
      await sidebar(page).locator("button", { hasText: "Meeting Template" }).first().click();
      await page.waitForTimeout(500);
      // Meeting Template has no topics — should show "+ Add topics"
      await expect(
        centerPanel(page).getByText("+ Add topics"),
      ).toBeVisible({ timeout: 3000 });
    });
  });
});
