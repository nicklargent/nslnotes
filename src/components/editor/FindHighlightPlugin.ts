import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Editor as TiptapEditor } from "@tiptap/core";

interface FindMatch {
  from: number;
  to: number;
}

interface FindState {
  query: string;
  matches: FindMatch[];
  currentIndex: number;
}

export const findHighlightKey = new PluginKey<FindState>("findHighlight");

function computeMatches(
  doc: import("@tiptap/pm/model").Node,
  query: string
): FindMatch[] {
  if (!query) return [];
  const matches: FindMatch[] = [];
  const lowerQuery = query.toLowerCase();

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const text = node.text.toLowerCase();
    let idx = text.indexOf(lowerQuery);
    while (idx !== -1) {
      matches.push({ from: pos + idx, to: pos + idx + query.length });
      idx = text.indexOf(lowerQuery, idx + 1);
    }
  });

  return matches;
}

export const FindHighlightPlugin = Extension.create({
  name: "findHighlight",

  addProseMirrorPlugins() {
    return [
      new Plugin<FindState>({
        key: findHighlightKey,
        state: {
          init(): FindState {
            return { query: "", matches: [], currentIndex: 0 };
          },
          apply(tr, value): FindState {
            const meta = tr.getMeta(findHighlightKey) as
              | Partial<FindState>
              | undefined;

            if (meta !== undefined) {
              if ("query" in meta) {
                const query = meta.query ?? "";
                const matches = computeMatches(tr.doc, query);
                return { query, matches, currentIndex: 0 };
              }
              if ("currentIndex" in meta) {
                return { ...value, currentIndex: meta.currentIndex ?? 0 };
              }
            }

            // Recompute on doc change if query is active
            if (tr.docChanged && value.query) {
              const matches = computeMatches(tr.doc, value.query);
              const clamped = Math.min(
                value.currentIndex,
                Math.max(0, matches.length - 1)
              );
              return { ...value, matches, currentIndex: clamped };
            }

            return value;
          },
        },
        props: {
          decorations(state) {
            const findState = findHighlightKey.getState(state);
            if (
              !findState ||
              !findState.query ||
              findState.matches.length === 0
            )
              return DecorationSet.empty;

            const decorations: Decoration[] = [];
            for (let i = 0; i < findState.matches.length; i++) {
              const match = findState.matches[i]!;
              const cls =
                i === findState.currentIndex
                  ? "find-highlight find-highlight-current"
                  : "find-highlight";
              decorations.push(
                Decoration.inline(match.from, match.to, { class: cls })
              );
            }

            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});

export function setFindQuery(editor: TiptapEditor, query: string): void {
  editor.view.dispatch(editor.state.tr.setMeta(findHighlightKey, { query }));
}

export function setFindIndex(editor: TiptapEditor, index: number): void {
  editor.view.dispatch(
    editor.state.tr.setMeta(findHighlightKey, { currentIndex: index })
  );
}

export function clearFind(editor: TiptapEditor): void {
  editor.view.dispatch(
    editor.state.tr.setMeta(findHighlightKey, { query: "" })
  );
}

export function getFindState(editor: TiptapEditor): FindState {
  return (
    findHighlightKey.getState(editor.state) ?? {
      query: "",
      matches: [],
      currentIndex: 0,
    }
  );
}
