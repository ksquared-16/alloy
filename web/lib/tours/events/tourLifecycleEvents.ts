import type { SupabaseClient } from "@supabase/supabase-js";
import { emitEvent } from "@/lib/emitEvent";
import { executeWorkflowRun } from "@/lib/workflowRun";
import { TOUR_BOOKING_ENTITY_TYPE, type TourLifecycleEventType } from "@/lib/tours/constants";
import type { TourBookingRow } from "@/lib/tours/bookings/types";

export type EmitTourLifecycleContext = {
    correlation_id?: string | null;
    actor_user_id?: string | null;
};

function basePayload(
    row: TourBookingRow,
    extras: Record<string, unknown>,
    ctx?: EmitTourLifecycleContext
): Record<string, unknown> {
    return {
        org_id: row.org_id,
        booking_id: row.id,
        opportunity_id: row.opportunity_id,
        location_id: row.location_id,
        start_at: row.start_at,
        end_at: row.end_at,
        timezone: row.timezone,
        status_key: row.status_key,
        source: row.source,
        ...(ctx?.correlation_id ? { correlation_id: ctx.correlation_id } : {}),
        ...(ctx?.actor_user_id ? { actor_user_id: ctx.actor_user_id } : {}),
        ...extras,
    };
}

/**
 * Insert `workflow_events` and fan out to matching workflows (same pattern as `emitStatusChangedEvent`).
 * Entity: `tour_bookings` / booking id. Never emits `tour_scheduled` (opportunity status vocabulary).
 */
export async function emitTourBookingLifecycleEvent(
    supabase: SupabaseClient,
    eventType: TourLifecycleEventType,
    row: TourBookingRow,
    extras: Record<string, unknown> = {},
    ctx?: EmitTourLifecycleContext
): Promise<string> {
    const occurredAt = new Date().toISOString();
    const payload = basePayload(row, { ...extras, event_type: eventType, occurred_at: occurredAt }, ctx);

    const id = await emitEvent({
        org_id: row.org_id,
        event_type: eventType,
        entity_type: TOUR_BOOKING_ENTITY_TYPE,
        entity_id: row.id,
        occurred_at: occurredAt,
        payload,
    });

    const eventPayload: Record<string, unknown> = {
        ...payload,
        entity_type: TOUR_BOOKING_ENTITY_TYPE,
        entity_id: row.id,
    };

    let wq = supabase
        .from("workflows")
        .select("id")
        .eq("enabled", true)
        .eq("event_type", eventType)
        .eq("entity_type", TOUR_BOOKING_ENTITY_TYPE);
    wq = wq.or(`org_id.eq.${row.org_id},org_id.is.null`);
    const { data: wfs } = await wq;

    for (const wf of wfs ?? []) {
        try {
            await executeWorkflowRun(supabase, (wf as { id: string }).id, eventPayload, {
                event_id: id,
                org_id: row.org_id,
            });
        } catch (e) {
            console.warn(
                "[emitTourBookingLifecycleEvent] executeWorkflowRun",
                (wf as { id: string }).id,
                e instanceof Error ? e.message : e
            );
        }
    }

    return id;
}
