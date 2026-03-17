import { createSignal, Show } from "solid-js";

interface EditableDateProps {
  value: string | null;
  onSave: (value: string | null) => void;
  label?: string;
}

export function EditableDate(props: EditableDateProps) {
  const [editing, setEditing] = createSignal(false);
  const [draft, setDraft] = createSignal("");

  function startEdit() {
    setDraft(props.value ?? "");
    setEditing(true);
  }

  function save() {
    const newValue = draft() || null;
    if (newValue !== props.value) {
      props.onSave(newValue);
    }
    setEditing(false);
  }

  function cancel() {
    setEditing(false);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  }

  return (
    <Show
      when={editing()}
      fallback={
        <span
          class="cursor-text text-xs text-gray-500 dark:text-gray-400 hover:underline hover:decoration-gray-300 dark:hover:decoration-gray-600"
          onClick={startEdit}
        >
          {props.label ? `${props.label}: ` : ""}
          {props.value ?? "No due date"}
        </span>
      }
    >
      <input
        type="date"
        value={draft()}
        onInput={(e) => setDraft(e.currentTarget.value)}
        onBlur={save}
        onChange={save}
        onKeyDown={handleKeyDown}
        class="rounded border border-blue-300 bg-white dark:bg-gray-800 px-1 py-0.5 text-xs outline-none focus:ring-1 focus:ring-blue-400"
        ref={(el) => setTimeout(() => el.focus(), 0)}
      />
    </Show>
  );
}
