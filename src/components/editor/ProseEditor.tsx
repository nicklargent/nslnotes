import { onMount, onCleanup, createEffect } from "solid-js";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { common, createLowlight } from "lowlight";
import nginx from "highlight.js/lib/languages/nginx";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import protobuf from "highlight.js/lib/languages/protobuf";
import { CodeBlockWithLines } from "./CodeBlockView";

const lowlightInstance = (() => {
  const ll = createLowlight(common);
  ll.register("nginx", nginx);
  ll.register("dockerfile", dockerfile);
  ll.register("protobuf", protobuf);
  return ll;
})();

import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { DOMSerializer, Slice } from "@tiptap/pm/model";
import { Plugin, PluginKey, Selection, TextSelection } from "@tiptap/pm/state";
import {
  clearPointerWikilinkDrag,
  clearWikilinkDragActive,
  getPointerWikilink,
  isWikilinkDragActive,
  WIKILINK_MIME,
} from "../../lib/drag";
import Strike from "@tiptap/extension-strike";
import { InlineDecorations } from "./InlineDecorations";
import { PromoteHighlightPlugin } from "./PromoteHighlightPlugin";
import { FindHighlightPlugin } from "./FindHighlightPlugin";
import { ImageResizePlugin } from "./ImageResizePlugin";
import { ImageMagnifyPlugin } from "./ImageMagnifyPlugin";
import Underline from "@tiptap/extension-underline";
import { ImageService, rootPathFromEntity } from "../../services/ImageService";
import { showToast } from "../Toast";
import { IMAGE_MIME_TYPES } from "../../types/images";
import { runtime } from "../../lib/runtime";
import { htmlFromMarkdown } from "./markdownToHtml";
import { markdownFromHtml } from "./htmlToMarkdown";

/** Read a File as base64, stripping the data URL prefix. */
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      if (base64) resolve(base64);
      else reject(new Error("Failed to extract base64 from data URL"));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

interface ProseEditorProps {
  content: string;
  placeholder?: string | undefined;
  autofocus?: boolean | undefined;
  entityPath?: string | undefined;
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
  onSelectionChange?: ((hasSelection: boolean) => void) | undefined;
  onEditorBlur?: ((event: FocusEvent) => void) | undefined;
  onEditorFocus?: (() => void) | undefined;
  onDoubleBracket?:
    | ((pos: { top: number; left: number }, cursorPos: number) => void)
    | undefined;
  onWikilinkClick?: ((type: string, target: string) => void) | undefined;
  onTopicClick?: ((ref: string) => void) | undefined;
  /** When true, suppress scroll-to-selection (for embedded/journal editors). */
  embedded?: boolean | undefined;
}

/**
 * Prose mode editor using TipTap (T5.3).
 * Renders content as formatted markdown with headings, paragraphs, and blocks.
 */
