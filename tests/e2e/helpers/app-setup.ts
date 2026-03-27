/**
 * App setup/teardown helpers for E2E tests.
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
 * Set up a test: create a temp dir with fixture files, configure settings
 * via API, navigate to /, and wait for the app to be ready.
 */
export async function setupApp(
  page: Page,
  options: SetupOptions = {},
): Promise<SetupResult> {
  const preset = options.preset ?? "full";
  const testRoot = createTestRoot(preset);

  await page.addInitScript((rootPath: string) => {
    localStorage.setItem(
      "nslnotes_settings",
      JSON.stringify({ rootPath, leftColumnWidth: null }),
    );
  }, testRoot);

  await page.goto("/");

  // Wait for sidebar content to be visible (indicates app is ready)
  await expect(page.locator("aside").first()).toBeVisible({ timeout: 10_000 });

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
