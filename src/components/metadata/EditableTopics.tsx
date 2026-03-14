import { createSignal, Show, For } from "solid-js";
import type { TopicRef } from "../../types/topics";

interface EditableTopicsProps {
  topics: TopicRef[];
  onSave: (topics: TopicRef[]) => void;
}

const VALID_TOPIC = /^[#@][a-z0-9-]+$/i;

function parseTopics(input: string): TopicRef[] {
  // Split on commas and/or whitespace to handle "#a, #b" and "#a #b"
  return input
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => {
      if (s.startsWith("#") || s.startsWith("@")) return s as TopicRef;
      return `#${s}` as TopicRef;
    })
    .filter((s) => VALID_TOPIC.test(s));
}

export function EditableTopics(props: EditableTopicsProps) {
  const [editing, setEditing] = createSignal(false);
  const [draft, setDraft] = createSignal("");

  function startEdit() {
    setDraft(props.topics.join(", "));
    setEditing(true);
  }

  function save() {
    const parsed = parseTopics(draft());
    const changed =
      parsed.length !== props.topics.length ||
      parsed.some((t, i) => t !== props.topics[i]);
    if (changed) {
      props.onSave(parsed);
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
        <div class="flex cursor-text flex-wrap gap-1" onClick={startEdit}>
          <Show
            when={props.topics.length > 0}
            fallback={
              <span class="text-xs text-gray-400 hover:text-gray-500">
                + Add topics
              </span>
            }
          >
            <For each={props.topics}>
              {(t) => (
                <span class="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-200">
                  {t}
                </span>
              )}
            </For>
          </Show>
        </div>
      }
    >
      <input
        type="text"
        value={draft()}
        onInput={(e) => setDraft(e.currentTarget.value)}
        onBlur={save}
        onKeyDown={handleKeyDown}
        placeholder="#topic1, @person"
        class="w-full rounded border border-blue-300 bg-white px-1.5 py-0.5 text-xs outline-none focus:ring-1 focus:ring-blue-400"
        ref={(el) => setTimeout(() => el.focus(), 0)}
      />
    </Show>
  );
}
