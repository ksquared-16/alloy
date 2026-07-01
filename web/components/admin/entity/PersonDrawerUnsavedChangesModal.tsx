"use client";

/** Branded discard prompt when leaving a person drawer with unsaved operating edits. */
export default function PersonDrawerUnsavedChangesModal({
    isOpen,
    onContinueEditing,
    onDiscard,
}: {
    isOpen: boolean;
    onContinueEditing: () => void;
    onDiscard: () => void;
}) {
    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50"
            role="dialog"
            aria-modal="true"
            aria-labelledby="person-drawer-unsaved-title"
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) onContinueEditing();
            }}
        >
            <div
                className="mx-4 w-full max-w-md rounded-lg border border-alloy-stone/30 bg-white p-5 shadow-lg"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <h3
                    id="person-drawer-unsaved-title"
                    className="mb-2 text-base font-semibold text-alloy-midnight"
                >
                    Unsaved Changes
                </h3>
                <p className="mb-1 text-sm text-alloy-midnight/80">
                    You have unsaved changes to this record.
                </p>
                <p className="mb-4 text-sm text-alloy-midnight/70">What would you like to do?</p>
                <div className="flex flex-wrap justify-end gap-2">
                    <button
                        type="button"
                        onClick={onContinueEditing}
                        className="rounded-md border border-alloy-stone/40 bg-white px-3 py-1.5 text-sm font-medium text-alloy-midnight hover:bg-alloy-stone/15"
                        data-person-drawer-unsaved-continue="true"
                    >
                        Continue Editing
                    </button>
                    <button
                        type="button"
                        onClick={onDiscard}
                        className="rounded-md border border-alloy-stone/40 bg-alloy-stone/10 px-3 py-1.5 text-sm font-medium text-alloy-midnight hover:bg-alloy-stone/20"
                        data-person-drawer-unsaved-discard="true"
                    >
                        Discard Changes
                    </button>
                </div>
            </div>
        </div>
    );
}
