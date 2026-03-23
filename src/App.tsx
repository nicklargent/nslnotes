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
import { QuickCapture } from "./components/QuickCapture";
import { ImagePreview } from "./components/shared/ImagePreview";
import { Layout } from "./components/layout/Layout";
import { LeftSidebar } from "./components/layout/LeftSidebar";
import { CenterPanel } from "./components/layout/CenterPanel";
import { RightPanel } from "./components/layout/RightPanel";
import {
  SettingsService,
  IndexService,
  NavigationService,
  FileService,
} from "./services";
import { clearIndexCache } from "./lib/indexCache";
import { indexStore, setIndexStore } from "./stores/indexStore";
import { contextStore, setContextStore } from "./stores/contextStore";
import { uiStore, setUIStore } from "./stores/uiStore";
import { debouncedSave } from "./components/layout/Layout";
import type { Topic } from "./types/topics";
import type { Doc } from "./types/entities";
import type { BacklinkEntry } from "./types/backlinks";

/**
 * Application state
 */
type AppState = "loading" | "setup" | "ready";

function App() {
  const [appState, setAppState] = createSignal<AppState>("loading");
  // eslint-disable-next-line solid/reactivity
  const [, setRootPath] = createSignal<string | null>(null);
  const [showShortcuts, setShowShortcuts] = createSignal(false);
  const [showQuickCapture, setShowQuickCapture] = createSignal(false);
  let unwatchFn: (() => void) | null = null;

  // Apply font size to document root reactively
  createEffect(() => {
    document.documentElement.style.fontSize = `${uiStore.fontSize}px`;
  });

  // Apply dark mode class reactively
  createEffect(() => {
    document.documentElement.classList.toggle("dark", uiStore.darkMode);
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
      if (settings.darkMode != null) {
        setUIStore("darkMode", settings.darkMode);
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
        NavigationService.initHistory();
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

    // Cmd/Ctrl+N: Quick capture
    if (mod && e.key === "n") {
      e.preventDefault();
      setShowQuickCapture(true);
      return;
    }

    // Cmd/Ctrl+K: Open search
    if (mod && e.key === "k") {
      e.preventDefault();
      NavigationService.goToSearch();
      return;
    }

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
        // Skip redundant invalidation for files we just wrote ourselves
        if (FileService.isRecentWrite(event.path)) return;
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

  async function switchFolder() {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Notes Folder",
      });

      if (!selected || typeof selected !== "string") return;

      const status = await FileService.verifyDirectory(selected);
      if (!status.readable || !status.writable) {
        showToast("Selected folder is not readable/writable", "error");
        return;
      }

      await FileService.ensureDirectory(selected);

      // Tear down current state
      unwatchFn?.();
      unwatchFn = null;
      await FileService.stopWatching();
      clearIndexCache();
      setIndexStore("notes", new Map());
      setIndexStore("tasks", new Map());
      setIndexStore("docs", new Map());
      setIndexStore("topics", new Map());
      setIndexStore("topicsYaml", new Map());
      setIndexStore("imageFiles", new Map());
      setIndexStore("entityToImages", new Map());
      setIndexStore("imageToEntities", new Map());
      setIndexStore("backlinkIndex", new Map());
      setIndexStore("lastIndexed", null);

      // Initialize with new folder
      await SettingsService.setRootPath(selected);
      setRootPath(selected);
      await IndexService.buildIndex(selected);
      startFileWatcher(selected);
      NavigationService.goHome();
      showToast("Switched notes folder", "success");
    } catch (err) {
      showToast(
        `Failed to switch folder: ${err instanceof Error ? err.message : "Unknown error"}`,
        "error"
      );
    }
  }

  /**
   * Active topics, sorted with context-based reordering (T3.11).
   */
  const sortedTopics = createMemo((): Topic[] => {
    const topics = Array.from(indexStore.topics.values()).filter(
      (t) => t.isActive
    );
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10);

    function weightedScore(t: Topic): number {
      let score = 0;
      for (const ref of t.references) {
        score += ref.date && ref.date >= sevenDaysAgoStr ? 2 : 1;
      }
      return score;
    }

    return topics.sort((a, b) => {
      const diff = weightedScore(b) - weightedScore(a);
      if (diff !== 0) return diff;
      return a.label.toLowerCase().localeCompare(b.label.toLowerCase());
    });
  });

  /**
   * Docs list, sorted with context-based reordering (T3.11).
   */
  const sortedDocs = createMemo((): Doc[] => {
    const docs = Array.from(indexStore.docs.values());
    return docs.sort((a, b) =>
      a.title.toLowerCase().localeCompare(b.title.toLowerCase())
    );
  });

  const groupedTasks = createMemo(() => {
    return IndexService.getGroupedTasks();
  });

  const groupedClosedTasks = createMemo(() => {
    return IndexService.getGroupedClosedTasks();
  });

  const highlightedTaskPath = createMemo(() => {
    const entity = contextStore.activeEntity;
    if (entity && entity.type === "task") return entity.path;
    return null;
  });

  const activeDocPath = createMemo(() => {
    const entity = contextStore.activeEntity;
    if (entity && entity.type === "doc") return entity.path;
    return null;
  });

  const activeBacklinks = createMemo((): BacklinkEntry[] => {
    const entity = contextStore.activeEntity;
    if (!entity || entity.type === "note") return [];
    return indexStore.backlinkIndex.get(entity.path) ?? [];
  });

  const handleBacklinkClick = (path: string) => {
    const entity = IndexService.resolveEntityByPath(path);
    if (entity) NavigationService.navigateTo(entity);
  };

  const datesWithNotes = createMemo((): Set<string> => {
    const dates = new Set<string>();
    for (const note of indexStore.notes.values()) {
      if (note.date) dates.add(note.date);
    }
    return dates;
  });

  const [noteDraftDate, setNoteDraftDate] = createSignal<string | null>(null);

  function handleNewNote(date: string) {
    setNoteDraftDate(date);
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
              activeDocPath={activeDocPath()}
              onTodayClick={() => NavigationService.goHome()}
              onSearchClick={() => NavigationService.goToSearch()}
              onQuickCapture={() => setShowQuickCapture(true)}
              onTopicClick={(ref) => NavigationService.navigateToTopic(ref)}
              onDocClick={(doc) => NavigationService.navigateTo(doc)}
              onCreateDoc={() => setContextStore("draft", { type: "doc" })}
              onSwitchFolder={switchFolder}
              datesWithNotes={datesWithNotes()}
              onDateSelect={(date) => NavigationService.navigateToDate(date)}
            />
          }
          center={
            <CenterPanel
              activeView={contextStore.activeView}
              onNewNote={handleNewNote}
              noteDraftDate={noteDraftDate()}
              onNoteDraftClear={() => setNoteDraftDate(null)}
            />
          }
          right={
            <RightPanel
              groupedTasks={groupedTasks()}
              groupedClosedTasks={groupedClosedTasks()}
              highlightedTaskPath={highlightedTaskPath()}
              onTaskClick={(task) => NavigationService.navigateTo(task)}
              onCreateTask={() => setContextStore("draft", { type: "task" })}
              backlinks={activeBacklinks()}
              onBacklinkClick={handleBacklinkClick}
            />
          }
        />
      </Show>

      <Show when={showShortcuts()}>
        <KeyboardShortcutsModal onClose={() => setShowShortcuts(false)} />
      </Show>

      <Show when={showQuickCapture()}>
        <QuickCapture onClose={() => setShowQuickCapture(false)} />
      </Show>

      <ImagePreview />
      <ToastContainer />
    </AppErrorBoundary>
  );
}

export default App;
