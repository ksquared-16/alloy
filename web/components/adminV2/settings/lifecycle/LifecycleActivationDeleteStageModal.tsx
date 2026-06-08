"use client";

export default function LifecycleActivationDeleteStageModal({
    open,
    stageLabel,
    busy,
    onCancel,
    onConfirm,
}: {
    open: boolean;
    stageLabel: string;
    busy: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}) {
    if (!open) return null;
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-alloy-midnight/40 p-4"
            role="dialog"
            aria-modal="true"
            data-testid="lifecycle-activation-delete-stage-modal"
        >
            <div className="max-w-md rounded-xl border border-alloy-forge/15 bg-white p-5 shadow-lg">
                <h3 className="text-sm font-semibold text-alloy-midnight">Delete stage?</h3>
                <p className="mt-2 text-xs leading-relaxed text-alloy-midnight/65">
                    Remove stage <span className="font-medium">{stageLabel || "this stage"}</span> from this
                    builder-owned Lifecycle. Status bindings and queue filters for this stage will need to be
                    reconfigured.
                </p>
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                    <button
                        type="button"
                        className="rounded-md border border-alloy-forge/20 px-3 py-1.5 text-xs font-medium"
                        disabled={busy}
                        onClick={onCancel}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="rounded-md bg-red-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                        disabled={busy}
                        onClick={onConfirm}
                        data-testid="lifecycle-activation-delete-stage-confirm"
                    >
                        {busy ? "Deleting…" : "Delete stage"}
                    </button>
                </div>
            </div>
        </div>
    );
}
