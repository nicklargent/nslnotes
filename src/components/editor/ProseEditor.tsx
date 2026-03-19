import { onMount, onCleanup, createEffect } from "solid-js";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { DOMSerializer } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { WIKILINK_MIME } from "../../lib/drag";
import { InlineDecorations } from "./InlineDecorations";
import { PromoteHighlightPlugin } from "./PromoteHighlightPlugin";
import { ImageResizePlugin } from "./ImageResizePlugin";
import { ImageMagnifyPlugin } from "./ImageMagnifyPlugin";
import { ImageService, rootPathFromEntity } from "../../services/ImageService";
import { showToast } from "../Toast";
import { IMAGE_MIME_TYPES } from "../../types/images";

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
  onWikilinkClick?: ((type: string, target: string) => void) | undefined;
  onTopicClick?: ((ref: string) => void) | undefined;
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
  const rootPath = () =>
    props.entityPath ? rootPathFromEntity(props.entityPath) : undefined;

  onMount(() => {
    if (!containerRef) return;

    editor = new Editor({
      element: containerRef,
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
        }),
        Placeholder.configure({
          placeholder: props.placeholder ?? "Start writing...",
        }),
        Link.extend({
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
          autolink: true,
          linkOnPaste: true,
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
        }).configure({
          inline: false,
          allowBase64: false,
        }),
        InlineDecorations,
        PromoteHighlightPlugin,
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
          if (!items || !props.entityPath) return false;

          for (const item of Array.from(items)) {
            if (IMAGE_MIME_TYPES.has(item.type)) {
              event.preventDefault();
              const file = item.getAsFile();
              if (!file) return true;

              void readFileAsBase64(file)
                .then((base64) =>
                  ImageService.ingestFromClipboard(
                    props.entityPath!,
                    base64,
                    item.type
                  )
                )
                .then((md) => {
                  if (!md || !editor) return;
                  const resolved = resolveImageMarkdownSrc(
                    md,
                    props.entityPath,
                    rootPath()
                  );
                  editor
                    .chain()
                    .focus()
                    .setImage({ src: resolved.src, alt: resolved.alt })
                    .run();
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

          // Cmd/Ctrl+click to open links
          if (event.metaKey || event.ctrlKey) {
            const marks = $pos.marks();
            const linkMark = marks.find((m) => m.type.name === "link");
            if (linkMark) {
              const href = linkMark.attrs["href"] as string | undefined;
              if (href) {
                event.preventDefault();
                window.open(href, "_blank");
                return true;
              }
            }
          }

          // Check for TODO marker click (Unicode chars ☐✎☑)
          const todoMatch = /^([\u2610\u25a3\u2611])\s/.exec(nodeText);
          if (todoMatch && clickOffset <= 1) {
            event.preventDefault();
            const markerChar = todoMatch[1]!;
            const nextChar =
              markerChar === "\u2610"
                ? "\u25a3"
                : markerChar === "\u25a3"
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
          }

          return false;
        },
        handleDrop: (view, event, _slice, moved) => {
          if (moved) return false;

          // Handle wikilink drops
          const wikilink = event.dataTransfer?.getData(WIKILINK_MIME);
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
          if (!files || files.length === 0 || !props.entityPath) return false;

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
                  props.entityPath!,
                  file.name,
                  base64,
                  file.type
                )
              )
              .then((md) => {
                if (!md || !editor) return;
                const resolved = resolveImageMarkdownSrc(
                  md,
                  props.entityPath,
                  rootPath()
                );
                if (dropCoords) {
                  const pos = dropCoords.pos;
                  editor
                    .chain()
                    .focus()
                    .command(({ tr }) => {
                      tr.setSelection(TextSelection.create(tr.doc, pos));
                      return true;
                    })
                    .setImage({ src: resolved.src, alt: resolved.alt })
                    .run();
                } else {
                  editor
                    .chain()
                    .focus()
                    .setImage({ src: resolved.src, alt: resolved.alt })
                    .run();
                }
              })
              .catch(() => {
                showToast("Failed to insert dropped image", "error");
              });
            return true;
          }

          return false;
        },
        handleKeyDown: (view, event) => {
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
    function handleLinkClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      const anchor = target.tagName === "A" ? target : target.closest("a");
      if (anchor && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
      }
    }
    containerRef.addEventListener("click", handleLinkClick, true);

    // Visual feedback for wikilink drag-and-drop
    function handleDragOver(e: DragEvent) {
      if (e.dataTransfer?.types.includes(WIKILINK_MIME)) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        containerRef!.classList.add("wikilink-drop-target");
      }
    }
    function handleDragEnd() {
      containerRef!.classList.remove("wikilink-drop-target");
    }
    containerRef.addEventListener("dragover", handleDragOver);
    containerRef.addEventListener("dragleave", handleDragEnd);
    containerRef.addEventListener("drop", handleDragEnd);

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
      const { from } = editor.state.selection;
      if (from !== selBefore) return; // ProseMirror handled it
      const pos = editor.view.posAtCoords({ left: coords.x, top: coords.y });
      if (pos && pos.pos !== from) {
        const tr = editor.state.tr.setSelection(
          TextSelection.create(editor.state.doc, pos.pos)
        );
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

    onCleanup(() => {
      containerRef!.removeEventListener("click", handleLinkClick, true);
      containerRef!.removeEventListener("mousedown", handleMouseDown, true);
      document.removeEventListener("mouseup", handleMouseUp);
      containerRef!.removeEventListener("dragover", handleDragOver);
      containerRef!.removeEventListener("dragleave", handleDragEnd);
      containerRef!.removeEventListener("drop", handleDragEnd);
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
  });

  // Reactively focus when autofocus becomes true (may happen after mount)
  createEffect(() => {
    if (props.autofocus && editor && !editor.isDestroyed) {
      setTimeout(() => editor!.commands.focus("end"), 0);
    }
  });

  createEffect(() => {
    const newContent = props.content;
    if (!editor || editor.isDestroyed) return;
    if (Date.now() - lastUserInteraction < 500) return;
    if (editor.isFocused) return;
    const currentMd = markdownFromHtml(
      editor.getHTML(),
      props.entityPath,
      rootPath()
    );
    if (currentMd !== newContent) {
      skipNextUpdate = true;
      editor.commands.setContent(
        htmlFromMarkdown(newContent, props.entityPath, rootPath())
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

/**
 * Simple markdown to HTML conversion for TipTap content.
 */
function htmlFromMarkdown(
  md: string,
  entityPath?: string,
  rootPath?: string
): string {
  if (!md.trim()) return "<p></p>";

  let html = md
    // Headers
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    // Bold and italic
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Images — must run BEFORE links to avoid ![...]() being consumed as [...]()
    .replace(
      /!\[([^\]]*)\]\(([^)]+)\)(?:\{width=(\d+)\})?/g,
      (_match, alt: string, src: string, width: string) => {
        const resolvedSrc =
          entityPath && rootPath
            ? ImageService.resolveImageUrl(src, entityPath, rootPath)
            : src;
        const widthAttr = width ? ` width="${width}"` : "";
        return `<img src="${resolvedSrc}" alt="${alt}"${widthAttr}>`;
      }
    )
    // Markdown links [text](url) — must run before wikilinks and topic refs
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    // Wikilinks
    .replace(/\[\[(task|doc|note):([^\]]+)\]\]/g, "[[$1:$2]]")
    // Topic/person refs
    .replace(/(?<!\w)([#@][a-z0-9-]+)/gi, "$1")
    // Inline code
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    // Code blocks
    .replace(/```[\s\S]*?```/g, (match) => {
      const content = match.slice(3, -3).replace(/^\w*\n/, "");
      return `<pre><code>${escapeHtml(content.trim())}</code></pre>`;
    });

  // TODO/DOING/DONE markers (in list items and plain paragraphs)
  html = html
    .replace(
      /^(\s*[-*] )TODO /gm,
      '$1<span class="todo-marker todo-open" data-todo="TODO">&#9744;</span> '
    )
    .replace(
      /^(\s*[-*] )DOING /gm,
      '$1<span class="todo-marker todo-doing" data-todo="DOING">&#9635;</span> '
    )
    .replace(
      /^(\s*[-*] )DONE /gm,
      '$1<span class="todo-marker todo-done" data-todo="DONE">&#9745;</span> <s>'
    )
    .replace(
      /^(\s*[-*] <span class="todo-marker todo-done"[^>]*>&#9745;<\/span> <s>)(.+)$/gm,
      "$1$2</s>"
    )
    // Top-level TODO/DOING/DONE (not in list items)
    .replace(
      /^TODO /gm,
      '<span class="todo-marker todo-open" data-todo="TODO">&#9744;</span> '
    )
    .replace(
      /^DOING /gm,
      '<span class="todo-marker todo-doing" data-todo="DOING">&#9635;</span> '
    )
    .replace(
      /^DONE /gm,
      '<span class="todo-marker todo-done" data-todo="DONE">&#9745;</span> <s>'
    )
    .replace(
      /^(<span class="todo-marker todo-done"[^>]*>&#9745;<\/span> <s>)(.+)$/gm,
      "$1$2</s>"
    );

  // Process line by line for lists and paragraphs
  const lines = html.split("\n");
  const result: string[] = [];
  let currentListDepth = -1;

  function closeListsTo(depth: number) {
    while (currentListDepth > depth) {
      result.push("</li></ul>");
      currentListDepth--;
    }
    if (currentListDepth >= 0 && depth >= 0) {
      result.push("</li>");
    }
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("<img ")) {
      // Block-level image — do not wrap in <p>
      closeListsTo(-1);
      result.push(trimmed);
    } else if (trimmed.startsWith("<h") || trimmed.startsWith("<pre>")) {
      closeListsTo(-1);
      result.push(trimmed);
    } else if (/^(\s*)([-*])\s(.*)$/.test(line)) {
      const match = /^(\s*)([-*])\s(.*)$/.exec(line)!;
      const indent = match[1]?.length ?? 0;
      const content = match[3] ?? "";
      const level = Math.floor(indent / 2);

      if (level > currentListDepth) {
        const levelsToOpen = level - currentListDepth;
        for (let j = 0; j < levelsToOpen; j++) {
          result.push("<ul>");
          currentListDepth++;
        }
      } else if (level < currentListDepth) {
        closeListsTo(level);
      } else if (currentListDepth >= 0) {
        result.push("</li>");
      }
      result.push(`<li><p>${content}</p>`);
    } else if (/^\d+\. /.test(trimmed)) {
      if (currentListDepth < 0) {
        result.push("<ol>");
        currentListDepth = 0;
      } else {
        result.push("</li>");
      }
      result.push(`<li><p>${trimmed.replace(/^\d+\. /, "")}</p>`);
    } else if (trimmed === "") {
      closeListsTo(-1);
    } else {
      closeListsTo(-1);
      result.push(`<p>${trimmed}</p>`);
    }
  }
  closeListsTo(-1);

  return result.join("") || "<p></p>";
}

/**
 * Convert TipTap HTML back to markdown.
 */
const sharedParser = new DOMParser();

export function markdownFromHtml(
  html: string,
  entityPath?: string,
  rootPath?: string
): string {
  const doc = sharedParser.parseFromString(html, "text/html");

  function convert(node: Node, listDepth: number): string {
    // Handle case where node itself is a list element (called from liNestedLists)
    if (node.nodeType === Node.ELEMENT_NODE) {
      const selfTag = (node as HTMLElement).tagName.toLowerCase();
      if (selfTag === "ul" || selfTag === "ol") {
        return processList(node as HTMLElement, selfTag, listDepth);
      }
    }

    let result = "";

    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        let text = child.textContent ?? "";
        text = text
          .replace(/^\u2610\s*/, "TODO ")
          .replace(/^\u25a3\s*/, "DOING ")
          .replace(/^\u2611\s*/, "DONE ");
        result += text;
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        const tag = el.tagName.toLowerCase();

        switch (tag) {
          case "h1":
            result += `# ${el.textContent}\n`;
            break;
          case "h2":
            result += `## ${el.textContent}\n`;
            break;
          case "h3":
            result += `### ${el.textContent}\n`;
            break;
          case "p":
            result += `${convert(el, listDepth)}\n`;
            break;
          case "strong": {
            const inner = convert(el, listDepth);
            if (inner.startsWith("**") && inner.endsWith("**")) {
              result += inner;
            } else {
              result += `**${inner}**`;
            }
            break;
          }
          case "em": {
            const inner = convert(el, listDepth);
            if (
              inner.startsWith("*") &&
              inner.endsWith("*") &&
              !inner.startsWith("**")
            ) {
              result += inner;
            } else {
              result += `*${inner}*`;
            }
            break;
          }
          case "a": {
            const href =
              el.getAttribute("href") || el.getAttribute("data-href") || "";
            const text = convert(el, listDepth);
            result += `[${text}](${href})`;
            break;
          }
          case "img": {
            const src = el.getAttribute("src") ?? "";
            const alt = el.getAttribute("alt") ?? "";
            const width = el.getAttribute("width");
            const relativeSrc =
              entityPath && rootPath
                ? ImageService.unresolveImageSrc(src, entityPath, rootPath)
                : src;
            const widthSuffix = width ? `{width=${width}}` : "";
            result += `![${alt}](${relativeSrc})${widthSuffix}\n`;
            break;
          }
          case "code":
            if (el.parentElement?.tagName.toLowerCase() === "pre") {
              result += el.textContent;
            } else {
              result += `\`${el.textContent}\``;
            }
            break;
          case "pre":
            result += `\`\`\`\n${el.textContent}\n\`\`\`\n`;
            break;
          case "ul":
          case "ol":
            result += processList(el, tag, listDepth);
            break;
          case "li":
            result += convert(el, listDepth);
            break;
          case "br":
            result += "\n";
            break;
          default:
            result += convert(el, listDepth);
        }
      }
    }

    return result;
  }

  function processList(
    el: HTMLElement,
    tag: string,
    listDepth: number
  ): string {
    let result = "";
    if (tag === "ul") {
      for (const li of Array.from(el.children)) {
        const indent = "  ".repeat(listDepth);
        const liContent = liText(li, listDepth);
        const nested = liNested(li, listDepth + 1);
        result += `${indent}- ${liContent.trim()}\n${nested}`;
      }
    } else {
      Array.from(el.children).forEach((li, i) => {
        const indent = "  ".repeat(listDepth);
        const liContent = liText(li, listDepth);
        const nested = liNested(li, listDepth + 1);
        result += `${indent}${i + 1}. ${liContent.trim()}\n${nested}`;
      });
    }
    return result;
  }

  function liText(li: Element, listDepth: number): string {
    let result = "";
    for (const child of Array.from(li.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const tag = (child as HTMLElement).tagName.toLowerCase();
        if (tag === "ul" || tag === "ol") continue;
      }
      result += convert(child as Node, listDepth);
    }
    return result;
  }

  function liNested(li: Element, listDepth: number): string {
    let result = "";
    for (const child of Array.from(li.children)) {
      const tag = child.tagName.toLowerCase();
      if (tag === "ul" || tag === "ol") {
        result += convert(child, listDepth);
      }
    }
    return result;
  }

  return convert(doc.body, 0).trim();
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
