import { onMount, onCleanup, createEffect } from "solid-js";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";

interface OutlinerEditorProps {
  content: string;
  placeholder?: string | undefined;
  onUpdate: (markdown: string) => void;
  onSlashKey?: ((pos: { top: number; left: number }) => void) | undefined;
  onHashOrAt?:
    | ((
        prefix: "#" | "@",
        pos: { top: number; left: number },
        cursorPos: number
      ) => void)
    | undefined;
  ref?: ((editor: Editor) => void) | undefined;
  onWikilinkClick?: ((type: string, target: string) => void) | undefined;
  onTopicClick?: ((ref: string) => void) | undefined;
}

/**
 * Outliner mode editor using TipTap (T5.4).
 * Renders content as a navigable block tree with indent/outdent/move operations.
 * Each block is a bullet list item.
 */
export function OutlinerEditor(props: OutlinerEditorProps) {
  let containerRef: HTMLDivElement | undefined;
  let editor: Editor | undefined;
  let skipNextUpdate = false;

  onMount(() => {
    if (!containerRef) return;

    editor = new Editor({
      element: containerRef,
      extensions: [
        StarterKit.configure({
          heading: false,
          blockquote: false,
          codeBlock: false,
          horizontalRule: false,
          bulletList: {
            keepMarks: true,
            keepAttributes: true,
          },
          listItem: {
            HTMLAttributes: {
              class: "outliner-block",
            },
          },
        }),
        Placeholder.configure({
          placeholder: props.placeholder ?? "Start writing...",
        }),
      ],
      content: outlineToHtml(props.content),
      onUpdate: ({ editor: e }) => {
        if (skipNextUpdate) {
          skipNextUpdate = false;
          return;
        }
        const md = htmlToOutline(e.getHTML());
        props.onUpdate(md);
      },
      editorProps: {
        handleKeyDown: (view, event) => {
          if (!editor) return false;

          // Tab to indent (T5.5)
          if (event.key === "Tab" && !event.shiftKey) {
            event.preventDefault();
            editor.chain().focus().sinkListItem("listItem").run();
            return true;
          }

          // Shift+Tab to outdent (T5.5)
          if (event.key === "Tab" && event.shiftKey) {
            event.preventDefault();
            editor.chain().focus().liftListItem("listItem").run();
            return true;
          }

          // Alt+Up to move block up (T5.6)
          if (event.key === "ArrowUp" && event.altKey) {
            event.preventDefault();
            const { state, dispatch } = view;
            const { $from } = state.selection;
            const listItem = findListItemAt(state, $from.pos);
            if (listItem) {
              moveListItem(state, dispatch, listItem, "up");
            }
            return true;
          }

          // Alt+Down to move block down (T5.6)
          if (event.key === "ArrowDown" && event.altKey) {
            event.preventDefault();
            const { state, dispatch } = view;
            const { $from } = state.selection;
            const listItem = findListItemAt(state, $from.pos);
            if (listItem) {
              moveListItem(state, dispatch, listItem, "down");
            }
            return true;
          }

          // Enter creates new block at same level (T5.7)
          // Default TipTap behavior handles this

          // Shift+Enter inserts line break within block (T5.7)
          if (event.key === "Enter" && event.shiftKey) {
            event.preventDefault();
            editor.chain().focus().setHardBreak().run();
            return true;
          }

          // # or @ triggers topic autocomplete (T6.10)
          if ((event.key === "#" || event.key === "@") && props.onHashOrAt) {
            const coords = view.coordsAtPos(view.state.selection.from);
            // Defer so the character is inserted first
            const prefix = event.key as "#" | "@";
            setTimeout(() => {
              props.onHashOrAt!(
                prefix,
                { top: coords.top, left: coords.left },
                view.state.selection.from
              );
            }, 0);
          }

          // / key opens command menu (T5.8)
          if (event.key === "/" && props.onSlashKey) {
            const coords = view.coordsAtPos(view.state.selection.from);
            // Defer so the / character is inserted first
            setTimeout(() => {
              props.onSlashKey!({ top: coords.top, left: coords.left });
            }, 0);
          }

          return false;
        },
      },
    });

    props.ref?.(editor);
  });

  createEffect(() => {
    const newContent = props.content;
    if (!editor || editor.isDestroyed) return;
    const currentMd = htmlToOutline(editor.getHTML());
    if (currentMd !== newContent) {
      skipNextUpdate = true;
      editor.commands.setContent(outlineToHtml(newContent));
    }
  });

  onCleanup(() => {
    editor?.destroy();
  });

  function handleEditorClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    // Wikilink click (T6.11)
    if (target.classList.contains("wikilink")) {
      e.preventDefault();
      const linkType = target.dataset["linkType"];
      const linkTarget = target.dataset["linkTarget"];
      if (linkType && linkTarget) {
        props.onWikilinkClick?.(linkType, linkTarget);
      }
    }
    // Topic ref click
    if (target.classList.contains("topic-ref")) {
      e.preventDefault();
      const topic = target.dataset["topic"];
      if (topic) {
        props.onTopicClick?.(topic);
      }
    }
  }

  return (
    <div
      ref={containerRef}
      class="outliner-editor focus-within:outline-none"
      onClick={handleEditorClick}
    />
  );
}

