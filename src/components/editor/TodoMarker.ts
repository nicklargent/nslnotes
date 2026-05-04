import { Node, InputRule, PasteRule } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { Transaction } from "@tiptap/pm/state";
import type { TodoState } from "../../types/inline";

const GLYPH: Record<TodoState, string> = {
  TODO: "☐", // ☐
  DOING: "▣", // ▣
  WAITING: "⊡", // ⊡
  LATER: "⊟", // ⊟
  DONE: "☑", // ☑
};

const STATES: TodoState[] = ["TODO", "DOING", "WAITING", "LATER", "DONE"];
const STATE_RE = /^(TODO|DOING|WAITING|LATER|DONE) $/;

// CSS class suffix per state — must match `markdownToHtml.ts` TODO_MAP and
// the `.todo-marker.todo-X` / `.todo-label.todo-X` rules in editor.css.
// TODO maps to `open`, not `todo`.
const CLS: Record<TodoState, string> = {
  TODO: "todo-open",
  DOING: "todo-doing",
  WAITING: "todo-waiting",
  LATER: "todo-later",
  DONE: "todo-done",
};

export function nextState(s: TodoState): TodoState {
  switch (s) {
    case "TODO":
      return "DOING";
    case "DOING":
      return "DONE";
    case "DONE":
      return "TODO";
    case "WAITING":
    case "LATER":
      return "DONE";
  }
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    todoMarker: {
      setTodoState: (state: TodoState) => ReturnType;
      cycleTodoState: () => ReturnType;
    };
  }
}

/**
 * TODO marker as a real schema node — replaces the unicode-glyph-as-text plus
 * decoration approach that previously lived in InlineDecorations. Treated as
 * an inline atom so its glyph isn't part of the surrounding selectable text.
 *
 * parseDOM matches the `<span data-todo="X">` shape produced by markdownToHtml's
 * `todoMarkersPlugin`, so loaded markdown becomes a TodoMarker node directly.
 *
 * toDOM renders the same outer span (so existing `.todo-marker` CSS still
 * targets it and getHTML output round-trips back through htmlToMarkdown's
 * span[data-todo] case) plus an inner `.todo-label` span for the keyword text.
 */
