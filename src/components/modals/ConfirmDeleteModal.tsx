import { ConfirmModal } from "./ConfirmModal";

interface ConfirmDeleteModalProps {
  title: string;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDeleteModal(props: ConfirmDeleteModalProps) {
  return (
    <ConfirmModal
      heading="Delete"
      body={<>Delete {props.title}? This cannot be undone.</>}
      confirmLabel="Delete"
      onConfirm={props.onConfirm}
      onClose={props.onClose}
    />
  );
}
