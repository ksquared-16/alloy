"use client";

import type { SVGProps } from "react";

import { BOS_IDENTITY, BOS_HORIZON_WIDTH_CLASS, type BosIdentitySize } from "@/lib/bos/bosIdentityTokens";

type Props = {
    size?: BosIdentitySize;
    className?: string;
    color?: string;
} & Omit<SVGProps<SVGSVGElement>, "color">;

/**
 * BOS horizon artifact — thin foresight curve. BOS-only; never part of the Alloy logo.
 */
export function BosHorizon({
    size = "md",
    className = "",
    color = BOS_IDENTITY.bendPine,
    ...svgProps
}: Props) {
    return (
        <svg
            viewBox="0 0 80 10"
            className={`${BOS_HORIZON_WIDTH_CLASS[size]} h-[0.35rem] shrink-0 ${className}`.trim()}
            aria-hidden
            preserveAspectRatio="none"
            data-bos-horizon="true"
            {...svgProps}
        >
            <path
                d="M2 8 Q 40 1.5 78 8"
                stroke={color}
                strokeWidth={1.25}
                strokeOpacity={0.42}
                strokeLinecap="round"
                fill="none"
            />
        </svg>
    );
}
