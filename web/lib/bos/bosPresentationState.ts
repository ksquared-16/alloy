/**
 * BOS presentation effective-state derivation — Adaptive Workspace System.
 * States: closed | floating | pinned. Floating is the default recommendation.
 */

import type { AdaptiveWorkspacePresentation } from "@/lib/presentation/adaptiveWorkspacePresentation";
import {
    BOS_PINNED_MIN_PX,
    type BosPresentationState,
    clampBosPinnedWidthPx,
    defaultBosPinnedWidthPx,
} from "@/lib/bos/bosPresentationPreference";

/** Minimum primary canvas width that must remain after a pinned BOS reserve. */
export const BOS_PINNED_PRIMARY_MIN_PX = 720;

/** @deprecated Use BOS_PINNED_PRIMARY_MIN_PX */
export const BOS_DOCKED_PRIMARY_MIN_PX = BOS_PINNED_PRIMARY_MIN_PX;

export type BosPresentationDerivationInput = {
    preferred: BosPresentationState;
    canvas: AdaptiveWorkspacePresentation;
    ambientWidthPx: number;
    preferredPinnedWidthPx: number;
};

export type BosPresentationDerivation = {
    preferred: BosPresentationState;
    effective: BosPresentationState;
    temporaryFallback: boolean;
    /** Width reserved in flex layout (0 for closed/floating). */
    reservedWidthPx: number;
    pinnedWidthPx: number;
    /** @deprecated alias of pinnedWidthPx */
    dockedWidthPx: number;
};

/**
 * Canvas may recommend; floating is the natural default.
 * Expanded canvases may still recommend floating — pinned is always optional.
 */
export function recommendBosPresentation(
    _canvas: AdaptiveWorkspacePresentation,
): BosPresentationState {
    return "floating";
}

export function canHonorPinnedReserve(ambientWidthPx: number, reservePx: number): boolean {
    if (!Number.isFinite(ambientWidthPx) || ambientWidthPx <= 0) return true;
    return ambientWidthPx - reservePx >= BOS_PINNED_PRIMARY_MIN_PX;
}

/** @deprecated Use canHonorPinnedReserve */
export const canHonorDockedReserve = canHonorPinnedReserve;

export function deriveBosPresentation(
    input: BosPresentationDerivationInput,
): BosPresentationDerivation {
    const preferred = input.preferred;
    const pinnedWidthPx = clampBosPinnedWidthPx(
        input.preferredPinnedWidthPx || defaultBosPinnedWidthPx(),
    );

    if (preferred === "closed") {
        return {
            preferred,
            effective: "closed",
            temporaryFallback: false,
            reservedWidthPx: 0,
            pinnedWidthPx,
            dockedWidthPx: pinnedWidthPx,
        };
    }

    if (preferred === "floating") {
        return {
            preferred,
            effective: "floating",
            temporaryFallback: false,
            reservedWidthPx: 0,
            pinnedWidthPx,
            dockedWidthPx: pinnedWidthPx,
        };
    }

    // Preferred pinned — may temporarily fall back to floating.
    const reserve = Math.max(BOS_PINNED_MIN_PX, pinnedWidthPx);
    if (canHonorPinnedReserve(input.ambientWidthPx, reserve)) {
        return {
            preferred,
            effective: "pinned",
            temporaryFallback: false,
            reservedWidthPx: pinnedWidthPx,
            pinnedWidthPx,
            dockedWidthPx: pinnedWidthPx,
        };
    }

    return {
        preferred,
        effective: "floating",
        temporaryFallback: true,
        reservedWidthPx: 0,
        pinnedWidthPx,
        dockedWidthPx: pinnedWidthPx,
    };
}

export const BOS_PRESENTATION_ATTR = "data-bos-presentation";
export const BOS_PRESENTATION_PREFERRED_ATTR = "data-bos-presentation-preferred";
export const BOS_RAIL_WIDTH_CSS_VAR = "--ws-rail";