/**
 * Convert markdown list content to HTML for TipTap.
 * Handles nested bullet lists with indentation.
 */
function outlineToHtml(md: string): string {
  if (!md.trim()) return "<ul><li><p></p></li></ul>";

  const lines = md.split("\n");
  const result: string[] = [];
  const stack: number[] = []; // Track indent levels

  for (const line of lines) {
    if (line.trim() === "") continue;

    // Detect indentation and content
    const match = /^(\s*)([-*]|\d+\.)\s(.*)$/.exec(line);
    if (match) {
      const indent = match[1]?.length ?? 0;
      const content = match[3] ?? "";
      const level = Math.floor(indent / 2);
      pushItem(result, stack, level, formatInlineContent(content));
    } else {
      // Non-list line - treat as a top-level item
      pushItem(result, stack, 0, formatInlineContent(line.trim()));
    }
  }

  // Close remaining open tags
  while (stack.length > 0) {
    result.push("</li></ul>");
    stack.pop();
  }

  const html = result.join("");
  return html || "<ul><li><p></p></li></ul>";
}

function pushItem(
  result: string[],
  stack: number[],
  level: number,
  content: string
) {
  // Close deeper levels
  while (stack.length > 0 && (stack[stack.length - 1] ?? -1) >= level) {
    result.push("</li></ul>");
    stack.pop();
  }

  if (stack.length === 0) {
    result.push(`<ul><li><p>${content}</p>`);
  } else {
    result.push(`<ul><li><p>${content}</p>`);
  }
  stack.push(level);
}

/**
 * Format inline TODO/DOING/DONE markers for display.
 */
