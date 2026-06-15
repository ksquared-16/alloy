"use client";

import type { SVGProps } from "react";

import {
    ALLOY_BRANDMARK_PATHS,
    ALLOY_BRANDMARK_VIEWBOX,
    BOS_IDENTITY,
    BOS_HORIZON_WIDTH_CLASS,
    BOS_MARK_SIZE_CLASS,
    type BosIdentitySize,
} from "@/lib/bos/bosIdentityTokens";

import { BosHorizon } from "@/app/adminV2/components/bos/identity/BosHorizon";

type Props = {
    size?: BosIdentitySize;
    /** Primary horizon + secondary wave beneath the mark (canonical BOS lockup). */
    horizon?: boolean;
    className?: string;
    color?: string;
} & Omit<SVGProps<SVGSVGElement>, "color">;

/**
 * BOS mark — official Alloy brandmark in single-color Bend Pine.
 * Alloy geometry unchanged; horizon artifacts are separate from the logo.
 */
export function BosMark({
    size = "md",
    horizon = false,
    className = "",
    color = BOS_IDENTITY.bendPine,
    ...svgProps
}: Props) {
    const mark = (
        <svg
            viewBox={ALLOY_BRANDMARK_VIEWBOX}
            className={`${BOS_MARK_SIZE_CLASS[size]} shrink-0 ${className}`.trim()}
            aria-hidden
            data-bos-mark-core="true"
            {...svgProps}
        >
            {ALLOY_BRANDMARK_PATHS.map((d, index) => (
                <path key={index} d={d} fill={color} />
            ))}
        </svg>
    );

    if (!horizon) return mark;

    return (
        <span className="inline-flex flex-col items-center gap-1" data-bos-mark="true" data-bos-mark-horizon="true">
            {mark}
            <BosHorizon size={size} className={BOS_HORIZON_WIDTH_CLASS[size]} color={color} />
        </span>
    );
}
