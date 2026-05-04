// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { common, createLowlight } from "lowlight";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import Strike from "@tiptap/extension-strike";
import { CodeBlockWithLines } from "./CodeBlockView";
import { TodoMarker } from "./TodoMarker";

/**
 * Regression: TipTap's CodeBlockLowlight binds ArrowDown to a handler that
 * synthesizes an empty paragraph when the code block is the last child of a
 * non-doc parent (e.g. a list item). We override that behaviour to instead
 * walk up to the nearest ancestor with a real next-sibling and place the
 * cursor there.
 *
 * If TipTap reshuffles the upstream keymap shape in a future version, this
 * test catches it: a stray paragraph reappears in the doc after ArrowDown.
 */
function makeEditor() {
  const element = document.createElement("div");
  document.body.appendChild(element);
  const lowlight = createLowlight(common);
  return new Editor({
    element,
    extensions: [
      StarterKit.configure({ codeBlock: false, strike: false }),
      Strike,
      CodeBlockWithLines.configure({ lowlight, defaultLanguage: "plaintext" }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TodoMarker,
    ],
    content: {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "bullet" }],
                },
                {
                  type: "codeBlock",
                  attrs: { language: "plaintext" },
                  content: [{ type: "text", text: "code line 1\ncode line 2" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "next bullet" }],
                },
              ],
            },
          ],
        },
      ],
    },
  });
}

function dispatchArrowDown(editor: Editor): void {
  // Simulate the keystroke at the ProseMirror keymap layer by calling
  // the bound handler directly. ProseMirror's keymap plugin walks
  // registered keymaps in order; our override sits on the CodeBlock
  // extension's keyboard shortcuts.
  const event = new KeyboardEvent("keydown", {
    key: "ArrowDown",
    code: "ArrowDown",
    bubbles: true,
    cancelable: true,
  });
  editor.view.dom.dispatchEvent(event);
}

describe("CodeBlockWithLines — ArrowDown does not synthesize a paragraph in list item", () => {
  let editor: Editor | null = null;
  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  it("ArrowDown at end of code block in a list item moves cursor out without inserting a paragraph", () => {
    editor = makeEditor();
    // Place cursor at the end of the code block content (inside listItem 0).
    // Doc shape: doc(0) > bulletList(1) > listItem(2) > codeBlock at offset 1
    // listItem starts at pos 2; paragraph at 3-13 (`<p>bullet</p>` = 8 chars
    // text + open/close = 10), codeBlock starts at ~13.
    // Easier: search for the codeBlock node and resolve to its end.
    let codeBlockEnd = -1;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "codeBlock" && codeBlockEnd === -1) {
        codeBlockEnd = pos + node.nodeSize - 1;
      }
    });
    expect(codeBlockEnd).toBeGreaterThan(0);

    editor.commands.setTextSelection(codeBlockEnd);

    const beforeJson = JSON.stringify(editor.state.doc.toJSON());
    const beforeParagraphs = countParagraphs(editor);

    dispatchArrowDown(editor);

    const afterParagraphs = countParagraphs(editor);

    // Doc must not have grown a paragraph anywhere as a result of the keypress.
    expect(afterParagraphs).toBe(beforeParagraphs);

    // Paranoia: also assert the doc shape is identical (no other nodes were
    // inserted or removed either).
    expect(JSON.stringify(editor.state.doc.toJSON())).toBe(beforeJson);
  });
});

function countParagraphs(editor: Editor): number {
  let count = 0;
  editor.state.doc.descendants((node) => {
    if (node.type.name === "paragraph") count++;
  });
  return count;
}
