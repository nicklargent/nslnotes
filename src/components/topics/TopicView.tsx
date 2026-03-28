import { createMemo, For, Show, onCleanup } from "solid-js";
import { indexStore } from "../../stores/indexStore";
import { contextStore } from "../../stores/contextStore";
import { NavigationService } from "../../services/NavigationService";
import { registerContainer, unregisterContainer } from "../../stores/findStore";
import type { Note, Doc, Task } from "../../types/entities";
import type { TopicRef } from "../../types/topics";

/** Strip common markdown prefixes for cleaner display. */
function stripMarkdown(line: string): string {
  return line
    .replace(/^(?:#{1,6}\s+|-\s+(?:\[.\]\s*)?|\*\s+|\d+\.\s+)/, "")
    .trim();
}

/** Extract lines from content that contain the topic ref (case-insensitive). Max 3. */
function getContextLines(content: string, ref: TopicRef): string[] {
  const lines = content.split("\n");
  const seen = new Set<string>();
  const result: string[] = [];
  for (const line of lines) {
    if (!line.toLowerCase().includes(ref)) continue;
    const cleaned = stripMarkdown(line);
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    result.push(cleaned);
    if (result.length >= 3) break;
  }
  return result;
}

function ContextLines(props: { content: string; topicRef: TopicRef }) {
  const lines = createMemo(() =>
    getContextLines(props.content, props.topicRef)
  );
  return (
    <Show when={lines().length > 0}>
      <div class="mt-0.5 ml-4">
        <For each={lines()}>
          {(line) => (
            <p class="text-sm text-gray-600 dark:text-gray-300 truncate">
              {line}
            </p>
          )}
        </For>
      </div>
    </Show>
  );
}

/**
 * Topic/Person view in center panel (T5.16).
 * Shows topic label, note, and lists of referencing notes and docs.
 */
export function TopicView() {
  const topicRef = () => contextStore.activeTopic;

  const topic = createMemo(() => {
    const ref = topicRef();
    if (!ref) return null;
    return indexStore.topics.get(ref) ?? null;
  });

  /** Notes referencing this topic, reverse chronological. */
  const referencingNotes = createMemo((): Note[] => {
    const ref = topicRef();
    if (!ref) return [];
    const notes: Note[] = [];
    for (const note of indexStore.notes.values()) {
      if (
        note.topics.includes(ref) ||
        note.content.toLowerCase().includes(ref)
      ) {
        notes.push(note);
      }
    }
    return notes.sort((a, b) => b.date.localeCompare(a.date));
  });

  /** Docs referencing this topic, alphabetical. */
  const referencingDocs = createMemo((): Doc[] => {
    const ref = topicRef();
    if (!ref) return [];
    const docs: Doc[] = [];
    for (const doc of indexStore.docs.values()) {
      if (doc.topics.includes(ref) || doc.content.toLowerCase().includes(ref)) {
        docs.push(doc);
      }
    }
    return docs.sort((a, b) =>
      a.title.toLowerCase().localeCompare(b.title.toLowerCase())
    );
  });

  /** Tasks with this topic. */
  const relatedTasks = createMemo((): Task[] => {
    const ref = topicRef();
    if (!ref) return [];
    const tasks: Task[] = [];
    for (const task of indexStore.tasks.values()) {
      if (
        task.status === "open" &&
        (task.topics.includes(ref) || task.content.toLowerCase().includes(ref))
      ) {
        tasks.push(task);
      }
    }
    return tasks;
  });

  let containerRef: HTMLDivElement | undefined;

  onCleanup(() => {
    if (containerRef) unregisterContainer(containerRef);
  });

  return (
    <div
      class="h-full overflow-y-auto"
      ref={(el) => {
        containerRef = el;
        registerContainer(el);
      }}
    >
      <div class="px-[8%] py-6">
        <Show
          when={topic()}
          fallback={
            <p class="text-sm text-gray-400 dark:text-gray-500">
              No topic selected
            </p>
          }
        >
          {(t) => (
            <>
              {/* Topic header */}
              <div class="mb-6">
                <h1 class="text-xl font-semibold text-gray-900 dark:text-gray-100">
                  {t().label}
                </h1>
                <span class="text-xs text-gray-400 dark:text-gray-500">
                  {t().kind === "person" ? "Person" : "Topic"} &middot;{" "}
                  {t().references.length} references
                </span>
                <Show when={t().note}>
                  <p class="mt-2 text-sm text-gray-600 dark:text-gray-300">
                    {t().note}
                  </p>
                </Show>
              </div>

              {/* Open tasks */}
              <Show when={relatedTasks().length > 0}>
                <div class="mb-6">
                  <h2 class="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
                    Open Tasks ({relatedTasks().length})
                  </h2>
                  <div class="space-y-1">
                    <For each={relatedTasks()}>
                      {(task) => (
                        <div>
                          <button
                            class="w-full rounded px-3 py-1.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700"
                            onClick={() => NavigationService.navigateTo(task)}
                          >
                            <span class="text-sm font-medium text-indigo-700 dark:text-indigo-300">
                              {task.title}
                            </span>
                            <Show when={task.due}>
                              <span class="ml-2 text-xs text-gray-400 dark:text-gray-500">
                                Due: {task.due}
                              </span>
                            </Show>
                            <ContextLines
                              content={task.content}
                              topicRef={topicRef()!}
                            />
                          </button>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
              </Show>

              {/* Docs */}
              <Show when={referencingDocs().length > 0}>
                <div class="mb-6">
                  <h2 class="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
                    Documents ({referencingDocs().length})
                  </h2>
                  <div class="space-y-1">
                    <For each={referencingDocs()}>
                      {(doc) => (
                        <div>
                          <button
                            class="w-full rounded px-3 py-1.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700"
                            onClick={() => NavigationService.navigateTo(doc)}
                          >
                            <span class="text-sm font-medium text-indigo-700 dark:text-indigo-300">
                              {doc.title}
                            </span>
                            <ContextLines
                              content={doc.content}
                              topicRef={topicRef()!}
                            />
                          </button>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
              </Show>

              {/* Notes */}
              <Show when={referencingNotes().length > 0}>
                <div class="mb-6">
                  <h2 class="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
                    Notes ({referencingNotes().length})
                  </h2>
                  <div class="space-y-1">
                    <For each={referencingNotes()}>
                      {(note) => (
                        <div>
                          <button
                            class="w-full rounded px-3 py-1.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700"
                            onClick={() => NavigationService.navigateTo(note)}
                          >
                            <span class="text-sm font-medium text-indigo-700 dark:text-indigo-300">
                              <span class="text-xs font-normal text-gray-400 dark:text-gray-500">
                                {note.date}
                              </span>
                              <Show when={note.title}>
                                <span class="ml-2">{note.title}</span>
                              </Show>
                              <Show when={!note.title}>
                                <span class="ml-2 italic text-gray-400 dark:text-gray-500">
                                  Daily note
                                </span>
                              </Show>
                            </span>
                            <ContextLines
                              content={note.content}
                              topicRef={topicRef()!}
                            />
                          </button>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
              </Show>

              {/* Empty state */}
              <Show
                when={
                  referencingNotes().length === 0 &&
                  referencingDocs().length === 0 &&
                  relatedTasks().length === 0
                }
              >
                <p class="text-sm text-gray-400 dark:text-gray-500">
                  No references found for this topic.
                </p>
              </Show>
            </>
          )}
        </Show>
      </div>
    </div>
  );
}
