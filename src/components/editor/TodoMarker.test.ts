// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Strike from "@tiptap/extension-strike";
import { TodoMarker } from "./TodoMarker";
import { parseMarkdown, serializeMarkdown } from "./pmMarkdown";

function makeEditor(md: string): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({
    element,
    extensions: [StarterKit.configure({ strike: false }), Strike, TodoMarker],
    content: parseMarkdown(md).toJSON(),
  });
}

describe("TodoMarker — rendered HTML matches CSS conventions", () => {
  let editor: Editor | null = null;
  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  it("renders TODO with class todo-open (matches markdown-it's class)", () => {
    editor = makeEditor("TODO foo");
    const html = editor.getHTML();
    // The class on the marker must match the CSS rule names
    expect(html).toContain("todo-marker");
    expect(html).toContain("todo-open");
    expect(html).not.toContain("todo-todo"); // common bug: state.toLowerCase()
    expect(html).toContain('data-todo="TODO"');
  });

  it("renders DONE with class todo-done", () => {
    editor = makeEditor("DONE foo");
    const html = editor.getHTML();
    expect(html).toContain("todo-done");
    expect(html).toContain('data-todo="DONE"');
  });

  it("renders DOING with class todo-doing", () => {
    editor = makeEditor("DOING foo");
    const html = editor.getHTML();
    expect(html).toContain("todo-doing");
  });

  it("renders the keyword label inside .todo-label", () => {
    editor = makeEditor("TODO foo");
    const html = editor.getHTML();
    expect(html).toContain('class="todo-label todo-open"');
    expect(html).toMatch(/<span[^>]*class="todo-label[^>]*>TODO<\/span>/);
  });

  it("places .todo-marker (the glyph) and .todo-label as separate elements (so width:1.125rem doesn't clip the label)", () => {
    editor = makeEditor("TODO foo");
    const html = editor.getHTML();
    // The marker class should not wrap the label — they should be siblings
    // within the data-todo wrapper.
    const markerSpanRe =
      /<span[^>]*class="todo-marker[^"]*"[^>]*>([^<]*)<\/span>/;
    const match = html.match(markerSpanRe);
    expect(match).not.toBeNull();
    if (match) {
      // The marker span should contain only the glyph, not the label
      expect(match[1]).not.toContain("TODO");
    }
  });
});

describe("TodoMarker — round-trip through editor preserves markdown", () => {
  let editor: Editor | null = null;
  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  function rt(md: string): string {
    editor?.destroy();
    editor = makeEditor(md);
    return serializeMarkdown(editor.state.doc).trim();
  }

  it("TODO foo", () => {
    expect(rt("TODO foo")).toBe("TODO foo");
  });

  it("DOING foo", () => {
    expect(rt("DOING foo")).toBe("DOING foo");
  });

  it("DONE foo (preserves strike on rest-of-line implicitly)", () => {
    expect(rt("DONE foo")).toBe("DONE foo");
  });

  it("- TODO foo (in list)", () => {
    expect(rt("- TODO buy milk")).toBe("- TODO buy milk");
  });

  it("two TODOs in adjacent paragraphs", () => {
    expect(rt("TODO one\n\nTODO two")).toBe("TODO one\n\nTODO two");
  });
});

// Input rules are verified manually in the live editor — programmatic
// insertContent bypasses prosemirror-inputrules' textInput handler, so a
// vitest exercise here would require simulating real DOM events.
