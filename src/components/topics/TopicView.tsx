import { createMemo, For, Show } from "solid-js";
import { indexStore } from "../../stores/indexStore";
import { contextStore } from "../../stores/contextStore";
import { NavigationService } from "../../services/NavigationService";
import type { Note, Doc, Task } from "../../types/entities";

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
      if (note.topics.includes(ref) || note.content.includes(ref)) {
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
      if (doc.topics.includes(ref) || doc.content.includes(ref)) {
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
        (task.topics.includes(ref) || task.content.includes(ref))
      ) {
        tasks.push(task);
      }
    }
    return tasks;
  });

  /** Doc with topic in frontmatter (shown prominently at top). */
  const pinnedDoc = createMemo((): Doc | null => {
    const ref = topicRef();
    if (!ref) return null;
    for (const doc of indexStore.docs.values()) {
      if (doc.topics.includes(ref)) return doc;
    }
    return null;
  });

  return (
    <div class="h-full overflow-y-auto">
      <div class="mx-auto max-w-2xl px-6 py-6">
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

              {/* Pinned doc (FR-NAV-014) */}
              <Show when={pinnedDoc()}>
                {(doc) => (
                  <div class="mb-6">
                    <button
                      class="w-full rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-900/30 p-4 text-left hover:border-blue-300"
                      onClick={() => NavigationService.navigateTo(doc())}
                    >
                      <h3 class="text-sm font-medium text-blue-800 dark:text-blue-300">
                        {doc().title}
                      </h3>
                      <p class="mt-1 text-xs leading-relaxed text-blue-600 dark:text-blue-400">
                        {doc()
                          .content.split("\n")
                          .filter((l) => l.trim())
                          .slice(0, 3)
                          .join(" ")
                          .slice(0, 200)}
                      </p>
                    </button>
                  </div>
                )}
              </Show>

              {/* Open tasks */}
              <Show when={relatedTasks().length > 0}>
                <div class="mb-6">
                  <h2 class="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
                    Open Tasks ({relatedTasks().length})
                  </h2>
                  <div class="space-y-1">
                    <For each={relatedTasks()}>
                      {(task) => (
                        <button
                          class="w-full rounded px-3 py-1.5 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                          onClick={() => NavigationService.navigateTo(task)}
                        >
                          <span class="mr-1 text-blue-500">&bull;</span>
                          {task.title}
                          <Show when={task.due}>
                            <span class="ml-2 text-xs text-gray-400 dark:text-gray-500">
                              Due: {task.due}
                            </span>
                          </Show>
                        </button>
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
                        <button
                          class="w-full rounded px-3 py-1.5 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                          onClick={() => NavigationService.navigateTo(note)}
                        >
                          <span class="text-xs text-gray-400 dark:text-gray-500">
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
                        </button>
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
                        <button
                          class="w-full rounded px-3 py-1.5 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                          onClick={() => NavigationService.navigateTo(doc)}
                        >
                          {doc.title}
                        </button>
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
