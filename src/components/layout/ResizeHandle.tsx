interface ResizeHandleProps {
  onResize: (deltaX: number) => void;
  onResizeEnd: () => void;
}

/**
 * Vertical drag handle for resizing adjacent columns.
 */
export function ResizeHandle(props: ResizeHandleProps) {
  let startX = 0;

  function onMouseDown(e: MouseEvent) {
    e.preventDefault();
    startX = e.clientX;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  function onMouseMove(e: MouseEvent) {
    const delta = e.clientX - startX;
    startX = e.clientX;
    props.onResize(delta);
  }

  function onMouseUp() {
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    props.onResizeEnd();
  }

  return (
    <div
      class="flex w-1 cursor-col-resize items-center justify-center bg-gray-200 transition-colors hover:bg-blue-300 active:bg-blue-400"
      onMouseDown={onMouseDown}
    />
  );
}
