"use client";

import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
    title?: string;
    children?: ReactNode;
    compact?: boolean;
};

/** BOS accent anchor — white surface, mint only as accent. */
export function ActionWorkspaceBosBanner({
    title = "BOS Assist",
    children,
    compact = false,
}: Props) {
    return (
        <div
            className={
                compact ?
                    "flex items-start gap-3 rounded-xl border border-alloy-stone/10 bg-white px-4 py-3 shadow-[0_1px_0_rgba(24,39,58,0.03)]"
                :   "rounded-2xl border border-alloy-stone/10 bg-white p-5 shadow-[0_1px_0_rgba(24,39,58,0.03)]"
            }
            data-testid="action-workspace-bos-banner"
        >
            <div
                className={
                    compact ?
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#00A283]/10 text-[#00A283]"
                    :   "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#00A283]/10 text-[#00A283]"
                }
                aria-hidden
            >
                <Sparkles className={compact ? "h-4 w-4" : "h-5 w-5"} strokeWidth={2.2} />
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
