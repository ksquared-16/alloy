"use client";

import type { CompressedQueueHeaderModel } from "@/lib/adminV2/runtime/compressedQueueHeader";

/**
 * Alloy OS — compressed queue column header (Scope A/B).
 *
 * Row 1 of `.adminv2-os-queue-header`: a Bend Pine left accent + dark-ink perspective name,
 * with a branded secondary summary line ("Active lens · 7 families"). The search/filter
 * toolbar (row 2) and expanded filter grid (row 3) render below, outside this component.
 */
export type CompressedQueueHeaderProps = CompressedQueueHeaderModel;

export function CompressedQueueHeader({
    perspectiveName,
    summaryLine,
}: CompressedQueueHeaderProps) {
    if (!perspectiveName && !summaryLine) return null;

    return (
        <div
            className="adminv2-os-queue-header__title"
            data-testid="compressed-queue-header-title"
        >
            <span className="adminv2-os-queue-header__accent" aria-hidden />
            <span className="adminv2-os-queue-header__title-text">
                {perspectiveName ? (
                    <span className="adminv2-os-queue-header__perspective">{perspectiveName}</span>
                ) : null}
                {summaryLine ? (
                    <span className="adminv2-os-queue-header__summary">{summaryLine}</span>
                ) : null}
            </span>
        </div>
    );
}
