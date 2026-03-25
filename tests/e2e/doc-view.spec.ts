import { test, expect } from "@playwright/test";
import * as path from "node:path";
import { setupApp, teardownApp } from "./helpers/app-setup";
import {
  sidebar,
  centerPanel,
  pinButton,
  pinnedButton,
  deleteButton,
  confirmDeleteButton,
  confirmModal,
  tiptapEditor,
} from "./helpers/selectors";
import { typeInEditor, waitForSave } from "./helpers/editor";
import { expectFrontmatter, expectFileContains } from "./helpers/assertions";

test.describe("Doc view", () => {
  let testRoot: string;

  test.beforeEach(async ({ page }) => {
    ({ testRoot } = await setupApp(page));
    // Open API Reference doc (unpinned, has topics)
    const docButton = sidebar(page).locator("button", { hasText: "API Reference" });
    await expect(docButton.first()).toBeVisible({ timeout: 10_000 });
    await docButton.first().click();
    await page.waitForTimeout(500);
  });

  test.afterEach(() => {
    teardownApp(testRoot);
  });

  test("displays doc title and metadata", async ({ page }) => {
    await expect(centerPanel(page).getByText("API Reference")).toBeVisible();
    // Should show the wikilink slug
    await expect(centerPanel(page).locator("code", { hasText: "[[doc:api-reference]]" })).toBeVisible();
    // Should show created date
    await expect(centerPanel(page).getByText("Created")).toBeVisible();
  });

  test("title is editable via click", async ({ page }) => {
    // Click the title text to start editing
    const titleSpan = centerPanel(page).locator("span", { hasText: "API Reference" }).first();
    await titleSpan.click();
    // Should show an input
    const input = centerPanel(page).locator("input[type='text']").first();
    await expect(input).toBeVisible({ timeout: 2000 });
    await input.fill("Updated API Docs");
    await page.keyboard.press("Enter");
    await waitForSave(page);
    // Verify on disk
    expectFrontmatter(
      path.join(testRoot, "docs", "api-reference.md"),
      "title",
      "Updated API Docs",
    );
  });

  test("topics are editable", async ({ page }) => {
    // Click a topic chip to start editing
    const topicChip = centerPanel(page).locator("span", { hasText: "#frontend" }).first();
    await topicChip.click();
    // Input placeholder is "#topic1, @person"
    const input = centerPanel(page).locator("input[placeholder='#topic1, @person']");
    await expect(input).toBeVisible({ timeout: 2000 });
    // Clear and type new value with trailing space to prevent autocomplete on last token
    await input.clear();
    await input.type("#frontend, #backend ");
    await page.keyboard.press("Enter");
    await waitForSave(page, 800);
    expectFileContains(
      path.join(testRoot, "docs", "api-reference.md"),
      "#backend",
    );
  });

  test("pin toggle works", async ({ page }) => {
    // API Reference starts unpinned
    await expect(pinButton(page)).toBeVisible({ timeout: 5000 });
    await pinButton(page).click();
    await expect(pinnedButton(page)).toBeVisible({ timeout: 5000 });
    await waitForSave(page);
    expectFrontmatter(path.join(testRoot, "docs", "api-reference.md"), "pinned", true);
  });

  test("editor content auto-saves to disk", async ({ page }) => {
    await typeInEditor(page, "\n\nNew paragraph added.");
    await waitForSave(page, 800);
    expectFileContains(
      path.join(testRoot, "docs", "api-reference.md"),
      "New paragraph added.",
    );
  });

  test("delete removes the doc", async ({ page }) => {
    await deleteButton(page).click();
    await expect(confirmModal(page)).toBeVisible({ timeout: 2000 });
    await confirmDeleteButton(page).click();
    await expect(
      sidebar(page).locator("button", { hasText: "API Reference" }),
    ).not.toBeVisible({ timeout: 5000 });
  });
});
