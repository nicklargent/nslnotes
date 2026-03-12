import { onCleanup, createSignal } from "solid-js";
import { Editor } from "@tiptap/core";
import type { Extensions } from "@tiptap/core";

interface UseTiptapOptions {
  extensions: Extensions;
  content?: string;
  editable?: boolean;
  onUpdate?: (content: string) => void;
}

/**
 * SolidJS-compatible TipTap hook (T5.1).
 * Creates a TipTap editor and manages its lifecycle.
 */
export function useTiptap(options: UseTiptapOptions) {
  const [editor, setEditor] = createSignal<Editor | null>(null);

  function initEditor(element: HTMLElement) {
    const ed = new Editor({
      element,
      extensions: options.extensions,
      content: options.content ?? "",
      editable: options.editable ?? true,
      onUpdate: ({ editor: e }) => {
        options.onUpdate?.(e.getHTML());
      },
    });
    setEditor(ed);
  }

  onCleanup(() => {
    editor()?.destroy();
  });

  return { editor, initEditor };
}
