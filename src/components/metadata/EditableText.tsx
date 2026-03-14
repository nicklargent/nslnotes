import { createSignal, Show } from "solid-js";

interface EditableTextProps {
  value: string;
  onSave: (value: string) => void;
  placeholder?: string;
  class?: string;
}

export function EditableText(props: EditableTextProps) {
  const [editing, setEditing] = createSignal(false);
  const [draft, setDraft] = createSignal("");

  function startEdit() {
    setDraft(props.value);
    setEditing(true);
  }

  function save() {
    const trimmed = draft().trim();
    if (trimmed && trimmed !== props.value) {
      props.onSave(trimmed);
    }
    setEditing(false);
  }

  function cancel() {
    setEditing(false);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      save();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  }

  return (
    <Show
      when={editing()}
      fallback={
        <span
          class={`cursor-text hover:underline hover:decoration-gray-300 ${props.class ?? ""}`}
          onClick={startEdit}
        >
          {props.value || props.placeholder || "Untitled"}
        </span>
      }
    >
      <input
        type="text"
        value={draft()}
        onInput={(e) => setDraft(e.currentTarget.value)}
        onBlur={save}
        onKeyDown={handleKeyDown}
        class={`w-full rounded border border-blue-300 bg-white px-1 outline-none focus:ring-1 focus:ring-blue-400 ${props.class ?? ""}`}
        ref={(el) => setTimeout(() => el.focus(), 0)}
      />
    </Show>
  );
}
