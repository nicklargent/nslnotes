import MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";
import { MarkdownParser } from "@tiptap/pm/markdown";
import type { Node as PMNode } from "@tiptap/pm/model";
import { schema } from "./schema";
import { ImageService } from "../../../services/ImageService";

// ---------------------------------------------------------------------------
// markdown-it instance (reused for every parse call)
// ---------------------------------------------------------------------------
const md = new MarkdownIt({ html: false, linkify: false, breaks: true });
md.disable("link"); // links stay as raw `[text](url)` text in the doc
md.disable("lheading"); // app emits ATX headings only; `text\n-` must never become a setext heading
md.enable(["strikethrough", "table"]);

// ---------------------------------------------------------------------------
// Plugin: task list — convert `[ ]` / `[x]` items to taskItem tokens, splitting
// mixed lists into runs of task vs plain. Renames `bullet_list_open`/`list_item_open`
// to `task_list_open`/`task_item_open` when applicable so the token table can
// dispatch them to taskList/taskItem nodes directly.
// ---------------------------------------------------------------------------
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

    // Pass 1: detect `[ ]`/`[x]` prefixes and tag the enclosing list_item
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i]!;
      if (tok.type !== "inline") continue;
      if (i < 1 || tokens[i - 1]!.type !== "paragraph_open") continue;
      if (i < 2 || tokens[i - 2]!.type !== "list_item_open") continue;

      const checkMatch = /^\[([ xX])\]\s?/.exec(tok.content);
      if (!checkMatch) continue;
      const checked = checkMatch[1] !== " ";
      const liOpen = tokens[i - 2]!;
      liOpen.attrSet("data-type", "taskItem");
      liOpen.attrSet("data-checked", String(checked));

      tok.content = tok.content.slice(checkMatch[0].length);
      if (tok.children && tok.children.length > 0) {
        const firstChild = tok.children[0]!;
        if (firstChild.type === "text") {
          firstChild.content = firstChild.content.slice(checkMatch[0].length);
        }
      }
    }

    // Pass 2: walk lists backwards, split mixed lists, promote nested under task
    for (let i = tokens.length - 1; i >= 0; i--) {
      const tok = tokens[i]!;
      if (tok.type !== "bullet_list_open" || tok.tag !== "ul") continue;

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
      // Nested under a taskItem: promote everything to taskList/taskItem.
      // (TaskList schema only allows TaskItem children, and the legacy regression
      // test "plain bullet nested under a task is promoted to taskItem" pins this
      // behavior.)
      if (isNested && ancestorTaskItem) {
        tok.attrSet("data-type", "taskList");
        const ranges = findListItemRanges(tokens, i);
        for (const range of ranges) {
          if (!range.isTask) {
            tokens[range.start]!.attrSet("data-type", "taskItem");
            tokens[range.start]!.attrSet("data-checked", "false");
          }
        }
        continue;
      }
      // Otherwise (top-level OR nested under a plain listItem) fall through to
      // the split logic so mixed lists become a sequence of homogeneous lists.

      const ranges = findListItemRanges(tokens, i);
      const hasTask = ranges.some((r) => r.isTask);
      const hasPlain = ranges.some((r) => !r.isTask);
      if (!hasTask) continue;

      if (!hasPlain) {
        tok.attrSet("data-type", "taskList");
        continue;
      }

      // Mixed list — split into runs of same-kind items
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
        if (hasTask) tok.attrSet("data-type", "taskList");
        continue;
      }

      const replacement: Token[] = [];
      for (const group of groups) {
        const open = new state.Token("bullet_list_open", "ul", 1);
        open.level = tok.level;
        open.markup = tok.markup;
        if (group.isTask) open.attrSet("data-type", "taskList");
        replacement.push(open);
        for (let t = group.startIdx; t <= group.endIdx; t++) {
          replacement.push(tokens[t]!);
        }
        const close = new state.Token("bullet_list_close", "ul", -1);
        close.level = tok.level;
        close.markup = tok.markup;
        replacement.push(close);
      }
      tokens.splice(i, listCloseIdx - i + 1, ...replacement);
    }

    // Pass 3 (forward): propagate taskItem promotion to nested lists
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i]!;
      if (tok.type !== "bullet_list_open" || tok.tag !== "ul") continue;
      if (tok.attrGet("data-type") === "taskList") continue;
      let ancestor: Token | null = null;
      for (let j = i - 1; j >= 0; j--) {
        const t = tokens[j]!;
        if (t.type === "list_item_open") {
          ancestor = t;
          break;
        }
        if (t.type === "list_item_close" || t.level < tok.level) break;
      }
      if (!ancestor || ancestor.attrGet("data-type") !== "taskItem") continue;
      tok.attrSet("data-type", "taskList");
      const ranges = findListItemRanges(tokens, i);
      for (const range of ranges) {
        if (!range.isTask) {
          tokens[range.start]!.attrSet("data-type", "taskItem");
          tokens[range.start]!.attrSet("data-checked", "false");
        }
      }
    }

    // Pass 4: rename token TYPES so the parser table can dispatch directly.
    // bullet_list_open with data-type=taskList -> task_list_open (and matching close).
    // list_item_open with data-type=taskItem -> task_item_open (and matching close).
    const stack: ("task_list" | "bullet_list" | "task_item" | "list_item")[] =
      [];
    for (const t of tokens) {
      if (t.type === "bullet_list_open") {
        const isTask = t.attrGet("data-type") === "taskList";
        stack.push(isTask ? "task_list" : "bullet_list");
        if (isTask) t.type = "task_list_open";
      } else if (t.type === "list_item_open") {
        const isTask = t.attrGet("data-type") === "taskItem";
        stack.push(isTask ? "task_item" : "list_item");
        if (isTask) t.type = "task_item_open";
      } else if (t.type === "bullet_list_close") {
        const top = stack.pop();
        if (top === "task_list") t.type = "task_list_close";
      } else if (t.type === "list_item_close") {
        const top = stack.pop();
        if (top === "task_item") t.type = "task_item_close";
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Plugin: TODO/DOING/WAITING/LATER/DONE markers — emit todo_marker token at
// the start of each matching paragraph or list item. For DONE, wrap the
// remaining inline content in strike marks.
// ---------------------------------------------------------------------------
type TodoKeyword = "TODO" | "DOING" | "WAITING" | "LATER" | "DONE";

function todoMarkersPlugin(md: MarkdownIt): void {
  md.core.ruler.push("todo_markers", (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i]!;
      if (tok.type !== "inline" || !tok.children) continue;
      // Only paragraph context; skip headings, table cells, blockquotes
      if (tokens[i - 1]?.type !== "paragraph_open") continue;

      const children = tok.children;
      const out: Token[] = [];
      for (let c = 0; c < children.length; c++) {
        const child = children[c]!;
        if (child.type !== "text") {
          out.push(child);
          continue;
        }
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

        const marker = new state.Token("todo_marker", "", 0);
        marker.attrSet("state", kw);
        out.push(marker);
        // The TodoMarker serializer emits "STATE " (with trailing space), so
        // we strip the matched space here and let the rest follow.

        if (kw === "DONE") {
          // Wrap only the current line (up to the next softbreak/hardbreak)
          // in strike — not the entire remainder of the paragraph.
          const strikeOpen = new state.Token("s_open", "s", 1);
          const strikeClose = new state.Token("s_close", "s", -1);
          out.push(strikeOpen);
          if (rest) {
            out.push(
              Object.assign(new state.Token("text", "", 0), { content: rest })
            );
          }
          let r = c + 1;
          while (
            r < children.length &&
            children[r]!.type !== "softbreak" &&
            children[r]!.type !== "hardbreak"
          ) {
            out.push(children[r]!);
            r++;
          }
          out.push(strikeClose);
          // Continue from the line break onwards so subsequent lines can be
          // matched independently.
          c = r - 1;
          continue;
        }
        if (rest) {
          out.push(
            Object.assign(new state.Token("text", "", 0), { content: rest })
          );
        }
      }
      tok.children = out;
    }
  });
}

