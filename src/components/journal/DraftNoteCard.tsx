import { createSignal, onMount, onCleanup } from "solid-js";
import { Editor } from "../editor/Editor";
import { EntityService } from "../../services/EntityService";
import type { Note } from "../../types/entities";

interface DraftNoteCardProps {
  date: string;
  onCommit: (note: Note) => void;
  onCancel: () => void;
}

/**
 * Inline draft card for creating a new named note in the journal.
 * Looks like a NamedNoteCard but with an auto-focused title input.
 * Enter on title commits (creates note), Esc cancels.
 */
export function DraftNoteCard(props: DraftNoteCardProps) {
  const [title, setTitle] = createSignal("");
  const [committed, setCommitted] = createSignal(false);
  let cancelled = false;
  const [body, setBody] = createSignal("");
  const [showEditor, setShowEditor] = createSignal(false);
  let titleRef: HTMLInputElement | undefined;

  onMount(() => {
    titleRef?.focus();
  });

  // Capture-phase Esc listener — fires before SolidJS delegation and other
  // bubble-phase handlers, ensuring the cancel always takes effect.
  function handleGlobalKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape" && !committed()) {
      e.preventDefault();
      e.stopPropagation();
      cancelled = true;
      props.onCancel();
    }
  }

  onMount(() => {
    document.addEventListener("keydown", handleGlobalKeyDown, true);
  });

  onCleanup(() => {
    document.removeEventListener("keydown", handleGlobalKeyDown, true);
  });

  async function commit() {
    const t = title().trim();
    if (!t || committed()) return;
    setCommitted(true);

    const note = await EntityService.createNamedNote({
      date: props.date,
      title: t,
    });
    if (note) {
      props.onCommit(note);
    } else {
      setCommitted(false);
    }
  }

  function handleTitleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (title().trim()) {
        setShowEditor(true);
        void commit();
      }
    }
  }

  function handleTitleBlur() {
    if (title().trim() && !committed() && !cancelled) {
      setShowEditor(true);
      void commit();
    }
  }

  return (
    <div class="mt-2 rounded-lg border border-blue-300 bg-blue-50 dark:bg-blue-900/30 p-3">
      <div class="mb-1">
        <input
          ref={titleRef}
          type="text"
          value={title()}
          onInput={(e) => setTitle(e.currentTarget.value)}
          onKeyDown={handleTitleKeyDown}
          onBlur={handleTitleBlur}
          placeholder="Note title..."
          class="w-full border-none bg-transparent text-sm font-medium text-gray-800 dark:text-gray-100 outline-none placeholder:text-gray-400 dark:placeholder:text-gray-500"
        />
      </div>

      <div class="mt-2">
        {showEditor() ? (
          <Editor
            content={body()}
            placeholder="Start writing..."
            autofocus={true}
            onUpdate={setBody}
          />
        ) : (
          <div class="text-sm text-gray-300 dark:text-gray-600">
            Press Enter to create...
          </div>
        )}
      </div>
    </div>
  );
}
