import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

const imageResizeKey = new PluginKey<number | null>("imageResize");

const MIN_WIDTH = 50;

/**
 * ProseMirror plugin that adds click-to-select and drag-to-resize for images.
 *
 * Uses decorations for the selection border (no DOM reparenting) and an
 * absolutely-positioned overlay handle anchored to the editor container.
 */
export const ImageResizePlugin = Extension.create({
  name: "imageResize",

  addProseMirrorPlugins() {
    return [
      new Plugin<number | null>({
        key: imageResizeKey,
        state: {
          init(): number | null {
            return null;
          },
          apply(tr, value): number | null {
            const meta = tr.getMeta(imageResizeKey) as
              | number
              | null
              | undefined;
            if (meta !== undefined) return meta;
            if (value !== null && tr.docChanged) {
              const mapped = tr.mapping.map(value);
              try {
                const node = tr.doc.nodeAt(mapped);
                if (node?.type.name === "image") return mapped;
              } catch {
                // position out of range
              }
              return null;
            }
            return value;
          },
        },
        props: {
          decorations(state) {
            const pos = imageResizeKey.getState(state);
            if (pos == null) return DecorationSet.empty;
            const node = state.doc.nodeAt(pos);
            if (!node || node.type.name !== "image") return DecorationSet.empty;
            return DecorationSet.create(state.doc, [
              Decoration.node(pos, pos + node.nodeSize, {
                class: "image-resize-selected",
              }),
            ]);
          },
          handleClickOn(view, _pos, node, nodePos, event) {
            if (node.type.name === "image") {
              const target = event.target as HTMLElement;
              if (target.classList.contains("image-resize-handle"))
                return false;
              view.dispatch(view.state.tr.setMeta(imageResizeKey, nodePos));
              return true;
            }
            return false;
          },
          handleClick(view, _pos, event) {
            const target = event.target as HTMLElement;
            if (
              target.tagName !== "IMG" &&
              !target.classList.contains("image-resize-handle")
            ) {
              const current = imageResizeKey.getState(view.state);
              if (current != null) {
                view.dispatch(view.state.tr.setMeta(imageResizeKey, null));
              }
            }
            return false;
          },
        },
        view(editorView) {
          let handle: HTMLDivElement | null = null;
          let selectedImg: HTMLImageElement | null = null;
          let resizing = false;
          let startX = 0;
          let startWidth = 0;
          let maxWidth = 800;
          let cachedContainerRect: DOMRect | null = null;

          function getEditorContainer(): HTMLElement {
            return (editorView.dom.closest(".prose-editor") ??
              editorView.dom.parentElement ??
              editorView.dom) as HTMLElement;
          }

          function removeHandle() {
            if (handle) {
              handle.removeEventListener("mousedown", onHandleMouseDown);
              if (handle.parentElement) handle.remove();
            }
            handle = null;
            selectedImg = null;
          }

          function positionHandle(img: HTMLImageElement) {
            if (!handle) return;
            const container = getEditorContainer();
            const containerRect = container.getBoundingClientRect();
            const imgRect = img.getBoundingClientRect();

            handle.style.top = `${imgRect.bottom - containerRect.top - 4}px`;
            handle.style.left = `${imgRect.right - containerRect.left - 4}px`;
          }

          function positionHandleDuringResize(img: HTMLImageElement) {
            if (!handle || !cachedContainerRect) return;
            const imgRect = img.getBoundingClientRect();
            handle.style.top = `${imgRect.bottom - cachedContainerRect.top - 4}px`;
            handle.style.left = `${imgRect.right - cachedContainerRect.left - 4}px`;
          }

          function showHandle(img: HTMLImageElement) {
            if (selectedImg === img && handle?.parentElement) {
              positionHandle(img);
              return;
            }
            removeHandle();
            selectedImg = img;

            const container = getEditorContainer();
            handle = document.createElement("div");
            handle.className = "image-resize-handle";
            container.appendChild(handle);
            positionHandle(img);

            handle.addEventListener("mousedown", onHandleMouseDown);
          }

          function onHandleMouseDown(e: MouseEvent) {
            e.preventDefault();
            e.stopPropagation();
            if (!selectedImg) return;

            resizing = true;
            startX = e.clientX;
            startWidth = selectedImg.getBoundingClientRect().width;
            const container = getEditorContainer();
            cachedContainerRect = container.getBoundingClientRect();
            maxWidth = container.clientWidth - 2;

            document.addEventListener("mousemove", onMouseMove);
            document.addEventListener("mouseup", onMouseUp);
          }

          let lastClampedWidth = 0;

          function onMouseMove(e: MouseEvent) {
            if (!resizing || !selectedImg) return;
            const dx = e.clientX - startX;
            lastClampedWidth = Math.max(
              MIN_WIDTH,
              Math.min(startWidth + dx, maxWidth)
            );
            selectedImg.style.width = `${lastClampedWidth}px`;
            positionHandleDuringResize(selectedImg);
          }

          function onMouseUp(_e: MouseEvent) {
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
            cachedContainerRect = null;

            if (!resizing || !selectedImg) {
              resizing = false;
              return;
            }
            resizing = false;

            const newWidth = Math.round(lastClampedWidth);
            if (newWidth === 0) return;

            const pos = imageResizeKey.getState(editorView.state);
            if (pos == null) return;

            const node = editorView.state.doc.nodeAt(pos);
            if (!node || node.type.name !== "image") return;

            const tr = editorView.state.tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              width: String(newWidth),
            });
            editorView.dispatch(tr);
          }

          function syncHandle() {
            const selectedPos = imageResizeKey.getState(editorView.state);

            if (selectedPos == null) {
              removeHandle();
              return;
            }

            const domNode = editorView.nodeDOM(selectedPos);
            if (!domNode || !(domNode instanceof HTMLElement)) {
              removeHandle();
              return;
            }

            const img =
              domNode.tagName === "IMG"
                ? (domNode as HTMLImageElement)
                : domNode.querySelector("img");

            if (!img) {
              removeHandle();
              return;
            }

            showHandle(img);
          }

          function getSelectedPos(
            state: EditorState
          ): number | null | undefined {
            return imageResizeKey.getState(state);
          }

          return {
            update(view, prevState) {
              if (resizing) return;
              const currentPos = getSelectedPos(view.state);
              const oldPos = getSelectedPos(prevState);
              if (currentPos === oldPos && view.state.doc.eq(prevState.doc)) {
                return;
              }
              syncHandle();
            },
            destroy() {
              removeHandle();
              document.removeEventListener("mousemove", onMouseMove);
              document.removeEventListener("mouseup", onMouseUp);
            },
          };
        },
      }),
    ];
  },
});