// ---------------------------------------------------------------------------
// Plugin: image {width=N} suffix — copy width from trailing text into image attr
// ---------------------------------------------------------------------------
function imageWidthPlugin(md: MarkdownIt): void {
  md.core.ruler.push("image_width", (state) => {
    for (const blockToken of state.tokens) {
      if (blockToken.type !== "inline" || !blockToken.children) continue;
      const children = blockToken.children;
      for (let i = 0; i < children.length; i++) {
        if (children[i]!.type !== "image") continue;
        const next = children[i + 1];
        if (next && next.type === "text") {
          const wm = /^\{width=(\d+)\}/.exec(next.content);
          if (wm) {
            children[i]!.attrSet("width", wm[1]!);
            next.content = next.content.slice(wm[0].length);
            if (!next.content) children.splice(i + 1, 1);
          }
        }
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Plugin: preserve blank-line gaps between blocks as empty paragraph tokens.
// ---------------------------------------------------------------------------
function blankLineGapsPlugin(md: MarkdownIt): void {
  md.core.ruler.push("blank_line_gaps", (state) => {
    const tokens = state.tokens;
    const srcLines = state.src.split("\n");

    function blockEndLine(idx: number): number | null {
      for (let j = idx; j >= 0; j--) {
        if (tokens[j]!.map) return tokens[j]!.map![1];
      }
      return null;
    }
    function blockStartLine(idx: number): number | null {
      if (tokens[idx]!.map) return tokens[idx]!.map![0];
      for (let j = idx + 1; j < tokens.length; j++) {
        if (tokens[j]!.map) return tokens[j]!.map![0];
        if (tokens[j]!.nesting === -1 && tokens[j]!.level === 0) break;
      }
      return null;
    }

    // Find the previous sibling block close at the same nesting level. Walk
    // backwards skipping anything at a deeper level; stop if we cross out of
    // the parent (token at a shallower level).
    function prevSiblingEnd(idx: number, level: number): number | null {
      for (let j = idx - 1; j >= 0; j--) {
        const t = tokens[j]!;
        if (t.level < level) return null; // left the parent
        if (t.level === level && t.nesting === -1) return blockEndLine(j);
        // tokens at a deeper level — keep walking back
      }
      return null;
    }

    const insertions: {
      beforeIdx: number;
      count: number;
      level: number;
    }[] = [];

    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i]!;
      // Skip inline content tokens; we only care about block boundaries.
      if (tok.type === "inline") continue;
      // Only consider opening (nesting=1) and self-closing (nesting=0) at
      // block level; closes don't start a new sibling.
      if (tok.nesting === -1) continue;
      // Skip list items: their parent is a list container that accepts only
      // listItem/taskItem children, so an inserted paragraph would be an
      // invalid sibling and PM rejects the whole list. Blank lines inside a
      // list have different semantics (loose-list spacing) which markdown-it
      // already handles via paragraph wrapping.
      if (tok.type === "list_item_open" || tok.type === "task_item_open") {
        continue;
      }

      const prevEnd = prevSiblingEnd(i, tok.level);
      if (prevEnd === null) continue;
      const startLine = blockStartLine(i);
      if (startLine === null || startLine <= prevEnd) continue;
      let blanks = 0;
      for (let line = prevEnd; line < startLine; line++) {
        if (srcLines[line] !== undefined && srcLines[line]!.trim() === "") {
          blanks++;
        }
      }
      if (blanks > 0) {
        insertions.push({ beforeIdx: i, count: 1, level: tok.level });
      }
    }

    for (let k = insertions.length - 1; k >= 0; k--) {
      const { beforeIdx, count, level } = insertions[k]!;
      const emptyTokens: Token[] = [];
      for (let n = 0; n < count; n++) {
        const open = new state.Token("paragraph_open", "p", 1);
        open.level = level;
        const inline = new state.Token("inline", "", 0);
        inline.level = level + 1;
        inline.content = "";
        inline.children = [];
        const close = new state.Token("paragraph_close", "p", -1);
        close.level = level;
        emptyTokens.push(open, inline, close);
      }
      tokens.splice(beforeIdx, 0, ...emptyTokens);
    }
  });
}

// ---------------------------------------------------------------------------
// Plugin: wrap table cell content (th/td) in paragraph tokens. TipTap's
// tableCell/tableHeader schema requires block children, but markdown-it's
// table emits inline content directly inside cell tokens.
// ---------------------------------------------------------------------------
function tableCellParagraphsPlugin(md: MarkdownIt): void {
  md.core.ruler.push("table_cell_paragraphs", (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i]!;
      if (tok.type !== "th_open" && tok.type !== "td_open") continue;
      // Insert paragraph_open after this cell open and paragraph_close before
      // the matching cell close.
      const cellLevel = tok.level;
      const closeType = tok.type === "th_open" ? "th_close" : "td_close";
      // Skip if already wrapped
      const next = tokens[i + 1];
      if (next?.type === "paragraph_open") continue;

      const pOpen = new state.Token("paragraph_open", "p", 1);
      pOpen.level = cellLevel + 1;
      // Find matching close
      let closeIdx = -1;
      for (let j = i + 1; j < tokens.length; j++) {
        if (tokens[j]!.type === closeType && tokens[j]!.level === cellLevel) {
          closeIdx = j;
          break;
        }
      }
      if (closeIdx === -1) continue;
      const pClose = new state.Token("paragraph_close", "p", -1);
      pClose.level = cellLevel + 1;
      tokens.splice(closeIdx, 0, pClose);
      tokens.splice(i + 1, 0, pOpen);
    }
  });
}

// ---------------------------------------------------------------------------
// Plugin: merge consecutive bullet_list / ordered_list tokens that aren't
// separated by a different block. markdown-it splits adjacent lists when the
// bullet marker differs (`- a\n* b`) — but since we render every list with
// the same marker, the round-trip would otherwise drift (split lists merge
// into one on re-parse). Run before taskListPlugin so its splits aren't
// re-merged.
// ---------------------------------------------------------------------------
function mergeAdjacentListsPlugin(md: MarkdownIt): void {
  md.core.ruler.push("merge_adjacent_lists", (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length - 1; i++) {
      const close = tokens[i]!;
      const next = tokens[i + 1]!;
      if (
        (close.type === "bullet_list_close" &&
          next.type === "bullet_list_open" &&
          close.level === next.level) ||
        (close.type === "ordered_list_close" &&
          next.type === "ordered_list_open" &&
          close.level === next.level)
      ) {
        // Drop the close-then-open pair so the items concatenate
        tokens.splice(i, 2);
        i--;
      }
    }
  });
}

