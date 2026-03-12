import { createSignal, Show } from "solid-js";
import { ProseEditor } from "./ProseEditor";
import { OutlinerEditor } from "./OutlinerEditor";
import { CommandMenu } from "./CommandMenu";
import type { Editor as TiptapEditor } from "@tiptap/core";
import type { EditorMode } from "../../types/stores";

interface EditorProps {
  content: string;
  mode: EditorMode;
  placeholder?: string;
  onUpdate: (content: string) => void;
  onModeChange?: (mode: EditorMode) => void;
  showModeToggle?: boolean;
}

/**
 * Editor mode wrapper (T5.2).
 * Switches between OutlinerEditor and ProseEditor.
 * Content is preserved on mode switch.
 */
export function Editor(props: EditorProps) {
  const [commandMenuPos, setCommandMenuPos] = createSignal<{
    top: number;
    left: number;
  } | null>(null);
  let editorRef: TiptapEditor | undefined;

  function toggleMode() {
    const newMode = props.mode === "outliner" ? "prose" : "outliner";
    props.onModeChange?.(newMode);
  }

  function handleSlashKey(pos: { top: number; left: number }) {
    setCommandMenuPos(pos);
  }

  function handleCommandSelect(action: string) {
    setCommandMenuPos(null);

    if (!editorRef) return;

    switch (action) {
      case "heading1":
        editorRef.chain().focus().toggleHeading({ level: 1 }).run();
        break;
      case "heading2":
        editorRef.chain().focus().toggleHeading({ level: 2 }).run();
        break;
      case "heading3":
        editorRef.chain().focus().toggleHeading({ level: 3 }).run();
        break;
      case "bullet-list":
        editorRef.chain().focus().toggleBulletList().run();
        break;
      case "ordered-list":
        editorRef.chain().focus().toggleOrderedList().run();
        break;
      case "code-block":
        editorRef.chain().focus().toggleCodeBlock().run();
        break;
      case "bold":
        editorRef.chain().focus().toggleBold().run();
        break;
      case "italic":
        editorRef.chain().focus().toggleItalic().run();
        break;
      case "divider":
        editorRef.chain().focus().setHorizontalRule().run();
        break;
    }
  }

  return (
    <div class="editor-wrapper relative">
      <Show when={props.showModeToggle !== false}>
        <div class="mb-2 flex items-center justify-end">
          <button
            class="rounded px-2 py-0.5 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            onClick={toggleMode}
          >
            {props.mode === "outliner" ? "Outline" : "Prose"}
          </button>
        </div>
      </Show>

      <Show when={props.mode === "outliner"}>
        <OutlinerEditor
          content={props.content}
          placeholder={props.placeholder}
          onUpdate={props.onUpdate}
          onSlashKey={handleSlashKey}
          ref={(e) => (editorRef = e)}
        />
      </Show>

      <Show when={props.mode === "prose"}>
        <ProseEditor
          content={props.content}
          placeholder={props.placeholder}
          onUpdate={props.onUpdate}
          onSlashKey={handleSlashKey}
          ref={(e) => (editorRef = e)}
        />
      </Show>

      <Show when={commandMenuPos() !== null}>
        <CommandMenu
          position={commandMenuPos()!}
          onSelect={handleCommandSelect}
          onClose={() => setCommandMenuPos(null)}
          mode={props.mode}
        />
      </Show>
    </div>
  );
}
