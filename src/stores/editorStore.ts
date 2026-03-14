import { createStore } from "solid-js/store";
import type { EditorState } from "../types/stores";

const [editorStore, setEditorStore] = createStore<EditorState>({
  activeFile: null,
  isDirty: false,
  pendingSave: null,
});

export { editorStore, setEditorStore };
