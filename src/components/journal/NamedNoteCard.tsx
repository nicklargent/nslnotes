import { For, Show } from "solid-js";
import type { Note } from "../../types/entities";

interface NamedNoteCardProps {
  note: Note;
  isFocused: boolean;
  onClick: (note: Note) => void;
}

/**
 * Card rendering for a named note within the journal (FR-ENT-003).
 * Shows title and preview/excerpt. Click focuses the note for context updates.
 */
export function NamedNoteCard(props: NamedNoteCardProps) {
  const excerpt = () => {
    const lines = props.note.content.split("\n").filter((l) => l.trim());
    const preview = lines.slice(0, 3).join(" ");
    return preview.length > 120 ? preview.slice(0, 120) + "..." : preview;
  };

  return (
    <button
      class={`mt-2 w-full rounded-lg border p-3 text-left transition-colors ${
        props.isFocused
          ? "border-blue-300 bg-blue-50"
          : "border-gray-200 bg-gray-50 hover:border-gray-300"
      }`}
      onClick={() => props.onClick(props.note)}
    >
      <h4 class="text-sm font-medium text-gray-800">
        {props.note.title ?? props.note.slug}
      </h4>
      <Show when={excerpt()}>
        <p class="mt-1 text-xs leading-relaxed text-gray-500">{excerpt()}</p>
      </Show>
      <Show when={props.note.topics.length > 0}>
        <div class="mt-1.5 flex flex-wrap gap-1">
          <For each={props.note.topics}>
            {(t) => (
              <span class="rounded bg-gray-200 px-1.5 py-0.5 text-xs text-gray-500">
                {t}
              </span>
            )}
          </For>
        </div>
      </Show>
    </button>
  );
}
