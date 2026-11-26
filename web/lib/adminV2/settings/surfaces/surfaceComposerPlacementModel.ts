/**
 * Shared Surface Composer — field placement model.
 *
 * Queue Row and Focus Panel (and future surfaces) persist placement differently,
 * but the operator-facing Section / line / inline semantics are identical.
 */

import type { SurfaceFieldPlacementMode, SurfaceFieldSectionKey } from "@/lib/adminV2/settings/surfaces/surfaceFieldComposer";

export const SURFACE_COMPOSER_MAX_FIELDS_PER_LINE = 3;

export type SurfaceComposerPlacementOverride = {
    builderSlot?: SurfaceFieldSectionKey;
    stackLine?: number;
    inlineWithPrevious?: boolean;
};

/** Minimal placed-item shape for shared append + inspector logic. */
export type SurfaceComposerPlacedItemRef = {
    fieldId: string;
    label: string;
    builderSlot: SurfaceFieldSectionKey;
    stackLine: number;
    inlineWithPrevious: boolean;
};

export function surfaceComposerPlacementModeFromInline(inlineWithPrevious: boolean): SurfaceFieldPlacementMode {
    return inlineWithPrevious ? "same-line" : "new-line-below";
}

export function surfaceComposerInlineFromPlacementMode(mode: SurfaceFieldPlacementMode): boolean {
    return mode === "same-line";
}

/**
 * Resolve where the next field should append within a section.
 * Mirrors queue row line-cap behavior (3 fields per line).
 */
export function resolveSurfaceComposerDefaultAppendPlacement(
    placed: readonly SurfaceComposerPlacedItemRef[],
    section: SurfaceFieldSectionKey,
    maxPerLine: number = SURFACE_COMPOSER_MAX_FIELDS_PER_LINE,
): SurfaceComposerPlacementOverride {
    const onSection = placed.filter((f) => f.builderSlot === section);
    if (onSection.length === 0) {
        return { builderSlot: section, stackLine: 0, inlineWithPrevious: false };
    }
    const lastLine = Math.max(...onSection.map((f) => f.stackLine));
    const onLastLine = onSection.filter((f) => f.stackLine === lastLine);
    if (onLastLine.length >= maxPerLine) {
        return { builderSlot: section, stackLine: lastLine + 1, inlineWithPrevious: false };
    }
    return { builderSlot: section, stackLine: lastLine, inlineWithPrevious: onLastLine.length > 0 };
}
