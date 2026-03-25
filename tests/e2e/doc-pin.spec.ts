import { test, expect } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

function createTestRoot(): string {
  const id = crypto.randomBytes(4).toString("hex");
  const root = `/tmp/nslnotes-test-pin-${id}`;
  fs.mkdirSync(path.join(root, "notes"), { recursive: true });
  fs.mkdirSync(path.join(root, "tasks"), { recursive: true });
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "docs", "test-doc.md"),
    `---
type: doc
title: Test Document
created: "2026-01-01"
---

Hello world.
`
  );
  return root;
}

/**
 * E2E test for doc pinning (pin state persists through parse cycle).
 */
test.describe("Doc pinning", { tag: "@serial" }, () => {
  test.describe.configure({ mode: "serial" });
  let testRoot: string;

  test.beforeEach(async () => {
    testRoot = createTestRoot();
  });

  test.afterEach(async () => {
    fs.rmSync(testRoot, { recursive: true, force: true });
  });

  test("pin button toggles pinned state and sidebar shows Pinned section", async ({
    page,
  }) => {
    // Set localStorage so the app skips setup and uses our test root
    await page.addInitScript((rootPath: string) => {
      localStorage.setItem(
        "nslnotes_settings",
        JSON.stringify({ rootPath, leftColumnWidth: null })
      );
    }, testRoot);

    await page.goto("/");

    // Wait for the sidebar to show our test doc
    const docButton = page.locator("button", { hasText: "Test Document" });
    await expect(docButton.first()).toBeVisible({ timeout: 10000 });

    // Click the doc to open it
    await docButton.first().click();

    // Verify the Pin button is visible and says "Pin" (not "Pinned")
    const pinButton = page.locator("button", { hasText: /^Pin$/ });
    await expect(pinButton).toBeVisible({ timeout: 5000 });

    // Click Pin
    await pinButton.click();

    // Verify the button now says "Pinned" with amber styling
    const pinnedButton = page.locator("button", { hasText: "Pinned" });
    await expect(pinnedButton).toBeVisible({ timeout: 5000 });
    await expect(pinnedButton).toHaveClass(/text-amber/);

    // Verify the sidebar now shows the "Pinned" section label
    const pinnedLabel = page.locator("div", { hasText: /^Pinned$/ }).filter({
      has: page.locator("text=Pinned"),
    });
    await expect(pinnedLabel.first()).toBeVisible();

    // Verify the file on disk has pinned: true in frontmatter
    const fileContent = fs.readFileSync(
      path.join(testRoot, "docs", "test-doc.md"),
      "utf-8"
    );
    expect(fileContent).toContain("pinned: true");

    // Now unpin
    await pinnedButton.click();

    // Verify it reverts to "Pin"
    await expect(
      page.locator("button", { hasText: /^Pin$/ })
    ).toBeVisible({ timeout: 5000 });

    // Verify the sidebar "Pinned" section label is gone
    // (the uppercase "PINNED" label should disappear)
    await expect(
      page.locator(".text-\\[10px\\]", { hasText: "Pinned" })
    ).not.toBeVisible();
  });

  test("pinned state persists after page reload", async ({ page }) => {
    // Set localStorage
    await page.addInitScript((rootPath: string) => {
      localStorage.setItem(
        "nslnotes_settings",
        JSON.stringify({ rootPath, leftColumnWidth: null })
      );
    }, testRoot);

    await page.goto("/");

    // Open the doc
    const docButton = page.locator("button", { hasText: "Test Document" });
    await expect(docButton.first()).toBeVisible({ timeout: 10000 });
    await docButton.first().click();

    // Pin it
    const pinButton = page.locator("button", { hasText: /^Pin$/ });
    await expect(pinButton).toBeVisible({ timeout: 5000 });
    await pinButton.click();

    // Wait for pinned state to be reflected
    await expect(
      page.locator("button", { hasText: "Pinned" })
    ).toBeVisible({ timeout: 5000 });

    // Reload the page
    await page.reload();

    // Verify the sidebar still shows the "Pinned" section label after reload
    await expect(
      page.locator(".text-\\[10px\\]", { hasText: "Pinned" })
    ).toBeVisible({ timeout: 10000 });

    // Click the doc to open it in center panel
    const docButton2 = page.locator("button", { hasText: "Test Document" });
    await expect(docButton2.first()).toBeVisible({ timeout: 10000 });
    await docButton2.first().click();

    // Verify the center panel pin button still says "Pinned"
    await expect(
      page.locator("button", { hasText: "Pinned" })
    ).toBeVisible({ timeout: 5000 });
  });
});
