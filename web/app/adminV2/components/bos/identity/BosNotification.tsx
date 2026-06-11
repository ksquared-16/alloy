"use client";

import type { ReactNode } from "react";

import { BosMark } from "@/app/adminV2/components/bos/identity/BosMark";

type Props = {
    title?: string;
    message: ReactNode;
    actionLabel?: string;
    onAction?: () => void;
    className?: string;
    "data-testid"?: string;
};

/**
 * BOS notification — insight-ready card with optional action link.
 */
export function BosNotification({
    title = "BOS Insight Ready",
    message,
    actionLabel = "View insights →",
    onAction,
    className = "",
    "data-testid": dataTestId = "bos-notification",
}: Props) {
    return (
        <div
            className={`rounded-xl border border-[#00A283]/15 bg-gradient-to-br from-[#00A283]/[0.06] via-white to-white px-4 py-3.5 shadow-[0_1px_0_rgba(39,63,82,0.04)] ${className}`.trim()}
            role="status"
            data-bos-notification="true"
            data-testid={dataTestId}
        >
            <div className="flex items-start gap-3">
                <span
                    className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#00A283]/10"
                    aria-hidden
                >
                    <BosMark size="sm" horizon />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-alloy-midnight">{title}</p>
                    <div className="mt-0.5 text-[12px] leading-snug text-alloy-midnight/65">{message}</div>
                    {onAction ?
                        <button
                            type="button"
                            onClick={onAction}
                            className="mt-2 text-[12px] font-semibold text-[#007A63] hover:text-[#005f4d]"
                        >
                            {actionLabel}
                        </button>
                    :   null}
                </div>
            </div>
        </div>
    );
}
