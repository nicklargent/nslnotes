import { test, expect } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";
import { setupApp, teardownApp } from "./helpers/app-setup";
import {
  centerPanel,
  rightPanel,
  createTaskButton,
  draftInput,
  tiptapEditor,
} from "./helpers/selectors";
import { typeInEditor, waitForSave } from "./helpers/editor";
import { expectFileExists, expectFileNotExists } from "./helpers/assertions";

const TEMPLATE_BODY =
  "## Agenda\n- \n\n## Notes\n- \n\n## Action items\n- [ ] ";

function templatesDir(testRoot: string): string {
  return path.join(testRoot, ".templates", "tasks");
}

function slashMenu(page: import("@playwright/test").Page) {
  return centerPanel(page).locator("[data-slash-menu]");
}

/** Open the new-task draft view via the right panel "+" button. */
async function openTaskDraft(page: import("@playwright/test").Page) {
  await createTaskButton(page).click();
  await expect(draftInput(page)).toBeVisible({ timeout: 2000 });
  await expect(draftInput(page)).toBeFocused();
}

/** Open the templates management view via the slash menu's "Manage templates…". */
async function openTemplatesView(page: import("@playwright/test").Page) {
  await openTaskDraft(page);
  await page.keyboard.type("/");
  await expect(slashMenu(page)).toBeVisible({ timeout: 2000 });
  await slashMenu(page).getByText("Manage templates…").click();
  await expect(
    centerPanel(page).getByRole("heading", { name: "Templates" }),
  ).toBeVisible({ timeout: 2000 });
}

