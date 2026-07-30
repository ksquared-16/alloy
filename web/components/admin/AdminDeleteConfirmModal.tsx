"use client";

/**
 * Reusable confirmation modal for admin delete actions.
 * Use only for admin/super-user delete; permission must be enforced server-side as well.
 */
export function AdminDeleteConfirmModal({
    isOpen,
    onClose,
    onConfirm,
    recordLabel,
    entityTypeLabel,
    isLoading,
}: {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void | Promise<void>;
    recordLabel: string;
    entityTypeLabel: string;
    isLoading?: boolean;
}) {
    if (!isOpen) return null;

    const handleConfirm = () => {
        void Promise.resolve(onConfirm()).catch(() => {});
    };

    return (
        <div
            className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/50"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-delete-modal-title"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-lg shadow-lg border border-alloy-stone/30 p-5 max-w-md w-full mx-4"
                onClick={(e) => e.stopPropagation()}
            >
                <h3 id="admin-delete-modal-title" className="text-base font-semibold text-alloy-midnight mb-2">
                    Delete {entityTypeLabel}?
                </h3>
                <p className="text-sm text-alloy-midnight/80 mb-1">
                    This will permanently remove <strong>{recordLabel || "this record"}</strong>. This action cannot be undone.
                </p>
                <p className="text-sm text-alloy-ember font-medium mb-4">This is destructive and cannot be undone.</p>
                <div className="flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isLoading}
                        className="px-3 py-1.5 text-sm border border-alloy-stone/40 rounded hover:bg-alloy-stone/20 disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirm}
                        disabled={isLoading}
                        className="px-3 py-1.5 text-sm bg-alloy-ember text-white rounded hover:opacity-90 disabled:opacity-50"
                    >
                        {isLoading ? "Deleting…" : "Delete permanently"}
                    </button>
                </div>
            </div>
        </div>
    );
}
