import { test, expect } from "@playwright/test";
import { setupApp, teardownApp } from "./helpers/app-setup";
import {
  sidebar,
  centerPanel,
  rightPanel,
  rightPanelTask,
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
      rightPanelTask(page, "New Test Task"),
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

test.describe("Draft creation with trailing-slash rootPath", () => {
  // Regression: settings.rootPath stored with a trailing "/" used to produce
  // a "//tasks/foo.md" path that didn't match `joinPath(rootPath, "tasks")`
  // in IndexService.invalidate, so newly created entities never landed in
  // the index, createTask returned null, and the draft view stayed stuck
  // after Enter.
  let testRoot: string;

  test.beforeEach(async ({ page }) => {
    ({ testRoot } = await setupApp(page, { preset: "empty" }));
    // Re-route /api/settings to send a rootPath WITH a trailing slash
    await page.route("**/api/settings", async (route, request) => {
      if (request.method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ rootPath: testRoot + "/" }),
        });
      } else {
        await route.fulfill({ status: 200, body: "{}" });
      }
    });
    await page.reload();
    await expect(page.locator("main").first()).toBeVisible({ timeout: 10_000 });
  });

  test.afterEach(() => teardownApp(testRoot));

  test("Enter creates task and switches view (trailing-slash root)", async ({
    page,
  }) => {
    await createTaskButton(page).click();
    const input = centerPanel(page).locator("input[placeholder*='title']");
    await expect(input).toBeVisible({ timeout: 2000 });
    await input.fill("Trailing Slash Task");
    await page.keyboard.press("Enter");
    // The draft input should disappear and TaskDetail should render
    await expect(input).not.toBeVisible({ timeout: 5000 });
    await expect(centerPanel(page).getByText("Trailing Slash Task")).toBeVisible({
      timeout: 5000,
    });
  });
});
