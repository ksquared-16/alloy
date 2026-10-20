/**
 * THE QUESTION AN OPERATOR IS ASKED BEFORE A TERMINAL OUTCOME CLOSES A TOUR THAT IS STILL AHEAD.
 *
 * The server refuses (409 `confirmation_required`, nothing written) and returns the scheduled Tour; the
 * surface asks this question in Alloy's own dialog and resubmits with the confirmation only if the
 * operator chooses "Record outcome". Pure: the copy is built from the Tour's real start and timezone and
 * the outcome's real label, so it is testable without a browser.
 */
import type { AlloyConfirmRequest } from "@/components/ui/AlloyConfirmDialog";

export type ScheduledTourConfirmation = {
    kind: string;
    message: string;
    tour?: { booking_id?: string; start_at?: string | null; timezone?: string | null } | null;
};

/** "Friday, Oct 23 at 9:00 AM" in the Tour's own timezone; the server's message when there is no start. */
export function formatScheduledTourWhen(startAt: string | null | undefined, timezone: string | null | undefined): string | null {
    if (!startAt) return null;
    const at = new Date(startAt);
    if (Number.isNaN(at.getTime())) return null;
    const zone = timezone && timezone.trim() ? timezone.trim() : undefined;
    try {
        const day = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: zone }).format(at);
        const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: zone }).format(at);
        return `${day} at ${time}`;
    } catch {
        return null;
    }
}

export function scheduledTourCloseConfirmRequest(input: {
    confirmation: ScheduledTourConfirmation;
    outcomeLabel: string | null;
}): AlloyConfirmRequest {
    const when = formatScheduledTourWhen(input.confirmation.tour?.start_at, input.confirmation.tour?.timezone);
    const outcome = input.outcomeLabel?.trim() ? `"${input.outcomeLabel.trim()}"` : "this outcome";
    const body = when
        ? `This tour is scheduled for ${when}. Recording ${outcome} will close the scheduled tour.`
        : input.confirmation.message;
    return {
        title: "Close scheduled tour?",
        body,
        confirmLabel: "Record outcome",
        cancelLabel: "Keep tour scheduled",
        testId: "scheduled-tour-close-confirm",
    };
}
