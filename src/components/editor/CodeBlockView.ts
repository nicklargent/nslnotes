import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import type { Editor } from "@tiptap/core";
import { Selection } from "@tiptap/pm/state";

/** Languages available in lowlight's common bundle */
const LANGUAGES = [
  "plaintext",
  "bash",
  "c",
  "cpp",
  "csharp",
  "css",
  "diff",
  "dockerfile",
  "go",
  "graphql",
  "ini",
  "java",
  "javascript",
  "json",
  "kotlin",
  "lua",
  "makefile",
  "markdown",
  "nginx",
  "perl",
  "php",
  "protobuf",
  "python",
  "r",
  "ruby",
  "rust",
  "scss",
  "shell",
  "sql",
  "swift",
  "typescript",
  "xml",
  "yaml",
];

/** Short display aliases for common languages */
const DISPLAY: Record<string, string> = {
  plaintext: "text",
  javascript: "js",
  typescript: "ts",
  csharp: "c#",
  cpp: "c++",
  markdown: "md",
};

function displayName(lang: string): string {
  return DISPLAY[lang] ?? lang;
}

/**
 * Extends CodeBlockLowlight with line numbers and an inline language selector.
 */
export const CodeBlockWithLines = CodeBlockLowlight.extend({
  addKeyboardShortcuts() {
    const parent = this.parent?.() ?? {};
    return {
      ...parent,
      // Override the upstream ArrowDown handler. The default calls
      // `editor.commands.exitCode()` (inserting a fresh paragraph after the
      // code block) when there's no node immediately after the code block in
      // its direct parent. That happens routinely when a code block is the
      // last child of a list item: the inserted paragraph never makes it
      // into the saved markdown, so it appears, persists in the live editor,
      // and vanishes on the next save+reload.
      //
      // Walk up the ancestor chain instead and place the cursor at the first
      // valid position OUTSIDE the trapping parent. If every ancestor is
      // also at its end, fall through to the original handler so we still
      // get a paragraph at the very end of the document.
      ArrowDown: ({ editor }) => {
        const { state } = editor as Editor;
        const { selection, doc } = state;
        const { $from, empty } = selection;
        if (!empty || $from.parent.type !== this.type) {
          return false;
        }
        const isAtEnd = $from.parentOffset === $from.parent.nodeSize - 2;
        if (!isAtEnd) return false;

        // Walk up looking for the nearest ancestor whose own next-sibling
        // position resolves to a real node — that's where the cursor should
        // land instead of synthesizing a paragraph.
        for (let depth = $from.depth; depth > 0; depth--) {
          const after = $from.after(depth);
          if (after === undefined || after >= doc.content.size) continue;
          const nodeAfter = doc.nodeAt(after);
          if (!nodeAfter) continue;
          const tr = state.tr.setSelection(Selection.near(doc.resolve(after)));
          (editor as Editor).view.dispatch(tr);
          return true;
        }
        // Fall through to the upstream behaviour when there is genuinely
        // nothing left in the document.
        const arrow = (parent as Record<string, unknown>)["ArrowDown"];
        return typeof arrow === "function"
          ? (arrow as (props: { editor: Editor }) => boolean)({
              editor: editor as Editor,
            })
          : false;
      },
    };
  },
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const wrapper = document.createElement("div");
      wrapper.classList.add("code-block-wrapper");

      const pre = document.createElement("pre");
      const lineNums = document.createElement("div");
      const code = document.createElement("code");

      lineNums.classList.add("line-numbers");
      lineNums.setAttribute("aria-hidden", "true");

      // Copy button
      const copyBtn = document.createElement("button");
      copyBtn.classList.add("code-copy-btn");
      copyBtn.type = "button";
      copyBtn.tabIndex = -1;
      copyBtn.title = "Copy code";
      copyBtn.innerHTML =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

      copyBtn.addEventListener("click", () => {
        const text = node.textContent;
        navigator.clipboard.writeText(text).then(() => {
          copyBtn.innerHTML =
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
          setTimeout(() => {
            copyBtn.innerHTML =
              '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
          }, 1500);
        });
      });

      // Language selector — native <select> avoids ProseMirror event conflicts
      const langSelect = document.createElement("select");
      langSelect.classList.add("code-lang-select");
      langSelect.tabIndex = -1;

      for (const lang of LANGUAGES) {
        const opt = document.createElement("option");
        opt.value = lang;
        opt.textContent = displayName(lang);
        langSelect.appendChild(opt);
      }

      function updateSelect() {
        langSelect.value = (node.attrs["language"] as string) || "plaintext";
      }

      langSelect.addEventListener("change", () => {
        if (typeof getPos === "function") {
          const pos = getPos() as number;
          const { tr } = (editor as Editor).state;
          tr.setNodeMarkup(pos, undefined, {
            ...node.attrs,
            language: langSelect.value,
          });
          (editor as Editor).view.dispatch(tr);
        }
      });

      const lang = node.attrs["language"] as string;
      if (lang) {
        code.classList.add(`language-${lang}`);
      }
      updateSelect();

      pre.appendChild(lineNums);
      pre.appendChild(code);
      const toolbar = document.createElement("div");
      toolbar.classList.add("code-toolbar");
      toolbar.appendChild(copyBtn);
      toolbar.appendChild(langSelect);
      wrapper.appendChild(toolbar);
      wrapper.appendChild(pre);

      let lastCount = 0;

      function updateLineNumbers() {
        const count = (node.textContent.match(/\n/g) ?? []).length + 1;
        if (count === lastCount) return;
        lastCount = count;

        let nums = "";
        for (let i = 1; i <= count; i++) {
          nums += i + "\n";
        }
        lineNums.textContent = nums;
      }

      updateLineNumbers();

      return {
        dom: wrapper,
        contentDOM: code,
        stopEvent(event: Event) {
          const target = event.target as HTMLElement;
          if (
            target.closest(".code-lang-select") ||
            target.closest(".code-copy-btn")
          ) {
            return true;
          }
          return false;
        },
        update(updatedNode) {
          if (updatedNode.type.name !== node.type.name) return false;
          node = updatedNode;
          const lang = node.attrs["language"] as string;
          code.className = lang ? `language-${lang}` : "";
          updateSelect();
          updateLineNumbers();
          return true;
        },
      };
    };
  },
});
