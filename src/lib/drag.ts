export const WIKILINK_MIME = "application/x-nslnotes-wikilink";

let _wikilinkDragActive = false;

export function isWikilinkDragActive(): boolean {
  return _wikilinkDragActive;
}

export function clearWikilinkDragActive(): void {
  _wikilinkDragActive = false;
}

export function setWikilinkDragData(
  e: DragEvent,
  type: "doc" | "task",
  slug: string
): void {
  if ("__TAURI_INTERNALS__" in window) {
    // In Tauri (WKWebView / WebKitGTK) the OS immediately cancels internal
    // HTML5 drags (dragend fires with dropEffect="none" before any dragover
    // or drop). Worse, once dragstart fires the browser suppresses pointer
    // events for the rest of the gesture, so pointerup never arrives and
    // _pointerWikilink stays set — breaking subsequent text editing.
    // Cancelling dragstart here keeps pointer events fully active so the
    // makePointerDragHandler path (pointerup on the editor) can deliver
    // the wikilink cleanly.
    e.preventDefault();
    return;
  }
  _wikilinkDragActive = true;
  const wikilink = `[[${type}:${slug}]]`;
  e.dataTransfer!.setData(WIKILINK_MIME, wikilink);
  e.dataTransfer!.setData("text/plain", wikilink);
  e.dataTransfer!.effectAllowed = "copy";
}

let _pointerWikilink: string | null = null;

export function getPointerWikilink(): string | null {
  return _pointerWikilink;
}

export function clearPointerWikilinkDrag(): void {
  _pointerWikilink = null;
}

/**
 * Returns a pointerdown handler that records the pending wikilink and sets
 * up cleanup via pointerup (Tauri) or dragend (web where HTML5 DnD works).
 *
 * In Tauri: dragstart is cancelled above, so pointer events remain active.
 *   pointerup fires normally → onUp cleans up.
 *   dragend never fires (drag was prevented).
 *
 * In web: HTML5 DnD starts → pointer events suppressed during drag.
 *   dragend fires after drop → onDragEnd defers cleanup past handleDrop.
 *   pointerup is suppressed by the browser during DnD → onUp never fires.
 */
export function makePointerDragHandler(
  getWikilink: () => string
): (e: PointerEvent) => void {
  return (e: PointerEvent) => {
    if (e.button !== 0) return;
    _pointerWikilink = getWikilink();
    _wikilinkDragActive = true;
    document.body.style.cursor = "copy";

    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // throws if element has no pointer capture; safe to ignore
    }

    function cleanup() {
      _pointerWikilink = null;
      _wikilinkDragActive = false;
      document.body.style.cursor = "";
    }

    function onUp() {
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      document.removeEventListener("dragend", onDragEnd);
      cleanup();
    }

    function onDragEnd() {
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      document.removeEventListener("dragend", onDragEnd);
      // Defer cleanup one tick so handleDrop runs first and can consume
      // _pointerWikilink as a last-resort fallback if getData() returns "".
      setTimeout(cleanup, 0);
    }

    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
    document.addEventListener("dragend", onDragEnd);
  };
}
