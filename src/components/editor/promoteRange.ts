import type { EditorState } from "@tiptap/pm/state";

export interface PromoteRange {
  from: number; // ProseMirror start pos
  to: number; // ProseMirror end pos
  title: string; // Auto-detected title
  hasBody: boolean; // Whether there's content beyond the title line
}

/**
 * Detect the content range to promote based on the block at cursor/$from.
 *
 * Rules:
 * - Never expand upward from the cursor position.
 * - Expand downward only to collect child content belonging to this block.
 *
 * Cases:
 * - Heading: title = heading text, range extends down through content
 *   until next heading of same or higher level (or end of doc).
 * - List item: title = first paragraph text, range = that single listItem
 *   node (including any nested sub-lists within it).
 * - Paragraph: title = paragraph text, range = just that paragraph.
 */
export function detectPromoteRange(state: EditorState): PromoteRange | null {
  const { $from } = state.selection;

  // Find the innermost meaningful block at the cursor.
  // Walk up from $from to identify what kind of block we're in.

  // Check if we're inside a listItem
  for (let depth = $from.depth; depth >= 1; depth--) {
    if ($from.node(depth).type.name === "listItem") {
      return detectListItemRange(state, depth);
    }
  }

  // Check the direct parent block at depth 1 (top-level child of doc)
  const depth1Node = $from.node(1);
  if (depth1Node.type.name === "heading") {
    return detectHeadingRange(state);
  }

  if (depth1Node.type.name === "paragraph") {
    return detectParagraphRange(state);
  }

  return null;
}

function detectHeadingRange(state: EditorState): PromoteRange | null {
  const { $from } = state.selection;
  const headingNode = $from.node(1);
  const title = headingNode.textContent.trim();
  if (!title) return null;

  const headingLevel = headingNode.attrs["level"] as number;
  const doc = state.doc;

  // Find this heading's index among doc children
  const from = $from.before(1);
  let to = from + headingNode.nodeSize;
  const headingIndex = $from.index(0);

  // Expand down through content until next heading of same or higher level
  for (let i = headingIndex + 1; i < doc.childCount; i++) {
    const child = doc.child(i);
    if (
      child.type.name === "heading" &&
      (child.attrs["level"] as number) <= headingLevel
    ) {
      break;
    }
    to += child.nodeSize;
  }

  return {
    from,
    to,
    title,
    hasBody: to > from + headingNode.nodeSize,
  };
}

function detectListItemRange(
  state: EditorState,
  listItemDepth: number
): PromoteRange | null {
  const { $from } = state.selection;
  const listItemNode = $from.node(listItemDepth);

  // Title is the text of the first child (usually a paragraph)
  const firstChild = listItemNode.firstChild;
  const title = firstChild ? firstChild.textContent.trim() : "";
  if (!title) return null;

  const from = $from.before(listItemDepth);
  const to = $from.after(listItemDepth);

  return {
    from,
    to,
    title,
    hasBody: listItemNode.childCount > 1,
  };
}

function detectParagraphRange(state: EditorState): PromoteRange | null {
  const { $from } = state.selection;
  const paraNode = $from.node(1);
  const title = paraNode.textContent.trim();
  if (!title) return null;

  const from = $from.before(1);
  const to = from + paraNode.nodeSize;

  return {
    from,
    to,
    title,
    hasBody: false,
  };
}
