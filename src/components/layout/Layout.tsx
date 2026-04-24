import type { JSX } from "solid-js";
import { Show } from "solid-js";
import { ResizeHandle } from "./ResizeHandle";
import { Drawer } from "./Drawer";
import { uiStore, setUIStore, closeDrawers } from "../../stores/uiStore";
import { SettingsService } from "../../services/SettingsService";

interface LayoutProps {
  top?: JSX.Element;
  left: JSX.Element;
  center: JSX.Element;
  right: JSX.Element;
}

let saveTimeout: ReturnType<typeof setTimeout> | undefined;

function debouncedSave() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    const settings = await SettingsService.loadSettings();
    settings.leftColumnWidth = uiStore.leftColumnWidth;
    settings.rightColumnWidth = uiStore.rightColumnWidth;
    settings.fontSize = uiStore.fontSize;
    settings.darkMode = uiStore.darkMode;
    await SettingsService.saveSettings(settings);
  }, 500);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Responsive three-column layout. Viewport mode picks the presentation:
 *
 * - `desktop` (≥1024px): fixed three-pane grid with resize handles.
 * - `tablet`  (768–1023px): center + right visible, left sidebar in a drawer.
 * - `mobile`  (<768px): only center visible, both sidebars in drawers.
 */
export function Layout(props: LayoutProps) {
  return (
    <div class="flex h-screen flex-col overflow-hidden bg-gray-50 dark:bg-gray-900">
      {props.top}

      <Show when={uiStore.viewport === "desktop"}>
        <div
          class="grid min-h-0 flex-1"
          style={{
            "grid-template-columns": `${uiStore.leftColumnWidth}px 4px 1fr 4px ${uiStore.rightColumnWidth}px`,
          }}
        >
          <aside class="flex flex-col overflow-y-auto border-r border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
            {props.left}
          </aside>
          <ResizeHandle
            onResize={(delta) => {
              setUIStore(
                "leftColumnWidth",
                clamp(uiStore.leftColumnWidth + delta, 160, 400)
              );
            }}
            onResizeEnd={debouncedSave}
          />
          <main class="flex flex-col overflow-y-auto overflow-x-hidden">
            {props.center}
          </main>
          <ResizeHandle
            onResize={(delta) => {
              setUIStore(
                "rightColumnWidth",
                clamp(uiStore.rightColumnWidth - delta, 180, 480)
              );
            }}
            onResizeEnd={debouncedSave}
          />
          <aside class="flex flex-col overflow-y-auto border-l border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
            {props.right}
          </aside>
        </div>
      </Show>

      <Show when={uiStore.viewport === "tablet"}>
        <div
          class="grid min-h-0 flex-1"
          style={{ "grid-template-columns": "1fr 260px" }}
        >
          <main class="flex flex-col overflow-y-auto overflow-x-hidden">
            {props.center}
          </main>
          <aside class="flex flex-col overflow-y-auto border-l border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
            {props.right}
          </aside>
        </div>
        <Drawer
          open={uiStore.leftDrawerOpen}
          side="left"
          onClose={closeDrawers}
        >
          {props.left}
        </Drawer>
      </Show>

      <Show when={uiStore.viewport === "mobile"}>
        <main class="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
          {props.center}
        </main>
        <Drawer
          open={uiStore.leftDrawerOpen}
          side="left"
          onClose={closeDrawers}
        >
          {props.left}
        </Drawer>
        <Drawer
          open={uiStore.rightDrawerOpen}
          side="right"
          onClose={closeDrawers}
        >
          {props.right}
        </Drawer>
      </Show>
    </div>
  );
}

export { debouncedSave };
