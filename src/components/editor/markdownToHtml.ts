import MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";
import { ImageService } from "../../services/ImageService";

interface RenderEnv {
  entityPath?: string | undefined;
  rootPath?: string | undefined;
}

// ---------------------------------------------------------------------------
// markdown-it instance — configured once, reused for every render call.
// ---------------------------------------------------------------------------
const md = new MarkdownIt({ html: true, linkify: false, breaks: false });

// Disable link parsing so [text](url) stays as raw text.
// Image parsing (![alt](url)) uses a separate rule and remains enabled.
md.disable("link");

// ---------------------------------------------------------------------------
// Plugin: wrap tight-list <li> content in <p> (TipTap expects it)
// ---------------------------------------------------------------------------
// markdown-it marks paragraph_open/paragraph_close as hidden=true for tight
// lists so they don't render. TipTap always expects <li><p>…</p></li>,
// so we unhide them.
function tiptapListParagraphs(md: MarkdownIt): void {
  md.core.ruler.push("tiptap_list_paragraphs", (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i]!;
      if (
        tok.hidden &&
        (tok.type === "paragraph_open" || tok.type === "paragraph_close")
      ) {
        tok.hidden = false;
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Plugin: task list support  — - [ ] / - [x] → TipTap taskList/taskItem
// ---------------------------------------------------------------------------
function taskListPlugin(md: MarkdownIt): void {
  md.core.ruler.push("task_lists", (state) => {
    const tokens = state.tokens;
    // Track which bullet_list_open tokens contain at least one task item,
    // so we can add data-type="taskList" to them.
    const taskListOpens = new Set<Token>();

    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i]!;
      if (tok.type !== "inline") continue;
      // Must be the first inline inside a list_item_open
      if (i < 1 || tokens[i - 1]!.type !== "paragraph_open") continue;
      if (i < 2 || tokens[i - 2]!.type !== "list_item_open") continue;

      const content = tok.content;
      const checkMatch = /^\[([ xX])\]\s?/.exec(content);
      if (!checkMatch) continue;

      const checked = checkMatch[1] !== " ";
      const liOpen = tokens[i - 2]!;

      // Mark the list_item as a taskItem
      liOpen.attrSet("data-type", "taskItem");
      liOpen.attrSet("data-checked", String(checked));

      // Strip the checkbox prefix from content
      tok.content = content.slice(checkMatch[0].length);
      // Also strip from children tokens if present
      if (tok.children && tok.children.length > 0) {
        const firstChild = tok.children[0]!;
        if (firstChild.type === "text") {
          firstChild.content = firstChild.content.slice(checkMatch[0].length);
        }
      }

      // Find the enclosing bullet_list_open and mark it
      for (let j = i - 2; j >= 0; j--) {
        if (tokens[j]!.type === "bullet_list_open" && tokens[j]!.tag === "ul") {
          taskListOpens.add(tokens[j]!);
          break;
        }
      }
    }

    // Apply data-type="taskList" to the bullet_list_open tokens
    for (const tok of taskListOpens) {
      tok.attrSet("data-type", "taskList");
    }
  });
}

// ---------------------------------------------------------------------------
// Plugin: TODO/DOING/WAITING/LATER/DONE markers
// ---------------------------------------------------------------------------
type TodoKeyword = "TODO" | "DOING" | "WAITING" | "LATER" | "DONE";

const TODO_MAP: Record<TodoKeyword, { cls: string; char: string }> = {
  TODO: { cls: "todo-open", char: "&#9744;" }, // ☐
  DOING: { cls: "todo-doing", char: "&#9635;" }, // ◣
  WAITING: { cls: "todo-waiting", char: "&#8865;" }, // ⌛
  LATER: { cls: "todo-later", char: "&#8863;" }, // ▷
  DONE: { cls: "todo-done", char: "&#9745;" }, // ☑
};

function todoMarkerSpan(kw: TodoKeyword): string {
  const m = TODO_MAP[kw];
  return `<span class="todo-marker ${m.cls}" data-todo="${kw}">${m.char}</span>`;
}

function todoMarkersPlugin(md: MarkdownIt): void {
  md.core.ruler.push("todo_markers", (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i]!;
      if (tok.type !== "inline" || !tok.children) continue;

      // Walk children tokens looking for text tokens starting with a keyword
      const children = tok.children;
      const out: Token[] = [];
      for (let c = 0; c < children.length; c++) {
        const child = children[c]!;
        if (child.type !== "text") {
          out.push(child);
          continue;
        }

        // Check if text starts with a TODO keyword (only at line start —
        // either the first text child or preceded by a softbreak/newline)
        const isLineStart = c === 0 || children[c - 1]!.type === "softbreak";

        if (!isLineStart) {
          out.push(child);
          continue;
        }

        const match = /^(TODO|DOING|WAITING|LATER|DONE)\s/.exec(child.content);
        if (!match) {
          out.push(child);
          continue;
        }

        const kw = match[1] as TodoKeyword;
        const rest = child.content.slice(match[0].length);
        const span = todoMarkerSpan(kw);

        // Replace the keyword prefix with the marker span
        out.push(
          Object.assign(new state.Token("html_inline", "", 0), {
            content: kw === "DONE" ? `${span} <s>` : `${span} `,
          })
        );
        // Push remaining text from this token
        if (rest) {
          out.push(
            Object.assign(new state.Token("text", "", 0), {
              content: rest,
            })
          );
        }
        // For DONE, push all remaining children then close </s>
        if (kw === "DONE") {
          for (let r = c + 1; r < children.length; r++) {
            out.push(children[r]!);
          }
          out.push(
            Object.assign(new state.Token("html_inline", "", 0), {
              content: "</s>",
            })
          );
          // We consumed all remaining children
          tok.children = out;
          break;
        }
      }
      tok.children = out;
    }
  });
}

