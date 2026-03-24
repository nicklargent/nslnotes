import { createSignal, Show, onCleanup } from "solid-js";
import { DOMSerializer } from "@tiptap/pm/model";
import { ProseEditor, markdownFromHtml } from "./ProseEditor";
import { CommandMenu, filterCommands } from "./CommandMenu";
import { BubbleMenu } from "./BubbleMenu";
import { TopicAutocomplete } from "./TopicAutocomplete";
import { PromoteConfirmBar } from "./PromoteConfirmBar";
import { detectPromoteRange } from "./promoteRange";
import { promoteHighlightKey } from "./PromoteHighlightPlugin";
import { EntityService } from "../../services/EntityService";
import { rootPathFromEntity } from "../../services/ImageService";
import { NavigationService } from "../../services/NavigationService";
import { IndexService } from "../../services/IndexService";
import { contextStore } from "../../stores/contextStore";
import { indexStore } from "../../stores/indexStore";
import { registerEditor, unregisterEditor } from "../../stores/findStore";
import type { Editor as TiptapEditor } from "@tiptap/core";
import type { PromoteRange } from "./promoteRange";
import type { TopicRef } from "../../types/topics";
import type { WikiLink } from "../../types/inline";

interface EditorProps {
  content: string;
  placeholder?: string | undefined;
  autofocus?: boolean | undefined;
  entityPath?: string | undefined;
  onUpdate: (content: string) => void;
}

/**
 * Editor wrapper (T5.2, T6.8, T6.9).
 * Handles command menu actions including extract (promote).
 */
