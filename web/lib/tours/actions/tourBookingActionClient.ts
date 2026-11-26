/** Client wrappers for tour_bookings REST APIs — shared by tour bar and canonical action routes. */

export async function postTourBookingAction(
    bookingId: string,
    path: "/confirm" | "/complete" | "/no-show" | "/cancel",
    body?: Record<string, unknown>
): Promise<void> {
    const res = await fetch(`/api/admin/tours/bookings/${encodeURIComponent(bookingId)}${path}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
    });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(j.error ?? "Tour action failed");
}

export function dispatchOpportunityTourUpdated(opportunityId: string, actionKey: string): void {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
        new CustomEvent("adminv2:opportunity-updated", {
            detail: { id: opportunityId, action_key: actionKey },
        })
    );
}

export const ADMINV2_OPEN_TOUR_SCHEDULE_MODAL = "adminv2:open-tour-schedule-modal" as const;
export const ADMINV2_OPEN_TOUR_OUTCOME_MODAL = "adminv2:open-tour-outcome-modal" as const;
