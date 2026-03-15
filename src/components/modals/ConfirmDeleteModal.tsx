interface ConfirmDeleteModalProps {
  title: string;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDeleteModal(props: ConfirmDeleteModalProps) {
  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div class="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
        <h2 class="mb-4 text-lg font-semibold text-gray-800">Delete</h2>
        <p class="mb-6 text-sm text-gray-600">
          Delete {props.title}? This cannot be undone.
        </p>
        <div class="flex justify-end gap-2">
          <button
            class="rounded px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
            onClick={() => props.onClose()}
          >
            Cancel
          </button>
          <button
            class="rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
            onClick={() => props.onConfirm()}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
