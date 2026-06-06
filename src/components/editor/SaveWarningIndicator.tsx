/**
 * Persistent inline indicator shown beside a note's save status when a
 * save-integrity check detects content that would not survive a save/reload
 * (approach A). Rendered by the editor hosts (DocView, TaskDetail, DailyNote,
 * NamedNoteCard) so the wording and styling stay consistent. `class` supplies
 * the host's spacing (e.g. `mt-1` / `mt-2`).
 */
export function SaveWarningIndicator(props: { class?: string }) {
  return (
    <div
      class={`text-right text-xs font-medium text-amber-600 dark:text-amber-500${
        props.class ? ` ${props.class}` : ""
      }`}
    >
      ⚠ Save may be incomplete — review this note
    </div>
  );
}
