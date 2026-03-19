import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { openImagePreview } from "../../stores/imagePreviewStore";

/**
 * ProseMirror plugin that shows a magnify icon on hover over images.
 * Clicking the icon opens the ImagePreview modal.
 */
export const ImageMagnifyPlugin = Extension.create({
  name: "imageMagnify",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        view(editorView) {
          let magnifyBtn: HTMLButtonElement | null = null;
          let currentImg: HTMLImageElement | null = null;

          function getContainer(): HTMLElement {
            return (editorView.dom.closest(".prose-editor") ??
              editorView.dom.parentElement ??
              editorView.dom) as HTMLElement;
          }

          function removeMagnify() {
            if (magnifyBtn?.parentElement) magnifyBtn.remove();
            magnifyBtn = null;
            currentImg = null;
          }

          function showMagnify(img: HTMLImageElement) {
            if (currentImg === img && magnifyBtn?.parentElement) {
              positionMagnify(img);
              return;
            }
            removeMagnify();
            currentImg = img;

            const container = getContainer();
            magnifyBtn = document.createElement("button");
            magnifyBtn.className = "image-magnify-btn";
            magnifyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/><path d="M11 8v6M8 11h6"/></svg>`;
            magnifyBtn.addEventListener("mousedown", (e) => {
              e.preventDefault();
              e.stopPropagation();
              if (currentImg) {
                openImagePreview(currentImg.src);
              }
            });

            container.appendChild(magnifyBtn);
            positionMagnify(img);
          }

          function positionMagnify(img: HTMLImageElement) {
            if (!magnifyBtn) return;
            const container = getContainer();
            const containerRect = container.getBoundingClientRect();
            const imgRect = img.getBoundingClientRect();

            magnifyBtn.style.position = "absolute";
            magnifyBtn.style.top = `${imgRect.top - containerRect.top + 4}px`;
            magnifyBtn.style.left = `${imgRect.right - containerRect.left - 28}px`;
            magnifyBtn.style.opacity = "1";
          }

          function handleMouseOver(e: MouseEvent) {
            const target = e.target as HTMLElement;
            if (target.tagName === "IMG") {
              showMagnify(target as HTMLImageElement);
            }
          }

          function handleMouseOut(e: MouseEvent) {
            const target = e.target as HTMLElement;
            const related = e.relatedTarget as HTMLElement | null;
            if (target.tagName === "IMG") {
              // Don't hide if moving to the magnify button
              if (
                related &&
                (related === magnifyBtn || magnifyBtn?.contains(related))
              ) {
                return;
              }
              removeMagnify();
            }
            // Hide if leaving the magnify button (and not going to the image)
            if (target === magnifyBtn || magnifyBtn?.contains(target)) {
              if (related?.tagName !== "IMG") {
                removeMagnify();
              }
            }
          }

          const dom = editorView.dom;
          dom.addEventListener("mouseover", handleMouseOver);
          dom.addEventListener("mouseout", handleMouseOut);

          return {
            destroy() {
              removeMagnify();
              dom.removeEventListener("mouseover", handleMouseOver);
              dom.removeEventListener("mouseout", handleMouseOut);
            },
          };
        },
      }),
    ];
  },
});
