"use client";

import type { ReactNode } from "react";

import { useFocusPanelComposer } from "@/lib/adminV2/settings/surfaces/focusPanelComposerContext";

type Props = {
    surfaceId: string;
    groupKey: string;
    label?: string;
    domainLocked?: boolean;
    children: ReactNode;
    className?: string;
    /** When true, renders as the native section element (household groups). */
    as?: "section" | "div";
    dataAttrs?: Record<string, string>;
};

/**
 * Subtle in-place region chrome — hover outline only.
 * Field composition lives inline via InlineRuntimeFieldList (Surface Composer V3).
 */
export default function ComposableRegionShell({
    surfaceId,
    groupKey,
    label,
    domainLocked = false,
    children,
    className = "",
    as = "div",
    dataAttrs = {},
}: Props) {
    const composer = useFocusPanelComposer();
    const composing = composer?.isComposingSurface(surfaceId) ?? false;
    const selected =
        composer?.selection?.kind === "region" &&
        composer.selection.surfaceId === surfaceId &&
        composer.selection.groupKey === groupKey;

    if (!composing) {
        const Tag = as;
        return (
            <Tag className={className} {...dataAttrs}>
                {children}
            </Tag>
        );
    }

    const Tag = as;

    return (
        <Tag
            className={[
                "fp-composable-region",
                selected ? "is-selected" : "",
                domainLocked ? "is-domain-locked" : "",
                className,
            ]
                .filter(Boolean)
                .join(" ")}
            data-composable-region={groupKey}
            {...dataAttrs}
            onClick={(e) => {
                e.stopPropagation();
                composer?.select({ kind: "region", surfaceId, groupKey });
            }}
        >
            {domainLocked ? (
                <span className="fp-composable-region__lock" data-domain-locked="true">
                    Domain-locked
                </span>
            ) : null}
            {children}
        </Tag>
    );
}
