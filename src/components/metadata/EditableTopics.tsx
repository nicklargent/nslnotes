import { createSignal, Show, For } from "solid-js";
import { TopicAutocomplete } from "../editor/TopicAutocomplete";
import { NavigationService } from "../../services/NavigationService";
import type { TopicRef } from "../../types/topics";

interface EditableTopicsProps {
  topics: TopicRef[];
  onSave: (topics: TopicRef[]) => void;
}

const VALID_TOPIC = /^[#@][a-z0-9-]+$/i;

// Singleton ctrl/meta key tracker shared across all EditableTopics instances
const [ctrlHeld, setCtrlHeld] = createSignal(false);
window.addEventListener("keydown", (e) => {
  if (e.key === "Control" || e.key === "Meta") setCtrlHeld(true);
});
window.addEventListener("keyup", (e) => {
  if (e.key === "Control" || e.key === "Meta") setCtrlHeld(false);
});
window.addEventListener("blur", () => setCtrlHeld(false));

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
  const [autocomplete, setAutocomplete] = createSignal<{
    pos: { top: number; left: number };
    prefix: "#" | "@";
    filter: string;
    tokenStart: number;
    tokenEnd: number;
  } | null>(null);
  let inputRef: HTMLInputElement | undefined;

  function startEdit() {
    setDraft(props.topics.join(", "));
    setEditing(true);
  }

  function save() {
    if (autocomplete()) return;
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
    setAutocomplete(null);
    setEditing(false);
  }

  function getTokenAtCursor(): {
    prefix: "#" | "@";
    filter: string;
    tokenStart: number;
    tokenEnd: number;
  } | null {
    if (!inputRef) return null;
    const text = inputRef.value;
    const cursor = inputRef.selectionStart ?? text.length;

    // Walk backward from cursor to find the start of the current token
    let start = cursor;
    while (start > 0 && !/[,\s]/.test(text.charAt(start - 1))) {
      start--;
    }

    const token = text.slice(start, cursor);
    if (token.length >= 1 && (token[0] === "#" || token[0] === "@")) {
      return {
        prefix: token[0] as "#" | "@",
        filter: token,
        tokenStart: start,
        tokenEnd: cursor,
      };
    }
    return null;
  }

  function updateAutocomplete() {
    if (!inputRef) return;
    const token = getTokenAtCursor();
    if (token) {
      const rect = inputRef.getBoundingClientRect();
      setAutocomplete({
        ...token,
        pos: { top: rect.bottom, left: rect.left },
      });
    } else {
      setAutocomplete(null);
    }
  }

  function handleInput(e: InputEvent & { currentTarget: HTMLInputElement }) {
    setDraft(e.currentTarget.value);
    updateAutocomplete();
  }

  function handleAutocompleteSelect(ref: TopicRef) {
    const ac = autocomplete();
    if (!ac || !inputRef) return;

    const text = draft();
    const newDraft =
      text.slice(0, ac.tokenStart) + ref + text.slice(ac.tokenEnd);
    setDraft(newDraft);
    setAutocomplete(null);

    // Restore focus and cursor position after the inserted ref
    const newCursor = ac.tokenStart + ref.length;
    setTimeout(() => {
      inputRef!.focus();
      inputRef!.setSelectionRange(newCursor, newCursor);
    }, 0);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (autocomplete()) {
      // Let TopicAutocomplete handle navigation keys
      if (["ArrowDown", "ArrowUp", "Enter", "Tab"].includes(e.key)) {
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setAutocomplete(null);
        return;
      }
    }
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
              <span class="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400">
                + Add topics
              </span>
            }
          >
            <For each={props.topics}>
              {(t) => (
                <span
                  class="rounded bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
                  classList={{ "cursor-pointer": ctrlHeld() }}
                  onClick={(e) => {
                    if (e.ctrlKey || e.metaKey) {
                      e.preventDefault();
                      e.stopPropagation();
                      NavigationService.navigateToTopic(t);
                    }
                  }}
                >
                  {t}
                </span>
              )}
            </For>
          </Show>
        </div>
      }
    >
      <div class="relative">
        <input
          type="text"
          value={draft()}
          onInput={handleInput}
          onBlur={save}
          onKeyDown={handleKeyDown}
          onClick={updateAutocomplete}
          placeholder="#topic1, @person"
          class="w-full rounded border border-blue-300 bg-white dark:bg-gray-800 px-1.5 py-0.5 text-xs outline-none focus:ring-1 focus:ring-blue-400"
          ref={(el) => {
            inputRef = el;
            setTimeout(() => el.focus(), 0);
          }}
        />
        <Show when={autocomplete()}>
          <TopicAutocomplete
            position={autocomplete()!.pos}
            prefix={autocomplete()!.prefix}
            filter={autocomplete()!.filter}
            onSelect={handleAutocompleteSelect}
            onClose={() => setAutocomplete(null)}
          />
        </Show>
      </div>
    </Show>
  );
}
