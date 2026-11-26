/**
 * Adaptive Workspace Region Contract — smallest shared semantic roles.
 * Not a general layout framework.
 */

export type AdaptiveWorkspaceRegionRole =
    | "selection"
    | "primary"
    | "supporting"
    | "assistant";

/** Priority when reclaiming scarce width (highest first). */
export const ADAPTIVE_REGION_PRIORITY: readonly AdaptiveWorkspaceRegionRole[] = [
    "primary",
    "selection",
    "supporting",
    "assistant",
] as const;

export const ADAPTIVE_REGION_ATTR = "data-adaptive-region";

export function adaptiveRegionDomAttrs(role: AdaptiveWorkspaceRegionRole): {
    [ADAPTIVE_REGION_ATTR]: AdaptiveWorkspaceRegionRole;
} {
    return { [ADAPTIVE_REGION_ATTR]: role };
}
