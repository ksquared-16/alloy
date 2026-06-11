"use client";

import {
    BOS_DEFAULT_HEADER_SUBTITLE,
    BOS_DEFAULT_HEADER_TITLE,
    type BosIdentitySize,
} from "@/lib/bos/bosIdentityTokens";

import { BosMark } from "@/app/adminV2/components/bos/identity/BosMark";

type Props = {
    title?: string;
    subtitle?: string;
    size?: BosIdentitySize;
    /** On midnight-forge or dark chrome. */
    onDark?: boolean;
    className?: string;
    titleId?: string;
};

/**
 * BOS header — mark + title + operational intelligence subtitle.
 * Reusable in drawers, modals, workspace shells, and recommendation panels.
 */
export function BosHeader({
    title = BOS_DEFAULT_HEADER_TITLE,
    subtitle = BOS_DEFAULT_HEADER_SUBTITLE,
    size = "md",
    onDark = false,
    className = "",
    titleId,
}: Props) {
    const titleClass =
        size === "lg" ? "text-xl font-bold tracking-tight"
        : size === "sm" ? "text-sm font-semibold"
        : "text-base font-bold tracking-tight";

    const subtitleClass =
        onDark ? "text-[11px] leading-snug text-white/48"
        : size === "sm" ? "text-[10px] leading-snug text-alloy-midnight/50"
        : "text-[11px] leading-snug text-alloy-midnight/50";

    const markWrapClass =
        onDark ?
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#00A283]/20"
        :   "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#00A283]/10";

    return (
        <div className={`flex min-w-0 items-center gap-3 ${className}`.trim()} data-bos-header="true">
            <span className={markWrapClass} aria-hidden>
                <BosMark size={size === "lg" ? "md" : size === "sm" ? "sm" : "md"} horizon />
            </span>
            <div className="min-w-0 text-left">
                <div
                    id={titleId}
                    className={`${titleClass} ${onDark ? "text-white" : "text-alloy-midnight"}`}
                >
                    {title}
                </div>
                <p className={`mt-0.5 ${subtitleClass}`}>{subtitle}</p>
            </div>
        </div>
    );
}
