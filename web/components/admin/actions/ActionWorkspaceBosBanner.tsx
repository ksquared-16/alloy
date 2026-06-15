"use client";

import type { ReactNode } from "react";

import { BosMark } from "@/app/adminV2/components/bos/identity/BosMark";

type Props = {
    title?: string;
    children?: ReactNode;
    compact?: boolean;
};

/** BOS accent anchor — standalone mark + horizon, no badge container. */
export function ActionWorkspaceBosBanner({
    title = "BOS Assist",
    children,
    compact = false,
}: Props) {
    return (
        <div
            className={
                compact ?
                    "flex items-start gap-3.5 rounded-xl border border-alloy-stone/10 bg-white px-4 py-3 shadow-[0_1px_0_rgba(24,39,58,0.03)]"
                :   "flex items-start gap-3.5 rounded-2xl border border-alloy-stone/10 bg-white p-5 shadow-[0_1px_0_rgba(24,39,58,0.03)]"
            }
            data-testid="action-workspace-bos-banner"
        >
            <div className="shrink-0 pt-0.5" aria-hidden>
                <BosMark size={compact ? "sm" : "md"} horizon />
            </div>
            <div className="min-w-0 flex-1">
                <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-alloy-midnight/45">
                    {title}
                </div>
                {children ?
                    <div
                        className={
                            compact ?
                                "mt-0.5 text-[13px] leading-relaxed text-alloy-midnight/70"
                            :   "mt-1 text-[14px] leading-relaxed text-alloy-midnight/70"
                        }
                    >
                        {children}
                    </div>
                :   null}
            </div>
        </div>
    );
}