export function Editor(props: EditorProps) {
  const [commandMenuPos, setCommandMenuPos] = createSignal<{
    top: number;
    left: number;
  } | null>(null);
  const [promoteRange, setPromoteRange] = createSignal<PromoteRange | null>(
    null
  );
  const [autocomplete, setAutocomplete] = createSignal<{
    pos: { top: number; left: number };
    prefix: "#" | "@";
    filter: string;
    startPos: number;
  } | null>(null);
  const [slashPos, setSlashPos] = createSignal<number | null>(null);
  const [commandFilter, setCommandFilter] = createSignal("");
  const [showBubbleMenu, setShowBubbleMenu] = createSignal(false);
  let editorRef: TiptapEditor | undefined;
  const [editorReady, setEditorReady] = createSignal(false);
  let blurTimeout: ReturnType<typeof setTimeout> | undefined;
  let bubbleMenuRef: HTMLDivElement | undefined;
  let confirmBarRef: HTMLDivElement | undefined;

  onCleanup(() => {
    if (blurTimeout) clearTimeout(blurTimeout);
    if (editorRef) unregisterEditor(editorRef);
  });

  function closeCommandMenu() {
    setCommandMenuPos(null);
    setCommandFilter("");
    setSlashPos(null);
  }

  function handleSlashKey(
    pos: { top: number; left: number },
    cursorPos: number
  ) {
    setShowBubbleMenu(false);
    setSlashPos(cursorPos);
    setCommandMenuPos(pos);
  }

  function handleHashOrAt(
    prefix: "#" | "@",
    pos: { top: number; left: number },
    cursorPos: number
  ) {
    setShowBubbleMenu(false);
    // Subtract 1 to include the # or @ prefix character in the replacement range
    setAutocomplete({ pos, prefix, filter: "", startPos: cursorPos - 1 });
  }

  function handleAutocompleteFilter(filter: string) {
    const ac = autocomplete();
    if (ac) {
      setAutocomplete({ ...ac, filter });
    }
  }

  function handleContentUpdate(content: string) {
    let inProgressToken: string | undefined;

    // Update autocomplete filter if active
    const ac = autocomplete();
    if (ac && editorRef) {
      const { state } = editorRef;
      const cursorPos = state.selection.from;
      if (cursorPos <= ac.startPos) {
        // Cursor moved before the trigger character — close autocomplete
        setAutocomplete(null);
      } else {
        // Extract text between start position and cursor
        const textBetween = state.doc.textBetween(ac.startPos, cursorPos, "");
        if (textBetween.includes(" ") || textBetween.includes("\n")) {
          setAutocomplete(null);
        } else {
          handleAutocompleteFilter(textBetween);
          inProgressToken = textBetween;
        }
      }
    }

    // Update command menu filter if active
    const sp = slashPos();
    if (sp !== null && commandMenuPos() && editorRef) {
      const { state } = editorRef;
      const cursorPos = state.selection.from;
      if (cursorPos <= sp) {
        closeCommandMenu();
      } else {
        const filterText = state.doc.textBetween(sp + 1, cursorPos, "");
        if (
          filterText.includes(" ") ||
          filterText.includes("\n") ||
          filterCommands(filterText).length === 0
        ) {
          closeCommandMenu();
        } else {
          setCommandFilter(filterText);
        }
      }
    }

    // Strip in-progress autocomplete token so partial topics don't get indexed
    let updatedContent = content;
    if (inProgressToken) {
      const idx = updatedContent.lastIndexOf(inProgressToken);
      if (idx !== -1) {
        updatedContent =
          updatedContent.slice(0, idx) +
          updatedContent.slice(idx + inProgressToken.length);
      }
    }

    props.onUpdate(updatedContent);
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

  function isDailyNote(): boolean {
    if (!props.entityPath) return false;
    const note = indexStore.notes.get(props.entityPath);
    return note?.isDaily === true;
  }

  function getSourceTopics(): TopicRef[] {
    const entity = contextStore.activeEntity;
    if (entity) return entity.topics;
    return [];
  }

  /**
   * Serialize a ProseMirror range to markdown.
   */
  function rangeToMarkdown(from: number, to: number): string {
    if (!editorRef) return "";
    const fragment = editorRef.state.doc.slice(from, to).content;
    const serializer = DOMSerializer.fromSchema(editorRef.state.schema);
    const dom = serializer.serializeFragment(fragment);
    const wrapper = document.createElement("div");
    wrapper.appendChild(dom);
    const rp = props.entityPath
      ? rootPathFromEntity(props.entityPath)
      : undefined;
    return markdownFromHtml(wrapper.innerHTML, props.entityPath, rp);
  }

  /**
   * Strip TODO/DOING/DONE prefix and Unicode markers from a title string.
   */
  function stripTodoPrefix(title: string): string {
    let cleaned = title;
    // Strip text prefixes
    for (const prefix of ["TODO ", "DOING ", "DONE "]) {
      if (cleaned.startsWith(prefix)) {
        cleaned = cleaned.slice(prefix.length);
        break;
      }
    }
    // Strip Unicode markers
    cleaned = cleaned
      .replace(/^\u2610\s*/, "")
      .replace(/^\u25a3\s*/, "")
      .replace(/^\u2611\s*/, "");
    return cleaned;
  }

  /**
   * Activate promote highlight and show confirm bar.
   */
  function startPromote() {
    if (!editorRef) return;
    const range = detectPromoteRange(editorRef.state);
    if (!range) return;

    // Set highlight decoration
    editorRef.view.dispatch(
      editorRef.state.tr.setMeta(promoteHighlightKey, {
        from: range.from,
        to: range.to,
      })
    );

    setShowBubbleMenu(false);
    setPromoteRange(range);
  }

  /**
   * Clear promote highlight and state.
   */
  function cancelPromote() {
    if (editorRef) {
      editorRef.view.dispatch(
        editorRef.state.tr.setMeta(promoteHighlightKey, null)
      );
    }
    setPromoteRange(null);
  }

  /**
   * Replace a range with a wikilink paragraph node.
   */
  function replaceRangeWithWikilink(range: PromoteRange, wikilinkText: string) {
    if (!editorRef) return;
    const { state } = editorRef;
    const paragraph = state.schema.nodes["paragraph"]!.create(
      null,
      state.schema.text(wikilinkText)
    );
    editorRef
      .chain()
      .focus()
      .command(({ tr }) => {
        tr.replaceWith(range.from, range.to, paragraph);
        return true;
      })
      .run();
  }

  function extractBody(range: PromoteRange): string {
    if (!range.hasBody) return "";
    const fullMd = rangeToMarkdown(range.from, range.to);
    const lines = fullMd.split("\n");
    return lines.slice(1).join("\n").trim();
  }

  async function handlePromoteConfirm(
    type: "task" | "doc" | "note",
    topics: TopicRef[],
    slug: string
  ) {
    const range = promoteRange();
    if (!range || !editorRef) return;

    const title = stripTodoPrefix(range.title);
    const body = extractBody(range);
    cancelPromote();

    if (type === "task") {
      const result = await EntityService.promoteToTask({
        todoText: title,
        slug,
        sourceTopics: topics.length > 0 ? topics : getSourceTopics(),
        ...(body ? { body } : {}),
        ...(props.entityPath ? { sourceEntityPath: props.entityPath } : {}),
      });
      if (result) {
        replaceRangeWithWikilink(range, `[[task:${result.slug}]]`);
        NavigationService.navigateTo(result.task);
      }
    } else if (type === "doc") {
      const result = await EntityService.promoteToDoc({
        title,
        slug,
        content: body,
        topics: topics.length > 0 ? topics : undefined,
        ...(props.entityPath ? { sourceEntityPath: props.entityPath } : {}),
      });
      if (result) {
        replaceRangeWithWikilink(range, `[[doc:${result.slug}]]`);
        NavigationService.navigateTo(result.doc);
      }
    } else {
      // note — only available from daily notes
      const sourceNote = props.entityPath
        ? indexStore.notes.get(props.entityPath)
        : undefined;
      if (!sourceNote) return;

      // Delete content from editor first so the save completes before
      // promoteToNote invalidates the index and triggers a re-render
      editorRef
        .chain()
        .focus()
        .command(({ tr }) => {
          tr.delete(range.from, range.to);
          return true;
        })
        .run();

      const result = await EntityService.promoteToNote({
        title,
        slug,
        date: sourceNote.date,
        sourceTopics: topics.length > 0 ? topics : getSourceTopics(),
        ...(body ? { body } : {}),
        ...(props.entityPath ? { sourceEntityPath: props.entityPath } : {}),
      });
      if (result) {
        NavigationService.focusEntity(result.note);
      }
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
    if (!editorRef) {
      closeCommandMenu();
      return;
    }

    // Delete the slash character and any filter text that was typed
    const sp = slashPos();
    closeCommandMenu();
    if (sp !== null) {
      const cursorPos = editorRef.state.selection.from;
      editorRef
        .chain()
        .focus()
        .command(({ tr }) => {
          tr.delete(sp, cursorPos);
          return true;
        })
        .run();
    }

    switch (action) {
      case "extract":
        startPromote();
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
      <ProseEditor
        content={props.content}
        placeholder={props.placeholder}
        autofocus={props.autofocus}
        entityPath={props.entityPath}
        onUpdate={handleContentUpdate}
        onSlashKey={handleSlashKey}
        onHashOrAt={handleHashOrAt}
        ref={(e) => {
          editorRef = e;
          registerEditor(e);
          setEditorReady(true);
        }}
        onSelectionChange={(hasSelection) => {
          if (
            hasSelection &&
            !commandMenuPos() &&
            !autocomplete() &&
            !promoteRange()
          ) {
            setShowBubbleMenu(true);
          } else {
            setShowBubbleMenu(false);
          }
        }}
        onEditorBlur={(event) => {
          const relatedTarget = event?.relatedTarget as HTMLElement | null;
          if (relatedTarget && bubbleMenuRef?.contains(relatedTarget)) return;
          if (relatedTarget && confirmBarRef?.contains(relatedTarget)) return;
          blurTimeout = setTimeout(() => setShowBubbleMenu(false), 200);
        }}
        onEditorFocus={() => {
          if (blurTimeout) clearTimeout(blurTimeout);
        }}
        onWikilinkClick={handleWikilinkClick}
        onTopicClick={handleTopicClick}
      />

      <Show when={showBubbleMenu() && editorReady() && !promoteRange()}>
        <BubbleMenu
          editor={editorRef!}
          onClose={() => setShowBubbleMenu(false)}
          onExtract={startPromote}
          ref={(el) => (bubbleMenuRef = el)}
        />
      </Show>

      <Show when={promoteRange() !== null && editorReady()}>
        <PromoteConfirmBar
          editor={editorRef!}
          range={promoteRange()!}
          sourceTopics={getSourceTopics()}
          onConfirmTask={(topics, slug) =>
            void handlePromoteConfirm("task", topics, slug)
          }
          onConfirmDoc={(topics, slug) =>
            void handlePromoteConfirm("doc", topics, slug)
          }
          onConfirmNote={
            isDailyNote()
              ? (topics, slug) =>
                  void handlePromoteConfirm("note", topics, slug)
              : undefined
          }
          onCancel={cancelPromote}
          ref={(el) => (confirmBarRef = el)}
        />
      </Show>

      <Show when={commandMenuPos() !== null}>
        <CommandMenu
          position={commandMenuPos()!}
          filter={commandFilter()}
          onSelect={handleCommandSelect}
          onClose={closeCommandMenu}
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
    </div>
  );
}
