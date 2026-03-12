import { createSignal, Show } from "solid-js";
import { ProseEditor } from "./ProseEditor";
import { OutlinerEditor } from "./OutlinerEditor";
import { CommandMenu } from "./CommandMenu";
import { TopicAutocomplete } from "./TopicAutocomplete";
import { EntityService } from "../../services/EntityService";
import { NavigationService } from "../../services/NavigationService";
import { IndexService } from "../../services/IndexService";
import { PromoteDocModal } from "../modals/PromoteDocModal";
import { contextStore } from "../../stores/contextStore";
import type { Editor as TiptapEditor } from "@tiptap/core";
import type { EditorMode } from "../../types/stores";
import type { TopicRef } from "../../types/topics";
import type { WikiLink } from "../../types/inline";

interface EditorProps {
  content: string;
  mode: EditorMode;
  placeholder?: string | undefined;
  onUpdate: (content: string) => void;
  onModeChange?: ((mode: EditorMode) => void) | undefined;
  showModeToggle?: boolean | undefined;
}

/**
 * Editor mode wrapper (T5.2, T6.8, T6.9).
 * Switches between OutlinerEditor and ProseEditor.
 * Handles command menu actions including promote-to-task/doc.
 */
export function Editor(props: EditorProps) {
  const [commandMenuPos, setCommandMenuPos] = createSignal<{
    top: number;
    left: number;
  } | null>(null);
  const [showPromoteDocModal, setShowPromoteDocModal] = createSignal(false);
  const [currentLineText, setCurrentLineText] = createSignal("");
  const [autocomplete, setAutocomplete] = createSignal<{
    pos: { top: number; left: number };
    prefix: "#" | "@";
    filter: string;
    startPos: number;
  } | null>(null);
  let editorRef: TiptapEditor | undefined;

  function toggleMode() {
    const newMode = props.mode === "outliner" ? "prose" : "outliner";
    props.onModeChange?.(newMode);
  }

  function handleSlashKey(pos: { top: number; left: number }) {
    setCommandMenuPos(pos);
  }

  function handleHashOrAt(
    prefix: "#" | "@",
    pos: { top: number; left: number },
    cursorPos: number
  ) {
    setAutocomplete({ pos, prefix, filter: "", startPos: cursorPos });
  }

  function handleAutocompleteFilter(filter: string) {
    const ac = autocomplete();
    if (ac) {
      setAutocomplete({ ...ac, filter });
    }
  }

  function handleContentUpdate(content: string) {
    // Update autocomplete filter if active
    const ac = autocomplete();
    if (ac && editorRef) {
      const { state } = editorRef;
      const cursorPos = state.selection.from;
      // Extract text between start position and cursor
      const textBetween = state.doc.textBetween(ac.startPos, cursorPos, "");
      if (textBetween.includes(" ") || textBetween.includes("\n")) {
        setAutocomplete(null);
      } else {
        handleAutocompleteFilter(textBetween);
      }
    }

    props.onUpdate(content);
  }

  function handleAutocompleteSelect(ref: TopicRef) {
    const ac = autocomplete();
    if (!ac || !editorRef) {
      setAutocomplete(null);
      return;
    }

    // Replace the typed prefix + filter with the full topic ref
    const { state } = editorRef;
    const from = ac.startPos;
    const to = state.selection.from;

    editorRef
      .chain()
      .focus()
      .command(({ tr }) => {
        tr.insertText(`${ref} `, from, to);
        return true;
      })
      .run();

    setAutocomplete(null);
  }

  function getSourceTopics(): TopicRef[] {
    const entity = contextStore.activeEntity;
    if (entity) return entity.topics;
    return [];
  }

  function getCurrentLineContent(): string {
    if (!editorRef) return "";
    const { state } = editorRef;
    const { $from } = state.selection;
    // Get the text of the current node
    const node = $from.parent;
    return node.textContent;
  }

  async function handlePromoteToTask() {
    const lineText = getCurrentLineContent().trim();
    if (!lineText) return;

    // Strip TODO/DOING/DONE prefix if present
    let taskTitle = lineText;
    for (const prefix of ["TODO ", "DOING ", "DONE "]) {
      if (taskTitle.startsWith(prefix)) {
        taskTitle = taskTitle.slice(prefix.length);
        break;
      }
    }

    const result = await EntityService.promoteToTask({
      todoText: taskTitle,
      sourceTopics: getSourceTopics(),
    });

    if (result) {
      // Replace current line with wikilink
      if (editorRef) {
        const { state } = editorRef;
        const { $from } = state.selection;
        const start = $from.start();
        const end = $from.end();
        editorRef
          .chain()
          .focus()
          .command(({ tr }) => {
            tr.insertText(`[[task:${result.slug}]]`, start, end);
            return true;
          })
          .run();
      }
      NavigationService.navigateTo(result.task);
    }
  }

  function handlePromoteToDoc() {
    setCurrentLineText(getCurrentLineContent());
    setShowPromoteDocModal(true);
  }

  async function handlePromoteDocConfirm(title: string, topics: TopicRef[]) {
    setShowPromoteDocModal(false);

    // Get current content to promote
    const contentToPromote = currentLineText();

    const result = await EntityService.promoteToDoc({
      title,
      content: contentToPromote,
      topics: topics.length > 0 ? topics : undefined,
    });

    if (result) {
      // Replace current content with wikilink
      if (editorRef) {
        const { state } = editorRef;
        const { $from } = state.selection;
        const start = $from.start();
        const end = $from.end();
        editorRef
          .chain()
          .focus()
          .command(({ tr }) => {
            tr.insertText(`[[doc:${result.slug}]]`, start, end);
            return true;
          })
          .run();
      }
      NavigationService.navigateTo(result.doc);
    }
  }

  function handleWikilinkClick(type: string, target: string) {
    const link: WikiLink = {
      raw: `[[${type}:${target}]]`,
      type: type as WikiLink["type"],
      target,
      isValid: true,
    };
    const entity = IndexService.resolveWikilink(link);
    if (entity) {
      NavigationService.navigateTo(entity);
    }
  }

  function handleTopicClick(ref: string) {
    NavigationService.navigateToTopic(ref as TopicRef);
  }

  function handleCommandSelect(action: string) {
    setCommandMenuPos(null);

    if (!editorRef) return;

    switch (action) {
      case "promote-to-task":
        void handlePromoteToTask();
        return;
      case "promote-to-doc":
        handlePromoteToDoc();
        return;
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
          onUpdate={handleContentUpdate}
          onSlashKey={handleSlashKey}
          onHashOrAt={handleHashOrAt}
          ref={(e) => (editorRef = e)}
          onWikilinkClick={handleWikilinkClick}
          onTopicClick={handleTopicClick}
        />
      </Show>

      <Show when={props.mode === "prose"}>
        <ProseEditor
          content={props.content}
          placeholder={props.placeholder}
          onUpdate={handleContentUpdate}
          onSlashKey={handleSlashKey}
          onHashOrAt={handleHashOrAt}
          ref={(e) => (editorRef = e)}
          onWikilinkClick={handleWikilinkClick}
          onTopicClick={handleTopicClick}
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

      <Show when={autocomplete() !== null}>
        <TopicAutocomplete
          position={autocomplete()!.pos}
          prefix={autocomplete()!.prefix}
          filter={autocomplete()!.filter}
          onSelect={handleAutocompleteSelect}
          onClose={() => setAutocomplete(null)}
        />
      </Show>

      <Show when={showPromoteDocModal()}>
        <PromoteDocModal
          sourceTopics={getSourceTopics()}
          onConfirm={(title, topics) =>
            void handlePromoteDocConfirm(title, topics)
          }
          onClose={() => setShowPromoteDocModal(false)}
        />
      </Show>
    </div>
  );
}