// ---------------------------------------------------------------------------
// Plugin: image {width=N} suffix & URL resolution
// ---------------------------------------------------------------------------
function imagePlugin(md: MarkdownIt): void {
  md.renderer.rules.image = (tokens, idx, _options, env: RenderEnv, _self) => {
    const tok = tokens[idx]!;
    const src = tok.attrGet("src") ?? "";
    const alt = tok.content ?? "";

    // Check the next text token for {width=N} suffix.
    // markdown-it leaves it as trailing text in the parent inline token.
    // We handle it in a core rule below instead.

    // Resolve image URL
    const resolvedSrc =
      env.entityPath && env.rootPath
        ? ImageService.resolveImageUrl(src, env.entityPath, env.rootPath)
        : src;
    tok.attrSet("src", resolvedSrc);

    // Check for width already set by core rule
    const width = tok.attrGet("width");

    // Build tag manually to control attribute order
    let html = `<img src="${resolvedSrc}" alt="${alt}"`;
    if (width) html += ` width="${width}"`;
    html += ">";
    return html;
  };

  // Core rule to consume {width=N} suffix from inline tokens containing images
  md.core.ruler.push("image_width", (state) => {
    for (const blockToken of state.tokens) {
      if (blockToken.type !== "inline" || !blockToken.children) continue;
      const children = blockToken.children;
      for (let i = 0; i < children.length; i++) {
        if (children[i]!.type !== "image") continue;
        // Look at the next token for {width=N}
        const next = children[i + 1];
        if (next && next.type === "text") {
          const wm = /^\{width=(\d+)\}/.exec(next.content);
          if (wm) {
            children[i]!.attrSet("width", wm[1]!);
            next.content = next.content.slice(wm[0].length);
            if (!next.content) {
              children.splice(i + 1, 1);
            }
          }
        }
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Plugin: table cell content wrapped in <p> (TipTap requirement)
// ---------------------------------------------------------------------------
function tableCellParagraphs(md: MarkdownIt): void {
  // Override td and th rendering to wrap content in <p>
  for (const tag of ["td", "th"] as const) {
    const openRule = `${tag}_open` as const;
    const closeRule = `${tag}_close` as const;

    const defaultOpen =
      md.renderer.rules[openRule] ||
      function (tokens, idx, options, _env, self) {
        return self.renderToken(tokens, idx, options);
      };
    const defaultClose =
      md.renderer.rules[closeRule] ||
      function (tokens, idx, options, _env, self) {
        return self.renderToken(tokens, idx, options);
      };

    md.renderer.rules[openRule] = (tokens, idx, options, env, self) => {
      return defaultOpen(tokens, idx, options, env, self) + "<p>";
    };
    md.renderer.rules[closeRule] = (tokens, idx, options, env, self) => {
      return "</p>" + defaultClose(tokens, idx, options, env, self);
    };
  }
}

// ---------------------------------------------------------------------------
// Plugin: trim trailing newline inside code blocks
// ---------------------------------------------------------------------------
function codeBlockTrimPlugin(md: MarkdownIt): void {
  md.renderer.rules.fence = (tokens, idx, _options, _env, _self) => {
    const tok = tokens[idx]!;
    const lang = tok.info.trim();
    const cls = lang ? ` class="language-${lang}"` : "";
    const content = escapeHtml(tok.content.replace(/\n$/, ""));
    return `<pre><code${cls}>${content}</code></pre>`;
  };
}

// ---------------------------------------------------------------------------
// Register all plugins
// ---------------------------------------------------------------------------
md.use(tiptapListParagraphs);
md.use(taskListPlugin);
md.use(todoMarkersPlugin);
md.use(imagePlugin);
md.use(tableCellParagraphs);
md.use(codeBlockTrimPlugin);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert a markdown string to TipTap-compatible HTML.
 *
 * Image URLs are resolved using ImageService when entityPath/rootPath
 * are provided. Links are preserved as raw `[text](url)` text.
 */
export function htmlFromMarkdown(
  markdown: string,
  entityPath?: string,
  rootPath?: string
): string {
  if (!markdown.trim()) return "<p></p>";

  const env: RenderEnv = { entityPath, rootPath };
  let html = md.render(markdown, env);

  // markdown-it wraps block-level images in <p>. TipTap expects bare <img>
  // at block level. Unwrap single-image paragraphs.
  html = html.replace(/<p>(<img [^>]+>)<\/p>/g, "$1");

  // Strip trailing newlines — the old implementation returned no trailing whitespace
  html = html.replace(/\n+$/, "");

  return html || "<p></p>";
}

// ---------------------------------------------------------------------------
// Shared utility
// ---------------------------------------------------------------------------
function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
