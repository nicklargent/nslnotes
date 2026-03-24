import { createSignal } from "solid-js";
import type { Editor as TiptapEditor } from "@tiptap/core";
import {
  setFindQuery,
  clearFind,
  setFindIndex,
  getFindState,
} from "../components/editor/FindHighlightPlugin";

/** Registry of all mounted TipTap editors. */
const editors = new Set<TiptapEditor>();

/** Reference to the find bar input element for external focusing. */
let findInputEl: HTMLInputElement | undefined;

export function setFindInputRef(el: HTMLInputElement) {
  findInputEl = el;
}

const [visible, setVisible] = createSignal(false);
const [query, setQuery] = createSignal("");
const [totalMatches, setTotalMatches] = createSignal(0);
const [currentGlobal, setCurrentGlobal] = createSignal(0);

export const findStore = {
  get visible() {
    return visible();
  },
  get query() {
    return query();
  },
  get totalMatches() {
    return totalMatches();
  },
  get currentGlobal() {
    return currentGlobal();
  },
};

export function registerEditor(editor: TiptapEditor) {
  editors.add(editor);
}

export function unregisterEditor(editor: TiptapEditor) {
  editors.delete(editor);
}

/** Iterate live editors, pruning destroyed ones. */
function forEachEditor(fn: (ed: TiptapEditor) => void) {
  for (const ed of editors) {
    if (ed.isDestroyed) {
      editors.delete(ed);
      continue;
    }
    fn(ed);
  }
}

/** Recompute aggregate match count across all editors. */
function recomputeMatches(): number {
  let total = 0;
  forEachEditor((ed) => {
    total += getFindState(ed).matches.length;
  });
  setTotalMatches(total);
  return total;
}

/** Map a global index to (editor, localIndex) pair. */
function resolveGlobalIndex(
  globalIdx: number
): { editor: TiptapEditor; localIndex: number } | null {
  let remaining = globalIdx;
  for (const ed of editors) {
    if (ed.isDestroyed) continue;
    const count = getFindState(ed).matches.length;
    if (remaining < count) {
      return { editor: ed, localIndex: remaining };
    }
    remaining -= count;
  }
  return null;
}

/** Highlight exactly one match across all editors and scroll to it. */
function applyAndScroll(globalIdx: number) {
  const target = resolveGlobalIndex(globalIdx);
  forEachEditor((ed) => {
    setFindIndex(ed, target?.editor === ed ? target.localIndex : -1);
  });

  if (!target) return;
  const match = getFindState(target.editor).matches[target.localIndex];
  if (!match) return;
  try {
    const domPos = target.editor.view.domAtPos(match.from);
    const node =
      domPos.node instanceof HTMLElement
        ? domPos.node
        : domPos.node.parentElement;
    node?.scrollIntoView({ block: "center", behavior: "smooth" });
  } catch {
    // domAtPos can throw for edge positions
  }
}

export function openFind() {
  if (visible()) {
    findInputEl?.focus();
    findInputEl?.select();
    return;
  }
  setVisible(true);
}

export function closeFind() {
  setVisible(false);
  setQuery("");
  setCurrentGlobal(0);
  setTotalMatches(0);
  forEachEditor((ed) => clearFind(ed));
}

export function updateQuery(q: string) {
  setQuery(q);
  forEachEditor((ed) => setFindQuery(ed, q));
  const total = recomputeMatches();
  setCurrentGlobal(0);
  if (total > 0) {
    applyAndScroll(0);
  }
}

export function goNext() {
  const total = totalMatches();
  if (total === 0) return;
  const next = (currentGlobal() + 1) % total;
  setCurrentGlobal(next);
  applyAndScroll(next);
}

export function goPrev() {
  const total = totalMatches();
  if (total === 0) return;
  const prev = (currentGlobal() - 1 + total) % total;
  setCurrentGlobal(prev);
  applyAndScroll(prev);
}
