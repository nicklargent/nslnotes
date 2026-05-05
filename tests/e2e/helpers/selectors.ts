/**
 * Locator factories for key UI elements.
 * Uses existing DOM traits — no data-testid attributes needed.
 */
import type { Page, Locator } from "@playwright/test";

// --- Layout columns ---
export function sidebar(page: Page): Locator {
  return page.locator("aside").first();
}

export function centerPanel(page: Page): Locator {
  return page.locator("main").first();
}

export function rightPanel(page: Page): Locator {
  return page.locator("aside").nth(1);
}

// --- Sidebar buttons ---
export function todayButton(page: Page): Locator {
  return sidebar(page).getByRole("button", { name: "Today" });
}

export function searchButton(page: Page): Locator {
  return sidebar(page).locator("button", { hasText: "Search" });
}

export function fontDecreaseButton(page: Page): Locator {
  return page.locator("button[title^='Decrease font size']");
}

export function fontIncreaseButton(page: Page): Locator {
  return page.locator("button[title^='Increase font size']");
}

export function darkModeToggle(page: Page): Locator {
  return page.locator(
    "button[title='Switch to light mode'], button[title='Switch to dark mode']"
  );
}

// --- Editor ---
export function tiptapEditor(page: Page): Locator {
  return page.locator(".tiptap").first();
}

export function proseMirrorEditor(page: Page): Locator {
  return page.locator("[contenteditable='true']").first();
}

// --- Find bar ---
export function findBarInput(page: Page): Locator {
  return page.locator("input[placeholder='Find...']");
}

export function findBarCounter(page: Page): Locator {
  return findBarInput(page).locator("..").locator("span");
}

export function findBarNext(page: Page): Locator {
  return page.locator("button[title='Next (Enter)']");
}

export function findBarPrev(page: Page): Locator {
  return page.locator("button[title='Previous (Shift+Enter)']");
}

export function findBarClose(page: Page): Locator {
  return page.locator("button[title='Close (Escape)']");
}

// --- Pin button ---
export function pinButton(page: Page): Locator {
  return page.locator("button", { hasText: /^Pin$/ });
}

export function pinnedButton(page: Page): Locator {
  return page.locator("button", { hasText: "Pinned" });
}

// --- Confirm modal ---
export function confirmModal(page: Page): Locator {
  return page.locator(".fixed.inset-0").filter({ hasText: "Delete" });
}

export function confirmDeleteButton(page: Page): Locator {
  return confirmModal(page).locator("button.bg-red-600", { hasText: "Delete" });
}

export function confirmCancelButton(page: Page): Locator {
  return confirmModal(page).getByRole("button", { name: "Cancel" });
}

// --- Shortcuts modal ---
export function shortcutsModal(page: Page): Locator {
  return page.locator(".fixed.inset-0").filter({ hasText: "Keyboard Shortcuts" });
}

// --- Task status buttons ---
export function markDoneButton(page: Page): Locator {
  return page.getByRole("button", { name: "Mark Done" });
}

export function cancelTaskButton(page: Page): Locator {
  return centerPanel(page).getByRole("button", { name: "Cancel" });
}

export function reopenButton(page: Page): Locator {
  return page.getByRole("button", { name: "Reopen" });
}

// --- Delete button ---
export function deleteButton(page: Page): Locator {
  return centerPanel(page).locator("button[title^='Delete ']");
}

// --- Quick capture ---
export function quickCaptureModal(page: Page): Locator {
  return page.locator(".fixed.inset-0").filter({ hasText: "Quick capture" });
}

export function quickCaptureTextarea(page: Page): Locator {
  return page.locator("textarea[placeholder=\"What's on your mind?\"]");
}

// --- Search view ---
export function searchInput(page: Page): Locator {
  return centerPanel(page).locator("input").first();
}

// --- Draft input ---
export function draftInput(page: Page): Locator {
  return centerPanel(page).locator("input[placeholder*='title']");
}

// --- Raw mode toggle ---
export function rawModeToggle(page: Page): Locator {
  return centerPanel(page).locator("button[title='View source'], button[title='Switch to editor']");
}

// --- Right panel task toggle ---
export function openClosedToggle(page: Page): Locator {
  return rightPanel(page).locator("button", { hasText: /^(Open|Closed)$/ });
}

export function createTaskButton(page: Page): Locator {
  return rightPanel(page).getByRole("button", { name: "+" });
}

/**
 * A row in the right-panel task list. The row is a clickable <div> wrapping
 * the title span — getByText targets the inner span and clicks bubble up to
 * the row's onClick handler.
 */
export function rightPanelTask(page: Page, title: string): Locator {
  return rightPanel(page).getByText(title, { exact: true });
}

/**
 * Read the current font size from the increase-font button's title attribute
 * ("Increase font size (now 16px)"). The on-screen font-size display was
 * removed when the controls moved to the header bar.
 */
export async function readFontSize(page: Page): Promise<number> {
  const title = await fontIncreaseButton(page).getAttribute("title");
  const match = /now (\d+)px/.exec(title ?? "");
  if (!match) throw new Error(`could not parse font size from title: ${title}`);
  return Number(match[1]);
}

// --- Bubble menu ---
export function bubbleMenu(page: Page): Locator {
  return page.locator(".animate-bubble-up").first();
}

// --- Command menu ---
export function commandMenu(page: Page): Locator {
  return page.locator(".fixed.z-50.w-56");
}

// --- Wikilink autocomplete ---
export function wikilinkAutocomplete(page: Page): Locator {
  return page.locator(".fixed.z-50.w-72");
}

// --- Table toolbar ---
export function tableToolbar(page: Page): Locator {
  return page.locator(".animate-bubble-up").filter({ hasText: "+Col" });
}
