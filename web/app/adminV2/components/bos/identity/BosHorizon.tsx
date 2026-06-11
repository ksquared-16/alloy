"use client";

import type { SVGProps } from "react";

import { BOS_IDENTITY, BOS_HORIZON_WIDTH_CLASS, type BosIdentitySize } from "@/lib/bos/bosIdentityTokens";

type Props = {
    size?: BosIdentitySize;
    className?: string;
    color?: string;
    /** Secondary atmospheric wave beneath the primary horizon line. */
    showWave?: boolean;
} & Omit<SVGProps<SVGSVGElement>, "color">;

const HEIGHT_CLASS: Record<BosIdentitySize, string> = {
    sm: "h-[0.45rem]",
    md: "h-[0.55rem]",
    lg: "h-[0.65rem]",
};

/**
 * BOS horizon artifact — primary foresight curve + optional secondary wave.
 * BOS-only; never part of the Alloy logo.
 */
export function BosHorizon({
    size = "md",
    className = "",
    color = BOS_IDENTITY.bendPine,
    showWave = true,
    ...svgProps
}: Props) {
    return (
        <svg
            viewBox="0 0 80 14"
            className={`${BOS_HORIZON_WIDTH_CLASS[size]} ${HEIGHT_CLASS[size]} shrink-0 ${className}`.trim()}
            aria-hidden
            preserveAspectRatio="none"
            data-bos-horizon="true"
            {...svgProps}
        >
            <path
                d="M2 5.5 Q 40 1.25 78 5.5"
                stroke={color}
                strokeWidth={1.25}
                strokeOpacity={0.52}
                strokeLinecap="round"
                fill="none"
                data-bos-horizon-primary="true"
            />
            {showWave ?
                <path
                    d="M1 11.5 Q 22 8.75 40 9.75 T 79 11.5"
                    stroke={color}
                    strokeWidth={0.75}
                    strokeOpacity={0.22}
                    strokeLinecap="round"
                    fill="none"
                    data-bos-horizon-wave="true"
                />
            :   null}
        </svg>
    );
}
