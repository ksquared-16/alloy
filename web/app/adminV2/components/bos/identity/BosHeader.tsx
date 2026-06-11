"use client";

import {
    BOS_DEFAULT_HEADER_SUBTITLE,
    BOS_DEFAULT_HEADER_TITLE,
    BOS_IDENTITY,
    type BosIdentitySize,
} from "@/lib/bos/bosIdentityTokens";

import { BosMark } from "@/app/adminV2/components/bos/identity/BosMark";

type Props = {
    title?: string;
    subtitle?: string;
    size?: BosIdentitySize;
    /** On midnight-forge or dark chrome — mark stays pine, no badge container. */
    onDark?: boolean;
    className?: string;
    titleId?: string;
};

const MARK_SIZE: Record<BosIdentitySize, BosIdentitySize> = {
    sm: "sm",
    md: "sm",
    lg: "md",
};

/**
 * BOS header — distant focal mark + title stack. No logo lockup containers.
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

    const markColor = onDark ? BOS_IDENTITY.bendPine : undefined;

    return (
        <div className={`flex min-w-0 items-start gap-3.5 ${className}`.trim()} data-bos-header="true">
            <div className="shrink-0 pt-0.5" aria-hidden>
                <BosMark size={MARK_SIZE[size]} horizon color={markColor} />
            </div>
            <div className="min-w-0 flex-1 text-left">
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
