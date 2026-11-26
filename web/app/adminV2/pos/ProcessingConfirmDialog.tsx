"use client";

import ProcessingAlloyDialog from "./ProcessingAlloyDialog";

/** Destructive / irreversible action confirmation — Alloy dialog, not browser confirm. */
export default function ProcessingConfirmDialog({
    open,
    onClose,
    onConfirm,
    title,
    body,
    confirmLabel,
    confirming = false,
    testId,
}: {
    open: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    body: string;
    confirmLabel: string;
    confirming?: boolean;
    testId?: string;
}) {
    return (
        <ProcessingAlloyDialog
            open={open}
            onClose={onClose}
            title={title}
            subtitle={body}
            testId={testId}
            footer={
                <>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={confirming}
                        className="rounded-lg border border-alloy-stone/20 bg-white px-4 py-2 text-[12px] font-semibold text-alloy-midnight/70 hover:bg-alloy-stone/[0.06]"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={confirming}
                        className="rounded-lg bg-rose-600 px-4 py-2 text-[12px] font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                        data-testid={testId ? `${testId}-confirm` : undefined}
                    >
                        {confirming ? "Working…" : confirmLabel}
                    </button>
                </>
            }
        >
            <p className="text-[13px] leading-relaxed text-alloy-midnight/60">This action cannot be undone from the Processing workspace.</p>
        </ProcessingAlloyDialog>
    );
}
