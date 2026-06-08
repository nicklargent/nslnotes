import { MarkdownSerializer } from "@tiptap/pm/markdown";
import type { Node as PMNode } from "@tiptap/pm/model";
import { ImageService } from "../../../services/ImageService";
import type { TodoState } from "../../../types/inline";

// Tracks per-call serialization context (image URL resolution).
// MarkdownSerializerState doesn't expose a way to thread custom env, so we
// stash it in module state for the duration of one `serializeMarkdown` call.
let serializeEntityPath: string | undefined;
let serializeRootPath: string | undefined;

/**
 * End a block "tightly" when followed by a non-empty sibling — emits a
 * single `\n` instead of PM-md's default `\n\n`. The blank-line gap plugin
 * inserts an empty paragraph between blocks that had blank lines in source;
 * if the next sibling is that marker, fall back to `closeBlock` so the
 * standard separator runs and produces the visible blank line.
 *
 * Applies at all levels — top-level doc as well as inside list items,
 * blockquotes, etc. The blank-line plugin runs at every level too, so the
 * doc structure consistently encodes which separator the source had.
 */
function closeBlockTight(
  state: import("@tiptap/pm/markdown").MarkdownSerializerState,
  node: PMNode,
  parent: PMNode,
  index: number
): void {
  const next = index + 1 < parent.childCount ? parent.child(index + 1) : null;
  const isBlankLineMarker =
    next?.type.name === "paragraph" && next.content.size === 0;
  // A paragraph followed immediately by a `---` rule would re-parse as a
  // setext h2 (`paragraph\n---` is the h2 underline syntax). Force a blank
  // line in that case to keep the rule a rule.
  const setextHazard =
    node.type.name === "paragraph" && next?.type.name === "horizontalRule";
  if (isBlankLineMarker || setextHazard) {
    state.closeBlock(node);
  } else {
    state.write("\n");
  }
}

/**
 * An empty list item — its only child is an empty paragraph. These are
 * transient outliner state (a freshly-indented bullet the user hasn't typed
 * into yet). They cannot round-trip through plain markdown: an empty `- ` line
 * directly under text either re-parses as a setext heading underline or as
 * literal text, so we drop them on serialize rather than corrupt the file. The
 * `childCount === 1` guard preserves items that hold real content — a leading
 * empty-paragraph spacer before a block (image / code block) is `childCount > 1`
 * and handled by the `listItem` serializer's `skipFirst`.
 */
function isEmptyListItem(item: PMNode): boolean {
  return (
    item.childCount === 1 &&
    item.firstChild?.type.name === "paragraph" &&
    item.firstChild.content.size === 0
  );
}

/** A copy of a list node with its empty items removed (same node if none). */
function withoutEmptyItems(node: PMNode): PMNode {
  const kept: PMNode[] = [];
  node.forEach((item) => {
    if (!isEmptyListItem(item)) kept.push(item);
  });
  return kept.length === node.childCount
    ? node
    : node.type.create(node.attrs, kept, node.marks);
}

