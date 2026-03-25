import { test, expect } from "@playwright/test";
import { setupApp, teardownApp } from "./helpers/app-setup";
import { sidebar, rightPanel } from "./helpers/selectors";

test.describe("Layout resize", () => {
  let testRoot: string;

  test.beforeEach(async ({ page }) => {
    ({ testRoot } = await setupApp(page));
  });

  test.afterEach(() => {
    teardownApp(testRoot);
  });

  test("left resize handle is draggable", async ({ page }) => {
    // The resize handles are 4px wide divs between columns
    const sidebarBox = await sidebar(page).boundingBox();
    expect(sidebarBox).toBeTruthy();

    // The left resize handle should be to the right of the sidebar
    const handleX = sidebarBox!.x + sidebarBox!.width + 2;
    const handleY = sidebarBox!.y + sidebarBox!.height / 2;

    const initialWidth = sidebarBox!.width;

    // Drag the handle to the right
    await page.mouse.move(handleX, handleY);
    await page.mouse.down();
    await page.mouse.move(handleX + 50, handleY, { steps: 5 });
    await page.mouse.up();

    await page.waitForTimeout(200);
    const newBox = await sidebar(page).boundingBox();
    // Width should have changed (increased by ~50px)
    expect(newBox!.width).toBeGreaterThan(initialWidth);
  });

  test("left column width clamped to 160-400px", async ({ page }) => {
    const sidebarBox = await sidebar(page).boundingBox();
    const handleX = sidebarBox!.x + sidebarBox!.width + 2;
    const handleY = sidebarBox!.y + sidebarBox!.height / 2;

    // Try to drag very far left (below minimum)
    await page.mouse.move(handleX, handleY);
    await page.mouse.down();
    await page.mouse.move(10, handleY, { steps: 10 });
    await page.mouse.up();

    await page.waitForTimeout(200);
    const newBox = await sidebar(page).boundingBox();
    expect(newBox!.width).toBeGreaterThanOrEqual(160);

    // Try to drag very far right (above maximum)
    const newHandleX = newBox!.x + newBox!.width + 2;
    await page.mouse.move(newHandleX, handleY);
    await page.mouse.down();
    await page.mouse.move(600, handleY, { steps: 10 });
    await page.mouse.up();

    await page.waitForTimeout(200);
    const finalBox = await sidebar(page).boundingBox();
    expect(finalBox!.width).toBeLessThanOrEqual(400);
  });

  test("right resize handle works", async ({ page }) => {
    const rpBox = await rightPanel(page).boundingBox();
    expect(rpBox).toBeTruthy();

    // Right handle is to the left of the right panel
    const handleX = rpBox!.x - 2;
    const handleY = rpBox!.y + rpBox!.height / 2;

    const initialWidth = rpBox!.width;

    // Drag left to make right panel wider
    await page.mouse.move(handleX, handleY);
    await page.mouse.down();
    await page.mouse.move(handleX - 50, handleY, { steps: 5 });
    await page.mouse.up();

    await page.waitForTimeout(200);
    const newBox = await rightPanel(page).boundingBox();
    expect(newBox!.width).toBeGreaterThan(initialWidth);
  });
});
