import { ConfirmModal } from "./ConfirmModal";

interface ConfirmDiscardChangesModalProps {
  /** What the user is switching to (e.g. `Notebook "Personal"`). */
  target: string;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDiscardChangesModal(
  props: ConfirmDiscardChangesModalProps
) {
  return (
    <ConfirmModal
      heading="Unsaved changes"
      body={
        <>
          You have unsaved changes. Discard them and switch to {props.target}?
        </>
      }
      confirmLabel="Discard and switch"
      onConfirm={props.onConfirm}
      onClose={props.onClose}
    />
  );
}
