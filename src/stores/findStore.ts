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

/** Registry of plain DOM containers (for views without TipTap). */
const containers = new Set<HTMLElement>();

/** Matches found in DOM containers, keyed by container element. */
const containerMarksMap = new Map<HTMLElement, HTMLElement[]>();

/** Currently highlighted container mark (for efficient prev/next toggle). */
let currentContainerMark: HTMLElement | null = null;

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

export function registerContainer(el: HTMLElement) {
  containers.add(el);
  // If find is already active, search only this new container
  if (visible() && query()) {
    searchSingleContainer(el, query());
    recomputeMatches();
    if (totalMatches() > 0) {
      applyAndScroll(currentGlobal());
    }
  }
}

export function unregisterContainer(el: HTMLElement) {
  containers.delete(el);
  clearMarksForContainer(el);
  recomputeMatches();
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

/** Remove <mark> wrappers for a specific container. */
function clearMarksForContainer(el: HTMLElement) {
  const marks = containerMarksMap.get(el);
  if (!marks) return;
  const parents = new Set<Node>();
  for (const mark of marks) {
    const parent = mark.parentNode;
    if (!parent) continue;
    const text = document.createTextNode(mark.textContent ?? "");
    parent.replaceChild(text, mark);
    parents.add(parent);
  }
  for (const parent of parents) {
    parent.normalize();
  }
  containerMarksMap.delete(el);
  if (currentContainerMark && marks.includes(currentContainerMark)) {
    currentContainerMark = null;
  }
}

/** Remove all <mark> wrappers across all containers. */
function clearAllContainerMarks() {
  for (const el of containerMarksMap.keys()) {
    clearMarksForContainer(el);
  }
  currentContainerMark = null;
}

/** Search a single container for query, wrapping matches in <mark>. */
function searchSingleContainer(container: HTMLElement, q: string) {
  clearMarksForContainer(container);
  const lower = q.toLowerCase();
  const marks: HTMLElement[] = [];

  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    null
  );
  const textNodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    textNodes.push(node as Text);
  }

  for (const textNode of textNodes) {
    const text = textNode.textContent ?? "";
    const textLower = text.toLowerCase();
    let startIdx = 0;
    const fragments: (string | HTMLElement)[] = [];
    let found = false;

    while (startIdx < text.length) {
      const matchIdx = textLower.indexOf(lower, startIdx);
      if (matchIdx === -1) {
        fragments.push(text.slice(startIdx));
        break;
      }
      found = true;
      if (matchIdx > startIdx) {
        fragments.push(text.slice(startIdx, matchIdx));
      }
      const mark = document.createElement("mark");
      mark.className = "find-highlight";
      mark.textContent = text.slice(matchIdx, matchIdx + q.length);
      fragments.push(mark);
      marks.push(mark);
      startIdx = matchIdx + q.length;
    }

    if (found && textNode.parentNode) {
      const frag = document.createDocumentFragment();
      for (const f of fragments) {
        frag.appendChild(
          typeof f === "string" ? document.createTextNode(f) : f
        );
      }
      textNode.parentNode.replaceChild(frag, textNode);
    }
  }

  if (marks.length > 0) {
    containerMarksMap.set(container, marks);
  }
}

/** Search all registered containers for query. */
function searchContainers(q: string) {
  clearAllContainerMarks();
  if (!q) return;
  for (const container of containers) {
    searchSingleContainer(container, q);
  }
}

/** Recompute aggregate match count across all editors and containers. */
function recomputeMatches(): number {
  let total = 0;
  forEachEditor((ed) => {
    total += getFindState(ed).matches.length;
  });
  for (const marks of containerMarksMap.values()) {
    total += marks.length;
  }
  setTotalMatches(total);
  return total;
}

/** Resolve a global index to an editor match or a container mark element. */
function resolveGlobalIndex(
  globalIdx: number
):
  | { type: "editor"; editor: TiptapEditor; localIndex: number }
  | { type: "container"; mark: HTMLElement }
  | null {
  let remaining = globalIdx;
  for (const ed of editors) {
    if (ed.isDestroyed) continue;
    const count = getFindState(ed).matches.length;
    if (remaining < count) {
      return { type: "editor", editor: ed, localIndex: remaining };
    }
    remaining -= count;
  }
  // Walk containers in stable iteration order
  for (const container of containers) {
    const marks = containerMarksMap.get(container);
    if (!marks) continue;
    if (remaining < marks.length) {
      return { type: "container", mark: marks[remaining]! };
    }
    remaining -= marks.length;
  }
  return null;
}

/** Highlight exactly one match across all editors/containers and scroll to it. */
function applyAndScroll(globalIdx: number) {
  const target = resolveGlobalIndex(globalIdx);

  // Update editor highlights
  forEachEditor((ed) => {
    setFindIndex(
      ed,
      target?.type === "editor" && target.editor === ed ? target.localIndex : -1
    );
  });

  // Update container mark highlight: only toggle previous and current
  if (currentContainerMark) {
    currentContainerMark.className = "find-highlight";
    currentContainerMark = null;
  }
  if (target?.type === "container") {
    target.mark.className = "find-highlight find-highlight-current";
    currentContainerMark = target.mark;
  }

  // Scroll to target
  if (!target) return;
  if (target.type === "editor") {
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
  } else {
    target.mark.scrollIntoView({ block: "center", behavior: "smooth" });
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
  clearAllContainerMarks();
}

export function updateQuery(q: string) {
  setQuery(q);
  forEachEditor((ed) => setFindQuery(ed, q));
  searchContainers(q);
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
