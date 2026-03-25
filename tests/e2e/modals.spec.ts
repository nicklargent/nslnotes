import { test, expect } from "@playwright/test";
import { setupApp, teardownApp } from "./helpers/app-setup";
import { blurActiveElement } from "./helpers/editor";
import {
  sidebar,
  deleteButton,
  confirmModal,
  confirmDeleteButton,
  confirmCancelButton,
  shortcutsModal,
} from "./helpers/selectors";

test.describe("Confirm delete modal", () => {
  let testRoot: string;

  test.beforeEach(async ({ page }) => {
    ({ testRoot } = await setupApp(page));
    // Open a doc to get the delete button
    const docButton = sidebar(page).locator("button", { hasText: "Meeting Template" });
    await expect(docButton.first()).toBeVisible({ timeout: 10_000 });
    await docButton.first().click();
    await page.waitForTimeout(300);
  });

  test.afterEach(() => {
    teardownApp(testRoot);
  });

  test("delete button opens confirm modal", async ({ page }) => {
    await deleteButton(page).click();
    await expect(confirmModal(page)).toBeVisible({ timeout: 2000 });
    await expect(confirmModal(page).getByText("This cannot be undone")).toBeVisible();
  });

  test("cancel button closes modal without deleting", async ({ page }) => {
    await deleteButton(page).click();
    await expect(confirmModal(page)).toBeVisible({ timeout: 2000 });
    await confirmCancelButton(page).click();
    await expect(confirmModal(page)).not.toBeVisible({ timeout: 2000 });
    // Doc should still be visible in sidebar
    await expect(
      sidebar(page).locator("button", { hasText: "Meeting Template" }),
    ).toBeVisible();
  });

  test("confirm delete removes the entity", async ({ page }) => {
    await deleteButton(page).click();
    await expect(confirmModal(page)).toBeVisible({ timeout: 2000 });
    await confirmDeleteButton(page).click();
    await expect(confirmModal(page)).not.toBeVisible({ timeout: 2000 });
    // Doc should be gone from sidebar
    await expect(
      sidebar(page).locator("button", { hasText: "Meeting Template" }),
    ).not.toBeVisible({ timeout: 5000 });
  });

  test("clicking backdrop closes modal", async ({ page }) => {
    await deleteButton(page).click();
    await expect(confirmModal(page)).toBeVisible({ timeout: 2000 });
    // Click the overlay backdrop (top-left corner, outside the dialog)
    await confirmModal(page).click({ position: { x: 5, y: 5 } });
    await expect(confirmModal(page)).not.toBeVisible({ timeout: 2000 });
  });
});

test.describe("Keyboard shortcuts modal", () => {
  let testRoot: string;

  test.beforeEach(async ({ page }) => {
    ({ testRoot } = await setupApp(page));
  });

  test.afterEach(() => {
    teardownApp(testRoot);
  });

  test("shows grouped shortcuts with kbd elements", async ({ page }) => {
    await blurActiveElement(page);
    await page.keyboard.press("?");
    await expect(shortcutsModal(page)).toBeVisible({ timeout: 2000 });
    await expect(shortcutsModal(page).locator("kbd").first()).toBeVisible();
    await expect(shortcutsModal(page).getByText("Global")).toBeVisible();
  });

  test("Esc button closes the modal", async ({ page }) => {
    await blurActiveElement(page);
    await page.keyboard.press("?");
    await expect(shortcutsModal(page)).toBeVisible({ timeout: 2000 });
    await shortcutsModal(page).locator("button", { hasText: "Esc" }).click();
    await expect(shortcutsModal(page)).not.toBeVisible({ timeout: 2000 });
  });

  test("clicking backdrop closes the modal", async ({ page }) => {
    await blurActiveElement(page);
    await page.keyboard.press("?");
    await expect(shortcutsModal(page)).toBeVisible({ timeout: 2000 });
    await shortcutsModal(page).click({ position: { x: 5, y: 5 } });
    await expect(shortcutsModal(page)).not.toBeVisible({ timeout: 2000 });
  });
});
