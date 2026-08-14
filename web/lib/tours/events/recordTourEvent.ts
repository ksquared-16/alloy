/**
 * Canonical tour lifecycle events — Slice C.
 *
 * Written to the platform's existing `workflow_events` store. There is
 * deliberately NO tour-only event table: a second timeline store is exactly what
 * makes an operator's history disagree with itself.
 *
 * Events reference durable identifiers only. A raw token must never reach an
 * event payload — the timeline is read by operators and exported to analytics,
 * and a token there is a credential in a log.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const TOUR_EVENTS = [
    "tour_invitation_created",
    "tour_invitation_activated",
    "tour_action_opened",
    "tour_slots_viewed",
    "tour_slot_selected",
    "tour_booked",
    "tour_invitation_declined",
    "tour_confirmed",
    "tour_reschedule_started",
    "tour_rescheduled",
    "tour_cancelled",
    "tour_action_expired",
    "tour_action_revoked",
    "tour_action_consumed",
] as const;

export type TourEvent = (typeof TOUR_EVENTS)[number];

/** Keys a caller may put in `detail`. Anything else is dropped, not stored. */
const ALLOWED_DETAIL_KEYS = [
    "action_kind",
    "slot_count",
    "start_at",
    "end_at",
    "timezone",
    "status_key",
    "previous_booking_id",
    "reason",
    "channel",
    "idempotent_replay",
    /** Operator Activity detail — never a credential; display name only. */
    "recipient_display_name",
] as const;

/**
 * Anything that looks like a credential is refused rather than sanitized —
 * silently stripping would let a caller believe it had been recorded.
 */
const FORBIDDEN_DETAIL_KEYS = ["token", "token_hash", "raw_token", "credential", "secret"];

export function filterTourEventDetail(raw: Record<string, unknown> | null | undefined): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (!raw) return out;
    for (const key of ALLOWED_DETAIL_KEYS) {
        if (raw[key] !== undefined && raw[key] !== null) out[key] = raw[key];
    }
    return out;
}

export function detailContainsCredential(raw: Record<string, unknown> | null | undefined): boolean {
    if (!raw) return false;
    return Object.keys(raw).some((k) => FORBIDDEN_DETAIL_KEYS.includes(k.toLowerCase()));
}

export async function recordTourEvent(
    supabase: SupabaseClient,
    args: {
        event: TourEvent;
        orgId: string;
        invitationId: string | null;
        recipientPersonId: string | null;
        opportunityId: string | null;
        threadId?: string | null;
        bookingId?: string | null;
        detail?: Record<string, unknown> | null;
    }
): Promise<{ recorded: boolean }> {
    if (detailContainsCredential(args.detail)) {
        // Fail loudly in development; never persist the event.
        console.warn("[tour events] refused: detail contained a credential-shaped key");
        return { recorded: false };
    }

    const payload = {
        org_id: args.orgId,
        event_type: args.event,
        entity_type: "tour_invitation",
        entity_id: args.invitationId,
        payload: {
            invitation_id: args.invitationId,
            recipient_person_id: args.recipientPersonId,
            opportunity_id: args.opportunityId,
            conversation_thread_id: args.threadId ?? null,
            tour_booking_id: args.bookingId ?? null,
            ...filterTourEventDetail(args.detail),
        },
    };

    const { error } = await supabase.from("workflow_events").insert(payload);
    if (error) {
        // An event failure must never fail the parent's booking. The booking is
        // the durable fact; the event is bookkeeping.
        console.warn("[tour events] insert failed", error.message);
        return { recorded: false };
    }
    return { recorded: true };
}
