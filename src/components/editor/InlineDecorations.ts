import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { Transaction } from "@tiptap/pm/state";
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
      // Plugin to auto-replace TODO/DOING/DONE text with Unicode markers
      new Plugin({
        key: new PluginKey("todoAutoReplace"),
        appendTransaction(
          transactions: readonly Transaction[],
          _oldState,
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

          newState.doc.descendants((node, pos) => {
            if (!node.isTextblock) return;
            const text = node.textContent;

            // Check if inside a list item
            const $pos = newState.doc.resolve(pos);
            let inListItem = false;
            for (let d = $pos.depth; d >= 0; d--) {
              if ($pos.node(d).type.name === "listItem") {
                inListItem = true;
                break;
              }
            }
            if (!inListItem) return;

            // Match TODO/DOING/DONE text that needs replacing with Unicode
            const textMatch = /^(TODO|DOING|DONE) /.exec(text);
            if (textMatch) {
              const marker = textMatch[1];
              const unicode =
                marker === "TODO"
                  ? "\u2610"
                  : marker === "DOING"
                    ? "\u25a3"
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

            // Handle existing Unicode markers — manage strike on state changes
            const unicodeMatch = /^([\u2610\u25a3\u2611])\s/.exec(text);
            if (unicodeMatch && strikeMark && text.length > 2) {
              const isDone = unicodeMatch[1] === "\u2611";
              const contentFrom = pos + 1 + 2; // after marker char + space
              const contentTo = pos + node.nodeSize - 1;
              if (contentFrom < contentTo) {
                // Check if any text node in this block has strike
                let hasStrike = false;
                node.forEach((child) => {
                  if (
                    child.isText &&
                    child.marks.some((m) => m.type === strikeMark)
                  ) {
                    hasStrike = true;
                  }
                });
                if (isDone && !hasStrike) {
                  strikeOps.push({
                    from: contentFrom,
                    to: contentTo,
                    add: true,
                  });
                } else if (!isDone && hasStrike) {
                  strikeOps.push({
                    from: contentFrom,
                    to: contentTo,
                    add: false,
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
      new Plugin({
        key: new PluginKey("inlineDecorations"),
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];

            state.doc.descendants((node, pos) => {
              if (!node.isText) return;
              const text = node.text || "";

              // TODO markers (☐ = \u2610, ✎ = \u25a3, ☑ = \u2611)
              const todoMatch = /^([\u2610\u25a3\u2611])/.exec(text);
              if (todoMatch) {
                const ch = todoMatch[1]!;
                const cls =
                  ch === "\u2610"
                    ? "todo-marker todo-open"
                    : ch === "\u25a3"
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
