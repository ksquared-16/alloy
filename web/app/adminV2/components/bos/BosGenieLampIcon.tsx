"use client";

import type { SVGProps } from "react";

import { BosMark } from "@/app/adminV2/components/bos/identity/BosMark";
import type { BosIdentitySize } from "@/lib/bos/bosIdentityTokens";

/** @deprecated Sprint 02 — use {@link BosMark} from `@/app/adminV2/components/bos/identity`. */
export type BosGenieLampIconSize = "xs" | "sm" | "md" | "base" | "lg" | "xl";

const SIZE_MAP: Record<BosGenieLampIconSize, BosIdentitySize> = {
    xs: "sm",
    sm: "sm",
    md: "md",
    base: "md",
    lg: "lg",
    xl: "lg",
};

type Props = {
    size?: BosGenieLampIconSize;
    className?: string;
    color?: string;
} & Omit<SVGProps<SVGSVGElement>, "color">;

/**
 * @deprecated Sprint 02 identity consolidation — renders {@link BosMark} (Alloy mark + optional horizon).
 * Genie lamp motif removed; do not use in new code.
 */
export function BosGenieLampIcon({
    size = "base",
    className = "",
    color,
    ...svgProps
}: Props) {
    return (
        <BosMark
            size={SIZE_MAP[size]}
            color={color}
            className={className}
            {...svgProps}
        />
    );
}
