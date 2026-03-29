import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import type { Editor } from "@tiptap/core";

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
