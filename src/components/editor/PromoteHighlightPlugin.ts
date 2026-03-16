import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

interface HighlightRange {
  from: number;
  to: number;
}

export const promoteHighlightKey = new PluginKey<HighlightRange | null>(
  "promoteHighlight"
);

/**
 * ProseMirror plugin that highlights a range of blocks with a blue background
 * during promote-to-task/doc confirmation flow.
 *
 * Set via `tr.setMeta(promoteHighlightKey, { from, to })`, clear with `null`.
 */
export const PromoteHighlightPlugin = Extension.create({
  name: "promoteHighlight",

  addProseMirrorPlugins() {
    return [
      new Plugin<HighlightRange | null>({
        key: promoteHighlightKey,
        state: {
          init(): HighlightRange | null {
            return null;
          },
          apply(tr, value): HighlightRange | null {
            const meta = tr.getMeta(promoteHighlightKey) as
              | HighlightRange
              | null
              | undefined;
            if (meta !== undefined) return meta;
            // Remap positions if doc changed
            if (value && tr.docChanged) {
              return {
                from: tr.mapping.map(value.from),
                to: tr.mapping.map(value.to),
              };
            }
            return value;
          },
        },
        props: {
          decorations(state) {
            const range = promoteHighlightKey.getState(state);
            if (!range) return DecorationSet.empty;

            const decorations: Decoration[] = [];
            state.doc.nodesBetween(range.from, range.to, (node, pos) => {
              // Decorate block nodes whose range is fully within the
              // highlight range. Skip the doc node itself.
              if (node.type.name === "doc") return true;
              if (!node.isBlock) return false;

              const nodeFrom = pos;
              const nodeTo = pos + node.nodeSize;

              if (nodeFrom >= range.from && nodeTo <= range.to) {
                decorations.push(
                  Decoration.node(nodeFrom, nodeTo, {
                    class: "promote-highlight",
                  })
                );
                return false; // don't recurse into decorated nodes
              }
              // Recurse into partially-overlapping containers (e.g. bulletList
              // when only one listItem is in range)
              return true;
            });

            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