md.use(mergeAdjacentListsPlugin);
md.use(taskListPlugin);
md.use(todoMarkersPlugin);
md.use(imageWidthPlugin);
md.use(tableCellParagraphsPlugin);
md.use(blankLineGapsPlugin);

// ---------------------------------------------------------------------------
// Token table — map markdown-it tokens to PM nodes/marks
// ---------------------------------------------------------------------------
const tokens = {
  paragraph: { block: "paragraph" },
  heading: {
    block: "heading",
    getAttrs: (tok: Token) => ({ level: Number(tok.tag.slice(1)) }),
  },
  blockquote: { block: "blockquote" },

  bullet_list: { block: "bulletList" },
  ordered_list: {
    block: "orderedList",
    getAttrs: (tok: Token) => ({
      start: tok.attrGet("start") ? Number(tok.attrGet("start")) : 1,
    }),
  },
  list_item: { block: "listItem" },

  task_list: { block: "taskList" },
  task_item: {
    block: "taskItem",
    getAttrs: (tok: Token) => ({
      checked: tok.attrGet("data-checked") === "true",
    }),
  },

  hr: { node: "horizontalRule" },
  hardbreak: { node: "hardBreak" },
  softbreak: { node: "hardBreak" },

  fence: {
    block: "codeBlock",
    getAttrs: (tok: Token) => ({ language: tok.info?.trim() || null }),
    noCloseToken: true,
  },
  code_block: {
    block: "codeBlock",
    getAttrs: () => ({ language: null }),
    noCloseToken: true,
  },

  image: {
    node: "image",
    getAttrs: (tok: Token) => ({
      src: tok.attrGet("src"),
      alt: tok.children?.[0]?.content ?? "",
      title: tok.attrGet("title"),
      width: tok.attrGet("width"),
    }),
  },

  table: { block: "table" },
  thead: { ignore: true },
  tbody: { ignore: true },
  tr: { block: "tableRow" },
  th: { block: "tableHeader" },
  td: { block: "tableCell" },

  todo_marker: {
    node: "todoMarker",
    getAttrs: (tok: Token) => ({ state: tok.attrGet("state") || "TODO" }),
  },

  em: { mark: "italic" },
  strong: { mark: "bold" },
  s: { mark: "strike" },
  code_inline: { mark: "code", noCloseToken: true },
};

export const parser = new MarkdownParser(schema, md, tokens);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export function parseMarkdown(
  markdown: string,
  entityPath?: string,
  rootPath?: string
): PMNode {
  const doc = parser.parse(markdown);
  if (!doc) throw new Error(`MarkdownParser returned null for input`);
  if (entityPath && rootPath) resolveImageSrcs(doc, entityPath, rootPath);
  return doc;
}

function resolveImageSrcs(
  doc: PMNode,
  entityPath: string,
  rootPath: string
): void {
  doc.descendants((node) => {
    if (node.type.name !== "image") return;
    const src = node.attrs["src"];
    if (typeof src !== "string") return;
    const resolved = ImageService.resolveImageUrl(src, entityPath, rootPath);
    (node.attrs as Record<string, unknown>)["src"] = resolved;
  });
}