export const TodoMarker = Node.create({
  name: "todoMarker",
  inline: true,
  group: "inline",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      state: {
        default: "TODO" as TodoState,
        parseHTML: (el) => {
          const v = (el as HTMLElement).getAttribute("data-todo");
          return STATES.includes(v as TodoState) ? (v as TodoState) : "TODO";
        },
        renderHTML: (attrs) => ({ "data-todo": attrs["state"] as string }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-todo]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const state = node.attrs["state"] as TodoState;
    const cls = CLS[state];
    // Outer wrapper carries data-todo (used by parseHTML to round-trip back to
    // a TodoMarker, and by htmlToMarkdown.ts to emit the keyword on save).
    // The glyph and label are siblings — keeping `.todo-marker` on a span
    // that contains only the glyph preserves the existing fixed-width CSS.
    return [
      "span",
      {
        ...HTMLAttributes,
        class: `todo-node ${cls}`,
        contenteditable: "false",
      },
      ["span", { class: `todo-marker ${cls}` }, GLYPH[state]],
      ["span", { class: `todo-label ${cls}` }, state],
    ];
  },

  addCommands() {
    return {
      setTodoState:
        (state: TodoState) =>
        ({ state: editorState, tr, dispatch }) => {
          const { selection } = editorState;
          const { from } = selection;
          const node =
            editorState.doc.nodeAt(from) ?? editorState.doc.nodeAt(from - 1);
          if (!node || node.type.name !== "todoMarker") return false;
          const pos = editorState.doc.nodeAt(from) ? from : from - 1;
          if (dispatch) {
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, state });
            dispatch(tr);
          }
          return true;
        },
      cycleTodoState:
        () =>
        ({ state: editorState, tr, dispatch }) => {
          const { selection } = editorState;
          const { from } = selection;
          const at = editorState.doc.nodeAt(from);
          const before = editorState.doc.nodeAt(from - 1);
          const node =
            at?.type.name === "todoMarker"
              ? at
              : before?.type.name === "todoMarker"
                ? before
                : null;
          if (!node) return false;
          const pos = at?.type.name === "todoMarker" ? from : from - 1;
          const cur = node.attrs["state"] as TodoState;
          const next = nextState(cur);
          if (dispatch) {
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, state: next });
            dispatch(tr);
          }
          return true;
        },
    };
  },

  addInputRules() {
    return [
      new InputRule({
        find: STATE_RE,
        handler: ({ range, match, chain }) => {
          const state = match[1] as TodoState;
          // Replace the typed `KEYWORD ` (5+ chars) with just the atom node.
          // The TodoMarker serializer emits `KEYWORD ` (with trailing space)
          // on save, so inserting a literal space here too would produce
          // `KEYWORD  text` (double space) on round-trip.
          chain()
            .deleteRange(range)
            .insertContent([{ type: "todoMarker", attrs: { state } }])
            .run();
        },
      }),
    ];
  },

  addPasteRules() {
    return [
      new PasteRule({
        find: /^(TODO|DOING|WAITING|LATER|DONE) /gm,
        handler: ({ range, match, chain }) => {
          const state = match[1] as TodoState;
          chain()
            .deleteRange(range)
            .insertContent([{ type: "todoMarker", attrs: { state } }])
            .run();
        },
      }),
    ];
  },

  addProseMirrorPlugins() {
    // Keep strike mark on rest-of-block in sync with DONE state.
    // When a TodoMarker switches to DONE, add strike to following inline
    // content; when it leaves DONE, remove strike.
    return [
      new Plugin({
        key: new PluginKey("todoMarkerStrikeSync"),
        appendTransaction(
          transactions: readonly Transaction[],
          oldState,
          newState
        ) {
          if (!transactions.some((tr) => tr.docChanged)) return null;
          const strikeMark = newState.schema.marks["strike"];
          if (!strikeMark) return null;

          // Find old TodoMarker positions/states (mapped through transactions)
          const oldStates = new Map<number, TodoState>();
          oldState.doc.descendants((node, pos) => {
            if (node.type.name === "todoMarker") {
              oldStates.set(pos, node.attrs["state"] as TodoState);
            }
          });

          const tr = newState.tr;
          let changed = false;

          newState.doc.descendants((node, pos, parent) => {
            if (node.type.name !== "todoMarker") return;
            const curState = node.attrs["state"] as TodoState;
            const mapped = transactions.reduce(
              (p, t) => t.mapping.invert().map(p),
              pos
            );
            const oldS = oldStates.get(mapped);
            if (oldS === curState) return;
            if (!parent) return;

            const $pos = newState.doc.resolve(pos);
            const parentDepth = $pos.depth;
            const blockEnd = $pos.end(parentDepth);

            // Strike applies only to the current LINE, not the rest of the
            // whole paragraph. Stop at the next hardBreak so other lines in
            // the same paragraph aren't affected.
            const contentFrom = pos + node.nodeSize; // marker (1) + immediately following text
            // skip the immediate space if present — but renderInline output
            // already has the marker emit "STATE " so a space exists in markdown
            // form. In the ProseMirror doc the space is the first char of the
            // following text node; we strike from there.
            if (contentFrom >= blockEnd) return;

            // Walk forward through the parent's content from pos until we hit
            // a hardBreak or block end.
            let lineEnd = blockEnd;
            const parentNode = $pos.node(parentDepth);
            const offsetInParent = pos - $pos.start(parentDepth);
            let scan = 0;
            parentNode.forEach((child, childOffset) => {
              if (childOffset <= offsetInParent) {
                scan = childOffset + child.nodeSize;
                return;
              }
              if (child.type.name === "hardBreak") {
                if (lineEnd === blockEnd) {
                  lineEnd = $pos.start(parentDepth) + childOffset;
                }
              }
              scan = childOffset + child.nodeSize;
            });
            void scan;

            if (contentFrom >= lineEnd) return;

            if (curState === "DONE") {
              tr.addMark(contentFrom, lineEnd, strikeMark.create());
            } else if (oldS === "DONE") {
              tr.removeMark(contentFrom, lineEnd, strikeMark);
            }
            changed = true;
          });

          return changed ? tr : null;
        },
      }),
    ];
  },
});
