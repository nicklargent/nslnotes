import { createSignal, createMemo, onMount, onCleanup, Show } from "solid-js";
import { SetupScreen } from "./components/SetupScreen";
import { Layout } from "./components/layout/Layout";
import { LeftSidebar } from "./components/layout/LeftSidebar";
import { CenterPanel } from "./components/layout/CenterPanel";
import { RightPanel } from "./components/layout/RightPanel";
import { CreateNoteModal } from "./components/modals/CreateNoteModal";
import { CreateTaskModal } from "./components/modals/CreateTaskModal";
import { CreateDocModal } from "./components/modals/CreateDocModal";
import {
  SettingsService,
  IndexService,
  NavigationService,
  FileService,
} from "./services";
import { indexStore } from "./stores/indexStore";
import { contextStore } from "./stores/contextStore";
import type { Topic } from "./types/topics";
import type { Doc } from "./types/entities";

/**
 * Application state
 */
type AppState = "loading" | "setup" | "ready";

function App() {
  const [appState, setAppState] = createSignal<AppState>("loading");
  // eslint-disable-next-line solid/reactivity
  const [, setRootPath] = createSignal<string | null>(null);
  let unwatchFn: (() => void) | null = null;

  onMount(async () => {
    const configured = await SettingsService.isConfigured();

    if (configured) {
      const path = await SettingsService.getRootPath();
      setRootPath(path);
      if (path) {
        await IndexService.buildIndex(path);
        startFileWatcher(path);
      }
      setAppState("ready");
    } else {
      setAppState("setup");
    }
  });

  onCleanup(() => {
    unwatchFn?.();
  });

  function startFileWatcher(path: string) {
    unwatchFn = FileService.onFileChange((event) => {
      if (event.path.endsWith(".md") || event.path.endsWith(".yaml")) {
        void IndexService.invalidate(event.path, path);
      }
    });
    void FileService.startWatching(path);
  }

  async function handleSetupComplete(path: string) {
    setRootPath(path);
    await IndexService.buildIndex(path);
    startFileWatcher(path);
    setAppState("ready");
  }

  /**
   * Active topics, sorted with context-based reordering (T3.11).
   * When not home state, related topics float to top.
   */
  const sortedTopics = createMemo((): Topic[] => {
    const topics = Array.from(indexStore.topics.values()).filter(
      (t) => t.isActive
    );

    if (contextStore.isHomeState) {
      // Natural order: most recently used
      return topics.sort((a, b) => {
        const aTime = a.lastUsed?.getTime() ?? 0;
        const bTime = b.lastUsed?.getTime() ?? 0;
        return bTime - aTime;
      });
    }

    // Related topics float to top
    const weights = contextStore.relevanceWeights;
    return topics.sort((a, b) => {
      const aWeight = getTopicWeight(a, weights);
      const bWeight = getTopicWeight(b, weights);
      if (aWeight !== bWeight) return bWeight - aWeight;
      const aTime = a.lastUsed?.getTime() ?? 0;
      const bTime = b.lastUsed?.getTime() ?? 0;
      return bTime - aTime;
    });
  });

  /**
   * Docs list, sorted with context-based reordering (T3.11).
   * When not home state, related docs float to top.
   */
  const sortedDocs = createMemo((): Doc[] => {
    const docs = Array.from(indexStore.docs.values());

    if (contextStore.isHomeState) {
      // Alphabetical by title
      return docs.sort((a, b) =>
        a.title.toLowerCase().localeCompare(b.title.toLowerCase())
      );
    }

    // Related docs float to top, rest alphabetical
    const weights = contextStore.relevanceWeights;
    return docs.sort((a, b) => {
      const aWeight = weights.get(a.path) ?? 0;
      const bWeight = weights.get(b.path) ?? 0;
      if (aWeight !== bWeight) return bWeight - aWeight;
      return a.title.toLowerCase().localeCompare(b.title.toLowerCase());
    });
  });

  /**
   * Grouped tasks for the right panel.
   */
  const groupedTasks = createMemo(() => {
    return IndexService.getGroupedTasks(contextStore);
  });

  /**
   * Path of the currently active task (for highlight indicator).
   */
  const highlightedTaskPath = createMemo(() => {
    const entity = contextStore.activeEntity;
    if (entity && entity.type === "task") return entity.path;
    return null;
  });

  // Modal state
  const [noteModalDate, setNoteModalDate] = createSignal<string | null>(null);
  const [showTaskModal, setShowTaskModal] = createSignal(false);
  const [showDocModal, setShowDocModal] = createSignal(false);

  function handleNewNote(date: string) {
    setNoteModalDate(date);
  }

  function handleNoteCreated(_slug: string | null) {
    setNoteModalDate(null);
  }

  return (
    <>
      <Show when={appState() === "loading"}>
        <div class="flex min-h-screen items-center justify-center bg-gray-50">
          <div class="text-gray-500">Loading...</div>
        </div>
      </Show>

      <Show when={appState() === "setup"}>
        <SetupScreen onComplete={handleSetupComplete} />
      </Show>

      <Show when={appState() === "ready"}>
        <Layout
          left={
            <LeftSidebar
              topics={sortedTopics()}
              docs={sortedDocs()}
              onTodayClick={() => NavigationService.goHome()}
              onTopicClick={(ref) => NavigationService.navigateToTopic(ref)}
              onDocClick={(doc) => NavigationService.navigateTo(doc)}
              onCreateDoc={() => setShowDocModal(true)}
            />
          }
          center={
            <CenterPanel
              activeView={contextStore.activeView}
              onNewNote={handleNewNote}
            />
          }
          right={
            <RightPanel
              groupedTasks={groupedTasks()}
              isHomeState={contextStore.isHomeState}
              highlightedTaskPath={highlightedTaskPath()}
              onTaskClick={(task) => NavigationService.navigateTo(task)}
              onCreateTask={() => setShowTaskModal(true)}
            />
          }
        />
        <Show when={noteModalDate() !== null}>
          <CreateNoteModal
            date={noteModalDate()!}
            onClose={() => setNoteModalDate(null)}
            onCreated={handleNoteCreated}
          />
        </Show>
        <Show when={showTaskModal()}>
          <CreateTaskModal onClose={() => setShowTaskModal(false)} />
        </Show>
        <Show when={showDocModal()}>
          <CreateDocModal onClose={() => setShowDocModal(false)} />
        </Show>
      </Show>
    </>
  );
}

/**
 * Get the relevance weight for a topic based on its references.
 */
function getTopicWeight(topic: Topic, weights: Map<string, number>): number {
  let total = 0;
  for (const ref of topic.references) {
    total += weights.get(ref.path) ?? 0;
  }
  return total;
}

export default App;
