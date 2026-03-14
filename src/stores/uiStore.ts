import { createStore } from "solid-js/store";

interface UIState {
  leftColumnWidth: number;
  rightColumnWidth: number;
  fontSize: number;
}

const [uiStore, setUIStore] = createStore<UIState>({
  leftColumnWidth: 240,
  rightColumnWidth: 280,
  fontSize: 16,
});

export { uiStore, setUIStore };