test.describe("Task templates", () => {
  let testRoot: string;

  test.beforeEach(async ({ page }) => {
    ({ testRoot } = await setupApp(page));
  });

  test.afterEach(() => {
    teardownApp(testRoot);
  });

  test("slash menu shows Manage when no templates exist", async ({ page }) => {
    await openTaskDraft(page);
    await page.keyboard.type("/");
    const menu = slashMenu(page);
    await expect(menu).toBeVisible();
    await expect(menu.getByText("Manage templates…")).toBeVisible();
  });

  test("slash menu does not appear for doc drafts", async ({ page }) => {
    // Doc drafts have no templates. Type / and verify nothing pops up.
    const createDocBtn = page
      .locator("aside")
      .first()
      .getByRole("button", { name: "+", exact: true })
      .first();
    await createDocBtn.click();
    await expect(draftInput(page)).toBeVisible();
    await page.keyboard.type("/");
    await expect(slashMenu(page)).toHaveCount(0);
  });

  test("create a template from the management view", async ({ page }) => {
    await openTemplatesView(page);
    await expect(
      centerPanel(page).getByText("No templates yet."),
    ).toBeVisible({ timeout: 2000 });

    await centerPanel(page).getByRole("button", { name: "+ New template" }).click();

    const nameInput = centerPanel(page).locator(
      "input[placeholder='e.g. Meeting prep']",
    );
    await expect(nameInput).toBeVisible({ timeout: 2000 });
    await nameInput.fill("Meeting prep");
    await typeInEditor(page, TEMPLATE_BODY);

    await centerPanel(page).getByRole("button", { name: "Save" }).click();
    await waitForSave(page);

    const filePath = path.join(templatesDir(testRoot), "meeting-prep.md");
    expectFileExists(filePath);
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("Agenda");
    expect(content).toContain("Action items");
    expect(content.startsWith("---")).toBe(false);

    await expect(centerPanel(page).getByText("Meeting prep")).toBeVisible({
      timeout: 2000,
    });
  });

  test("slash menu picks a template, applies chip, and commits with body", async ({
    page,
  }) => {
    fs.mkdirSync(templatesDir(testRoot), { recursive: true });
    fs.writeFileSync(
      path.join(templatesDir(testRoot), "bug-triage.md"),
      "## Steps\n- [ ] Reproduce\n- [ ] Identify root cause",
    );

    await page.reload();
    await expect(centerPanel(page).locator("main, [class*='editor']").first()).toBeVisible({
      timeout: 5000,
    });
    await openTaskDraft(page);

    // Type some title, then slash, then filter.
    await page.keyboard.type("Investigate flaky CI ");
    await page.keyboard.type("/");
    const menu = slashMenu(page);
    await expect(menu).toBeVisible();
    await expect(menu.getByText("Bug triage")).toBeVisible();

    // Filter narrows results
    await page.keyboard.type("bug");
    await expect(menu.getByText("Bug triage")).toBeVisible();

    // Enter selects the highlighted item
    await page.keyboard.press("Enter");
    await expect(menu).toBeHidden();

    // Title should have the `/bug` token stripped
    await expect(draftInput(page)).toHaveValue("Investigate flaky CI ");
    // Applied chip is visible
    await expect(centerPanel(page).getByText("Template: Bug triage")).toBeVisible();

    // Commit via Enter
    await page.keyboard.press("Enter");

    await expect(centerPanel(page).getByText("Investigate flaky CI")).toBeVisible({
      timeout: 5000,
    });
    const editor = tiptapEditor(page);
    await expect(editor).toContainText("Reproduce", { timeout: 5000 });
    await expect(editor).toContainText("Identify root cause");

    await expect(
      rightPanel(page).getByText("Investigate flaky CI"),
    ).toBeVisible({ timeout: 5000 });

    const taskFile = path.join(testRoot, "tasks", "investigate-flaky-ci.md");
    await waitForSave(page);
    expectFileExists(taskFile);
    const taskContent = fs.readFileSync(taskFile, "utf-8");
    expect(taskContent).toContain("Reproduce");
    expect(taskContent).not.toContain("template:");
  });

  test("Esc dismisses the slash menu without cancelling the draft", async ({ page }) => {
    fs.mkdirSync(templatesDir(testRoot), { recursive: true });
    fs.writeFileSync(
      path.join(templatesDir(testRoot), "ignored.md"),
      "ignored body",
    );
    await page.reload();
    await openTaskDraft(page);
    await page.keyboard.type("Plain ");
    await page.keyboard.type("/");
    await expect(slashMenu(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(slashMenu(page)).toBeHidden();
    // Draft is still open
    await expect(draftInput(page)).toBeVisible();
    await expect(draftInput(page)).toHaveValue("Plain /");

    // A second Esc cancels the draft.
    await page.keyboard.press("Escape");
    await expect(draftInput(page)).not.toBeVisible({ timeout: 2000 });
  });

  test("Blank task (no slash) commits without template body", async ({ page }) => {
    fs.mkdirSync(templatesDir(testRoot), { recursive: true });
    fs.writeFileSync(
      path.join(templatesDir(testRoot), "with-body.md"),
      "Some preset content",
    );
    await page.reload();
    await openTaskDraft(page);
    await draftInput(page).fill("Plain task");
    await page.keyboard.press("Enter");
    await expect(centerPanel(page).getByText("Plain task")).toBeVisible({
      timeout: 5000,
    });
    await waitForSave(page);
    const taskFile = path.join(testRoot, "tasks", "plain-task.md");
    expectFileExists(taskFile);
    const taskContent = fs.readFileSync(taskFile, "utf-8");
    expect(taskContent).not.toContain("Some preset content");
  });

  test("clearing the applied template removes the chip", async ({ page }) => {
    fs.mkdirSync(templatesDir(testRoot), { recursive: true });
    fs.writeFileSync(
      path.join(templatesDir(testRoot), "alpha.md"),
      "alpha content",
    );
    await page.reload();
    await openTaskDraft(page);
    await page.keyboard.type("/alpha");
    await expect(slashMenu(page)).toBeVisible();
    await page.keyboard.press("Enter");
    const chip = centerPanel(page).getByText("Template: Alpha");
    await expect(chip).toBeVisible();
    await centerPanel(page).getByRole("button", { name: "Clear template" }).click();
    await expect(chip).toBeHidden();
  });

  test("delete a template removes the file", async ({ page }) => {
    fs.mkdirSync(templatesDir(testRoot), { recursive: true });
    const filePath = path.join(templatesDir(testRoot), "doomed.md");
    fs.writeFileSync(filePath, "to be deleted");
    await page.reload();
    await openTemplatesView(page);

    const row = centerPanel(page).locator("li", { hasText: "Doomed" });
    await row.hover();
    await row.getByRole("button", { name: "Delete", exact: true }).click();

    const confirm = page
      .locator(".fixed.inset-0")
      .filter({ hasText: "Doomed" });
    await expect(confirm).toBeVisible({ timeout: 2000 });
    await confirm.locator("button.bg-red-600").click();

    await page.waitForTimeout(300);
    expectFileNotExists(filePath);
    await expect(
      centerPanel(page).getByText("No templates yet."),
    ).toBeVisible({ timeout: 2000 });
  });

  test("rename a template moves the file on disk", async ({ page }) => {
    fs.mkdirSync(templatesDir(testRoot), { recursive: true });
    fs.writeFileSync(
      path.join(templatesDir(testRoot), "old-name.md"),
      "preserved body",
    );
    await page.reload();
    await openTemplatesView(page);

    const row = centerPanel(page).locator("li", { hasText: "Old name" });
    await row.click();

    const nameInput = centerPanel(page).locator(
      "input[placeholder='e.g. Meeting prep']",
    );
    await expect(nameInput).toBeVisible({ timeout: 2000 });
    await nameInput.fill("Brand new name");
    await centerPanel(page).getByRole("button", { name: "Save" }).click();
    await waitForSave(page);

    expectFileNotExists(path.join(templatesDir(testRoot), "old-name.md"));
    expectFileExists(path.join(templatesDir(testRoot), "brand-new-name.md"));
    const content = fs.readFileSync(
      path.join(templatesDir(testRoot), "brand-new-name.md"),
      "utf-8",
    );
    expect(content).toContain("preserved body");
  });
});
