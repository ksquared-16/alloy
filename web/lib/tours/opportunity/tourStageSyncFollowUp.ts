/**
 * Observable, retryable record of a tour stage synchronization that did not apply.
 *
 * The Director boundary: the canonical `tour_bookings` row is domain truth. Business
 * Process stage movement is a downstream consequence — it must be observable and
 * retryable, but it may never revoke a booking the parent successfully made.
 *
 * This is deliberately NOT a new reliability platform. It writes one row through the
 * SAME canonical activity path the tour lifecycle already uses (`workflow_events`),
 * carrying exactly the context a deterministic retry needs. The operator sees it on
 * the timeline next to the successful booking, so the record reads truthfully:
 * *the tour was booked, and the process still needs a follow-up.*
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Timeline/audit event type for "booked, but the process did not advance". */
export const TOUR_STAGE_SYNC_FOLLOW_UP_EVENT = "tour_stage_sync_follow_up_required" as const;

export type TourStageSyncFailure = {
    /** The domain signal that found no configured transition, e.g. `scheduled`. */
    signal: string;
    /** Domain the signal belongs to, e.g. `tour_booking`. */
    domain: string;
    /** Raw reason from the Business Process layer — operator-facing, never parent-facing. */
    message: string;
};

export type RecordTourStageSyncFollowUpArgs = {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
    bookingId: string;
    failure: TourStageSyncFailure;
    actorUserId?: string | null;
    correlationId?: string | null;
};

/**
 * Record the follow-up. Best-effort by construction: this exists BECAUSE a downstream
 * step failed, so it must never be the thing that throws. A failure to record is
 * logged and swallowed — the booking still stands.
 *
 * Returns whether the record landed, so callers can report honestly rather than
 * assuming.
 */
export async function recordTourStageSyncFollowUp(
    args: RecordTourStageSyncFollowUpArgs
): Promise<{ recorded: boolean }> {
    const occurredAt = new Date().toISOString();

    // Everything a deterministic retry needs: which opportunity, which booking, which
    // signal, and why it did not apply.
    const payload: Record<string, unknown> = {
        reason: "stage_transition_not_configured",
        domain: args.failure.domain,
        signal: args.failure.signal,
        detail: args.failure.message,
        booking_id: args.bookingId,
        opportunity_id: args.opportunityId,
        retryable: true,
        occurred_at: occurredAt,
        // The booking is NOT in question. Stated explicitly so no consumer of this
        // event mistakes it for a failed booking.
        booking_committed: true,
        ...(args.correlationId ? { correlation_id: args.correlationId } : {}),
        ...(args.actorUserId ? { actor_user_id: args.actorUserId } : {}),
    };

    try {
        const { error } = await args.supabase.from("workflow_events").insert({
            org_id: args.orgId,
            event_type: TOUR_STAGE_SYNC_FOLLOW_UP_EVENT,
            entity_type: "opportunity",
            entity_id: args.opportunityId,
            action_type: "operational_follow_up",
            payload,
            occurred_at: occurredAt,
        });
        if (error) {
            console.warn("[tour_stage_sync] follow-up record failed", error.message);
            return { recorded: false };
        }
        return { recorded: true };
    } catch (e) {
        console.warn("[tour_stage_sync] follow-up record threw", e instanceof Error ? e.message : e);
        return { recorded: false };
    }
}
