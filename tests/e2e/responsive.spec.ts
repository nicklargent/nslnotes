import { test, expect } from "@playwright/test";
import { setupApp, teardownApp } from "./helpers/app-setup";

const MOBILE = { width: 375, height: 800 };
const TABLET = { width: 900, height: 1024 };
const DESKTOP = { width: 1280, height: 800 };

test.describe("Responsive layout", () => {
  let testRoot: string;

  test.afterEach(() => {
    teardownApp(testRoot);
  });

  test("desktop shows three-pane layout, no hamburger", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    ({ testRoot } = await setupApp(page));

    // All three panes visible.
    await expect(page.locator("aside").first()).toBeVisible();
    await expect(page.locator("main").first()).toBeVisible();
    await expect(page.locator("aside").nth(1)).toBeVisible();
    // Hamburger hidden.
    await expect(page.getByTestId("open-left-drawer")).toHaveCount(0);
    await expect(page.getByTestId("open-right-drawer")).toHaveCount(0);
  });

  test("tablet hides left sidebar behind a drawer, right stays visible", async ({
    page,
  }) => {
    await page.setViewportSize(TABLET);
    ({ testRoot } = await setupApp(page));

    // Hamburger visible; tasks drawer button hidden (right panel inline on tablet).
    await expect(page.getByTestId("open-left-drawer")).toBeVisible();
    await expect(page.getByTestId("open-right-drawer")).toHaveCount(0);

    // Right panel visible inline (tasks list), no left aside inline.
    const asides = page.locator("aside");
    await expect(asides).toHaveCount(1);

    // Open the left drawer and confirm it mounts.
    await page.getByTestId("open-left-drawer").click();
    await expect(page.locator("aside")).toHaveCount(2);

    // Dismiss via Escape.
    await page.keyboard.press("Escape");
    await expect(page.locator("aside")).toHaveCount(1);
  });

  test("mobile shows only center; both sidebars live in drawers", async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE);
    ({ testRoot } = await setupApp(page));

    await expect(page.locator("main").first()).toBeVisible();
    await expect(page.locator("aside")).toHaveCount(0);

    await expect(page.getByTestId("open-left-drawer")).toBeVisible();
    await expect(page.getByTestId("open-right-drawer")).toBeVisible();

    // Open left drawer.
    await page.getByTestId("open-left-drawer").click();
    await expect(page.locator("aside")).toHaveCount(1);

    // Opening the other drawer replaces the first.
    await page.keyboard.press("Escape");
    await page.getByTestId("open-right-drawer").click();
    await expect(page.locator("aside")).toHaveCount(1);
  });

  test("mobile collapses notebook tabs to a dropdown switcher", async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE);
    ({ testRoot } = await setupApp(page));

    // Switcher toggle visible; no NotebookTab buttons rendered.
    await expect(page.getByTestId("notebook-switcher-toggle")).toBeVisible();

    // Opening the dropdown reveals the Add action.
    await page.getByTestId("notebook-switcher-toggle").click();
    await expect(page.getByTestId("notebook-switcher-menu")).toBeVisible();
    await expect(page.getByTestId("notebook-switcher-add")).toBeVisible();

    // Dismiss via Escape.
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("notebook-switcher-menu")).toHaveCount(0);
  });

  test("desktop keeps the tab strip, no switcher toggle", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    ({ testRoot } = await setupApp(page));
    await expect(page.getByTestId("notebook-switcher-toggle")).toHaveCount(0);
  });

  test("viewport resize transitions layout without reload", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    ({ testRoot } = await setupApp(page));
    await expect(page.getByTestId("open-left-drawer")).toHaveCount(0);

    await page.setViewportSize(MOBILE);
    await expect(page.getByTestId("open-left-drawer")).toBeVisible();
    await expect(page.locator("aside")).toHaveCount(0);

    await page.setViewportSize(DESKTOP);
    await expect(page.getByTestId("open-left-drawer")).toHaveCount(0);
    await expect(page.locator("aside")).toHaveCount(2);
  });
});
