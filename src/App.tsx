import {
  createSignal,
  createMemo,
  createEffect,
  onMount,
  onCleanup,
  Show,
} from "solid-js";
import { SetupScreen } from "./components/SetupScreen";
import { AppErrorBoundary } from "./components/ErrorBoundary";
import { ToastContainer, showToast } from "./components/Toast";
import {
  SidebarSkeleton,
  JournalSkeleton,
  TaskListSkeleton,
} from "./components/LoadingSkeleton";
import { KeyboardShortcutsModal } from "./components/modals/KeyboardShortcutsModal";
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
import { clearIndexCache } from "./lib/indexCache";
import { indexStore } from "./stores/indexStore";
import { contextStore } from "./stores/contextStore";
import { uiStore, setUIStore } from "./stores/uiStore";
import { debouncedSave } from "./components/layout/Layout";
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
  const [showShortcuts, setShowShortcuts] = createSignal(false);
  let unwatchFn: (() => void) | null = null;

  // Apply font size to document root reactively
  createEffect(() => {
    document.documentElement.style.fontSize = `${uiStore.fontSize}px`;
  });

  onMount(async () => {
    try {
      // Hydrate UI store from persisted settings
      const settings = await SettingsService.loadSettings();
      if (settings.leftColumnWidth != null) {
        setUIStore("leftColumnWidth", settings.leftColumnWidth);
      }
      if (settings.rightColumnWidth != null) {
        setUIStore("rightColumnWidth", settings.rightColumnWidth);
      }
      if (settings.fontSize != null) {
        setUIStore("fontSize", settings.fontSize);
      }

      const configured = await SettingsService.isConfigured();

      if (configured) {
        const path = await SettingsService.getRootPath();
        setRootPath(path);
        if (path) {
          try {
            await IndexService.buildIndex(path);
          } catch (indexErr) {
            // Index build failed (likely stale cache) — clear cache and retry
            console.warn(
              "Index build failed, clearing cache and retrying:",
              indexErr
            );
            clearIndexCache();
            await IndexService.buildIndex(path);
          }
          startFileWatcher(path);
        }
        setAppState("ready");
      } else {
        setAppState("setup");
      }
    } catch (err) {
      console.error("Initialization error:", err);
      showToast(
        `Failed to initialize: ${err instanceof Error ? err.message : "Unknown error"}`,
        "error"
      );
      setAppState("setup");
    }
  });

  onCleanup(() => {
    unwatchFn?.();
  });

  // Global keyboard shortcuts
  function handleGlobalKeyDown(e: KeyboardEvent) {
    const mod = e.ctrlKey || e.metaKey;

    // Font size: Ctrl/Cmd + = / -
    if (mod && (e.key === "=" || e.key === "+")) {
      e.preventDefault();
      setUIStore("fontSize", Math.min(24, uiStore.fontSize + 1));
      debouncedSave();
      return;
    }
    if (mod && e.key === "-") {
      e.preventDefault();
      setUIStore("fontSize", Math.max(12, uiStore.fontSize - 1));
      debouncedSave();
      return;
    }

    // ? for help (T7.6)
    if (
      e.key === "?" &&
      !mod &&
      !(e.target instanceof HTMLInputElement) &&
      !(e.target instanceof HTMLTextAreaElement) &&
      !(e.target as HTMLElement)?.closest?.(".tiptap")
    ) {
      e.preventDefault();
      setShowShortcuts((s) => !s);
    }
  }

  onMount(() => {
    document.addEventListener("keydown", handleGlobalKeyDown);
    onCleanup(() => {
      document.removeEventListener("keydown", handleGlobalKeyDown);
    });
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
    showToast("Notes folder configured successfully", "success");
  }

  /**
   * Active topics, sorted with context-based reordering (T3.11).
   */
  const sortedTopics = createMemo((): Topic[] => {
    const topics = Array.from(indexStore.topics.values()).filter(
      (t) => t.isActive
    );

    if (contextStore.isHomeState) {
      return topics.sort((a, b) => {
        const aTime = a.lastUsed?.getTime() ?? 0;
        const bTime = b.lastUsed?.getTime() ?? 0;
        return bTime - aTime;
      });
    }

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
   */
  const sortedDocs = createMemo((): Doc[] => {
    const docs = Array.from(indexStore.docs.values());

    if (contextStore.isHomeState) {
      return docs.sort((a, b) =>
        a.title.toLowerCase().localeCompare(b.title.toLowerCase())
      );
    }

    const weights = contextStore.relevanceWeights;
    return docs.sort((a, b) => {
      const aWeight = weights.get(a.path) ?? 0;
      const bWeight = weights.get(b.path) ?? 0;
      if (aWeight !== bWeight) return bWeight - aWeight;
      return a.title.toLowerCase().localeCompare(b.title.toLowerCase());
    });
  });

  const groupedTasks = createMemo(() => {
    return IndexService.getGroupedTasks(contextStore);
  });

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
    <AppErrorBoundary>
      <Show when={appState() === "loading"}>
        <Layout
          left={<SidebarSkeleton />}
          center={<JournalSkeleton />}
          right={<TaskListSkeleton />}
        />
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

      <Show when={showShortcuts()}>
        <KeyboardShortcutsModal onClose={() => setShowShortcuts(false)} />
      </Show>

      <ToastContainer />
    </AppErrorBoundary>
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
