/**
 * BOS presentation effective-state derivation — Adaptive Workspace System.
 * States: closed | floating | pinned. Floating is the default recommendation.
 */

import type { AdaptiveWorkspacePresentation } from "@/lib/presentation/adaptiveWorkspacePresentation";
import { BOS_FLOAT_MIN_WIDTH_PX } from "@/lib/bos/bosFloatingGeometry";
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

/**
 * Is there room for a FLOATING assistant, or would it simply cover the page?
 *
 * Pinned has always been width-guarded, because it reserves layout. Floating had no guard at all --
 * it reserves nothing, so it looked free. It is not free: the window has a hard minimum width of
 * BOS_FLOAT_MIN_WIDTH_PX (320), and on a 375px phone that is 85% of the viewport, pinned over the
 * page with pointer-events enabled. Measured on a Work Unit at 375px: the rail intercepted the
 * "Send form" button outright -- Playwright reported the bos-rail-starter-card subtree taking the
 * click -- and no parking position can fix it, because at that width every position covers
 * everything. Collision-aware parking answers "where", and this answers the prior question "should
 * it float here at all".
 *
 * The rule is that a floating surface may cover at most half the page. Below that it is not
 * floating, it is occluding, and the honest presentation is `closed` -- which the operator can
 * still open deliberately. This is a TEMPORARY fallback keyed to width, exactly like the pinned
 * one: widening the viewport restores the operator's preference untouched.
 */
export function canFloatWithoutCoveringPrimary(ambientWidthPx: number): boolean {
    if (!Number.isFinite(ambientWidthPx) || ambientWidthPx <= 0) return true;
    return ambientWidthPx >= BOS_FLOAT_MIN_WIDTH_PX * 2;
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
            effective: canFloatWithoutCoveringPrimary(input.ambientWidthPx) ? "floating" : "closed",
            temporaryFallback: !canFloatWithoutCoveringPrimary(input.ambientWidthPx),
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
        // Falling back from pinned must not land on an occluding float on a phone.
        effective: canFloatWithoutCoveringPrimary(input.ambientWidthPx) ? "floating" : "closed",
        temporaryFallback: true,
        reservedWidthPx: 0,
        pinnedWidthPx,
        dockedWidthPx: pinnedWidthPx,
    };
}

export const BOS_PRESENTATION_ATTR = "data-bos-presentation";
export const BOS_PRESENTATION_PREFERRED_ATTR = "data-bos-presentation-preferred";
export const BOS_RAIL_WIDTH_CSS_VAR = "--ws-rail";
