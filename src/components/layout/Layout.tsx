import type { JSX } from "solid-js";
import { ResizeHandle } from "./ResizeHandle";
import { uiStore, setUIStore } from "../../stores/uiStore";
import { SettingsService } from "../../services/SettingsService";

interface LayoutProps {
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
 * Three-column layout using CSS Grid with resizable columns.
 * Columns never collapse or hide (FR-UI-001).
 * Left sidebar: navigation. Center: content. Right: tasks (FR-UI-002).
 */
export function Layout(props: LayoutProps) {
  return (
    <div
      class="grid h-screen overflow-hidden bg-gray-50 dark:bg-gray-900"
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
  );
}

export { debouncedSave };
