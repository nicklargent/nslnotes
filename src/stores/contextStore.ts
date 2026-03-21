import { createStore } from "solid-js/store";
import type { ContextState } from "../types/stores";

const [contextStore, setContextStore] = createStore<ContextState>({
  activeView: "journal",
  activeEntity: null,
  activeTopic: null,
  relevanceWeights: new Map<string, number>(),
  isHomeState: true,
  journalAnchorDate: null,
  visibleDates: new Set<string>(),
  draft: null,
  searchState: null,
  scrollToDate: null,
});

export { contextStore, setContextStore };
