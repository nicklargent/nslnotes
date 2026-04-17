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
const md = new MarkdownIt({ html: true, linkify: false, breaks: true });

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

/** Find the token range of each top-level list item (list_item_open..list_item_close at nesting 1). */
function findListItemRanges(
  tokens: Token[],
  listOpenIdx: number
): { start: number; end: number; isTask: boolean }[] {
  const listLevel = tokens[listOpenIdx]!.level;
  const ranges: { start: number; end: number; isTask: boolean }[] = [];
  for (let i = listOpenIdx + 1; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.type === "bullet_list_close" && t.level === listLevel) break;
    if (t.type === "list_item_open" && t.level === listLevel + 1) {
      const start = i;
      const isTask = t.attrGet("data-type") === "taskItem";
      for (let j = i + 1; j < tokens.length; j++) {
        if (
          tokens[j]!.type === "list_item_close" &&
          tokens[j]!.level === listLevel + 1
        ) {
          ranges.push({ start, end: j, isTask });
          i = j;
          break;
        }
      }
    }
  }
  return ranges;
}

function taskListPlugin(md: MarkdownIt): void {
  md.core.ruler.push("task_lists", (state) => {
    const tokens = state.tokens;

    // First pass: mark individual task items and strip checkbox prefixes
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i]!;
      if (tok.type !== "inline") continue;
      if (i < 1 || tokens[i - 1]!.type !== "paragraph_open") continue;
      if (i < 2 || tokens[i - 2]!.type !== "list_item_open") continue;

      const content = tok.content;
      const checkMatch = /^\[([ xX])\]\s?/.exec(content);
      if (!checkMatch) continue;

      const checked = checkMatch[1] !== " ";
      const liOpen = tokens[i - 2]!;

      liOpen.attrSet("data-type", "taskItem");
      liOpen.attrSet("data-checked", String(checked));

      tok.content = content.slice(checkMatch[0].length);
      if (tok.children && tok.children.length > 0) {
        const firstChild = tok.children[0]!;
        if (firstChild.type === "text") {
          firstChild.content = firstChild.content.slice(checkMatch[0].length);
        }
      }
    }

    // Second pass (backwards so splice indices stay valid): split or promote lists.
    for (let i = tokens.length - 1; i >= 0; i--) {
      const tok = tokens[i]!;
      if (tok.type !== "bullet_list_open" || tok.tag !== "ul") continue;

      // Single backward scan: determine if this list is nested and whether
      // it's inside a taskItem (ProseMirror requires consistent child types,
      // and taskList CSS breaks plain bulletList rendering inside taskItems).
      let ancestorTaskItem = false;
      let isNested = false;
      for (let j = i - 1; j >= 0; j--) {
        const t = tokens[j]!;
        if (t.type === "list_item_open") {
          isNested = true;
          ancestorTaskItem = t.attrGet("data-type") === "taskItem";
          break;
        }
        if (t.type === "list_item_close" || t.level < tok.level) break;
      }
      if (isNested) {
        if (ancestorTaskItem) {
          tok.attrSet("data-type", "taskList");
          const ranges = findListItemRanges(tokens, i);
          for (const range of ranges) {
            if (!range.isTask) {
              tokens[range.start]!.attrSet("data-type", "taskItem");
              tokens[range.start]!.attrSet("data-checked", "false");
            }
          }
        }
        continue;
      }

      const ranges = findListItemRanges(tokens, i);
      const hasTask = ranges.some((r) => r.isTask);
      const hasPlain = ranges.some((r) => !r.isTask);

      if (!hasTask) continue; // all plain — nothing to do

      if (!hasPlain) {
        // All items are tasks — just mark the whole list
        tok.attrSet("data-type", "taskList");
        continue;
      }

      // Mixed list — split into runs of same-kind items, each becoming its own list.
      // Find the list_close token
      let listCloseIdx = -1;
      for (let j = i + 1; j < tokens.length; j++) {
        if (
          tokens[j]!.type === "bullet_list_close" &&
          tokens[j]!.level === tok.level
        ) {
          listCloseIdx = j;
          break;
        }
      }
      if (listCloseIdx === -1) continue;

      // Group consecutive items by kind
      const groups: { isTask: boolean; startIdx: number; endIdx: number }[] =
        [];
      let cur = ranges[0]!;
      let groupStart = cur.start;
      for (let r = 1; r < ranges.length; r++) {
        if (ranges[r]!.isTask !== cur.isTask) {
          groups.push({
            isTask: cur.isTask,
            startIdx: groupStart,
            endIdx: cur.end,
          });
          groupStart = ranges[r]!.start;
        }
        cur = ranges[r]!;
      }
      groups.push({
        isTask: cur.isTask,
        startIdx: groupStart,
        endIdx: cur.end,
      });

      if (groups.length <= 1) {
        // Shouldn't happen given hasTask && hasPlain, but guard
        if (hasTask) tok.attrSet("data-type", "taskList");
        continue;
      }

      // Build replacement token array: for each group, wrap in ul open/close
      const replacement: Token[] = [];
      for (const group of groups) {
        const open = new state.Token("bullet_list_open", "ul", 1);
        open.level = tok.level;
        open.markup = tok.markup;
        if (group.isTask) open.attrSet("data-type", "taskList");

        replacement.push(open);
        // Copy all tokens for the items in this group
        for (let t = group.startIdx; t <= group.endIdx; t++) {
          replacement.push(tokens[t]!);
        }
        const close = new state.Token("bullet_list_close", "ul", -1);
        close.level = tok.level;
        close.markup = tok.markup;
        replacement.push(close);
      }

      // Replace the original list_open..list_close range
      tokens.splice(i, listCloseIdx - i + 1, ...replacement);
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
    let listDepth = 0;
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i]!;
      if (tok.type === "list_item_open") listDepth++;
      else if (tok.type === "list_item_close") listDepth--;

      if (tok.type !== "inline" || !tok.children) continue;
      if (listDepth <= 0) continue;

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
// Plugin: preserve blank-line gaps between blocks as empty paragraphs
// ---------------------------------------------------------------------------
function blankLineGapsPlugin(md: MarkdownIt): void {
  md.core.ruler.push("blank_line_gaps", (state) => {
    const tokens = state.tokens;
    const src = state.src;
    // Pre-compute which source lines are blank
    const srcLines = src.split("\n");

    /** Get the last source line of a top-level block ending at index `idx`. */
    function blockEndLine(idx: number): number | null {
      // Walk backwards from idx to find the opening token with a map
      for (let j = idx; j >= 0; j--) {
        if (tokens[j]!.map) return tokens[j]!.map![1];
      }
      return null;
    }

    /** Get the first source line of a top-level block starting at index `idx`. */
    function blockStartLine(idx: number): number | null {
      if (tokens[idx]!.map) return tokens[idx]!.map![0];
      // For synthetic tokens (from list split), check children
      for (let j = idx + 1; j < tokens.length; j++) {
        if (tokens[j]!.map) return tokens[j]!.map![0];
        if (tokens[j]!.nesting === -1 && tokens[j]!.level === 0) break;
      }
      return null;
    }

    // Walk top-level open/self-closing tokens and check for blank-line gaps
    const insertions: { beforeIdx: number; count: number }[] = [];
    let prevEndLine: number | null = null;

    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i]!;
      if (tok.level !== 0) continue;
      if (tok.nesting === -1) {
        // closing token — record end line
        prevEndLine = blockEndLine(i);
        continue;
      }

      // opening or self-closing token at level 0
      if (prevEndLine !== null) {
        const startLine = blockStartLine(i);
        if (startLine !== null && startLine > prevEndLine) {
          // Count blank lines between blocks
          let blanks = 0;
          for (let line = prevEndLine; line < startLine; line++) {
            if (srcLines[line] !== undefined && srcLines[line]!.trim() === "")
              blanks++;
          }
          // 1+ blank lines → one visible gap (empty paragraph).
          // Multiple blank lines collapse to a single gap (Obsidian behavior).
          if (blanks > 0) {
            insertions.push({ beforeIdx: i, count: 1 });
          }
        }
      }

      // Skip past this block's children
      if (tok.nesting === 1) {
        // Find matching close
        let depth = 1;
        for (let j = i + 1; j < tokens.length; j++) {
          depth += tokens[j]!.nesting;
          if (depth === 0) {
            prevEndLine = blockEndLine(j);
            i = j;
            break;
          }
        }
      } else {
        prevEndLine = tok.map ? tok.map[1] : prevEndLine;
      }
    }

    for (let k = insertions.length - 1; k >= 0; k--) {
      const { beforeIdx, count } = insertions[k]!;
      const emptyTokens: Token[] = [];
      for (let n = 0; n < count; n++) {
        const open = new state.Token("paragraph_open", "p", 1);
        open.level = 0;
        const inline = new state.Token("inline", "", 0);
        inline.level = 1;
        inline.content = "";
        inline.children = [];
        const close = new state.Token("paragraph_close", "p", -1);
        close.level = 0;
        emptyTokens.push(open, inline, close);
      }
      tokens.splice(beforeIdx, 0, ...emptyTokens);
    }
  });
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
md.use(blankLineGapsPlugin);

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

  if (!html) return "<p></p>";

  // Ensure a trailing empty paragraph so the cursor always has a place
  // to land outside the last block (e.g. when the only content is a wikilink).
  if (!html.endsWith("<p></p>")) {
    html += "<p></p>";
  }

  return html;
}

// ---------------------------------------------------------------------------
// Shared utility
// ---------------------------------------------------------------------------
function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
