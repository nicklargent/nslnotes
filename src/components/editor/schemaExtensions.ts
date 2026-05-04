/**
 * Single source of truth for the TipTap extensions used by the live editor
 * AND the markdown round-trip pipeline. Every extension that contributes to
 * the schema (nodes, marks, attributes) or that customizes parseHTML /
 * renderHTML lives here. UI-only extensions (Placeholder, decoration plugins)
 * are added on top in `editorExtensions(...)` below.
 *
 * Why a shared module: the markdown parser uses `getSchema(schemaExtensions)`
 * to build a PM Schema before any editor exists, while the live editor builds
 * its own Schema from its extension list at construction time. Sharing this
 * list guarantees the two schemas have the same shape — drift here would
 * mean parser-produced JSON could be silently coerced or rejected when fed
 * back into the editor.
 */
import type { Extensions } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { common, createLowlight } from "lowlight";
import nginx from "highlight.js/lib/languages/nginx";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import protobuf from "highlight.js/lib/languages/protobuf";
import Strike from "@tiptap/extension-strike";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Underline from "@tiptap/extension-underline";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { CodeBlockWithLines } from "./CodeBlockView";
import { TodoMarker } from "./TodoMarker";
import { isExternalUrl } from "../../lib/url";

const lowlightInstance = (() => {
  const ll = createLowlight(common);
  ll.register("nginx", nginx);
  ll.register("dockerfile", dockerfile);
  ll.register("protobuf", protobuf);
  return ll;
})();

/** Custom Link with raw-text rendering (we treat `[text](url)` as plain text). */
const CustomLink = Link.extend({
  // Disable Link's built-in paste rules — we handle links as raw markdown
  // text and convert via linkMarkToRawText plugin in InlineDecorations.
  addPasteRules() {
    return [];
  },
  renderHTML({ HTMLAttributes }) {
    // Render without href/target to prevent browser navigation. Store href
    // as data-href; mark attributes retain the real href.
    const attrs = HTMLAttributes as Record<string, unknown>;
    const href = attrs["href"];
    const out: Record<string, unknown> = { "data-href": href };
    if (typeof href === "string" && isExternalUrl(href)) {
      out["data-external"] = "true";
    }
    return ["a", out, 0];
  },
  parseHTML() {
    return [
      {
        tag: "a[href]",
        getAttrs: (node: string | HTMLElement) => {
          if (typeof node === "string") return false;
          const href = node.getAttribute("href");
          return href ? { href } : false;
        },
      },
      {
        tag: "a[data-href]",
        getAttrs: (node: string | HTMLElement) => {
          if (typeof node === "string") return false;
          const href = node.getAttribute("data-href");
          return href ? { href } : false;
        },
      },
    ];
  },
}).configure({
  openOnClick: false,
  autolink: false,
  linkOnPaste: false,
});

/** Image with a `width` attribute and a runtime trailing-paragraph guard. */
const CustomImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => element.getAttribute("width"),
        renderHTML: (attributes) => {
          if (!attributes["width"]) return {};
          return {
            width: attributes["width"],
            style: `width: ${attributes["width"]}px`,
          };
        },
      },
    };
  },
  addProseMirrorPlugins() {
    // Ensure a paragraph always exists after block nodes that trap the cursor
    // (codeBlock, table, horizontalRule), so there's somewhere to click/type
    // at the end of the doc. Image is now inline, so it isn't included in
    // the trapping set — but the plugin is attached to Image purely for
    // historical reasons; it could equally well live elsewhere.
    return [
      new Plugin({
        key: new PluginKey("trailingParagraph"),
        appendTransaction(_transactions, _oldState, newState) {
          if (!_transactions.some((t) => t.docChanged)) return null;
          const { doc, schema, tr } = newState;
          const paragraph = schema.nodes["paragraph"];
          if (!paragraph) return null;
          const trapping = new Set(["codeBlock", "table", "horizontalRule"]);
          let changed = false;
          for (let i = doc.childCount - 1; i >= 0; i--) {
            const child = doc.child(i);
            if (!trapping.has(child.type.name)) continue;
            const isLast = i === doc.childCount - 1;
            const nextIsTrapping =
              !isLast && trapping.has(doc.child(i + 1).type.name);
            if (isLast || nextIsTrapping) {
              let pos = 0;
              for (let j = 0; j <= i; j++) pos += doc.child(j).nodeSize;
              tr.insert(pos, paragraph.create());
              changed = true;
            }
          }
          return changed ? tr : null;
        },
      }),
    ];
  },
}).configure({
  inline: true,
  allowBase64: false,
});

/**
 * Schema-contributing extensions. Used by both the live editor (via
 * `editorExtensions`) and the markdown parser (via `getSchema`).
 */
export const schemaExtensions: Extensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    dropcursor: { color: "var(--color-link)", width: 2 },
    codeBlock: false,
    strike: false,
  }),
  Strike.extend({ keepOnSplit: false }),
  CodeBlockWithLines.configure({
    lowlight: lowlightInstance,
    defaultLanguage: "plaintext",
  }),
  CustomLink,
  CustomImage,
  Underline,
  TaskList,
  TaskItem.configure({ nested: true }),
  Table.configure({ resizable: true, handleWidth: 5, cellMinWidth: 80 }),
  TableRow,
  TableHeader,
  TableCell,
  TodoMarker,
];

/**
 * Build the full extension list for the live editor: schema-contributing
 * extensions plus UI-only plugins. The dynamic bits (placeholder text,
 * decorations) are passed in.
 */
export function editorExtensions(opts: {
  placeholder?: string | undefined;
  uiPlugins: Extensions;
}): Extensions {
  // The order of UI plugins matters less than the schema-contributing ones,
  // but Placeholder ought to come early so its decorations layer beneath
  // selection-aware ones.
  return [...schemaExtensions, ...opts.uiPlugins];
}
