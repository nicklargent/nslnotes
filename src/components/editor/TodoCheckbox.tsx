import type { TodoState } from "../../types/inline";

interface TodoCheckboxProps {
  state: TodoState;
  onCycle: () => void;
}

/**
 * Visual indicator for TODO state (T5.9, T5.10).
 * Click cycles: TODO -> DOING -> DONE -> TODO
 */
export function TodoCheckbox(props: TodoCheckboxProps) {
  const icon = () => {
    switch (props.state) {
      case "TODO":
        return "\u2610"; // Empty checkbox
      case "DOING":
        return "\u270e"; // Pencil
      case "DONE":
        return "\u2611"; // Checked checkbox
    }
  };

  const colorClass = () => {
    switch (props.state) {
      case "TODO":
        return "text-gray-400";
      case "DOING":
        return "text-blue-500";
      case "DONE":
        return "text-green-500";
    }
  };

  return (
    <button
      class={`inline-flex cursor-pointer select-none items-center justify-center text-base ${colorClass()}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        props.onCycle();
      }}
    >
      {icon()}
    </button>
  );
}
