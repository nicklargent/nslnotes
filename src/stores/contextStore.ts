import { createStore } from "solid-js/store";
import type { ContextState } from "../types/stores";

const [contextStore, setContextStore] = createStore<ContextState>({
  activeView: "journal",
  activeEntity: null,
  activeTopic: null,
  relevanceWeights: new Map<string, number>(),
  isHomeState: true,
  journalAnchorDate: null,
});

export { contextStore, setContextStore };
