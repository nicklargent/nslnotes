import { type JSX, Show, onMount, onCleanup } from "solid-js";

interface DrawerProps {
  open: boolean;
  side: "left" | "right";
  onClose: () => void;
  /** Width applied below tablet breakpoint; defaults to 80% viewport. */
  width?: string;
  children: JSX.Element;
}

/**
 * Slide-in sidebar used for mobile/tablet presentations of what would be
 * fixed columns on desktop. Dismisses via backdrop tap or Escape.
 */
export function Drawer(props: DrawerProps) {
  let containerRef: HTMLDivElement | undefined;

  onMount(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && props.open) {
        e.preventDefault();
        e.stopPropagation();
        props.onClose();
      }
    }
    document.addEventListener("keydown", onKey, true);
    onCleanup(() => document.removeEventListener("keydown", onKey, true));
  });

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === containerRef) props.onClose();
  }

  return (
    <Show when={props.open}>
      <div
        ref={containerRef}
        class="fixed inset-0 z-40 bg-black/40"
        onClick={handleBackdropClick}
      >
        <aside
          class={
            "absolute top-0 h-full flex-shrink-0 overflow-y-auto bg-white shadow-xl transition-transform dark:bg-gray-800 " +
            (props.side === "left"
              ? "left-0 border-r border-gray-200 dark:border-gray-700"
              : "right-0 border-l border-gray-200 dark:border-gray-700")
          }
          style={{ width: props.width ?? "min(85vw, 340px)" }}
        >
          {props.children}
        </aside>
      </div>
    </Show>
  );
}
