"use client";

const DEFAULT_ITEMS = [
    "Lifecycle configuration and stages on this department",
    "Work unit queue created by this Lifecycle Builder flow (deactivated)",
    "Action placements created for this lifecycle (deactivated)",
    "Your user department access rows for this lifecycle department",
    "The backing department row when it is builder-owned",
] as const;

export default function LifecycleActivationDeleteModal({
    open,
    lifecycleName,
    busy,
    legacy = false,
    onCancel,
    onConfirm,
}: {
    open: boolean;
    lifecycleName: string;
    busy: boolean;
    /** Legacy process removal on a shared department — elevated copy */
    legacy?: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}) {
    if (!open) return null;

    const title = legacy ? "Delete shared lifecycle process?" : "Delete lifecycle?";

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-alloy-midnight/40 p-4"
            role="dialog"
            aria-modal="true"
            data-testid={legacy ? "lifecycle-legacy-delete-modal" : "lifecycle-activation-delete-modal"}
        >
            <div className="max-w-md rounded-xl border border-alloy-forge/15 bg-white p-5 shadow-lg">
                <h3 className="text-sm font-semibold text-alloy-midnight">{title}</h3>
                <p className="mt-2 text-xs leading-relaxed text-alloy-midnight/65">
                    {legacy ? (
                        <>
                            This removes process{" "}
                            <span className="font-medium">{lifecycleName || "this lifecycle"}</span> from shared
                            department configuration. Platform Enrollment, Operations, Finance, Compliance, and
                            System departments are protected.
                        </>
                    ) : (
                        <>
                            This permanently removes{" "}
                            <span className="font-medium">{lifecycleName || "this lifecycle"}</span> and related
                            builder setup:
                        </>
                    )}
                </p>
                {!legacy ? (
                    <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs text-alloy-midnight/65">
                        {DEFAULT_ITEMS.map((item) => (
                            <li key={item}>{item}</li>
                        ))}
                    </ul>
                ) : null}
                <p className="mt-3 text-xs leading-relaxed text-amber-900/90" data-testid="lifecycle-delete-records-warning">
                    Opportunities and other records are <strong>not</strong> deleted. Records that still use this
                    lifecycle&apos;s queue or status labels may need manual review.
                </p>
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                    <button
                        type="button"
                        className="rounded-md border border-alloy-forge/20 px-3 py-1.5 text-xs font-medium"
                        disabled={busy}
                        onClick={onCancel}
                        data-testid="lifecycle-activation-delete-cancel"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="rounded-md bg-red-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                        disabled={busy}
                        onClick={onConfirm}
                        data-testid={legacy ? "lifecycle-legacy-delete-confirm" : "lifecycle-activation-delete-confirm"}
                    >
                        {busy ? "Deleting…" : legacy ? "Delete process" : "Delete lifecycle"}
                    </button>
                </div>
            </div>
        </div>
    );
}
