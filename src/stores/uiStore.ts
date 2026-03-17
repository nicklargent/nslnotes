import { createStore } from "solid-js/store";

interface UIState {
  leftColumnWidth: number;
  rightColumnWidth: number;
  fontSize: number;
  darkMode: boolean;
}

const [uiStore, setUIStore] = createStore<UIState>({
  leftColumnWidth: 240,
  rightColumnWidth: 280,
  fontSize: 16,
  darkMode: false,
});

export { uiStore, setUIStore };
