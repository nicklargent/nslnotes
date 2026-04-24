import { createStore } from "solid-js/store";

export type Viewport = "mobile" | "tablet" | "desktop";

interface UIState {
  leftColumnWidth: number;
  rightColumnWidth: number;
  fontSize: number;
  darkMode: boolean;
  /**
   * Reactive viewport mode. Desktop shows the three-pane layout; tablet
   * collapses the left sidebar to a drawer; mobile collapses both sidebars
   * to drawers and shows only the center pane.
   */
  viewport: Viewport;
  leftDrawerOpen: boolean;
  rightDrawerOpen: boolean;
}

function detectViewport(): Viewport {
  if (typeof window === "undefined") return "desktop";
  const w = window.innerWidth;
  if (w < 768) return "mobile";
  if (w < 1024) return "tablet";
  return "desktop";
}

const [uiStore, setUIStore] = createStore<UIState>({
  leftColumnWidth: 240,
  rightColumnWidth: 280,
  fontSize: 16,
  darkMode: false,
  viewport: detectViewport(),
  leftDrawerOpen: false,
  rightDrawerOpen: false,
});

/**
 * Wire viewport tracking to window resize. Call once at app start.
 * Closes any open drawers on transition to desktop so state is consistent.
 */
export function installViewportTracking(): () => void {
  if (typeof window === "undefined") return () => {};
  function onResize() {
    const next = detectViewport();
    if (next !== uiStore.viewport) {
      setUIStore("viewport", next);
      if (next === "desktop") {
        setUIStore("leftDrawerOpen", false);
        setUIStore("rightDrawerOpen", false);
      }
    }
  }
  window.addEventListener("resize", onResize);
  return () => window.removeEventListener("resize", onResize);
}

/** Open one drawer, auto-closing the other so only one is visible at a time. */
export function openDrawer(side: "left" | "right") {
  if (side === "left") {
    setUIStore("leftDrawerOpen", true);
    setUIStore("rightDrawerOpen", false);
  } else {
    setUIStore("rightDrawerOpen", true);
    setUIStore("leftDrawerOpen", false);
  }
}

export function closeDrawers() {
  setUIStore("leftDrawerOpen", false);
  setUIStore("rightDrawerOpen", false);
}

export { uiStore, setUIStore };
