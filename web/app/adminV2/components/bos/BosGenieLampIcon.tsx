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
 * BOS identity — genie lamp silhouette (Bend Pine). Readable at 16–20px via filled body + stroke lid/spout.
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
            {...svgProps}
        >
            <path
                d="M8.5 16.5h7v1.75c0 .55-.45 1-1 1h-5c-.55 0-1-.45-1-1V16.5Z"
                fill={color}
                opacity={0.92}
            />
            <path
                d="M7.25 14.25h9.5c.55 0 1 .45 1 1v1.25H6.25V15.25c0-.55.45-1 1-1Z"
                fill={color}
            />
            <path
                d="M9.25 8.25c0-2.35 1.35-4.25 3-4.25s3 1.9 3 4.25c0 2.8-1.1 5.25-2.25 5.25S9.25 11.05 9.25 8.25Z"
                fill={color}
            />
            <path
                d="M12 3.75V5.5"
                stroke={color}
                strokeWidth={1.75}
                strokeLinecap="round"
            />
            <path
                d="M10.25 3.25h3.5c.4 0 .75.35.75.75v.5c0 .4-.35.75-.75.75h-3.5c-.4 0-.75-.35-.75-.75v-.5c0-.4.35-.75.75-.75Z"
                fill={color}
            />
            <path
                d="M15.75 9.5c1.65.9 2.1 2.95 1.35 4.65"
                stroke={color}
                strokeWidth={1.75}
                strokeLinecap="round"
            />
            <path
                d="M6.5 10.25c-.85 1.35-.55 3.05.65 4"
                stroke={color}
                strokeWidth={1.75}
                strokeLinecap="round"
            />
            <path
                d="M11.25 2.25c.35-.35.9-.35 1.25 0 .2.2.2.5 0 .7-.35.35-.9.35-1.25 0-.2-.2-.2-.5 0-.7Z"
                fill={color}
            />
            <path
                d="M12.5 1.5c.55.35.85.95.7 1.55-.05.2-.2.35-.35.45"
                stroke={color}
                strokeWidth={1.25}
                strokeLinecap="round"
            />
        </svg>
    );
}