export function ProseEditor(props: ProseEditorProps) {
  let containerRef: HTMLDivElement | undefined;
  let editor: Editor | undefined;
  let skipNextUpdate = false;
  let lastUserInteraction = 0;
  let lastEntityPath: string | undefined;
  const rootPath = () =>
    props.entityPath ? rootPathFromEntity(props.entityPath) : undefined;

  onMount(() => {
    if (!containerRef) return;

    editor = new Editor({
      element: containerRef,
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
          dropcursor: { color: "var(--color-link)", width: 2 },
          codeBlock: false,
          strike: false,
        }),
        Strike.extend({ keepOnSplit: false }),
        CodeBlockWithLines.configure({
          lowlight: lowlightInstance,
          defaultLanguage: "plaintext",
        }),
        Placeholder.configure({
          placeholder: props.placeholder ?? "Start writing...",
        }),
        Link.extend({
          // Disable Link's built-in paste rules — we handle links as raw
          // markdown text and convert via linkMarkToRawText plugin.
          addPasteRules() {
            return [];
          },
          renderHTML({ HTMLAttributes }) {
            // Render without href/target to prevent browser navigation.
            // Store href as data-href; mark attributes retain the real href.
            const attrs = HTMLAttributes as Record<string, unknown>;
            return ["a", { "data-href": attrs["href"] }, 0];
          },
          parseHTML() {
            return [
              {
                tag: "a[href]",
                getAttrs: (node: string | HTMLElement) => {
                  if (typeof node === "string") return false;
                  const href = node.getAttribute("href");
                  return href ? { href } : false;
                },
              },
              {
                tag: "a[data-href]",
                getAttrs: (node: string | HTMLElement) => {
                  if (typeof node === "string") return false;
                  const href = node.getAttribute("data-href");
                  return href ? { href } : false;
                },
              },
            ];
          },
        }).configure({
          openOnClick: false,
          autolink: false,
          linkOnPaste: false,
        }),
        Image.extend({
          addAttributes() {
            return {
              ...this.parent?.(),
              width: {
                default: null,
                parseHTML: (element) => element.getAttribute("width"),
                renderHTML: (attributes) => {
                  if (!attributes["width"]) return {};
                  return {
                    width: attributes["width"],
                    style: `width: ${attributes["width"]}px`,
                  };
                },
              },
            };
          },
          // Ensure a paragraph always exists after block nodes (images,
          // code blocks, tables, etc.) so the cursor has a valid landing
          // spot. Without this, block nodes at the end of the doc leave
          // no place to click/type.
          addProseMirrorPlugins() {
            return [
              new Plugin({
                key: new PluginKey("trailingParagraph"),
                appendTransaction(_transactions, _oldState, newState) {
                  if (!_transactions.some((t) => t.docChanged)) return null;
                  const { doc, schema, tr } = newState;
                  const paragraph = schema.nodes["paragraph"];
                  if (!paragraph) return null;
                  // Block types that trap the cursor (no text insertion point)
                  const trapping = new Set([
                    "image",
                    "codeBlock",
                    "table",
                    "horizontalRule",
                  ]);
                  let changed = false;
                  for (let i = doc.childCount - 1; i >= 0; i--) {
                    const child = doc.child(i);
                    if (!trapping.has(child.type.name)) continue;
                    const isLast = i === doc.childCount - 1;
                    const nextIsTrapping =
                      !isLast && trapping.has(doc.child(i + 1).type.name);
                    if (isLast || nextIsTrapping) {
                      let pos = 0;
                      for (let j = 0; j <= i; j++) pos += doc.child(j).nodeSize;
                      tr.insert(pos, paragraph.create());
                      changed = true;
                    }
                  }
                  return changed ? tr : null;
                },
              }),
            ];
          },
        }).configure({
          inline: false,
          allowBase64: false,
        }),
        Underline,
        TaskList,
        TaskItem.configure({ nested: true }),
        Table.configure({ resizable: true, handleWidth: 5, cellMinWidth: 80 }),
        TableRow,
        TableHeader,
        TableCell,
        InlineDecorations,
        PromoteHighlightPlugin,
        FindHighlightPlugin,
        ImageResizePlugin,
        ImageMagnifyPlugin,
      ],
      content: htmlFromMarkdown(props.content, props.entityPath, rootPath()),
      autofocus: false,
      onUpdate: ({ editor: e }) => {
        if (skipNextUpdate) {
          skipNextUpdate = false;
          return;
        }
        lastUserInteraction = Date.now();
        const md = markdownFromHtml(e.getHTML(), props.entityPath, rootPath());
        props.onUpdate(md);
      },
      editorProps: {
        // In embedded editors (e.g. journal cards inside a virtual scroller)
        // suppress scroll-to-selection to avoid jumping the parent container.
        ...(props.embedded
          ? { handleScrollToSelection: () => true as const }
          : {}),
        transformCopied: (slice) => {
          // Unresolve image src URLs in copied content so that pasted HTML
          // contains relative paths instead of asset:// or /api/assets URLs.
          const entityPath = props.entityPath;
          const root = rootPath();
          if (!entityPath || !root) return slice;
          const json = slice.content.toJSON() as
            | Record<string, unknown>[]
            | null;
          if (json && Array.isArray(json)) {
            const unresolveNodes = (nodes: Record<string, unknown>[]): void => {
              for (const n of nodes) {
                if (n["type"] === "image" && n["attrs"]) {
                  const attrs = n["attrs"] as Record<string, string>;
                  const src = attrs["src"];
                  if (typeof src === "string") {
                    attrs["src"] = ImageService.unresolveImageSrc(
                      src,
                      entityPath,
                      root
                    );
                  }
                }
                if (Array.isArray(n["content"])) {
                  unresolveNodes(n["content"] as Record<string, unknown>[]);
                }
              }
            };
            unresolveNodes(json);
            const newContent = editor!.schema.nodeFromJSON({
              type: "doc",
              content: json,
            }).content;
            return new Slice(newContent, slice.openStart, slice.openEnd);
          }
          return slice;
        },
        clipboardTextSerializer: (slice) => {
          const serializer = DOMSerializer.fromSchema(editor!.schema);
          const wrapper = document.createElement("div");
          wrapper.appendChild(serializer.serializeFragment(slice.content));
          return markdownFromHtml(
            wrapper.innerHTML,
            props.entityPath,
            rootPath()
          );
        },
        handlePaste: (_view, event) => {
          const items = event.clipboardData?.items;
          const entityPath = props.entityPath;
          const root = rootPath();
          if (!items || !entityPath) return false;

          // Intercept URL pastes to prevent nesting inside existing markdown links
          const plainText = event.clipboardData?.getData("text/plain")?.trim();
          if (plainText && /^https?:\/\/\S+$/.test(plainText)) {
            event.preventDefault();
            const { state } = _view;
            const { $from } = state.selection;
            const parentText = $from.parent.textContent;
            const offset = $from.parentOffset;
            const mdLinkRe =
              /(?<!\[!?)\[([^\]]+)\]\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g;
            let insideLink = false;
            let m;
            while ((m = mdLinkRe.exec(parentText)) !== null) {
              if (offset >= m.index && offset <= m.index + m[0].length) {
                insideLink = true;
                break;
              }
            }
            // Also detect partial markdown link: cursor right after [text](
            if (
              !insideLink &&
              /\[([^\]]+)\]\($/.test(parentText.slice(0, offset))
            ) {
              insideLink = true;
            }
            const toInsert = insideLink
              ? plainText
              : `[${plainText}](${plainText})`;
            editor!.commands.insertContent(toInsert);
            return true;
          }

          for (const item of Array.from(items)) {
            if (IMAGE_MIME_TYPES.has(item.type)) {
              event.preventDefault();
              const file = item.getAsFile();
              if (!file) return true;

              void readFileAsBase64(file)
                .then((base64) =>
                  ImageService.ingestFromClipboard(
                    entityPath,
                    base64,
                    item.type
                  )
                )
                .then((md) => {
                  if (!md || !editor) return;
                  const resolved = resolveImageMarkdownSrc(
                    md,
                    entityPath,
                    root
                  );
                  insertImageInEditor(editor, resolved);
                })
                .catch(() => {
                  showToast("Failed to paste image", "error");
                });
              return true;
            }
          }
          return false;
        },
        handleClick: (view, pos, event) => {
          const $pos = view.state.doc.resolve(pos);
          const nodeText = $pos.parent.textContent;
          const clickOffset = pos - $pos.start();

          // Cmd/Ctrl+click to open links (raw markdown links)
          if (event.metaKey || event.ctrlKey) {
            const mdLinkRegex =
              /(?<!\[!?)\[([^\]]+)\]\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g;
            let mlMatch;
            while ((mlMatch = mdLinkRegex.exec(nodeText)) !== null) {
              if (
                clickOffset >= mlMatch.index &&
                clickOffset <= mlMatch.index + mlMatch[0].length
              ) {
                event.preventDefault();
                const href = mlMatch[2]!;
                runtime.openUrl(href);
                return true;
              }
            }
          }

          // Check for TODO marker click (Unicode chars ☐◣⌛▷☑)
          const todoMatch = /^([\u2610\u25a3\u22A1\u229F\u2611])\s/.exec(
            nodeText
          );
          if (todoMatch && clickOffset <= 1) {
            event.preventDefault();
            const markerChar = todoMatch[1]!;
            // Cycle: TODO→DOING→DONE→TODO. WAITING/LATER click→DONE.
            const nextChar =
              markerChar === "\u2610"
                ? "\u25a3"
                : markerChar === "\u25a3"
                  ? "\u2611"
                  : markerChar === "\u22A1" || markerChar === "\u229F"
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

          // Check for wikilink click [[type:target]] — only navigate on Cmd/Ctrl+click
          if (event.metaKey || event.ctrlKey) {
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
            const topicRegex = /(?<!\w)([#@][a-z0-9][a-z0-9-]+)/gi;
            let topicMatch;
            while ((topicMatch = topicRegex.exec(nodeText)) !== null) {
              if (
                clickOffset >= topicMatch.index &&
                clickOffset <= topicMatch.index + topicMatch[0].length
              ) {
                event.preventDefault();
                props.onTopicClick?.(topicMatch[1]!.toLowerCase());
                return true;
              }
            }
          }

          return false;
        },
        handleDrop: (view, event, _slice, moved) => {
          if (moved) return false;

          // Handle wikilink drops.
          // In Tauri the pointer path delivers wikilinks via pointerup, not
          // the HTML5 drop event. In web mode, try getData with MIME fallbacks.
          const pointerWikilink = getPointerWikilink();
          clearPointerWikilinkDrag();
          const wikilink =
            event.dataTransfer?.getData(WIKILINK_MIME) ||
            (isWikilinkDragActive()
              ? event.dataTransfer?.getData("text/plain")
              : "") ||
            pointerWikilink ||
            "";
          if (wikilink) {
            event.preventDefault();
            const coords = view.posAtCoords({
              left: event.clientX,
              top: event.clientY,
            });
            if (!coords) return false;
            const insertPos = coords.pos;
            const tr = view.state.tr.insertText(wikilink + " ", insertPos);
            const cursorPos = insertPos + wikilink.length + 1;
            tr.setSelection(TextSelection.create(tr.doc, cursorPos));
            view.dispatch(tr);
            setTimeout(() => view.focus(), 0);
            return true;
          }

          // Handle image file drops
          const files = event.dataTransfer?.files;
          const entityPath = props.entityPath;
          const root = rootPath();
          if (!files || files.length === 0 || !entityPath) return false;

          for (const file of Array.from(files)) {
            if (!IMAGE_MIME_TYPES.has(file.type)) continue;

            event.preventDefault();
            const dropCoords = view.posAtCoords({
              left: event.clientX,
              top: event.clientY,
            });

            void readFileAsBase64(file)
              .then((base64) =>
                ImageService.ingestFromDrop(
                  entityPath,
                  file.name,
                  base64,
                  file.type
                )
              )
              .then((md) => {
                if (!md || !editor) return;
                const resolved = resolveImageMarkdownSrc(md, entityPath, root);
                insertImageInEditor(editor, resolved, dropCoords?.pos);
              })
              .catch(() => {
                showToast("Failed to insert dropped image", "error");
              });
            return true;
          }

          return false;
        },
        handleKeyDown: (view, event) => {
          // Tab/Shift+Tab in tables: navigate cells
          if (event.key === "Tab" && editor?.isActive("table")) {
            event.preventDefault();
            if (event.shiftKey) {
              editor.chain().focus().goToPreviousCell().run();
            } else {
              editor.chain().focus().goToNextCell().run();
            }
            return true;
          }

          // Ctrl/Cmd+Shift+Enter: escape table by inserting paragraph after it
          if (
            event.key === "Enter" &&
            event.shiftKey &&
            (event.ctrlKey || event.metaKey) &&
            editor?.isActive("table")
          ) {
            event.preventDefault();
            const { state } = view;
            const { $from } = state.selection;
            // Walk up to find the table node
            for (let d = $from.depth; d > 0; d--) {
              if ($from.node(d).type.name === "table") {
                const insertPos = $from.after(d);
                const paragraph = state.schema.nodes["paragraph"]!.create();
                const tr = state.tr.insert(insertPos, paragraph);
                tr.setSelection(TextSelection.create(tr.doc, insertPos + 1));
                view.dispatch(tr);
                return true;
              }
            }
            return false;
          }

          // Tab/Shift+Tab inside code blocks: insert/remove indentation
          if (event.key === "Tab" && editor?.isActive("codeBlock")) {
            event.preventDefault();
            event.stopPropagation();
            const { state } = editor;
            const { from, to } = state.selection;
            const $from = state.doc.resolve(from);
            const blockStart = from - $from.parentOffset;
            const fullText = $from.parent.textContent;

            if (from !== to) {
              // Multi-line: indent/unindent all lines in selection
              const selStart = $from.parentOffset;
              const selEnd = selStart + (to - from);
              // Find all line start offsets within the selection
              const lineStarts: number[] = [];
              // Include line containing selection start
              const firstLine = fullText.lastIndexOf("\n", selStart - 1) + 1;
              lineStarts.push(firstLine);
              for (let i = firstLine; i < selEnd; i++) {
                if (fullText[i] === "\n" && i + 1 <= selEnd) {
                  lineStarts.push(i + 1);
                }
              }
              // Process in reverse to preserve positions
              let tr = state.tr;
              for (let i = lineStarts.length - 1; i >= 0; i--) {
                const ls = lineStarts[i]!;
                const docLs = blockStart + ls;
                if (event.shiftKey) {
                  if (fullText.slice(ls).startsWith("  ")) {
                    tr = tr.delete(docLs, docLs + 2);
                  }
                } else {
                  tr = tr.insertText("  ", docLs);
                }
              }
              editor.view.dispatch(tr);
            } else {
              // Single cursor: original behavior
              if (event.shiftKey) {
                const offset = $from.parentOffset;
                const lineStart = fullText.lastIndexOf("\n", offset - 1) + 1;
                if (fullText.slice(lineStart).startsWith("  ")) {
                  const docLineStart = blockStart + lineStart;
                  editor.view.dispatch(
                    state.tr.delete(docLineStart, docLineStart + 2)
                  );
                }
              } else {
                editor.view.dispatch(state.tr.insertText("  ", from));
              }
            }
            return true;
          }

          // Tab to indent list items, or wrap paragraph in bullet list
          if (event.key === "Tab" && !event.shiftKey) {
            event.preventDefault();
            if (editor?.can().sinkListItem("listItem")) {
              editor.chain().focus().sinkListItem("listItem").run();
            } else if (!editor?.isActive("listItem")) {
              editor?.chain().focus().toggleBulletList().run();
            }
            return true;
          }

          // Shift+Tab to outdent / unwrap list items
          if (event.key === "Tab" && event.shiftKey) {
            event.preventDefault();
            editor?.chain().focus().liftListItem("listItem").run();
            return true;
          }

          // Alt+Up to move block up
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

          // Alt+Down to move block down
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

          // Shift+Enter inserts line break within block
          if (event.key === "Enter" && event.shiftKey) {
            event.preventDefault();
            editor?.chain().focus().setHardBreak().run();
            return true;
          }

          // # or @ triggers topic autocomplete (T6.10)
          if ((event.key === "#" || event.key === "@") && props.onHashOrAt) {
            const { view } = editor!;
            const prefix = event.key as "#" | "@";

            // For #, don't trigger autocomplete at start of text block
            // where it's heading syntax (e.g. #, ##, ###)
            if (prefix === "#") {
              const { $from } = view.state.selection;
              const textBefore = $from.parent.textBetween(
                0,
                $from.parentOffset,
                ""
              );
              if (/^#+$/.test(textBefore)) {
                return false;
              }
            }

            const coords = view.coordsAtPos(view.state.selection.from);
            setTimeout(() => {
              props.onHashOrAt!(
                prefix,
                { top: coords.top, left: coords.left },
                view.state.selection.from
              );
            }, 0);
          }

          // [[ triggers wikilink autocomplete
          if (event.key === "[" && props.onDoubleBracket) {
            const { view } = editor!;
            const { $from } = view.state.selection;
            const textBefore = $from.parent.textBetween(
              0,
              $from.parentOffset,
              ""
            );
            if (textBefore.endsWith("[")) {
              const coords = view.coordsAtPos(view.state.selection.from);
              setTimeout(() => {
                props.onDoubleBracket!(
                  { top: coords.top, left: coords.left },
                  view.state.selection.from
                );
              }, 0);
            }
          }

          if (event.key === "/" && props.onSlashKey) {
            const { view } = editor!;
            const cursorPos = view.state.selection.from;
            // Only trigger command menu if / is at start of line or after whitespace
            const $pos = view.state.doc.resolve(cursorPos);
            const textBefore = $pos.parent.textBetween(
              0,
              $pos.parentOffset,
              ""
            );
            if (textBefore.length === 0 || /\s$/.test(textBefore)) {
              const coords = view.coordsAtPos(cursorPos);
              // Defer so the / character is inserted first
              setTimeout(() => {
                props.onSlashKey!(
                  { top: coords.top, left: coords.left },
                  cursorPos
                );
              }, 0);
            }
          }
          return false;
        },
      },
    });

    // Prevent native <a> click navigation — links are opened via Cmd/Ctrl+click.
    // Use capture phase to intercept before ProseMirror or browser default handling.
    // Also handle clicks on resolved link widgets to place cursor at the raw text.
    function handleLinkClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      const anchor = target.tagName === "A" ? target : target.closest("a");
      if (anchor && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
      }

      // Click on resolved markdown link widget → place cursor at raw text position
      const resolved = target.closest(
        ".md-link-resolved"
      ) as HTMLElement | null;
      if (resolved && editor && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
        const posStr = resolved.getAttribute("data-link-pos");
        if (posStr) {
          const pos = parseInt(posStr, 10);
          // Place cursor inside the link text (after the opening "[")
          const safePos = Math.min(pos + 1, editor.state.doc.content.size);
          editor
            .chain()
            .focus()
            .command(({ tr }) => {
              tr.setSelection(TextSelection.create(tr.doc, safePos));
              return true;
            })
            .run();
        }
        return;
      }

      // Ctrl+click on resolved link widget → open URL
      if (resolved && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        e.stopPropagation();
        const href = resolved.getAttribute("data-link-href");
        if (href) {
          runtime.openUrl(href);
        }
        return;
      }
    }
    containerRef.addEventListener("click", handleLinkClick, true);

    // Visual feedback for wikilink drag-and-drop
    function handleDragOver(e: DragEvent) {
      const dt = e.dataTransfer;
      if (!dt) return;
      const hasWikilink =
        isWikilinkDragActive() ||
        dt.types.includes(WIKILINK_MIME) ||
        (dt.types.includes("text/plain") && dt.effectAllowed === "copy");
      if (hasWikilink) {
        e.preventDefault();
        dt.dropEffect = "copy";
        containerRef!.classList.add("wikilink-drop-target");
      }
    }
    function handleDragEnd() {
      clearWikilinkDragActive();
      containerRef!.classList.remove("wikilink-drop-target");
    }
    containerRef.addEventListener("dragover", handleDragOver);
    containerRef.addEventListener("dragleave", handleDragEnd);
    containerRef.addEventListener("drop", handleDragEnd);

    // Pointer-events path for Tauri: HTML5 DnD is cancelled in dragstart so
    // pointer events remain fully active. makePointerDragHandler sets
    // _pointerWikilink on pointerdown; mouseenter shows the highlight;
    // pointerup delivers the wikilink at the drop position.
    function handleMouseEnter() {
      if (getPointerWikilink() !== null) {
        containerRef!.classList.add("wikilink-drop-target");
      }
    }
    function handleMouseLeave() {
      if (getPointerWikilink() !== null) {
        containerRef!.classList.remove("wikilink-drop-target");
      }
    }
    function handlePointerUp(e: PointerEvent) {
      const wikilink = getPointerWikilink();
      if (!wikilink || !editor || editor.isDestroyed) return;
      e.preventDefault();
      clearPointerWikilinkDrag();
      const coords = editor.view.posAtCoords({
        left: e.clientX,
        top: e.clientY,
      });
      if (!coords) return;
      const insertPos = coords.pos;
      const tr = editor.view.state.tr.insertText(wikilink + " ", insertPos);
      const cursorPos = insertPos + wikilink.length + 1;
      tr.setSelection(TextSelection.create(tr.doc, cursorPos));
      editor.view.dispatch(tr);
      containerRef!.classList.remove("wikilink-drop-target");
      setTimeout(() => editor?.view.focus(), 0);
    }
    containerRef.addEventListener("mouseenter", handleMouseEnter);
    containerRef.addEventListener("mouseleave", handleMouseLeave);
    containerRef.addEventListener("pointerup", handlePointerUp);

    // Fix: when clicking into an unfocused editor whose selection was reset
    // (e.g. by setContent), ProseMirror sometimes fails to resolve the click
    // position. We capture mousedown coords and, after ProseMirror finishes
    // processing the click, correct the selection if it wasn't updated.
    let clickCoords: { x: number; y: number } | null = null;
    let selBeforeClick = -1;
    function handleMouseDown(e: MouseEvent) {
      lastUserInteraction = Date.now();
      if (!editor?.isFocused) {
        clickCoords = { x: e.clientX, y: e.clientY };
        selBeforeClick = editor?.state.selection.from ?? -1;
      }
    }
    function correctClickSelection(
      coords: { x: number; y: number },
      selBefore: number
    ) {
      if (!editor || editor.isDestroyed) return;
      const sel = editor.state.selection;
      // If ProseMirror already updated the selection (including to a GapCursor),
      // don't override it.
      if (sel.from !== selBefore) return;
      const pos = editor.view.posAtCoords({ left: coords.x, top: coords.y });
      if (pos && pos.pos !== sel.from) {
        // Use Selection.near so it can resolve to a GapCursor when next to
        // a block node (e.g. image) rather than forcing a TextSelection.
        const $pos = editor.state.doc.resolve(pos.pos);
        const newSel = Selection.near($pos);
        const tr = editor.state.tr.setSelection(newSel);
        editor.view.dispatch(tr);
      }
    }
    function handleMouseUp() {
      const coords = clickCoords;
      const selBefore = selBeforeClick;
      clickCoords = null;
      selBeforeClick = -1;
      if (!coords || !editor || editor.isDestroyed) return;
      // Try synchronously first (avoids visible flash)
      correctClickSelection(coords, selBefore);
      // Fallback: ProseMirror may process asynchronously
      setTimeout(() => correctClickSelection(coords, selBefore), 0);
    }
    containerRef.addEventListener("mousedown", handleMouseDown, true);
    document.addEventListener("mouseup", handleMouseUp);

    // Show pointer cursor on Cmd/Ctrl hold over clickable elements
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Control" || e.key === "Meta") {
        containerRef!.classList.add("ctrl-held");
      }
    }
    function handleKeyUp(e: KeyboardEvent) {
      if (e.key === "Control" || e.key === "Meta") {
        containerRef!.classList.remove("ctrl-held");
      }
    }
    function handleBlurWindow() {
      containerRef!.classList.remove("ctrl-held");
    }
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlurWindow);

    // Tauri native drag-drop: the webview intercepts OS file drops so
    // dataTransfer.files is empty in the DOM drop handler. Listen for
    // Tauri's own drag-drop event which provides file paths directly.
    // The event is global, so we hit-test against this editor's container
    // to only handle drops that land within this specific editor instance.
    let tauriUnlisten: (() => void) | null = null;
    if (runtime.isNative() && props.entityPath) {
      import("@tauri-apps/api/event").then(({ listen }) => {
        listen<{ paths: string[]; position: { x: number; y: number } }>(
          "tauri://drag-drop",
          (event) => {
            // Read current props/state inside the callback to avoid stale captures
            const currentEntityPath = props.entityPath;
            const currentRoot = rootPath();
            if (
              !editor ||
              editor.isDestroyed ||
              !containerRef ||
              !currentEntityPath
            )
              return;
            const { paths, position } = event.payload;

            // Hit-test: only handle if the drop landed within this editor
            const rect = containerRef.getBoundingClientRect();
            if (
              position.x < rect.left ||
              position.x > rect.right ||
              position.y < rect.top ||
              position.y > rect.bottom
            )
              return;

            for (const filePath of paths) {
              const ext = filePath
                .substring(filePath.lastIndexOf(".") + 1)
                .toLowerCase();
              if (!["png", "jpg", "jpeg", "gif", "webp"].includes(ext))
                continue;

              const dropCoords = editor.view.posAtCoords({
                left: position.x,
                top: position.y,
              });

              void ImageService.ingestFromFilePath(currentEntityPath, filePath)
                .then((md) => {
                  if (!md || !editor || editor.isDestroyed) return;
                  const resolved = resolveImageMarkdownSrc(
                    md,
                    currentEntityPath,
                    currentRoot
                  );
                  insertImageInEditor(editor, resolved, dropCoords?.pos);
                })
                .catch(() => {
                  showToast("Failed to insert dropped image", "error");
                });
            }
          }
        ).then((unlisten) => {
          tauriUnlisten = unlisten;
        });
      });
    }

    onCleanup(() => {
      tauriUnlisten?.();
      containerRef!.removeEventListener("click", handleLinkClick, true);
      containerRef!.removeEventListener("mousedown", handleMouseDown, true);
      document.removeEventListener("mouseup", handleMouseUp);
      containerRef!.removeEventListener("dragover", handleDragOver);
      containerRef!.removeEventListener("dragleave", handleDragEnd);
      containerRef!.removeEventListener("drop", handleDragEnd);
      containerRef!.removeEventListener("mouseenter", handleMouseEnter);
      containerRef!.removeEventListener("mouseleave", handleMouseLeave);
      containerRef!.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlurWindow);
    });

    // Surface editor events to parent without exposing TipTap internals.
    // Capture callbacks at registration time to avoid SolidJS reactivity warnings.
    const onSelectionChange = props.onSelectionChange;
    if (onSelectionChange) {
      editor.on("selectionUpdate", ({ editor: ed }) => {
        const { from, to } = ed.state.selection;
        onSelectionChange(from !== to);
      });
    }
    const onEditorBlur = props.onEditorBlur;
    if (onEditorBlur) {
      editor.on("blur", ({ event }) => {
        onEditorBlur(event as FocusEvent);
      });
    }
    const onEditorFocus = props.onEditorFocus;
    editor.on("focus", () => {
      lastUserInteraction = Date.now();
      onEditorFocus?.();
    });

    props.ref?.(editor);
    lastEntityPath = props.entityPath;
  });

  // Reactively focus when autofocus becomes true (may happen after mount)
  createEffect(() => {
    if (props.autofocus && editor && !editor.isDestroyed) {
      setTimeout(() => {
        editor!.commands.focus("end");
        editor!.view.dispatch(editor!.state.tr.scrollIntoView());
      }, 0);
    }
  });

  createEffect(() => {
    const newContent = props.content;
    const entityPath = props.entityPath;
    if (!editor || editor.isDestroyed) return;
    // Always update when entity changes; only guard against external
    // updates (e.g. file watcher) for the same entity.
    if (entityPath === lastEntityPath) {
      if (Date.now() - lastUserInteraction < 500) return;
      if (editor.isFocused) return;
    }
    lastEntityPath = entityPath;
    const currentMd = markdownFromHtml(
      editor.getHTML(),
      entityPath,
      rootPath()
    );
    if (currentMd !== newContent) {
      skipNextUpdate = true;
      editor.commands.setContent(
        htmlFromMarkdown(newContent, entityPath, rootPath())
      );
    }
  });

  onCleanup(() => {
    editor?.destroy();
  });

  return (
    <div ref={containerRef} class="prose-editor focus-within:outline-none" />
  );
}

