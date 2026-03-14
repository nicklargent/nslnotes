import { onMount, onCleanup, createEffect } from "solid-js";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { TextSelection } from "@tiptap/pm/state";
import { InlineDecorations } from "./InlineDecorations";

interface OutlinerEditorProps {
  content: string;
  placeholder?: string | undefined;
  onUpdate: (markdown: string) => void;
  onSlashKey?:
    | ((pos: { top: number; left: number }, cursorPos: number) => void)
    | undefined;
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
  let lastUserUpdate = 0;
  let todoRenderTimer: ReturnType<typeof setTimeout> | undefined;

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
        InlineDecorations,
      ],
      content: outlineToHtml(props.content),
      onUpdate: ({ editor: e }) => {
        if (skipNextUpdate) {
          skipNextUpdate = false;
          return;
        }
        lastUserUpdate = Date.now();
        const md = htmlToOutline(e.getHTML());
        props.onUpdate(md);

        // Schedule re-render for TODO markers if patterns detected
        if (/(?:^|\n)\s*- (?:TODO|DOING|DONE) /m.test(md)) {
          clearTimeout(todoRenderTimer);
          todoRenderTimer = setTimeout(() => {
            if (!editor || editor.isDestroyed) return;
            const { from } = editor.state.selection;
            skipNextUpdate = true;
            editor.commands.setContent(outlineToHtml(md));
            try {
              const maxPos = editor.state.doc.content.size;
              const safePos = Math.min(from, maxPos);
              const $pos = editor.state.doc.resolve(safePos);
              editor.commands.setTextSelection(TextSelection.near($pos).from);
            } catch {
              // cursor restoration failed, acceptable
            }
          }, 800);
        }
      },
      editorProps: {
        handleClick: (view, pos, event) => {
          const $pos = view.state.doc.resolve(pos);
          const nodeText = $pos.parent.textContent;
          const clickOffset = pos - $pos.start();

          // Check for TODO marker click (Unicode chars ☐✎☑)
          const todoMatch = /^([\u2610\u270e\u2611])\s/.exec(nodeText);
          if (todoMatch && clickOffset <= 1) {
            event.preventDefault();
            const markerChar = todoMatch[1]!;
            const nextChar =
              markerChar === "\u2610"
                ? "\u270e"
                : markerChar === "\u270e"
                  ? "\u2611"
                  : "\u2610";
            // Replace just the marker character at the exact position
            const markerPos = $pos.start();
            editor!
              .chain()
              .focus()
              .command(({ tr }) => {
                tr.insertText(nextChar, markerPos, markerPos + 1);
                return true;
              })
              .run();
            return true;
          }

          // Check for wikilink click [[type:target]]
          const wikilinkRegex = /\[\[(task|doc|note):([^\]]+)\]\]/g;
          let wlMatch;
          while ((wlMatch = wikilinkRegex.exec(nodeText)) !== null) {
            if (
              clickOffset >= wlMatch.index &&
              clickOffset <= wlMatch.index + wlMatch[0].length
            ) {
              event.preventDefault();
              props.onWikilinkClick?.(wlMatch[1]!, wlMatch[2]!);
              return true;
            }
          }

          // Check for topic ref click (#topic or @person)
          const topicRegex = /(?<!\w)([#@][a-z0-9-]+)/gi;
          let topicMatch;
          while ((topicMatch = topicRegex.exec(nodeText)) !== null) {
            if (
              clickOffset >= topicMatch.index &&
              clickOffset <= topicMatch.index + topicMatch[0].length
            ) {
              event.preventDefault();
              props.onTopicClick?.(topicMatch[1]!);
              return true;
            }
          }

          return false;
        },
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
            const cursorPos = view.state.selection.from;
            const coords = view.coordsAtPos(cursorPos);
            // Defer so the / character is inserted first
            setTimeout(() => {
              props.onSlashKey!(
                { top: coords.top, left: coords.left },
                cursorPos
              );
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
    // Don't sync back content within 500ms of a user edit to avoid fighting
    if (Date.now() - lastUserUpdate < 500) return;
    const currentMd = htmlToOutline(editor.getHTML());
    if (currentMd !== newContent) {
      skipNextUpdate = true;
      editor.commands.setContent(outlineToHtml(newContent));
    }
  });

  onCleanup(() => {
    clearTimeout(todoRenderTimer);
    editor?.destroy();
  });

  return (
    <div ref={containerRef} class="outliner-editor focus-within:outline-none" />
  );
}

/**
 * Convert markdown list content to HTML for TipTap.
 * Handles nested bullet lists with indentation.
 * Produces correct <ul><li><p>...</p><ul><li>...</li></ul></li></ul> nesting.
 */
function outlineToHtml(md: string): string {
  if (!md.trim()) return "<ul><li><p></p></li></ul>";

  const lines = md.split("\n");
  const items: { level: number; content: string }[] = [];

  for (const line of lines) {
    if (line.trim() === "") continue;

    const match = /^(\s*)([-*]|\d+\.)\s(.*)$/.exec(line);
    if (match) {
      const indent = match[1]?.length ?? 0;
      const content = match[3] ?? "";
      const level = Math.floor(indent / 2);
      items.push({ level, content: formatInlineContent(content) });
    } else {
      items.push({ level: 0, content: formatInlineContent(line.trim()) });
    }
  }

  if (items.length === 0) return "<ul><li><p></p></li></ul>";

  const result: string[] = [];
  let currentLevel = -1;

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    if (item.level > currentLevel) {
      // Open new nested list(s)
      const levelsToOpen = item.level - currentLevel;
      for (let j = 0; j < levelsToOpen; j++) {
        result.push("<ul>");
      }
    } else if (item.level < currentLevel) {
      // Close deeper levels
      const levelsToClose = currentLevel - item.level;
      for (let j = 0; j < levelsToClose; j++) {
        result.push("</li></ul>");
      }
      result.push("</li>");
    } else {
      // Same level - close previous sibling
      if (currentLevel >= 0) {
        result.push("</li>");
      }
    }

    result.push(`<li><p>${item.content}</p>`);
    currentLevel = item.level;

    // If next item is not a child, we don't need to keep the li open for nesting
    // (the closing will be handled by the next iteration or the final cleanup)
  }

  // Close all remaining open tags
  for (let i = currentLevel; i >= 0; i--) {
    result.push("</li></ul>");
  }

  const html = result.join("");
  return html || "<ul><li><p></p></li></ul>";
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

  // Bold, italic, code (wikilinks and topic refs kept as plain text — click detected via handleClick)
  let result = text;
  result = result.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  result = result.replace(/\*(.+?)\*/g, "<em>$1</em>");
  result = result.replace(/`([^`]+)`/g, "<code>$1</code>");

  return result;
}

/**
 * Convert TipTap HTML back to markdown outline format.
 */
function htmlToOutline(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const lines: string[] = [];
  processListNode(doc.body, lines, 0);
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

  // Get the sibling we're swapping with
  const sibling = item.parent.child(targetIndex);

  if (direction === "up") {
    // Calculate sibling position (before current item)
    let siblingPos = item.pos;
    for (let i = item.index - 1; i >= targetIndex; i--) {
      siblingPos -= item.parent.child(i).nodeSize;
    }

    // Delete current item, insert before sibling
    const itemStart = item.pos;
    const itemEnd = itemStart + item.node.nodeSize;
    const slice = state.doc.slice(itemStart, itemEnd);
    tr.delete(itemStart, itemEnd);
    const mappedSiblingPos = tr.mapping.map(siblingPos);
    tr.insert(mappedSiblingPos, slice.content);

    // Place cursor inside the moved item
    try {
      const $pos = tr.doc.resolve(mappedSiblingPos + 2);
      tr.setSelection(TextSelection.near($pos));
    } catch {
      // fallback: don't move cursor
    }
  } else {
    // Delete sibling (which comes after current item), insert before current item
    const siblingPos = item.pos + item.node.nodeSize;
    const siblingEnd = siblingPos + sibling.nodeSize;
    const slice = state.doc.slice(siblingPos, siblingEnd);
    tr.delete(siblingPos, siblingEnd);
    const mappedItemPos = tr.mapping.map(item.pos);
    tr.insert(mappedItemPos, slice.content);

    // Place cursor inside the original item (now after the inserted sibling)
    try {
      const newItemPos = mappedItemPos + sibling.nodeSize;
      const $pos = tr.doc.resolve(newItemPos + 2);
      tr.setSelection(TextSelection.near($pos));
    } catch {
      // fallback: don't move cursor
    }
  }

  dispatch(tr);
}
