/** Gutter between entity drawer edge and BOS rail overlay (desktop). */
export const BOS_RAIL_OVERLAY_GUTTER_PX = 16;

export const BOS_OVERLAY_WIDTH_CSS_VAR = "--adminv2-bos-overlay-width";
export const BOS_OVERLAY_GUTTER_CSS_VAR = "--adminv2-bos-overlay-gutter";
export const BOS_DRAWER_RAIL_OFFSET_CSS_VAR = "--adminv2-workspace-command-rail-offset";

/**
 * Reserve horizontal space for the BOS overlay + gutter (drawer `right` inset).
 */
export function computeBosDrawerRailOffsetPx(rect: DOMRect, gutterPx = BOS_RAIL_OVERLAY_GUTTER_PX): number {
    const width = Math.max(0, Math.round(rect.width));
    const fromLeft = Math.round(window.innerWidth - rect.left + gutterPx);
    const fromEdges = Math.round(width + gutterPx + (window.innerWidth - rect.right));
    return Math.max(0, fromLeft, fromEdges);
}
