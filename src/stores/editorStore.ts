import { createStore } from "solid-js/store";
import type { EditorState } from "../types/stores";

function initialEditorState(): EditorState {
  return {
    activeFile: null,
    isDirty: false,
    pendingSave: null,
  };
}

const [editorStore, setEditorStore] =
  createStore<EditorState>(initialEditorState());

export function resetEditorStore(): void {
  setEditorStore(initialEditorState());
}

export { editorStore, setEditorStore };
