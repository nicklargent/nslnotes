import { onMount, onCleanup, createEffect } from "solid-js";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";

interface ProseEditorProps {
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
 * Prose mode editor using TipTap (T5.3).
 * Renders content as formatted markdown with headings, paragraphs, and blocks.
 */
export function ProseEditor(props: ProseEditorProps) {
  let containerRef: HTMLDivElement | undefined;
  let editor: Editor | undefined;
  let skipNextUpdate = false;

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
      ],
      content: htmlFromMarkdown(props.content),
      onUpdate: ({ editor: e }) => {
        if (skipNextUpdate) {
          skipNextUpdate = false;
          return;
        }
        const md = markdownFromHtml(e.getHTML());
        props.onUpdate(md);
      },
      editorProps: {
        handleKeyDown: (_view, event) => {
          // # or @ triggers topic autocomplete (T6.10)
          if ((event.key === "#" || event.key === "@") && props.onHashOrAt) {
            const { view } = editor!;
            const coords = view.coordsAtPos(view.state.selection.from);
            const prefix = event.key as "#" | "@";
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
            const coords = view.coordsAtPos(view.state.selection.from);
            props.onSlashKey({ top: coords.top, left: coords.left });
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
    const currentMd = markdownFromHtml(editor.getHTML());
    if (currentMd !== newContent) {
      skipNextUpdate = true;
      editor.commands.setContent(htmlFromMarkdown(newContent));
    }
  });

  onCleanup(() => {
    editor?.destroy();
  });

  function handleEditorClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.classList.contains("wikilink")) {
      e.preventDefault();
      const linkType = target.dataset["linkType"];
      const linkTarget = target.dataset["linkTarget"];
      if (linkType && linkTarget) {
        props.onWikilinkClick?.(linkType, linkTarget);
      }
    }
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
      class="prose-editor prose prose-sm max-w-none focus-within:outline-none"
      onClick={handleEditorClick}
    />
  );
}

/**
 * Simple markdown to HTML conversion for TipTap content.
 */
function htmlFromMarkdown(md: string): string {
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
    // Wikilinks
    .replace(
      /\[\[(task|doc|note):([^\]]+)\]\]/g,
      '<span class="wikilink" data-link-type="$1" data-link-target="$2" contenteditable="false">[[$1:$2]]</span>'
    )
    // Topic/person refs
    .replace(
      /(?<!\w)([#@][a-z0-9-]+)/gi,
      '<span class="topic-ref" data-topic="$1">$1</span>'
    )
    // Inline code
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    // Code blocks
    .replace(/```[\s\S]*?```/g, (match) => {
      const content = match.slice(3, -3).replace(/^\w*\n/, "");
      return `<pre><code>${escapeHtml(content.trim())}</code></pre>`;
    });

  // Process line by line for lists and paragraphs
  const lines = html.split("\n");
  const result: string[] = [];
  let inList = false;
  let listType: "ul" | "ol" = "ul";

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("<h") || trimmed.startsWith("<pre>")) {
      if (inList) {
        result.push(`</${listType}>`);
        inList = false;
      }
      result.push(trimmed);
    } else if (/^[-*] /.test(trimmed)) {
      if (!inList) {
        listType = "ul";
        result.push("<ul>");
        inList = true;
      }
      result.push(`<li>${trimmed.slice(2)}</li>`);
    } else if (/^\d+\. /.test(trimmed)) {
      if (!inList) {
        listType = "ol";
        result.push("<ol>");
        inList = true;
      }
      result.push(`<li>${trimmed.replace(/^\d+\. /, "")}</li>`);
    } else if (trimmed === "") {
      if (inList) {
        result.push(`</${listType}>`);
        inList = false;
      }
    } else {
      if (inList) {
        result.push(`</${listType}>`);
        inList = false;
      }
      result.push(`<p>${trimmed}</p>`);
    }
  }
  if (inList) result.push(`</${listType}>`);

  return result.join("") || "<p></p>";
}

/**
 * Convert TipTap HTML back to markdown.
 */
function markdownFromHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return nodeToMarkdown(doc.body).trim();
}

function nodeToMarkdown(node: Node): string {
  let result = "";

  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      result += child.textContent ?? "";
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
          result += `${nodeToMarkdown(el)}\n`;
          break;
        case "strong":
          result += `**${nodeToMarkdown(el)}**`;
          break;
        case "em":
          result += `*${nodeToMarkdown(el)}*`;
          break;
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
          for (const li of Array.from(el.children)) {
            result += `- ${nodeToMarkdown(li).trim()}\n`;
          }
          break;
        case "ol":
          Array.from(el.children).forEach((li, i) => {
            result += `${i + 1}. ${nodeToMarkdown(li).trim()}\n`;
          });
          break;
        case "li":
          result += nodeToMarkdown(el);
          break;
        case "br":
          result += "\n";
          break;
        default:
          result += nodeToMarkdown(el);
      }
    }
  }

  return result;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
