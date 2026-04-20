import { test, expect, type Page } from "@playwright/test";
import { createTestRoot, removeTestRoot } from "./fixtures/test-data";
import { centerPanel, sidebar, tiptapEditor, todayButton } from "./helpers/selectors";

/**
 * Set up the app with a pre-configured pair of notebooks. The /api/settings
 * route is stateful so the frontend's PUTs are reflected on subsequent GETs.
 * This lets us verify switching persists across interactions within a test.
 */
async function setupWithNotebooks(
  page: Page,
  roots: { id: string; name: string; path: string }[],
  activeId: string
) {
  // Seed settings as if they had been written by the app already
  let current: Record<string, unknown> = {
    rootPath: roots.find((n) => n.id === activeId)!.path,
    notebooks: roots,
    activeNotebookId: activeId,
    leftColumnWidth: 256,
    rightColumnWidth: 280,
    fontSize: 14,
    darkMode: false,
  };

  await page.route("**/api/settings", async (route, request) => {
    if (request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(current),
      });
    } else if (request.method() === "PUT") {
      try {
        const body = request.postData();
        if (body) current = JSON.parse(body);
      } catch {
        // ignore
      }
      await route.fulfill({ status: 200, body: "{}" });
    } else {
      await route.continue();
    }
  });

  await page.goto("/");
  await expect(page.locator("aside").first()).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(500);
}

/**
 * Simpler setup for legacy-migration tests: only rootPath is returned from GET.
 */
async function setupLegacy(page: Page, rootPath: string) {
  let current: Record<string, unknown> = { rootPath };
  await page.route("**/api/settings", async (route, request) => {
    if (request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(current),
      });
    } else if (request.method() === "PUT") {
      try {
        const body = request.postData();
        if (body) current = JSON.parse(body);
      } catch {
        // ignore
      }
      await route.fulfill({ status: 200, body: "{}" });
    } else {
      await route.continue();
    }
  });
  await page.goto("/");
  await expect(page.locator("aside").first()).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(500);
}

test.describe("Notebook switcher", () => {
  test("legacy rootPath-only settings migrate to a single notebook tab", async ({
    page,
  }) => {
    const root = createTestRoot("minimal");
    try {
      await setupLegacy(page, root);
      // The top bar should show one tab labeled with the folder's basename.
      const basename = root.split("/").pop()!;
      const tab = page.getByRole("button", { name: basename, exact: true }).first();
      await expect(tab).toBeVisible({ timeout: 5000 });
    } finally {
      removeTestRoot(root);
    }
  });

  test("switching notebooks swaps in the other notebook's content", async ({
    page,
  }) => {
    const rootA = createTestRoot("minimal");
    const rootB = createTestRoot("full"); // "full" has #project topic
    try {
      await setupWithNotebooks(
        page,
        [
          { id: "a", name: "alpha", path: rootA },
          { id: "b", name: "beta", path: rootB },
        ],
        "a"
      );

      // Starting in "alpha": sidebar does NOT show #project yet (minimal preset)
      await expect(sidebar(page).getByText("#project")).toHaveCount(0);

      // Click beta tab
      await page.getByRole("button", { name: "beta", exact: true }).first().click();

      // beta uses the "full" preset which has #project
      await expect(sidebar(page).getByText("#project").first()).toBeVisible({
        timeout: 5000,
      });
    } finally {
      removeTestRoot(rootA);
      removeTestRoot(rootB);
    }
  });

  test("switching with a dirty editor shows the discard confirm modal", async ({
    page,
  }) => {
    const rootA = createTestRoot("full");
    const rootB = createTestRoot("minimal");
    try {
      await setupWithNotebooks(
        page,
        [
          { id: "a", name: "alpha", path: rootA },
          { id: "b", name: "beta", path: rootB },
        ],
        "a"
      );

      // Open a doc so an editor mounts, then make it dirty.
      const docButton = sidebar(page)
        .locator("button", { hasText: "API Reference" })
        .first();
      await expect(docButton).toBeVisible({ timeout: 5000 });
      await docButton.click();
      await expect(tiptapEditor(page)).toBeVisible({ timeout: 5000 });
      // Type to dirty the editor
      await tiptapEditor(page).click();
      await page.keyboard.type(" (dirty)");
      await page.waitForTimeout(200);

      // Try to switch to beta — expect the confirm modal instead of an immediate switch.
      await page.getByRole("button", { name: "beta", exact: true }).first().click();

      const modal = page.locator(".fixed.inset-0").filter({ hasText: "Unsaved changes" });
      await expect(modal).toBeVisible({ timeout: 3000 });

      // Cancel — we should still be in alpha. The simplest check is that the doc editor is still visible.
      await modal.getByRole("button", { name: "Cancel" }).click();
      await expect(tiptapEditor(page)).toBeVisible();
    } finally {
      removeTestRoot(rootA);
      removeTestRoot(rootB);
    }
  });

  test("right-click a tab and Rename updates the label", async ({ page }) => {
    const rootA = createTestRoot("minimal");
    const rootB = createTestRoot("minimal");
    try {
      await setupWithNotebooks(
        page,
        [
          { id: "a", name: "alpha", path: rootA },
          { id: "b", name: "beta", path: rootB },
        ],
        "a"
      );

      const betaTab = page.getByRole("button", { name: "beta", exact: true }).first();
      await betaTab.click({ button: "right" });
      await page.getByRole("button", { name: "Rename", exact: true }).click();

      // The inline input replaces the tab label and is autofocused.
      const input = page.locator("input:focus");
      await expect(input).toBeVisible();
      await expect(input).toHaveValue("beta");
      await input.fill("bravo");
      await input.press("Enter");

      await expect(
        page.getByRole("button", { name: "bravo", exact: true }).first()
      ).toBeVisible();
    } finally {
      removeTestRoot(rootA);
      removeTestRoot(rootB);
    }
  });

  test("clicking the Today button still works after switching notebooks", async ({
    page,
  }) => {
    const rootA = createTestRoot("minimal");
    const rootB = createTestRoot("minimal");
    try {
      await setupWithNotebooks(
        page,
        [
          { id: "a", name: "alpha", path: rootA },
          { id: "b", name: "beta", path: rootB },
        ],
        "a"
      );
      await page.getByRole("button", { name: "beta", exact: true }).first().click();
      await page.waitForTimeout(300);
      await todayButton(page).click();
      await expect(
        centerPanel(page).getByText("Today", { exact: true }).first()
      ).toBeVisible({ timeout: 5000 });
    } finally {
      removeTestRoot(rootA);
      removeTestRoot(rootB);
    }
  });
});
