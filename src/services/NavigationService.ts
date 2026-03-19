import { contextStore, setContextStore } from "../stores/contextStore";
import { IndexService } from "./IndexService";
import type { Entity } from "../types/entities";
import type { TopicRef } from "../types/topics";
import type { SearchFilter } from "../types/search";

/**
 * NavigationService manages view navigation and context state (Design §6.5).
 */
export const NavigationService = {
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
    });
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
        ? { journalAnchorDate: entity.date }
        : {}),
    });

    NavigationService.updateRelevance();
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
  },
};
