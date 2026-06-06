import { test, expect } from "@playwright/test";
import * as path from "node:path";
import { setupApp, teardownApp } from "./helpers/app-setup";
import {
  rightPanel,
  centerPanel,
  taskViewTab,
  taskRowPinButton,
  detailPinButton,
  detailPinnedButton,
  rightPanelTask,
} from "./helpers/selectors";
import { waitForSave } from "./helpers/editor";
import { expectFrontmatter, readFrontmatter } from "./helpers/assertions";

test.describe("Task pinning", () => {
  let testRoot: string;

  test.beforeEach(async ({ page }) => {
    ({ testRoot } = await setupApp(page));
  });

  test.afterEach(() => {
    teardownApp(testRoot);
  });

  test("pin from row surfaces task in Pinned tab and writes frontmatter", async ({
    page,
  }) => {
    // Pin "Fix Login Bug" from its right-panel row
    await expect(rightPanelTask(page, "Fix Login Bug")).toBeVisible({
      timeout: 5000,
    });
    await taskRowPinButton(page, "Fix Login Bug").click();
    await waitForSave(page);

    // File gained pinned: true
    expectFrontmatter(
      path.join(testRoot, "tasks", "fix-login-bug.md"),
      "pinned",
      true,
    );

    // Pinned tab shows only the pinned task
    await taskViewTab(page, "Pinned").click();
    await expect(rightPanel(page).getByText("Fix Login Bug")).toBeVisible({
      timeout: 5000,
    });
    await expect(rightPanel(page).getByText("Write Docs")).toHaveCount(0);
  });

  test("Pinned tab shows empty state when nothing is pinned", async ({
    page,
  }) => {
    await taskViewTab(page, "Pinned").click();
    await expect(
      rightPanel(page).getByText(/No pinned tasks/),
    ).toBeVisible({ timeout: 5000 });
  });

  test("unpin removes the pinned frontmatter key", async ({ page }) => {
    await taskRowPinButton(page, "Fix Login Bug").click();
    await waitForSave(page);
    expectFrontmatter(
      path.join(testRoot, "tasks", "fix-login-bug.md"),
      "pinned",
      true,
    );

    // Unpin (button title flips to "Unpin task" — same selector regex)
    await taskRowPinButton(page, "Fix Login Bug").click();
    await waitForSave(page);

    const fm = readFrontmatter(path.join(testRoot, "tasks", "fix-login-bug.md"));
    expect(fm["pinned"]).toBeUndefined();
  });

  test("pin toggle in task detail persists and reflects state", async ({
    page,
  }) => {
    await rightPanelTask(page, "Write Docs").first().click();
    await expect(centerPanel(page).getByText("Write Docs")).toBeVisible({
      timeout: 5000,
    });

    // Pin from detail action row
    await expect(detailPinButton(page)).toBeVisible({ timeout: 3000 });
    await detailPinButton(page).click();
    await waitForSave(page);
    await expect(detailPinnedButton(page)).toBeVisible({ timeout: 3000 });
    expectFrontmatter(
      path.join(testRoot, "tasks", "write-docs.md"),
      "pinned",
      true,
    );

    // Unpin from detail
    await detailPinnedButton(page).click();
    await waitForSave(page);
    await expect(detailPinButton(page)).toBeVisible({ timeout: 3000 });
  });
});