export const serializer = new MarkdownSerializer(
  {
    paragraph(state, node, parent, index) {
      // Empty paragraphs are blank-line markers — they're consumed by the
      // preceding block's closeBlockTight, so they emit nothing themselves.
      if (node.content.size === 0) return;
      state.renderInline(node);
      closeBlockTight(state, node, parent, index);
    },

    heading(state, node, parent, index) {
      state.write("#".repeat(node.attrs["level"] as number) + " ");
      state.renderInline(node, false);
      closeBlockTight(state, node, parent, index);
    },

    blockquote(state, node) {
      state.wrapBlock("> ", null, node, () => state.renderContent(node));
    },

    horizontalRule(state, node) {
      state.write("---");
      state.closeBlock(node);
    },

    bulletList(state, node) {
      const list = withoutEmptyItems(node);
      if (list.childCount === 0) return;
      state.renderList(list, "  ", () => "- ");
    },

    orderedList(state, node) {
      const list = withoutEmptyItems(node);
      if (list.childCount === 0) return;
      const start = (list.attrs["start"] as number) ?? 1;
      const maxW = String(start + list.childCount - 1).length;
      const space = " ".repeat(maxW + 2);
      state.renderList(list, space, (i: number) => {
        const nStr = String(start + i);
        return " ".repeat(maxW - nStr.length) + nStr + ". ";
      });
    },

    listItem(state, node) {
      // Skip leading empty paragraphs — they appear when the schema's
      // `paragraph block*` requirement auto-fills a paragraph in front of a
      // standalone block child like an image.
      const skipFirst =
        node.childCount > 1 &&
        node.firstChild?.type.name === "paragraph" &&
        node.firstChild.content.size === 0;
      if (!skipFirst) {
        state.renderContent(node);
        return;
      }
      // Render only from index 1 onward
      const fragment = node.content.cut(node.firstChild!.nodeSize);
      const stripped = node.type.create(node.attrs, fragment);
      state.renderContent(stripped);
    },

    taskList(state, node) {
      const list = withoutEmptyItems(node);
      if (list.childCount === 0) return;
      state.renderList(list, "  ", () => "- ");
    },

    taskItem(state, node) {
      const checked = node.attrs["checked"] as boolean;
      state.write(checked ? "[x] " : "[ ] ");
      state.renderContent(node);
    },

    codeBlock(state, node) {
      const lang = (node.attrs["language"] as string | null) || "";
      const backticks = node.textContent.match(/`{3,}/gm);
      const fence = backticks ? backticks.sort().slice(-1)[0]! + "`" : "```";
      state.write(fence + lang + "\n");
      state.text(node.textContent, false);
      state.write("\n");
      state.write(fence);
      state.closeBlock(node);
    },

    image(state, node) {
      const rawSrc = (node.attrs["src"] as string) ?? "";
      const src =
        serializeEntityPath && serializeRootPath
          ? ImageService.unresolveImageSrc(
              rawSrc,
              serializeEntityPath,
              serializeRootPath
            )
          : rawSrc;
      const alt = (node.attrs["alt"] as string) ?? "";
      const width = node.attrs["width"];
      const title = node.attrs["title"];
      const escapedSrc = src.replace(/[()]/g, "\\$&");
      const titlePart = title
        ? ` "${(title as string).replace(/"/g, '\\"')}"`
        : "";
      const widthSuffix = width ? `{width=${width}}` : "";
      state.write(
        "![" +
          state.esc(alt) +
          "](" +
          escapedSrc +
          titlePart +
          ")" +
          widthSuffix
      );
      // Image is inline — no closeBlock; the enclosing paragraph closes itself.
    },

    hardBreak(state, node, parent, index) {
      // markdown-it's `breaks: true` makes \n a hard break, so emit a bare \n
      // between siblings instead of `\\\n`. This matches the legacy DOM walker
      // behaviour (a `<br>` becomes `\n`).
      for (let i = index + 1; i < parent.childCount; i++) {
        if (parent.child(i).type !== node.type) {
          state.write("\n");
          return;
        }
      }
    },

    todoMarker(state, node) {
      const s = node.attrs["state"] as TodoState;
      state.write(`${s} `);
    },

    table(state, node) {
      // Render row by row. First row is the header; we emit the separator
      // after it. PM's table doesn't track header vs body sections.
      const rows: PMNode[] = [];
      node.forEach((row) => rows.push(row));
      if (rows.length === 0) {
        state.closeBlock(node);
        return;
      }

      function renderRow(row: PMNode): string {
        const cells: string[] = [];
        row.forEach((cell) => cells.push(serializeCell(cell)));
        return "| " + cells.join(" | ") + " |";
      }

      // Header
      state.write(renderRow(rows[0]!) + "\n");
      // Separator — width = number of cells in row 0
      let cellCount = 0;
      rows[0]!.forEach(() => cellCount++);
      state.write("| " + Array(cellCount).fill("---").join(" | ") + " |\n");
      // Body
      for (let i = 1; i < rows.length; i++) {
        state.write(renderRow(rows[i]!) + (i < rows.length - 1 ? "\n" : ""));
      }
      state.closeBlock(node);
    },

    // tableRow / tableCell / tableHeader are rendered manually inside table()
    tableRow() {},
    tableCell() {},
    tableHeader() {},

    text(state, node, parent, index) {
      const prev = index > 0 ? parent.child(index - 1) : null;
      // Escape a leading list-marker (`- `, `* `, `+ `, `1. `) only when this
      // text actually begins a new line — i.e. it carries no inline marks.
      // When the text is wrapped in a mark, the mark's opening delimiter
      // (`**`, `*`, `` ` ``, `<u>`, `[`) is emitted first, so the marker is no
      // longer at the line start and won't be re-parsed as a list item;
      // escaping it there would corrupt the source (e.g. a fully-bold
      // `**1. Title**` would round-trip to `**\1. Title**`).
      // Two cases: (1) immediately after a hardBreak; (2) at the very start
      // of a paragraph that's a top-level block.
      const looksLikeListMarker = /^(?:[-*+]\s|\d+\.\s)/.test(node.text ?? "");
      if (looksLikeListMarker && node.marks.length === 0) {
        if (prev?.type.name === "hardBreak") {
          state.text("\\" + node.text!, false);
          return;
        }
        if (
          index === 0 &&
          parent.type.name === "paragraph" &&
          parent !== node // paranoia
        ) {
          state.text("\\" + node.text!, false);
          return;
        }
      }
      // Disable escaping otherwise — markdown-it has `link` disabled and our
      // doc treats `[text](url)` / `[[wikilink]]` as raw text.
      state.text(node.text!, false);
    },
  },
  {
    bold: {
      open: "**",
      close: "**",
      mixable: true,
      expelEnclosingWhitespace: true,
    },
    italic: {
      open: "*",
      close: "*",
      mixable: true,
      expelEnclosingWhitespace: true,
    },
    strike: {
      open(_state, _mark, parent, index) {
        // DONE TODO markers imply strike on the rest of the block — suppress
        // the literal `~~` syntax when a preceding sibling is a DONE marker.
        if (parentHasDoneTodoBefore(parent, index)) return "";
        return "~~";
      },
      close(_state, _mark, parent, index) {
        if (parentHasDoneTodoBefore(parent, index)) return "";
        return "~~";
      },
      mixable: true,
      expelEnclosingWhitespace: true,
    },
    code: {
      open: "`",
      close: "`",
      mixable: false,
      escape: false,
    },
    underline: {
      open: "<u>",
      close: "</u>",
      mixable: true,
    },
    link: {
      open: "[",
      close(_state, mark) {
        const href = (mark.attrs["href"] as string) ?? "";
        const title = mark.attrs["title"];
        const escapedHref = href.replace(/[()"]/g, "\\$&");
        const titlePart = title
          ? ` "${(title as string).replace(/"/g, '\\"')}"`
          : "";
        return `](${escapedHref}${titlePart})`;
      },
      mixable: true,
    },
  }
);

/** True when a sibling before `index` is a TodoMarker with state=DONE. */
function parentHasDoneTodoBefore(parent: PMNode, index: number): boolean {
  for (let i = 0; i < index; i++) {
    const child = parent.child(i);
    if (child.type.name === "todoMarker" && child.attrs["state"] === "DONE") {
      return true;
    }
  }
  return false;
}

/** Serialize a single table cell's inline content. */
function serializeCell(cell: PMNode): string {
  let text = "";
  cell.descendants((node, _pos, parent) => {
    if (node.isText) {
      let chunk = node.text ?? "";
      // Apply marks
      for (const mark of node.marks) {
        switch (mark.type.name) {
          case "bold":
            chunk = `**${chunk}**`;
            break;
          case "italic":
            chunk = `*${chunk}*`;
            break;
          case "strike":
            chunk = `~~${chunk}~~`;
            break;
          case "code":
            chunk = `\`${chunk}\``;
            break;
          case "underline":
            chunk = `<u>${chunk}</u>`;
            break;
          case "link": {
            const href = (mark.attrs["href"] as string) ?? "";
            chunk = `[${chunk}](${href})`;
            break;
          }
        }
      }
      text += chunk;
    }
    void parent;
    return true;
  });
  // Escape pipes so they don't terminate the cell
  return text.replace(/\|/g, "\\|");
}

export function serializeMarkdown(
  doc: PMNode,
  entityPath?: string,
  rootPath?: string
): string {
  serializeEntityPath = entityPath;
  serializeRootPath = rootPath;
  try {
    return serializer.serialize(doc, { tightLists: true });
  } finally {
    serializeEntityPath = undefined;
    serializeRootPath = undefined;
  }
}