/** Parse a markdown image string and resolve the src URL for display. */
function resolveImageMarkdownSrc(
  md: string,
  entityPath?: string,
  rootPath?: string
): { src: string; alt: string } {
  const match = /!\[([^\]]*)\]\(([^)]+)\)/.exec(md);
  if (!match) return { src: "", alt: "" };
  const alt = match[1] ?? "";
  const rawSrc = match[2] ?? "";
  const src =
    entityPath && rootPath
      ? ImageService.resolveImageUrl(rawSrc, entityPath, rootPath)
      : rawSrc;
  return { src, alt };
}

/** Insert an image into the editor, optionally at a specific drop position. */
function insertImageInEditor(
  ed: Editor,
  resolved: { src: string; alt: string },
  dropPos?: number
) {
  const chain = ed.chain().focus();
  if (dropPos !== undefined) {
    chain.command(({ tr }) => {
      tr.setSelection(TextSelection.create(tr.doc, dropPos));
      return true;
    });
  }
  chain
    .setImage({ src: resolved.src, alt: resolved.alt })
    .createParagraphNear()
    .run();
}

// List item movement helpers (ported from OutlinerEditor)

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
  const sibling = item.parent.child(targetIndex);

  if (direction === "up") {
    let siblingPos = item.pos;
    for (let i = item.index - 1; i >= targetIndex; i--) {
      siblingPos -= item.parent.child(i).nodeSize;
    }

    const itemStart = item.pos;
    const itemEnd = itemStart + item.node.nodeSize;
    const slice = state.doc.slice(itemStart, itemEnd);
    tr.delete(itemStart, itemEnd);
    const mappedSiblingPos = tr.mapping.map(siblingPos);
    tr.insert(mappedSiblingPos, slice.content);

    try {
      const $pos = tr.doc.resolve(mappedSiblingPos + 2);
      tr.setSelection(TextSelection.near($pos));
    } catch {
      // fallback: don't move cursor
    }
  } else {
    const siblingPos = item.pos + item.node.nodeSize;
    const siblingEnd = siblingPos + sibling.nodeSize;
    const slice = state.doc.slice(siblingPos, siblingEnd);
    tr.delete(siblingPos, siblingEnd);
    const mappedItemPos = tr.mapping.map(item.pos);
    tr.insert(mappedItemPos, slice.content);

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
