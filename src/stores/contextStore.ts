import { createStore } from "solid-js/store";
import type { ContextState } from "../types/stores";

function initialContextState(): ContextState {
  return {
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
    currentMonth: null,
  };
}

const [contextStore, setContextStore] = createStore<ContextState>(
  initialContextState()
);

export function resetContextStore(): void {
  setContextStore(initialContextState());
}

export { contextStore, setContextStore };
