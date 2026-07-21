/**
 * Adaptive Workspace Presentation Contract — pure derivation helpers.
 *
 * One runtime, three named presentation states driven by operational ambient width
 * (shell primary + command-rail row), not a second mobile product.
 */

export type AdaptiveWorkspacePresentation = "expanded" | "compact" | "constrained";

export type AdaptiveMetricDensity = "standard" | "compact";

/** Ambient width at/above which Expanded canvas recommendations apply. */
export const ADAPTIVE_WORKSPACE_EXPANDED_MIN_PX = 1320;

/** Ambient width at/above which Compact applies (below = Constrained). */
export const ADAPTIVE_WORKSPACE_COMPACT_MIN_PX = 980;

/**
 * Primary Work Unit width below which the queue becomes a temporary selector
 * instead of a permanent side rail (queue min ~256 + focus min ~420 + gap).
 */
export const WORK_UNIT_TWO_PANE_FLOOR_PX = 700;

/** Queue rail width tokens by presentation state (rem) when in side-by-side rail mode. */
export const ADAPTIVE_QUEUE_WIDTH_REM: Record<AdaptiveWorkspacePresentation, number> = {
    expanded: 24,
    compact: 18,
    constrained: 16,
};

export const WORKSPACE_PRESENTATION_ATTR = "data-workspace-presentation";
/** @deprecated Use BOS presentation controller attrs — kept for first-pass CSS compat during migration. */
export const BOS_RAIL_PANEL_ATTR = "data-bos-rail-panel";

export type WorkUnitSelectionMode = "rail" | "temporary";

export function deriveAdaptiveWorkspacePresentation(
    ambientWidthPx: number,
): AdaptiveWorkspacePresentation {
    if (!Number.isFinite(ambientWidthPx) || ambientWidthPx < 0) {
        return "expanded";
    }
    if (ambientWidthPx >= ADAPTIVE_WORKSPACE_EXPANDED_MIN_PX) return "expanded";
    if (ambientWidthPx >= ADAPTIVE_WORKSPACE_COMPACT_MIN_PX) return "compact";
    return "constrained";
}

/**
 * Work Unit selection layout: keep side-by-side rail until the true two-pane floor.
 * Does NOT use the Tailwind xl (1280) stack breakpoint.
 */
export function deriveWorkUnitSelectionMode(primaryWidthPx: number): WorkUnitSelectionMode {
    if (!Number.isFinite(primaryWidthPx) || primaryWidthPx <= 0) return "rail";
    return primaryWidthPx >= WORK_UNIT_TWO_PANE_FLOOR_PX ? "rail" : "temporary";
}

/** @deprecated Prefer BOS presentation controller — pin only when effective docked. */
export function shouldPinBosCommandRail(
    presentation: AdaptiveWorkspacePresentation,
): boolean {
    return presentation === "expanded";
}

export function adaptiveMetricDensity(
    presentation: AdaptiveWorkspacePresentation,
): AdaptiveMetricDensity {
    return presentation === "expanded" ? "standard" : "compact";
}

export function adaptiveQueueWidthRem(
    presentation: AdaptiveWorkspacePresentation,
): number {
    return ADAPTIVE_QUEUE_WIDTH_REM[presentation];
}

/**
 * Communications Activity topic-rail visibility from existing operator state.
 * Does not invent a parallel lifecycle — empty / reading / composing only.
 */
export type ActivityCommsCompositionState = "empty" | "reading" | "composing";

export function deriveActivityCommsCompositionState(input: {
    conversationCount: number;
    selectedThreadId: string | null | undefined;
    isNewMessageMode: boolean;
    replyComposerExpanded: boolean;
}): ActivityCommsCompositionState {
    if (input.isNewMessageMode || input.replyComposerExpanded) return "composing";
    if (input.conversationCount <= 0) return "empty";
    return "reading";
}

export function shouldShowActivityTopicRail(
    composition: ActivityCommsCompositionState,
): boolean {
    return composition === "reading";
}
