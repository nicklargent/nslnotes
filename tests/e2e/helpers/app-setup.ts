/**
 * App setup/teardown helpers for E2E tests.
 *
 * Each test context intercepts `/api/settings` GET requests at the browser
 * level so that parallel workers don't clobber each other's rootPath.  The
 * test root is set via Playwright's `page.route()`, not a shared server-side
 * mutation.
 */
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { createTestRoot, removeTestRoot, type Preset } from "../fixtures/test-data";

export interface SetupOptions {
  preset?: Preset;
}

export interface SetupResult {
  testRoot: string;
}

/**
 * Set up a test: create a temp dir with fixture files, intercept the settings
 * API so the app uses our test root, navigate to /, and wait for the app to
 * be ready.
 */
export async function setupApp(
  page: Page,
  options: SetupOptions = {},
): Promise<SetupResult> {
  const preset = options.preset ?? "full";
  const testRoot = createTestRoot(preset);

  // Intercept /api/settings so this browser context uses our test root
  // without clobbering the real settings.json on disk.
  await page.route("**/api/settings", async (route, request) => {
    if (request.method() === "GET") {
      // Return the test rootPath — each context gets its own.
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ rootPath: testRoot }),
      });
    } else if (request.method() === "PUT") {
      // Swallow PUT requests — the app may save settings (e.g. column
      // widths) which would write the test rootPath into the real
      // settings.json, breaking the user's config.
      await route.fulfill({ status: 200, body: "{}" });
    } else {
      await route.continue();
    }
  });

  await page.goto("/");

  // Wait for the main pane to mount. An <aside> is a stronger signal but not
  // present in the mobile layout where both sidebars live behind drawers.
  await expect(page.locator("main").first()).toBeVisible({ timeout: 10_000 });

  // Wait a bit for the index to finish building
  await page.waitForTimeout(500);

  return { testRoot };
}

/**
 * Clean up a test root directory.
 */
export function teardownApp(testRoot: string): void {
  removeTestRoot(testRoot);
}
