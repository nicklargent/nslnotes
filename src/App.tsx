import {
  createSignal,
  createMemo,
  createEffect,
  onMount,
  onCleanup,
  Show,
  batch,
} from "solid-js";
import { SetupScreen } from "./components/SetupScreen";
import { LoginScreen } from "./components/LoginScreen";
import { AppErrorBoundary } from "./components/ErrorBoundary";
import { runtime, AUTH_EXPIRED_EVENT } from "./lib/runtime";
import { ToastContainer, showToast } from "./components/Toast";
import { SplashScreen, type LoadProgress } from "./components/SplashScreen";
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
import { clearAllIndexCaches, clearIndexCache } from "./lib/indexCache";
import { indexStore, resetIndexStore } from "./stores/indexStore";
import {
  contextStore,
  setContextStore,
  resetContextStore,
} from "./stores/contextStore";
import { uiStore, setUIStore } from "./stores/uiStore";
import {
  editorStore,
  setEditorStore,
  resetEditorStore,
} from "./stores/editorStore";
import { notebooksStore, notebooksApi } from "./stores/notebooksStore";
import { closeImagePreview } from "./stores/imagePreviewStore";
import { debouncedSave } from "./components/layout/Layout";
import { findStore, openFind, closeFind } from "./stores/findStore";
import { NotebookTabBar } from "./components/layout/NotebookTabBar";
import { ConfirmDiscardChangesModal } from "./components/modals/ConfirmDiscardChangesModal";
import type { Notebook } from "./services/SettingsService";
import type { Topic } from "./types/topics";
import type { Doc } from "./types/entities";

/**
 * Module-level AbortController for global keyboard shortcut listener.
 * Ensures only one listener is active even when Vite HMR re-mounts the component.
 */
let globalShortcutAbort: AbortController | null = null;

/**
 * Application state
 */
type AppState = "loading" | "login" | "setup" | "ready";

async function checkAuthenticated(): Promise<boolean> {
  if (runtime.isNative()) return true;
  try {
    const res = await fetch("/api/auth/me", { credentials: "include" });
    return res.ok;
  } catch {
    return false;
  }
}

