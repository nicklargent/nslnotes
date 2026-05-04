import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { IndexService } from "../../services/IndexService";
import { NavigationService } from "../../services/NavigationService";
import { runtime } from "../../lib/runtime";
import { isExternalUrl } from "../../lib/url";
import { indexStore } from "../../stores/indexStore";
import { findHighlightKey } from "./FindHighlightPlugin";
import type { TopicRef } from "../../types/topics";
import type { EntityType } from "../../types/entities";

const WIKILINK_RE = /\[\[(task|doc|note):([^\]]+)\]\]/g;
const TOPIC_RE = /(?:^|(?<=\s))([#@][a-z0-9][a-z0-9-]+)/gi;
const MD_LINK_RE = /(?<!\[!?)\[([^\]]+)\]\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g;
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

function navigateFromWidget(className: string, attrs: Record<string, string>) {
  if (className === "wikilink-resolved") {
    const type = attrs["data-wikilink-type"] as EntityType | undefined;
    const target = attrs["data-wikilink-target"];
    if (type && target) {
      const entity = IndexService.resolveWikilink({
        raw: `[[${type}:${target}]]`,
        type,
        target,
        isValid: true,
      });
      if (entity) NavigationService.navigateTo(entity);
    }
  } else if (className === "topic-resolved") {
    const ref = attrs["data-topic-ref"];
    if (ref) NavigationService.navigateToTopic(ref.toLowerCase() as TopicRef);
  } else if (className === "md-link-resolved") {
    const href = attrs["data-link-href"];
    if (href) runtime.openUrl(href);
  }
}

function attachWidgetClick(el: HTMLElement, onClick: () => void) {
  el.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  el.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });
}

function createResolvedSpan(
  className: string,
  text: string,
  attrs: Record<string, string>
): HTMLElement {
  const span = document.createElement("span");
  span.className = className;
  span.setAttribute("contenteditable", "false");
  for (const [k, v] of Object.entries(attrs)) {
    span.setAttribute(k, v);
  }

  const textEl = document.createElement("span");
  textEl.className = `${className}-text`;
  textEl.textContent = text;
  attachWidgetClick(textEl, () => navigateFromWidget(className, attrs));
  span.appendChild(textEl);

  const icon = document.createElement("span");
  icon.className = "inline-edit-icon";
  icon.textContent = "✎";
  attachWidgetClick(icon, () => {
    const pos = attrs["data-pos"];
    if (!pos) return;
    span.dispatchEvent(
      new CustomEvent("inline-edit", {
        bubbles: true,
        detail: { pos: parseInt(pos, 10) },
      })
    );
  });
  span.appendChild(icon);

  return span;
}

/**
 * ProseMirror decoration plugin that scans document text for inline patterns
 * (wikilinks, topic refs, markdown links) and applies CSS classes for visual styling.
 *
 * ProseMirror strips custom <span> elements not defined in the schema, so we use
 * decorations to re-add styling classes without modifying the document.
 *
 * NOTE: TODO marker handling has moved to the TodoMarker schema node — it's no
 * longer a decoration on text content.
 */
export const InlineDecorations = Extension.create({
  name: "inlineDecorations",

  addProseMirrorPlugins() {
    return [
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
                          "data-pos": String(wlFrom),
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
                      () => {
                        const attrs: Record<string, string> = {
                          "data-link-href": linkUrl,
                          "data-pos": String(mlFrom),
                        };
                        if (isExternalUrl(linkUrl)) {
                          attrs["data-external"] = "true";
                        }
                        return createResolvedSpan(
                          "md-link-resolved",
                          linkText,
                          attrs
                        );
                      },
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
                          "data-pos": String(topicFrom),
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
