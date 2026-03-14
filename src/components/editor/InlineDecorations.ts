import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

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
      new Plugin({
        key: new PluginKey("inlineDecorations"),
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];

            state.doc.descendants((node, pos) => {
              if (!node.isText) return;
              const text = node.text || "";

              // TODO markers (☐ = \u2610, ✎ = \u270e, ☑ = \u2611)
              const todoMatch = /^([\u2610\u270e\u2611])/.exec(text);
              if (todoMatch) {
                const ch = todoMatch[1]!;
                const cls =
                  ch === "\u2610"
                    ? "todo-marker todo-open"
                    : ch === "\u270e"
                      ? "todo-marker todo-doing"
                      : "todo-marker todo-done";
                decorations.push(
                  Decoration.inline(pos, pos + 1, { class: cls })
                );
              }

              // Wikilinks [[type:target]]
              const wlRegex = /\[\[(task|doc|note):[^\]]+\]\]/g;
              let wlMatch;
              while ((wlMatch = wlRegex.exec(text)) !== null) {
                decorations.push(
                  Decoration.inline(
                    pos + wlMatch.index,
                    pos + wlMatch.index + wlMatch[0].length,
                    { class: "wikilink" }
                  )
                );
              }

              // Topic/person refs (#topic, @person)
              const topicRegex = /(?:^|(?<=\s))([#@][a-z0-9-]+)/gi;
              let topicMatch;
              while ((topicMatch = topicRegex.exec(text)) !== null) {
                decorations.push(
                  Decoration.inline(
                    pos + topicMatch.index,
                    pos + topicMatch.index + topicMatch[0].length,
                    { class: "topic-ref" }
                  )
                );
              }
            });

            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
