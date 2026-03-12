import type { JSX } from "solid-js";

interface LayoutProps {
  left: JSX.Element;
  center: JSX.Element;
  right: JSX.Element;
}

/**
 * Three-column layout using CSS Grid.
 * Columns never collapse or hide (FR-UI-001).
 * Left sidebar: navigation. Center: content. Right: tasks (FR-UI-002).
 */
export function Layout(props: LayoutProps) {
  return (
    <div class="grid h-screen grid-cols-[240px_1fr_280px] overflow-hidden bg-gray-50">
      <aside class="flex flex-col overflow-y-auto border-r border-gray-200 bg-white">
        {props.left}
      </aside>
      <main class="flex flex-col overflow-y-auto">{props.center}</main>
      <aside class="flex flex-col overflow-y-auto border-l border-gray-200 bg-white">
        {props.right}
      </aside>
    </div>
  );
}
