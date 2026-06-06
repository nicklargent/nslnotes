import type { Node as PMNode } from "@tiptap/pm/model";
import { serializeMarkdown } from "./serializer";
import { parseMarkdown } from "./parser";

/**
 * Result of a save → load round trip. `md` is what would be persisted, `reDoc`
 * is the doc you would get back by reloading that markdown, and `ok` is whether
 * the reloaded doc is structurally identical to the original.
 *
 * The loss this detects happens at serialize time: the live ProseMirror doc can
 * hold schema-valid content the markdown serializer cannot fully represent (most
 * commonly tables with multi-line / block-content cells, or deeply nested
 * structures), which is silently dropped. Comparing `doc` against
 * `parseMarkdown(serializeMarkdown(doc))` is the only place that discrepancy is
 * visible — the markdown on disk is already lossy but stable.
 */
export interface RoundTrip {
  md: string;
  reDoc: PMNode;
  ok: boolean;
}

type NodeJSON = { type: string; content?: NodeJSON[]; [k: string]: unknown };

/** A blank paragraph — a blank-line gap, not content. */
function isBlankParagraph(n: NodeJSON): boolean {
  return n.type === "paragraph" && (!n.content || n.content.length === 0);
}

/**
 * Split a paragraph's inline content on hard breaks into one paragraph per line.
 * Non-paragraph nodes pass through unchanged.
 */
function splitParagraphOnHardBreak(n: NodeJSON): NodeJSON[] {
  if (n.type !== "paragraph" || !n.content) return [n];
  const lines: NodeJSON[][] = [[]];
  for (const inline of n.content) {
    if (inline.type === "hardBreak") lines.push([]);
    else lines[lines.length - 1]!.push(inline);
  }
  if (lines.length === 1) return [n];
  return lines.map((content) => ({ type: "paragraph", content }));
}

/** Textblocks whose leading/trailing whitespace markdown trims (NOT codeBlock). */
const TRIM_EDGE_WHITESPACE = new Set(["paragraph", "heading"]);

/** List nodes that markdown cannot keep separate when adjacent. */
const LIST_TYPES = new Set(["bulletList", "orderedList", "taskList"]);

/**
 * Merge consecutive same-type lists into one. Two adjacent bullet/ordered/task
 * lists (e.g. left behind when a blank line splits a list mid-edit) cannot be
 * kept separate in markdown — they always reflow into a single list on reload —
 * so the split-vs-merged grouping is not a real difference. Every item is
 * preserved, so genuine item loss is still visible.
 */
function mergeAdjacentLists(content: NodeJSON[]): NodeJSON[] {
  const out: NodeJSON[] = [];
  for (const node of content) {
    const prev = out[out.length - 1];
    if (prev && node.type === prev.type && LIST_TYPES.has(node.type)) {
      out[out.length - 1] = {
        ...prev,
        content: [...(prev.content ?? []), ...(node.content ?? [])],
      };
    } else {
      out.push(node);
    }
  }
  return out;
}

/**
 * Trim leading/trailing whitespace at the edges of a textblock's inline content,
 * dropping any boundary text nodes that become empty. Internal whitespace is
 * left intact (markdown preserves it).
 */
function trimInlineEdges(content: NodeJSON[]): NodeJSON[] {
  const out = content.slice();
  while (out.length && out[0]!.type === "text") {
    const t = ((out[0]!["text"] as string) ?? "").replace(/^\s+/, "");
    if (t === "") out.shift();
    else {
      out[0] = { ...out[0]!, text: t };
      break;
    }
  }
  while (out.length && out[out.length - 1]!.type === "text") {
    const last = out[out.length - 1]!;
    const t = ((last["text"] as string) ?? "").replace(/\s+$/, "");
    if (t === "") out.pop();
    else {
      out[out.length - 1] = { ...last, text: t };
      break;
    }
  }
  return out;
}

