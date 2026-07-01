"use client";

import type { ReactNode } from "react";
import { ActionModalOverlayShell } from "@/components/admin/opportunity/actions/ActionModalOverlayShell";

type Props = {
    open: boolean;
    title: string;
    description?: string;
    busy?: boolean;
    onClose: () => void;
    onSubmit?: () => void;
    submitLabel?: string;
    submitDisabled?: boolean;
    testId?: string;
    children: ReactNode;
};

export default function OperationalEnrollmentModalChrome({
    open,
    title,
    description,
    busy = false,
    onClose,
    onSubmit,
    submitLabel = "Save",
    submitDisabled = false,
    testId,
    children,
}: Props) {
    return (
        <ActionModalOverlayShell open={open} onClose={onClose} busy={busy} data-testid={testId}>
            <div data-operational-enrollment-modal="true">
                <div className="border-b border-alloy-stone/15 px-5 py-4">
                    <div className="text-base font-semibold text-alloy-midnight">{title}</div>
                    {description ?
                        <p className="mt-0.5 text-sm text-alloy-midnight/65">{description}</p>
                    :   null}
                </div>
                <div className="space-y-3 px-5 py-4">{children}</div>
                <div className="flex justify-end gap-2 border-t border-alloy-stone/15 px-5 py-4">
                    <button
                        type="button"
                        className="rounded-lg border border-alloy-stone/25 px-3 py-2 text-sm font-semibold text-alloy-midnight hover:bg-alloy-stone/10"
                        disabled={busy}
                        onClick={onClose}
                    >
                        Cancel
                    </button>
                    {onSubmit ?
                        <button
                            type="button"
                            className="rounded-lg bg-alloy-midnight px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                            disabled={busy || submitDisabled}
                            data-operational-enrollment-modal-submit="true"
                            onClick={onSubmit}
                        >
                            {submitLabel}
                        </button>
                    :   null}
                </div>
            </div>
        </ActionModalOverlayShell>
    );
}