function App() {
  const [appState, setAppState] = createSignal<AppState>("loading");

  const [showShortcuts, setShowShortcuts] = createSignal(false);
  const [showQuickCapture, setShowQuickCapture] = createSignal(false);
  const [pendingSwitch, setPendingSwitch] = createSignal<Notebook | null>(null);
  const [loadProgress, setLoadProgress] = createSignal<LoadProgress>({
    percent: 0,
    status: "Loading settings...",
  });
  let unwatchFn: (() => void) | null = null;
  // Incremented per switch; watcher callbacks keyed to a stale epoch drop their events.
  let switchEpoch = 0;

  // Apply font size to document root reactively
  createEffect(() => {
    document.documentElement.style.fontSize = `${uiStore.fontSize}px`;
  });

  // Apply dark mode class reactively
  createEffect(() => {
    document.documentElement.classList.toggle("dark", uiStore.darkMode);
  });

  async function initialize(opts: { skipAuthCheck?: boolean } = {}) {
    setAppState("loading");
    setLoadProgress({ percent: 0, status: "Loading settings..." });

    if (!opts.skipAuthCheck && !(await checkAuthenticated())) {
      setAppState("login");
      return;
    }

    try {
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

      setLoadProgress({ percent: 10, status: "Checking configuration..." });
      notebooksApi.hydrateFrom(settings);
      const active = notebooksApi.activeNotebook();

      if (active) {
        setLoadProgress({ percent: 15, status: "Building index..." });
        let lastPct = 15;
        const onProgress = (completed: number, total: number) => {
          // Map file parsing progress into 15–90% range
          const pct =
            total > 0 ? Math.round(15 + (completed / total) * 75) : 15;
          if (pct === lastPct) return;
          lastPct = pct;
          setLoadProgress({
            percent: pct,
            status: `Indexing files... ${completed} / ${total}`,
          });
        };
        try {
          await IndexService.buildIndex(active.path, active.id, onProgress);
        } catch (indexErr) {
          console.warn(
            "Index build failed, clearing cache and retrying:",
            indexErr
          );
          clearAllIndexCaches();
          await IndexService.buildIndex(active.path, active.id, onProgress);
        }
        setLoadProgress({ percent: 95, status: "Starting file watcher..." });
        startFileWatcher(active.path);
        NavigationService.initHistory();
        setLoadProgress({ percent: 100, status: "Ready" });
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
  }

  onMount(() => {
    void initialize();

    const handleAuthExpired = () => {
      // Guard against re-entry: stopWatching below fires /api/watch/stop which
      // also 401s, re-dispatching AUTH_EXPIRED_EVENT. Setting state first makes
      // that re-entry a no-op.
      if (appState() === "login") return;
      setAppState("login");
      unwatchFn?.();
      unwatchFn = null;
      void FileService.stopWatching();
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    onCleanup(() =>
      window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired)
    );
  });

  onCleanup(() => {
    unwatchFn?.();
  });

  // Global keyboard shortcuts
  function handleGlobalKeyDown(e: KeyboardEvent) {
    const mod = e.ctrlKey || e.metaKey;

    // Cmd/Ctrl+F: Open find bar (prevent native browser find)
    if (mod && e.key === "f") {
      e.preventDefault();
      openFind();
      return;
    }

    // Escape: Close topmost overlay
    if (e.key === "Escape") {
      if (showShortcuts()) {
        e.preventDefault();
        e.stopPropagation();
        setShowShortcuts(false);
        return;
      }
      if (findStore.visible) {
        e.preventDefault();
        e.stopPropagation();
        closeFind();
        return;
      }
    }

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

    // ? for help (T7.6) — only when no text-editable element has focus.
    if (
      e.key === "?" &&
      !mod &&
      !(e.target instanceof HTMLInputElement) &&
      !(e.target instanceof HTMLTextAreaElement) &&
      !(e.target as HTMLElement)?.closest?.(".tiptap")
    ) {
      e.preventDefault();
      e.stopPropagation();
      setShowShortcuts((s) => !s);
    }
  }

  onMount(() => {
    // Use capture phase so global shortcuts (Ctrl+F, Escape) fire before
    // ProseMirror or other components can consume/stopPropagation the event.
    // Abort any previous listener first — during Vite HMR the old cleanup may
    // not run before the new mount, causing double-registration.
    globalShortcutAbort?.abort();
    globalShortcutAbort = new AbortController();
    document.addEventListener("keydown", handleGlobalKeyDown, {
      capture: true,
      signal: globalShortcutAbort.signal,
    });
    onCleanup(() => {
      globalShortcutAbort?.abort();
      globalShortcutAbort = null;
    });
  });

  function startFileWatcher(path: string) {
    const epoch = switchEpoch;
    unwatchFn = FileService.onFileChange((event) => {
      if (epoch !== switchEpoch) return;
      if (event.path.endsWith(".md") || event.path.endsWith(".yaml")) {
        if (FileService.isRecentWrite(event.path)) return;
        void IndexService.invalidate(event.path, path);
      }
    });
    void FileService.startWatching(path);
  }

  async function handleSetupComplete(
    path: string,
    creds?: import("./services/SettingsService").NotebookCredentials
  ) {
    const nb = await notebooksApi.add(path, undefined, creds);
    try {
      await IndexService.buildIndex(path, nb.id);
    } catch (e) {
      showToast(
        `Notebook saved, but index build failed: ${
          e instanceof Error ? e.message : String(e)
        }`,
        "error"
      );
      setAppState("ready");
      return;
    }
    startFileWatcher(path);
    setAppState("ready");
    showToast("Notes folder configured successfully", "success");
  }

  async function switchToNotebook(nb: Notebook) {
    if (notebooksStore.switching) return;
    if (notebooksStore.activeNotebookId === nb.id) return;

    if (editorStore.isDirty) {
      setPendingSwitch(nb);
      return;
    }
    await performSwitch(nb);
  }

  async function performSwitch(nb: Notebook) {
    notebooksApi.setSwitching(true);
    try {
      switchEpoch += 1;

      unwatchFn?.();
      unwatchFn = null;
      await FileService.stopWatching();

      batch(() => {
        resetIndexStore();
        resetContextStore();
        resetEditorStore();
      });
      closeFind();
      closeImagePreview();

      await Promise.all([
        notebooksApi.setActive(nb.id),
        IndexService.buildIndex(nb.path, nb.id),
      ]);
      startFileWatcher(nb.path);
      NavigationService.goHome();
    } finally {
      notebooksApi.setSwitching(false);
    }
  }

  async function handleAddNotebook(
    path: string,
    creds?: import("./services/SettingsService").NotebookCredentials
  ) {
    // Local paths get verified before save. SMB paths skip pre-verification
    // because the backend only registers credentials on settings save; any
    // auth problems surface during the subsequent index build.
    if (!path.startsWith("smb://")) {
      const status = await FileService.verifyDirectory(path);
      if (!status.readable || !status.writable) {
        showToast("Selected folder is not readable/writable", "error");
        return;
      }
      await FileService.ensureDirectory(path);
    }
    const nb = await notebooksApi.add(path, undefined, creds);
    await switchToNotebook(nb);
  }

  async function handleRemoveNotebook(id: string) {
    const wasActive = notebooksStore.activeNotebookId === id;
    clearIndexCache(id);
    await notebooksApi.remove(id);
    if (wasActive) {
      const next = notebooksStore.notebooks[0];
      if (next) {
        await performSwitch(next);
      } else {
        setAppState("setup");
      }
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
        <SplashScreen progress={loadProgress()} />
      </Show>

      <Show when={appState() === "login"}>
        <LoginScreen
          onSuccess={() => void initialize({ skipAuthCheck: true })}
        />
      </Show>

      <Show when={appState() === "setup"}>
        <SetupScreen onComplete={handleSetupComplete} />
      </Show>

      <Show when={appState() === "ready"}>
        <Layout
          top={
            <NotebookTabBar
              onSelect={switchToNotebook}
              onAdd={handleAddNotebook}
              onRemove={handleRemoveNotebook}
              onRename={(id, name) => notebooksApi.rename(id, name)}
            />
          }
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
            />
          }
        />
      </Show>

      <Show when={pendingSwitch()}>
        {(nb) => (
          <ConfirmDiscardChangesModal
            target={`notebook "${nb().name}"`}
            onClose={() => setPendingSwitch(null)}
            onConfirm={async () => {
              const target = nb();
              setPendingSwitch(null);
              // Clear dirty flag so performSwitch doesn't re-prompt.
              setEditorStore("isDirty", false);
              await performSwitch(target);
            }}
          />
        )}
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