function formatInlineContent(text: string): string {
  // Format TODO states with visual indicators (T5.9)
  if (text.startsWith("TODO ")) {
    return `<span class="todo-marker todo-open" data-todo="TODO">&#9744;</span> ${text.slice(5)}`;
  }
  if (text.startsWith("DOING ")) {
    return `<span class="todo-marker todo-doing" data-todo="DOING">&#9998;</span> ${text.slice(6)}`;
  }
  if (text.startsWith("DONE ")) {
    return `<span class="todo-marker todo-done" data-todo="DONE">&#9745;</span> <s>${text.slice(5)}</s>`;
  }

  // Bold, italic, code, wikilinks, topics
  let result = text;
  result = result.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  result = result.replace(/\*(.+?)\*/g, "<em>$1</em>");
  result = result.replace(/`([^`]+)`/g, "<code>$1</code>");
  // Wikilinks (T6.12)
  result = result.replace(
    /\[\[(task|doc|note):([^\]]+)\]\]/g,
    '<span class="wikilink" data-link-type="$1" data-link-target="$2" contenteditable="false">[[$1:$2]]</span>'
  );
  // Topic refs (T6.10)
  result = result.replace(
    /(?<!\w)([#@][a-z0-9-]+)/gi,
    '<span class="topic-ref" data-topic="$1">$1</span>'
  );

  return result;
}

/**
 * Convert TipTap HTML back to markdown outline format.
 */
function htmlToOutline(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const lines: string[] = [];
  processListNode(doc.body, lines, -1);
  return lines.join("\n");
}

function processListNode(node: Node, lines: string[], depth: number) {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const el = child as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (tag === "ul" || tag === "ol") {
      processListNode(el, lines, depth);
    } else if (tag === "li") {
      // Extract text content from the li's direct <p> children
      const paragraphs = el.querySelectorAll(":scope > p");
      let text = "";
      if (paragraphs.length > 0) {
        text = extractMarkdownText(paragraphs[0]!);
      } else {
        text = extractMarkdownText(el);
      }

      // Restore TODO markers from display format
      text = text
        .replace(/^[\u2610\u2611\u2612\u270e]\s*/, (match) => {
          if (match.includes("\u2610")) return "TODO ";
          if (match.includes("\u270e")) return "DOING ";
          if (match.includes("\u2611")) return "DONE ";
          return match;
        })
        .replace(/<s>(.+?)<\/s>/g, "$1");

      const indent = "  ".repeat(Math.max(0, depth));
      if (text.trim() || depth >= 0) {
        lines.push(`${indent}- ${text}`);
      }

      // Process nested lists
      for (const subChild of Array.from(el.childNodes)) {
        if (subChild.nodeType === Node.ELEMENT_NODE) {
          const subTag = (subChild as HTMLElement).tagName.toLowerCase();
          if (subTag === "ul" || subTag === "ol") {
            processListNode(subChild, lines, depth + 1);
          }
        }
      }
    }
  }
}

function extractMarkdownText(el: Element): string {
  let text = "";
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      text += child.textContent ?? "";
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const childEl = child as HTMLElement;
      const tag = childEl.tagName.toLowerCase();
      if (tag === "strong") {
        text += `**${extractMarkdownText(childEl)}**`;
      } else if (tag === "em") {
        text += `*${extractMarkdownText(childEl)}*`;
      } else if (tag === "code") {
        text += `\`${childEl.textContent ?? ""}\``;
      } else if (tag === "s") {
        text += extractMarkdownText(childEl);
      } else if (tag === "span" && childEl.dataset["todo"]) {
        const state = childEl.dataset["todo"];
        text += `${state} `;
      } else if (tag === "br") {
        text += "\n";
      } else if (tag === "ul" || tag === "ol") {
        // Skip nested lists (handled separately)
        continue;
      } else {
        text += extractMarkdownText(childEl);
      }
    }
  }
  return text;
}

// Helper types from ProseMirror
interface ListItemInfo {
  pos: number;
  node: import("@tiptap/pm/model").Node;
  index: number;
  parent: import("@tiptap/pm/model").Node;
  parentPos: number;
}

function findListItemAt(
  state: import("@tiptap/pm/state").EditorState,
  pos: number
): ListItemInfo | null {
  const $pos = state.doc.resolve(pos);
  for (let depth = $pos.depth; depth >= 0; depth--) {
    const node = $pos.node(depth);
    if (node.type.name === "listItem") {
      const parent = $pos.node(depth - 1);
      const parentPos = $pos.before(depth - 1);
      const index = $pos.index(depth - 1);
      return { pos: $pos.before(depth), node, index, parent, parentPos };
    }
  }
  return null;
}

function moveListItem(
  state: import("@tiptap/pm/state").EditorState,
  dispatch: ((tr: import("@tiptap/pm/state").Transaction) => void) | undefined,
  item: ListItemInfo,
  direction: "up" | "down"
) {
  if (!dispatch) return;

  const targetIndex = direction === "up" ? item.index - 1 : item.index + 1;

  if (targetIndex < 0 || targetIndex >= item.parent.childCount) return;

  const tr = state.tr;
  const itemStart = item.pos;
  const itemEnd = itemStart + item.node.nodeSize;

  // Remove the item
  const itemSlice = state.doc.slice(itemStart, itemEnd);
  tr.delete(itemStart, itemEnd);

  // Calculate new position
  let insertPos: number;
  if (direction === "up") {
    // Insert before the previous sibling
    const prevStart = item.parentPos + 1;
    let pos = prevStart;
    for (let i = 0; i < targetIndex; i++) {
      pos += item.parent.child(i).nodeSize;
    }
    insertPos = tr.mapping.map(pos);
  } else {
    // Insert after the next sibling
    const prevStart = item.parentPos + 1;
    let pos = prevStart;
    for (let i = 0; i <= targetIndex; i++) {
      if (i !== item.index) {
        pos += item.parent.child(i).nodeSize;
      }
    }
    insertPos = tr.mapping.map(pos);
  }

  tr.insert(insertPos, itemSlice.content);
  dispatch(tr);
}
