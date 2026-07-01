"use client";

import type { ReactNode } from "react";
import { ActionModalOverlayShell } from "@/components/admin/opportunity/actions/ActionModalOverlayShell";

type Props = {
    open: boolean;
    onClose: () => void;
    busy?: boolean;
    title: string;
    description?: string;
    children: ReactNode;
    footer?: ReactNode;
    panelClassName?: string;
    "data-testid"?: string;
};

/** Shared header/footer chrome for config-driven action intake modals. */
export function ActionIntakeModalShell({
    open,
    onClose,
    busy = false,
    title,
    description,
    children,
    footer,
    panelClassName = "flex max-h-[90vh] w-[92vw] max-w-[600px] flex-col overflow-hidden rounded-2xl border border-admin-border bg-white shadow-xl",
    "data-testid": dataTestId,
}: Props) {
    return (
        <ActionModalOverlayShell
            open={open}
            onClose={onClose}
            busy={busy}
            panelClassName={panelClassName}
            data-testid={dataTestId}
        >
            <div role="dialog" aria-modal="true" aria-label={title}>
                <div className="flex shrink-0 items-start justify-between gap-3 border-b border-alloy-stone/15 px-5 py-4">
                    <div className="min-w-0">
                        <div className="text-base font-semibold text-alloy-midnight">{title}</div>
                        {description ?
                            <p className="mt-1 text-[13px] leading-relaxed text-alloy-midnight/65">
                                {description}
                            </p>
                        :   null}
                    </div>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={onClose}
                        className="shrink-0 text-xs font-semibold text-alloy-midnight/60 hover:text-alloy-midnight disabled:opacity-50"
                    >
                        Close
                    </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

                {footer ?
                    <div className="flex shrink-0 items-center justify-end gap-2 border-t border-alloy-stone/15 px-5 py-4">
                        {footer}
                    </div>
                :   null}
            </div>
        </ActionModalOverlayShell>
    );
}
