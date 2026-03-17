export const WIKILINK_MIME = "application/x-nslnotes-wikilink";

export function setWikilinkDragData(
  e: DragEvent,
  type: "doc" | "task",
  slug: string
): void {
  const wikilink = `[[${type}:${slug}]]`;
  e.dataTransfer!.setData(WIKILINK_MIME, wikilink);
  e.dataTransfer!.setData("text/plain", wikilink);
  e.dataTransfer!.effectAllowed = "copy";
}
