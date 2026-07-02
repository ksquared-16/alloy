/**
 * Focus Panel first-row auto-open decision (WU.FOCUS_PANEL boundary).
 *
 * Pure so the golden-flow rule is testable without mounting the queue:
 * the first visible queue row opens by default UNLESS a record is already
 * selected (deep-link route or open drawer), an open is already pending, the
 * lane already auto-opened once, or the lane has zero rows.
 */
export type FocusPanelAutoOpenInput = {
    rowCount: number;
    alreadyAutoOpened: boolean;
    hasRouteRecordId: boolean;
    hasOpenDrawerRecord: boolean;
    hasPendingRowOpen: boolean;
};

/** True when the first queue row should auto-open the Focus Panel. */
export function shouldAutoOpenFirstQueueRow(input: FocusPanelAutoOpenInput): boolean {
    if (input.alreadyAutoOpened) return false;
    if (input.hasRouteRecordId) return false;
    if (input.hasOpenDrawerRecord) return false;
    if (input.hasPendingRowOpen) return false;
    return input.rowCount > 0;
}

/**
 * True when the lane has settled with zero rows and nothing else is selected —
 * the Focus Panel must stay closed and the empty state remains (traced as
 * auto_open:false, focus_panel_opened:false).
 */
export function isEmptyLaneNoAutoOpen(input: FocusPanelAutoOpenInput): boolean {
    if (input.alreadyAutoOpened) return false;
    if (input.hasRouteRecordId) return false;
    if (input.hasOpenDrawerRecord) return false;
    if (input.hasPendingRowOpen) return false;
    return input.rowCount === 0;
}
