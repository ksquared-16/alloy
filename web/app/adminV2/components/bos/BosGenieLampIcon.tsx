"use client";

import type { SVGProps } from "react";

import { palette } from "@/styles/tokens/colors";

export type BosGenieLampIconSize = "sm" | "md" | "base" | "lg";

const SIZE_CLASS: Record<BosGenieLampIconSize, string> = {
    sm: "h-4 w-4",
    md: "h-5 w-5",
    base: "h-6 w-6",
    lg: "h-8 w-8",
};

type Props = {
    size?: BosGenieLampIconSize;
    className?: string;
    /** Defaults to Bend Pine */
    color?: string;
} & Omit<SVGProps<SVGSVGElement>, "color">;

/**
 * BOS identity — Aladdin-style genie lamp silhouette (single-color stroke, Bend Pine).
 * Optimized for legibility at 16–20px.
 */
export function BosGenieLampIcon({
    size = "base",
    className = "",
    color = palette.bendPine,
    ...svgProps
}: Props) {
    return (
        <svg
            viewBox="0 0 24 24"
            className={`${SIZE_CLASS[size]} shrink-0 ${className}`.trim()}
            aria-hidden
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            {...svgProps}
        >
            <path d="M3 12h4.25" />
            <path d="M3 12c0-2.4 1.85-4.35 4.25-4.35.95 0 1.8.3 2.45.8" />
            <path d="M9.25 7.75h5.5" />
            <path d="M12 5.5V7.75" />
            <path d="M9.75 8.25c0 3.65 1.4 6.5 2.25 6.5s2.25-2.85 2.25-6.5" />
            <path d="M9.25 15.25h5.5" />
            <path d="M8.25 17.5h7.5" />
            <path d="M17.1 10.5c1.55.85 1.95 2.85 1.2 4.55" />
        </svg>
    );
}
