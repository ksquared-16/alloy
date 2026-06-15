"use client";

import type { ElementType, ReactNode } from "react";

type Props = {
    value: string;
    className?: string;
    as?: ElementType;
    lineClamp?: 1 | 2 | 3 | null;
    children?: ReactNode;
};

/** Relationship card text — wraps long contact values; title fallback when clamped or ellipsized. */
export default function DrawerRelationshipOverflowText({
    value,
    className = "",
    as: Tag = "span",
    lineClamp = null,
    children,
}: Props) {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const clampClass =
        lineClamp === 1 ? "line-clamp-1"
        : lineClamp === 2 ? "line-clamp-2"
        : lineClamp === 3 ? "line-clamp-3"
        :   "";

    return (
        <Tag
            className={`min-w-0 break-words ${clampClass} ${className}`.trim()}
            title={trimmed}
        >
            {children ?? trimmed}
        </Tag>
    );
}
