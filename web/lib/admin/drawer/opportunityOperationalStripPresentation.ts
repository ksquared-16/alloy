/**
 * Inquiry summary right column: tasks vs reminders grouping (presentation only).
 */

export type OpportunityOperationalStripLayout = "header_chips" | "inquiry_summary";

export function operationalStripReminderCount(stripSendCount: number, showNextFollowUp: boolean): number {
    return stripSendCount + (showNextFollowUp ? 1 : 0);
}

export function operationalStripShowEmptyState(args: {
    loading: boolean;
    openTaskCount: number;
    stripSendCount: number;
    showNextFollowUp: boolean;
    hasError: boolean;
}): boolean {
    if (args.hasError) return false;
    if (args.loading) return false;
    if (args.openTaskCount > 0) return false;
    if (operationalStripReminderCount(args.stripSendCount, args.showNextFollowUp) > 0) return false;
    return true;
}
