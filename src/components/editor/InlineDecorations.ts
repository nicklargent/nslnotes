import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { IndexService } from "../../services/IndexService";
import { indexStore } from "../../stores/indexStore";
import { findHighlightKey } from "./FindHighlightPlugin";
import type { TopicRef } from "../../types/topics";
import type { EntityType } from "../../types/entities";

const WIKILINK_RE = /\[\[(task|doc|note):([^\]]+)\]\]/g;
const TOPIC_RE = /(?:^|(?<=\s))([#@][a-z0-9][a-z0-9-]+)/gi;
const MD_LINK_RE = /(?<!\[!?)\[([^\]]+)\]\(((?:[^()]*|\([^()]*\))*)\)/g;
const HIDDEN_STYLE = "font-size:0;letter-spacing:-1ch;color:transparent;";
const inlineDecorationsKey = new PluginKey<{ focused: boolean }>(
  "inlineDecorations"
);

function resolveWikilinkTitle(type: EntityType, target: string): string | null {
  const entity = IndexService.resolveWikilink({
    raw: "",
    type,
    target,
    isValid: true,
  });
  if (!entity) return null;
  if (entity.type === "note") return entity.title ?? entity.date;
  return entity.title;
}

function resolveTopicLabel(ref: string): string | null {
  const topic = indexStore.topics.get(ref as TopicRef);
  if (topic && topic.label !== topic.ref) return topic.label;
  return null;
}

function createResolvedSpan(
  className: string,
  text: string,
  attrs: Record<string, string>
): HTMLElement {
  const span = document.createElement("span");
  span.className = className;
  span.textContent = text;
  for (const [k, v] of Object.entries(attrs)) {
    span.setAttribute(k, v);
  }
  return span;
}

/**
 * ProseMirror decoration plugin that scans document text for inline patterns
 * (TODO markers, wikilinks, topic refs) and applies CSS classes for visual styling.
 *
 * ProseMirror strips custom <span> elements not defined in the schema, so we use
 * decorations to re-add styling classes without modifying the document.
 */
export const InlineDecorations = Extension.create({
  name: "inlineDecorations",

  addProseMirrorPlugins() {
    return [
      // Plugin to auto-replace TODO/DOING/DONE text with Unicode markers
      new Plugin({
        key: new PluginKey("todoAutoReplace"),
        appendTransaction(
          transactions: readonly Transaction[],
          oldState,
          newState
        ) {
          // Only process if document changed
          if (!transactions.some((tr) => tr.docChanged)) return null;

          const tr = newState.tr;
          let changed = false;
          const strikeMark = newState.schema.marks["strike"];

          const replacements: Array<{
            from: number;
            to: number;
            text: string;
          }> = [];
          const strikeOps: Array<{ from: number; to: number; add: boolean }> =
            [];

          // Build a map of old marker characters by node position for comparison
          const unicodeMarkerRe = /^([\u2610\u25a3\u22A1\u229F\u2611])\s/;
          const oldMarkers = new Map<number, string>();
          oldState.doc.descendants((node, pos) => {
            if (!node.isTextblock) return;
            const m = unicodeMarkerRe.exec(node.textContent);
            if (m) oldMarkers.set(pos, m[1]!);
          });

          newState.doc.descendants((node, pos) => {
            if (!node.isTextblock) return;
            const text = node.textContent;

            // Match TODO/DOING/WAITING/LATER/DONE text that needs replacing with Unicode
            const textMatch = /^(TODO|DOING|WAITING|LATER|DONE) /.exec(text);
            if (textMatch) {
              const marker = textMatch[1];
              const unicode =
                marker === "TODO"
                  ? "\u2610"
                  : marker === "DOING"
                    ? "\u25a3"
                    : marker === "WAITING"
                      ? "\u22A1"
                      : marker === "LATER"
                        ? "\u229F"
                        : "\u2611";
              replacements.push({
                from: pos + 1,
                to: pos + 1 + marker!.length,
                text: unicode,
              });
              // Strike the rest of the text for DONE
              if (strikeMark && node.textContent.length > textMatch[0].length) {
                const contentFrom = pos + 1 + unicode.length + 1; // after marker + space
                const contentTo = pos + node.nodeSize - 1;
                strikeOps.push({
                  from: contentFrom,
                  to: contentTo,
                  add: marker === "DONE",
                });
              }
              return;
            }

            // Handle existing Unicode markers — only manage strike when marker changed
            const unicodeMatch = unicodeMarkerRe.exec(text);
            if (unicodeMatch && strikeMark && text.length > 2) {
              const currentMarker = unicodeMatch[1]!;
              // Map this position back to oldState to find the old marker
              const mappedPos = transactions.reduce(
                (p, t) => t.mapping.invert().map(p),
                pos
              );
              const oldMarker = oldMarkers.get(mappedPos);

              // Only enforce strike changes when the marker itself changed
              if (oldMarker !== undefined && oldMarker !== currentMarker) {
                const isDone = currentMarker === "\u2611";
                const contentFrom = pos + 1 + 2; // after marker char + space
                const contentTo = pos + node.nodeSize - 1;
                if (contentFrom < contentTo) {
                  strikeOps.push({
                    from: contentFrom,
                    to: contentTo,
                    add: isDone,
                  });
                }
              }
            }
          });

          // Apply text replacements in reverse order to preserve positions
          for (let i = replacements.length - 1; i >= 0; i--) {
            const r = replacements[i]!;
            tr.insertText(r.text, r.from, r.to);
            changed = true;
          }

          // Apply strike operations (positions may have shifted from replacements)
          for (const op of strikeOps) {
            const from = tr.mapping.map(op.from);
            const to = tr.mapping.map(op.to);
            if (from < to) {
              if (op.add) {
                tr.addMark(from, to, strikeMark!.create());
              } else {
                tr.removeMark(from, to, strikeMark);
              }
              changed = true;
            }
          }

          return changed ? tr : null;
        },
      }),
      // Plugin to convert any link marks (from paste, etc.) back to raw [text](url)
      new Plugin({
        key: new PluginKey("linkMarkToRawText"),
        appendTransaction(
          transactions: readonly Transaction[],
          _oldState,
          newState
        ) {
          if (!transactions.some((tr) => tr.docChanged)) return null;
          // Don't re-process our own appended transactions
          if (transactions.some((tr) => tr.getMeta("linkMarkToRawText")))
            return null;

          const linkMark = newState.schema.marks["link"];
          if (!linkMark) return null;

          const tr = newState.tr;
          let changed = false;

          // Collect replacements first to avoid modifying during traversal
          const replacements: Array<{
            from: number;
            to: number;
            text: string;
            href: string;
          }> = [];

          newState.doc.descendants((node, pos) => {
            if (!node.isText) return;
            const mark = node.marks.find((m) => m.type === linkMark);
            if (mark) {
              const href = mark.attrs["href"] as string;
              const text = node.text || "";
              replacements.push({
                from: pos,
                to: pos + node.nodeSize,
                text,
                href,
              });
            }
          });

          // Apply in reverse to preserve positions
          for (let i = replacements.length - 1; i >= 0; i--) {
            const r = replacements[i]!;
            const alreadyMarkdown = /\[([^\]]+)\]\(/.test(r.text);
            const raw = alreadyMarkdown ? r.text : `[${r.text}](${r.href})`;
            tr.replaceWith(r.from, r.to, newState.schema.text(raw));
            changed = true;
          }

          if (!changed) return null;
          tr.setMeta("preventAutolink", true);
          tr.setMeta("linkMarkToRawText", true);
          return tr;
        },
      }),
      new Plugin({
        key: inlineDecorationsKey,
        state: {
          init() {
            return { focused: false };
          },
          apply(tr, value) {
            const meta = tr.getMeta(inlineDecorationsKey);
            if (meta !== undefined) return meta;
            return value;
          },
        },
        view(editorView) {
          const setFocused = (focused: boolean) => {
            const cur = inlineDecorationsKey.getState(editorView.state);
            if (cur?.focused !== focused) {
              editorView.dispatch(
                editorView.state.tr.setMeta(inlineDecorationsKey, { focused })
              );
            }
          };
          const onFocus = () => setFocused(true);
          const onBlur = () => setFocused(false);
          editorView.dom.addEventListener("focus", onFocus);
          editorView.dom.addEventListener("blur", onBlur);
          return {
            destroy() {
              editorView.dom.removeEventListener("focus", onFocus);
              editorView.dom.removeEventListener("blur", onBlur);
            },
          };
        },
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];
            const focused =
              inlineDecorationsKey.getState(state)?.focused ?? false;
            const { from: selFrom, to: selTo } = focused
              ? state.selection
              : { from: -1, to: -1 };

            // Check if any find match overlaps a given range.
            // Matches are sorted by position (produced by doc.descendants),
            // so use binary search for O(log n) per call.
            const findState = findHighlightKey.getState(state);
            const findMatches = findState?.query ? findState.matches : [];
            function hasFindOverlap(from: number, to: number): boolean {
              if (findMatches.length === 0) return false;
              let lo = 0;
              let hi = findMatches.length - 1;
              while (lo < hi) {
                const mid = (lo + hi) >> 1;
                if (findMatches[mid]!.to <= from) lo = mid + 1;
                else hi = mid;
              }
              return lo < findMatches.length && findMatches[lo]!.from < to;
            }

            state.doc.descendants((node, pos) => {
              if (!node.isText) return;
              const text = node.text || "";

              // TODO markers (☐ = \u2610, ◣ = \u25a3, ⌛ = \u231B, ▷ = \u25B7, ☑ = \u2611)
              const todoMatch = /^([\u2610\u25a3\u22A1\u229F\u2611])/.exec(
                text
              );
              if (todoMatch) {
                const ch = todoMatch[1]!;
                const cls =
                  ch === "\u2610"
                    ? "todo-marker todo-open"
                    : ch === "\u25a3"
                      ? "todo-marker todo-doing"
                      : ch === "\u22A1"
                        ? "todo-marker todo-waiting"
                        : ch === "\u229F"
                          ? "todo-marker todo-later"
                          : "todo-marker todo-done";
                decorations.push(
                  Decoration.inline(pos, pos + 1, { class: cls })
                );
                const label =
                  ch === "\u2610"
                    ? "TODO"
                    : ch === "\u25a3"
                      ? "DOING"
                      : ch === "\u22A1"
                        ? "WAITING"
                        : ch === "\u229F"
                          ? "LATER"
                          : "DONE";
                decorations.push(
                  Decoration.widget(
                    pos + 1,
                    () => {
                      const span = document.createElement("span");
                      span.className = `todo-label ${cls.replace("todo-marker ", "")}`;
                      span.textContent = label;
                      return span;
                    },
                    { side: -1, key: `todo-label:${pos}:${label}` }
                  )
                );
              }

              // Wikilinks [[type:target]]
              WIKILINK_RE.lastIndex = 0;
              let wlMatch;
              while ((wlMatch = WIKILINK_RE.exec(text)) !== null) {
                const wlFrom = pos + wlMatch.index;
                const wlTo = wlFrom + wlMatch[0].length;
                const cursorInside = selFrom <= wlTo && selTo >= wlFrom;
                const type = wlMatch[1] as EntityType;
                const target = wlMatch[2]!;
                const title = resolveWikilinkTitle(type, target);

                if (cursorInside || !title || hasFindOverlap(wlFrom, wlTo)) {
                  decorations.push(
                    Decoration.inline(wlFrom, wlTo, { class: "wikilink" })
                  );
                } else {
                  decorations.push(
                    Decoration.inline(wlFrom, wlTo, {
                      class: "wikilink-hidden",
                      style: HIDDEN_STYLE,
                    })
                  );
                  decorations.push(
                    Decoration.widget(
                      wlFrom,
                      () =>
                        createResolvedSpan("wikilink-resolved", title, {
                          "data-wikilink-type": type,
                          "data-wikilink-target": target,
                        }),
                      { side: -1, key: `wl:${type}:${target}` }
                    )
                  );
                }
              }

              // Markdown links [text](url)
              MD_LINK_RE.lastIndex = 0;
              let mdLinkMatch;
              while ((mdLinkMatch = MD_LINK_RE.exec(text)) !== null) {
                const linkText = mdLinkMatch[1]!;
                // Skip nested/malformed matches (e.g. [[url](url)](url))
                if (linkText.includes("](") || linkText.startsWith("["))
                  continue;
                const mlFrom = pos + mdLinkMatch.index;
                const mlTo = mlFrom + mdLinkMatch[0].length;
                const linkUrl = mdLinkMatch[2]!;
                const cursorInside = selFrom <= mlTo && selTo >= mlFrom;

                if (cursorInside || hasFindOverlap(mlFrom, mlTo)) {
                  // Show full raw text; style the whole thing as a link
                  decorations.push(
                    Decoration.inline(mlFrom, mlTo, { class: "md-link" })
                  );
                  // Dim the URL portion: (url)
                  // The URL portion starts after "[text]" = 1 + linkText.length + 1 chars from mlFrom
                  const urlFrom = mlFrom + 1 + linkText.length + 1; // after "[text]"
                  const urlTo = mlTo; // includes closing ")"
                  decorations.push(
                    Decoration.inline(urlFrom, urlTo, {
                      class: "md-link-url",
                    })
                  );
                } else {
                  // Hide raw text, show widget
                  decorations.push(
                    Decoration.inline(mlFrom, mlTo, {
                      class: "md-link-hidden",
                      style: HIDDEN_STYLE,
                    })
                  );
                  decorations.push(
                    Decoration.widget(
                      mlFrom,
                      () =>
                        createResolvedSpan("md-link-resolved", linkText, {
                          "data-link-pos": String(mlFrom),
                          "data-link-href": linkUrl,
                        }),
                      { side: -1, key: `mdlink:${mlFrom}:${linkText}` }
                    )
                  );
                }
              }

              // Topic/person refs (#topic, @person)
              TOPIC_RE.lastIndex = 0;
              let topicMatch: RegExpExecArray | null;
              while ((topicMatch = TOPIC_RE.exec(text)) !== null) {
                const rawRef = topicMatch[0];
                const topicFrom = pos + topicMatch.index;
                const topicTo = topicFrom + rawRef.length;
                const cursorInside = selFrom <= topicTo && selTo >= topicFrom;
                const label = resolveTopicLabel(rawRef);

                if (
                  cursorInside ||
                  !label ||
                  hasFindOverlap(topicFrom, topicTo)
                ) {
                  decorations.push(
                    Decoration.inline(topicFrom, topicTo, {
                      class: "topic-ref",
                    })
                  );
                } else {
                  decorations.push(
                    Decoration.inline(topicFrom, topicTo, {
                      class: "topic-hidden",
                      style: HIDDEN_STYLE,
                    })
                  );
                  decorations.push(
                    Decoration.widget(
                      topicFrom,
                      () =>
                        createResolvedSpan("topic-resolved", label, {
                          "data-topic-ref": rawRef,
                        }),
                      { side: -1, key: `topic:${rawRef}` }
                    )
                  );
                }
              }
            });

            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
