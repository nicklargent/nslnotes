import { createSignal, Show } from "solid-js";
import { TrashIcon } from "../icons/TrashIcon";
import { ConfirmDeleteModal } from "../modals/ConfirmDeleteModal";

interface DeleteIconButtonProps {
  buttonTitle: string;
  confirmTitle: string;
  onConfirm: () => void | Promise<void>;
  stopPropagation?: boolean;
}

export function DeleteIconButton(props: DeleteIconButtonProps) {
  const [showModal, setShowModal] = createSignal(false);

  return (
    <>
      <button
        class="rounded p-0.5 text-gray-400 dark:text-gray-500 hover:bg-red-100 hover:text-red-600"
        title={props.buttonTitle}
        onClick={(e) => {
          if (props.stopPropagation) e.stopPropagation();
          setShowModal(true);
        }}
      >
        <TrashIcon />
      </button>
      <Show when={showModal()}>
        <ConfirmDeleteModal
          title={props.confirmTitle}
          onClose={() => setShowModal(false)}
          onConfirm={() => {
            setShowModal(false);
            void props.onConfirm();
          }}
        />
      </Show>
    </>
  );
}
