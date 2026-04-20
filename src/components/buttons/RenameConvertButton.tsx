import { createSignal, Show } from "solid-js";
import { RenameConvertModal } from "../modals/RenameConvertModal";
import type { Entity } from "../../types/entities";

interface RenameConvertButtonProps {
  entity: Entity;
  stopPropagation?: boolean;
}

export function RenameConvertButton(props: RenameConvertButtonProps) {
  const [showModal, setShowModal] = createSignal(false);

  return (
    <>
      <button
        class="rounded p-0.5 text-gray-400 dark:text-gray-500 hover:bg-blue-100 hover:text-blue-600"
        title="Rename / Convert"
        onClick={(e) => {
          if (props.stopPropagation) e.stopPropagation();
          setShowModal(true);
        }}
      >
        <svg
          class="h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
          />
        </svg>
      </button>
      <Show when={showModal()}>
        <RenameConvertModal
          entity={props.entity}
          onClose={() => setShowModal(false)}
        />
      </Show>
    </>
  );
}
