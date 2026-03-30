import { contextStore, setContextStore } from "../stores/contextStore";
import { IndexService } from "./IndexService";
import { getMonthKey } from "../lib/dates";
import type { Entity } from "../types/entities";
import type { TopicRef } from "../types/topics";
import type { SearchFilter } from "../types/search";
import type { NavHistoryEntry } from "../types/stores";

/**
 * Suppression depth counter for history pushes.
 * Cleared via queueMicrotask so SolidJS effects triggered by restoreState
 * (which run after the synchronous call returns) are also suppressed
 * and don't wipe the forward stack.
 */
let suppressHistoryDepth = 0;

/**
 * Deep-clone a value into a plain object safe for history.pushState.
 * SolidJS store proxies carry internal symbols that cause DataCloneError
 * with the structured clone algorithm used by pushState.
 */
function cloneForHistory(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

function snapshotEntry(): NavHistoryEntry {
  return {
    activeView: contextStore.activeView,
    activeEntity: cloneForHistory(
      contextStore.activeEntity
    ) as NavHistoryEntry["activeEntity"],
    activeTopic: contextStore.activeTopic,
    isHomeState: contextStore.isHomeState,
    journalAnchorDate: contextStore.journalAnchorDate,
    searchState: cloneForHistory(
      contextStore.searchState
    ) as NavHistoryEntry["searchState"],
    currentMonth: contextStore.currentMonth,
  };
}

/** Push the current (post-mutation) state as a new history entry. */
function pushHistory(): void {
  if (suppressHistoryDepth > 0) return;
  history.pushState(snapshotEntry(), "");
}

/**
 * NavigationService manages view navigation and context state (Design §6.5).
 */
export const NavigationService = {
  /**
   * Initialize browser history integration.
   * Call once on app mount.
   */
  initHistory: (): void => {
    // Seed current state so first back works
    history.replaceState(snapshotEntry(), "");

    window.addEventListener("popstate", (event: PopStateEvent) => {
      const entry = event.state as NavHistoryEntry | null;
      if (!entry) return;
      NavigationService.restoreState(entry);
    });

    // Tauri's webview doesn't map mouse back/forward buttons (3/4) to
    // browser history navigation, so handle them manually.
    window.addEventListener("mouseup", (event: MouseEvent) => {
      if (event.button === 3) {
        event.preventDefault();
        history.back();
      } else if (event.button === 4) {
        event.preventDefault();
        history.forward();
      }
    });
  },

  /**
   * Restore context from a history entry without pushing to history.
   * Suppression persists through microtask to cover SolidJS reactive effects.
   */
  restoreState: (entry: NavHistoryEntry): void => {
    suppressHistoryDepth++;

    setContextStore({
      activeView: entry.activeView,
      activeEntity: entry.activeEntity,
      activeTopic: entry.activeTopic,
      isHomeState: entry.isHomeState,
      journalAnchorDate: entry.journalAnchorDate,
      draft: null,
      searchState: entry.searchState,
      currentMonth: entry.currentMonth ?? null,
    });

    // Recompute relevance based on restored state
    if (entry.activeEntity) {
      const weights = IndexService.computeRelevance(entry.activeEntity);
      setContextStore("relevanceWeights", weights);
    } else if (entry.activeTopic) {
      const weights = new Map<string, number>();
      const refs = IndexService.getTopicReferences(entry.activeTopic);
      for (const entityRef of refs) {
        weights.set(entityRef.path, 1);
      }
      setContextStore("relevanceWeights", weights);
    } else {
      setContextStore("relevanceWeights", new Map());
    }

    // Clear after microtasks settle so reactive effects are also suppressed
    queueMicrotask(() => {
      suppressHistoryDepth--;
    });
  },

  /**
   * Focus an entity within the current view without creating a history entry.
   * Used for in-view actions like clicking a note card in the journal.
   */
  focusEntity: (entity: Entity): void => {
    const viewMap = { note: "journal", task: "task", doc: "doc" } as const;
    const activeView = viewMap[entity.type];

    setContextStore({
      activeView,
      activeEntity: entity,
      activeTopic: null,
      isHomeState: false,
      draft: null,
      searchState: null,
      ...(entity.type === "note" && entity.date
        ? { journalAnchorDate: entity.date }
        : {}),
    });

    NavigationService.updateRelevance();

    // Update the current history entry in-place (no new entry)
    NavigationService.replaceCurrentState();
  },

  /**
  /**
   * Navigate to a specific date in the journal.
   * Sets journal view anchored to the given date.
   */
  navigateToDate: (date: string): void => {
    setContextStore({
      activeView: "journal",
      activeEntity: null,
      activeTopic: null,
      relevanceWeights: new Map(),
      isHomeState: false,
      journalAnchorDate: date,
      draft: null,
      searchState: null,
      scrollToDate: date,
      currentMonth: getMonthKey(date),
    });
    pushHistory();
  },

  /**
   * Navigate to home state (Today button).
   * Sets journal view, clears relevance, resets scroll (FR-NAV-001–003).
   */
  goHome: (): void => {
    setContextStore({
      activeView: "journal",
      activeEntity: null,
      activeTopic: null,
      relevanceWeights: new Map(),
      isHomeState: true,
      journalAnchorDate: null,
      draft: null,
      searchState: null,
      currentMonth: null,
    });
    pushHistory();
  },

  /**
   * Navigate to a specific entity.
   * Sets activeView based on entity type and updates relevance.
   */
  navigateTo: (entity: Entity): void => {
    const viewMap = { note: "journal", task: "task", doc: "doc" } as const;
    const activeView = viewMap[entity.type];

    setContextStore({
      activeView,
      activeEntity: entity,
      activeTopic: null,
      isHomeState: false,
      draft: null,
      searchState: null,
      ...(entity.type === "note" && entity.date
        ? {
            journalAnchorDate: entity.date,
            currentMonth: getMonthKey(entity.date),
            scrollToDate: entity.date,
          }
        : {}),
    });

    NavigationService.updateRelevance();
    pushHistory();
  },

  /**
   * Navigate to a topic/person view.
   */
  navigateToTopic: (ref: TopicRef): void => {
    setContextStore({
      activeView: "topic",
      activeEntity: null,
      activeTopic: ref,
      isHomeState: false,
    });

    // Weight by topic: find all entities with this topic and build weights
    const weights = new Map<string, number>();
    const refs = IndexService.getTopicReferences(ref);
    for (const entityRef of refs) {
      weights.set(entityRef.path, 1);
    }
    setContextStore("relevanceWeights", weights);
    pushHistory();
  },

  /**
   * Update relevance weights based on the current active entity.
   */
  updateRelevance: (): void => {
    const entity = contextStore.activeEntity;
    if (!entity) {
      NavigationService.clearRelevance();
      return;
    }

    const weights = IndexService.computeRelevance(entity);
    setContextStore("relevanceWeights", weights);
  },

  /**
   * Clear all relevance weighting (home state).
   */
  clearRelevance: (): void => {
    setContextStore("relevanceWeights", new Map());
  },

  /**
   * Replace the current history entry with the current context state.
   * Use when in-view state changes (e.g. search filter/query) that should
   * be restored on back navigation without creating a new history entry.
   */
  replaceCurrentState: (): void => {
    history.replaceState(snapshotEntry(), "");
  },

  /**
   * Navigate to the search view.
   * Optionally pre-populates query and filter.
   */
  goToSearch: (query?: string, filter?: SearchFilter): void => {
    setContextStore({
      activeView: "search",
      activeEntity: null,
      activeTopic: null,
      relevanceWeights: new Map(),
      isHomeState: false,
      draft: null,
      searchState: {
        query: query ?? "",
        filter: filter ?? "all",
        results: [],
      },
    });
    pushHistory();
  },
};
