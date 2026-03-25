import { test, expect } from "@playwright/test";
import { setupApp, teardownApp } from "./helpers/app-setup";
import {
  sidebar,
  todayButton,
  searchButton,
  fontDecreaseButton,
  fontIncreaseButton,
  centerPanel,
} from "./helpers/selectors";

test.describe("Left sidebar", () => {
  let testRoot: string;

  test.beforeEach(async ({ page }) => {
    ({ testRoot } = await setupApp(page));
  });

  test.afterEach(() => {
    teardownApp(testRoot);
  });

  test("Today button navigates to journal", async ({ page }) => {
    // Navigate away first (open search)
    await page.keyboard.press("Control+k");
    await page.waitForTimeout(300);
    // Click Today
    await todayButton(page).click();
    await expect(centerPanel(page).getByText("Today", { exact: true }).first()).toBeVisible({ timeout: 5000 });
  });

  test("Search button opens search view", async ({ page }) => {
    await searchButton(page).click();
    await expect(centerPanel(page).locator("input").first()).toBeVisible({ timeout: 2000 });
  });

  test("font size buttons change font size", async ({ page }) => {
    const fontDisplay = sidebar(page).locator("span.min-w-\\[3ch\\]");
    const initial = Number(await fontDisplay.textContent());

    await fontIncreaseButton(page).click();
    await page.waitForTimeout(100);
    expect(Number(await fontDisplay.textContent())).toBe(initial + 1);

    await fontDecreaseButton(page).click();
    await page.waitForTimeout(100);
    expect(Number(await fontDisplay.textContent())).toBe(initial);
  });

  test("topics list shows topics from fixtures", async ({ page }) => {
    // The full fixture has #project and #frontend topics
    await expect(sidebar(page).getByText("#project")).toBeVisible({ timeout: 5000 });
  });

  test("topic click navigates to topic view", async ({ page }) => {
    const topicButton = sidebar(page).locator("button", { hasText: "#project" });
    await expect(topicButton.first()).toBeVisible({ timeout: 5000 });
    await topicButton.first().click();
    // Topic view should show in center panel
    await expect(centerPanel(page).locator("h1", { hasText: "#project" })).toBeVisible({
      timeout: 5000,
    });
  });

  test("docs list shows docs from fixtures", async ({ page }) => {
    await expect(
      sidebar(page).locator("button", { hasText: "Project Plan" }),
    ).toBeVisible({ timeout: 5000 });
    await expect(
      sidebar(page).locator("button", { hasText: "API Reference" }),
    ).toBeVisible({ timeout: 5000 });
  });

  test("doc click navigates to doc view", async ({ page }) => {
    const docButton = sidebar(page).locator("button", { hasText: "API Reference" });
    await docButton.first().click();
    // Title should appear in center panel
    await expect(
      centerPanel(page).getByText("API Reference"),
    ).toBeVisible({ timeout: 5000 });
  });

  test("pinned docs shown with pin indicator", async ({ page }) => {
    // Project Plan is pinned — should have "Pinned" section label
    await expect(
      sidebar(page).locator("div", { hasText: /^Pinned$/ }).first(),
    ).toBeVisible({ timeout: 5000 });
  });
});
