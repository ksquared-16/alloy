import { dispatchOpportunityTourUpdated } from "@/lib/tours/actions/tourBookingActionClient";

/** Legacy date/time tour schedule — shared by drawer modals and Current Work inline panel. */
export async function submitTourScheduleLegacyFromPanel(args: {
    opportunityId: string;
    locationId: string | null | undefined;
    actionKey: string;
    payload: { tour_date: string; tour_time: string };
}): Promise<void> {
    const opportunityId = args.opportunityId.trim();
    const actionKey = args.actionKey.trim() || "schedule_tour";
    const locId = String(args.locationId ?? "").trim();

    if (locId) {
        const res = await fetch("/api/admin/tours/bookings", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                opportunity_id: opportunityId,
                location_id: locId,
                tour_date: args.payload.tour_date,
                tour_time: args.payload.tour_time,
            }),
        });
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
            throw new Error(json.error ?? "Failed to schedule tour");
        }
        dispatchOpportunityTourUpdated(opportunityId, actionKey);
        return;
    }

    const res = await fetch("/api/admin/actions/execute", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            action_key: actionKey,
            entity_type: "opportunity",
            entity_id: opportunityId,
            context: { surface: "record_header", work_unit_id: null },
            payload: args.payload,
        }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: { message?: string } };
    if (!res.ok || json.ok === false) {
        throw new Error(json.error?.message ?? "Failed to schedule tour");
    }
    dispatchOpportunityTourUpdated(opportunityId, actionKey);
}