/**
 * Canonicalize a doc for loss-comparison, collapsing two kinds of benign
 * block-structure churn that do NOT represent data loss:
 *
 *  1. Blank-paragraph gaps. The serializer emits blank lines between blocks;
 *     reparsing them reintroduces empty paragraph nodes the original doc lacked.
 *  2. Paragraph-break vs. hard break. markdown-it runs with `breaks: true`, so a
 *     line break and a paragraph break are interchangeable on the markdown side:
 *     two adjacent paragraphs serialize and reparse as one paragraph with a hard
 *     break (and vice versa). This happens constantly while editing.
 *
 * Both shuffle block boundaries while preserving every piece of text and every
 * real node, so a raw `doc.eq` would fire on essentially every edit to
 * link/image-dense notes.
 *
 * It also (case 3) trims leading/trailing whitespace at paragraph/heading edges
 * — markdown drops a trailing space at the end of a line or a leading space in a
 * bullet, so the live doc carries whitespace the reload won't; codeBlock is
 * excluded since its whitespace is significant — and (case 4) merges adjacent
 * same-type lists, which markdown always reflows into one on reload (e.g. when a
 * blank line splits a list mid-edit). These only flip a verdict where markdown
 * actually normalizes, so they cannot mask real loss:
 * dropped or flattened content leaves a different node/text sequence behind (e.g.
 * a list inside a table cell collapsing to plain text). Calibrated against the
 * full notes corpus (404 notes, 0 false positives) and the crafted-loss tests.
 */
function normalize(n: NodeJSON): NodeJSON {
  if (!n.content) return n;
  let content: NodeJSON[] = [];
  for (const child of n.content) {
    for (const piece of splitParagraphOnHardBreak(child)) {
      content.push(normalize(piece));
    }
  }
  if (TRIM_EDGE_WHITESPACE.has(n.type)) content = trimInlineEdges(content);
  content = content.filter((c) => !isBlankParagraph(c));
  content = mergeAdjacentLists(content);
  return { ...n, content };
}

/** Structural equality that ignores blank-line / hard-break cosmetics. */
function docsEquivalent(a: PMNode, b: PMNode): boolean {
  return (
    JSON.stringify(normalize(a.toJSON() as NodeJSON)) ===
    JSON.stringify(normalize(b.toJSON() as NodeJSON))
  );
}

/**
 * Low-level round trip: serialize a doc to markdown, reparse it, and compare the
 * result structurally. Returns the intermediate `md` and reparsed `reDoc` so
 * callers that want to *use* the savable form (e.g. paste normalization) can.
 * May throw if serialization/parsing fails — callers that only want a verdict
 * should use {@link checkRoundTrip}.
 */
export function roundTripDoc(
  doc: PMNode,
  entityPath?: string,
  rootPath?: string,
  // The doc's serialized markdown, if a caller already computed it (e.g. the
  // editor's onUpdate). Skips a redundant second serialization of the same doc.
  precomputedMd?: string
): RoundTrip {
  const md = precomputedMd ?? serializeMarkdown(doc, entityPath, rootPath);
  const reDoc = parseMarkdown(md, entityPath, rootPath);
  return { md, reDoc, ok: docsEquivalent(doc, reDoc) };
}

export interface RoundTripCheck {
  ok: boolean;
  detail?: string;
}

/**
 * Verdict-only wrapper around {@link roundTripDoc} that never throws. A thrown
 * serialization/parse error is itself a round-trip failure (the serializer has
 * no handler for some content), so it is reported as `ok: false`.
 */
export function checkRoundTrip(
  doc: PMNode,
  entityPath?: string,
  rootPath?: string,
  precomputedMd?: string
): RoundTripCheck {
  try {
    const { ok } = roundTripDoc(doc, entityPath, rootPath, precomputedMd);
    return ok
      ? { ok: true }
      : { ok: false, detail: "Content changes after a save/reload test." };
  } catch (e) {
    return {
      ok: false,
      detail: e instanceof Error ? e.message : "serialization error",
    };
  }
}
