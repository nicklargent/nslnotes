import { test, expect } from "@playwright/test";
import { setupApp, teardownApp } from "./helpers/app-setup";
import {
  sidebar,
  centerPanel,
  rightPanel,
  createTaskButton,
  draftInput,
} from "./helpers/selectors";

test.describe("Doc draft creation", () => {
  let testRoot: string;

  test.beforeEach(async ({ page }) => {
    ({ testRoot } = await setupApp(page));
  });

  test.afterEach(() => {
    teardownApp(testRoot);
  });

  test("+ button in sidebar creates doc draft with auto-focused input", async ({
    page,
  }) => {
    // Find the + button in the docs section of sidebar
    // The + button is in the Docs section header of the sidebar
    const createDocBtn = sidebar(page).getByRole("button", { name: "+", exact: true }).first();
    await createDocBtn.click();
    // Draft input should appear and be focused
    const input = centerPanel(page).locator("input[placeholder*='title']");
    await expect(input).toBeVisible({ timeout: 2000 });
    await expect(input).toBeFocused();
  });

  test("Enter commits doc draft", async ({ page }) => {
    // The + button is in the Docs section header of the sidebar
    const createDocBtn = sidebar(page).getByRole("button", { name: "+", exact: true }).first();
    await createDocBtn.click();
    const input = centerPanel(page).locator("input[placeholder*='title']");
    await expect(input).toBeVisible({ timeout: 2000 });
    await input.fill("New Test Doc");
    await page.keyboard.press("Enter");
    // Should navigate to the new doc
    await expect(centerPanel(page).getByText("New Test Doc")).toBeVisible({ timeout: 5000 });
    // Should appear in sidebar
    await expect(
      sidebar(page).locator("button", { hasText: "New Test Doc" }),
    ).toBeVisible({ timeout: 5000 });
  });

  test("Escape cancels doc draft", async ({ page }) => {
    // The + button is in the Docs section header of the sidebar
    const createDocBtn = sidebar(page).getByRole("button", { name: "+", exact: true }).first();
    await createDocBtn.click();
    const input = centerPanel(page).locator("input[placeholder*='title']");
    await expect(input).toBeVisible({ timeout: 2000 });
    await page.keyboard.press("Escape");
    await expect(input).not.toBeVisible({ timeout: 2000 });
  });
});

test.describe("Task draft creation", () => {
  let testRoot: string;

  test.beforeEach(async ({ page }) => {
    ({ testRoot } = await setupApp(page));
  });

  test.afterEach(() => {
    teardownApp(testRoot);
  });

  test("+ button in right panel creates task draft", async ({ page }) => {
    await createTaskButton(page).click();
    const input = centerPanel(page).locator("input[placeholder*='title']");
    await expect(input).toBeVisible({ timeout: 2000 });
    await expect(input).toBeFocused();
  });

  test("Enter commits task draft", async ({ page }) => {
    await createTaskButton(page).click();
    const input = centerPanel(page).locator("input[placeholder*='title']");
    await expect(input).toBeVisible({ timeout: 2000 });
    await input.fill("New Test Task");
    await page.keyboard.press("Enter");
    // Should navigate to task detail
    await expect(centerPanel(page).getByText("New Test Task")).toBeVisible({ timeout: 5000 });
    // Should appear in right panel
    await expect(
      rightPanel(page).locator("button", { hasText: "New Test Task" }),
    ).toBeVisible({ timeout: 5000 });
  });

  test("Escape cancels task draft", async ({ page }) => {
    await createTaskButton(page).click();
    const input = centerPanel(page).locator("input[placeholder*='title']");
    await expect(input).toBeVisible({ timeout: 2000 });
    await page.keyboard.press("Escape");
    await expect(input).not.toBeVisible({ timeout: 2000 });
  });
});
