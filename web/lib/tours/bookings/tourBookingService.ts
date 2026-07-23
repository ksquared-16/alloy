import type { SupabaseClient } from "@supabase/supabase-js";
import { computeAvailableTourSlots } from "@/lib/tours/availability/computeAvailableTourSlots";
import { isSlotOffered } from "@/lib/tours/availability/internalCompute";
import type {
    CancelTourBookingInput,
    CreateTourBookingInput,
    RescheduleTourBookingInput,
    TourBookingRow,
} from "@/lib/tours/bookings/types";
import { TOUR_BOOKING_ACTIVE_NON_TERMINAL_STATUS_KEYS } from "@/lib/tours/constants";
import { emitTourBookingLifecycleEvent } from "@/lib/tours/events/tourLifecycleEvents";
import { applyTourBookingOpportunityIntegration } from "@/lib/tours/opportunity/tourBookingOpportunityIntegration";
import {
    orchestrateTourBookingCanceled,
    orchestrateTourBookingCompleted,
    orchestrateTourBookingConfirmed,
    orchestrateTourBookingNoShow,
    orchestrateTourBookingRescheduled,
    runTourCommsOrchestratorBestEffort,
    type TourCommsOrchestrationResult,
} from "@/lib/tours/comms/tourCommsOrchestrator";

const ACTIVE = [...TOUR_BOOKING_ACTIVE_NON_TERMINAL_STATUS_KEYS];

function toRow(data: unknown): TourBookingRow {
    return data as TourBookingRow;
}

async function fetchBooking(supabase: SupabaseClient, orgId: string, id: string): Promise<TourBookingRow | null> {
    const { data, error } = await supabase
        .from("tour_bookings")
        .select("*")
        .eq("org_id", orgId)
        .eq("id", id)
        .maybeSingle();
    if (error) throw new Error(`tour_bookings fetch: ${error.message}`);
    return data ? toRow(data) : null;
}

async function assertNoOtherActiveBooking(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string,
    exceptBookingId?: string | null
): Promise<void> {
    let q = supabase.from("tour_bookings").select("id").eq("org_id", orgId).eq("opportunity_id", opportunityId).in("status_key", ACTIVE);
    if (exceptBookingId) {
        q = q.neq("id", exceptBookingId);
    }
    const { data, error } = await q.limit(2);
    if (error) throw new Error(`active booking check: ${error.message}`);
    if ((data ?? []).length > 0) {
        throw new Error("tour_bookings: an active non-terminal booking already exists for this opportunity");
    }
}

async function assertSlotAvailableForWrite(
    supabase: SupabaseClient,
    params: {
        orgId: string;
        locationId: string;
        userId?: string | null;
        startAt: Date;
        endAt: Date;
        excludeBookingId?: string | null;
    }
): Promise<void> {
    const padMs = 5 * 60 * 1000;
    const from = new Date(params.startAt.getTime() - padMs);
    const to = new Date(params.endAt.getTime() + padMs);
    const slots = await computeAvailableTourSlots(supabase, {
        orgId: params.orgId,
        locationId: params.locationId,
        userId: params.userId ?? null,
        from,
        to,
    });
    const ok = isSlotOffered(
        slots,
        {
            startAt: params.startAt.toISOString(),
            endAt: params.endAt.toISOString(),
            locationId: params.locationId,
        },
        1
    );
    if (!ok) {
        throw new Error("tour_bookings: selected slot is not available (overlap, capacity, or rules)");
    }
}

function resolveInitialStatus(input: CreateTourBookingInput): "requested" | "pending_approval" | "confirmed" {
    if (input.initialStatus) return input.initialStatus;
    return input.approvalRequired ? "pending_approval" : "confirmed";
}

async function afterTourBookingComms(
    label: string,
    fn: () => Promise<TourCommsOrchestrationResult>
): Promise<void> {
    await runTourCommsOrchestratorBestEffort(label, fn);
}

export async function createTourBooking(supabase: SupabaseClient, input: CreateTourBookingInput): Promise<TourBookingRow> {
    const orgId = String(input.orgId).trim();
    const opportunityId = String(input.opportunityId).trim();
    const locationId = String(input.locationId).trim();
    const tz = String(input.timezone).trim();
    if (!tz) throw new Error("tour_bookings: timezone required");
    if (!(input.endAt > input.startAt)) throw new Error("tour_bookings: end_at must be after start_at");

    await assertNoOtherActiveBooking(supabase, orgId, opportunityId, null);

    const status = resolveInitialStatus(input);
    if (status !== "requested") {
        await assertSlotAvailableForWrite(supabase, {
            orgId,
            locationId,
            userId: input.requestedByUserId ?? null,
            startAt: input.startAt,
            endAt: input.endAt,
            excludeBookingId: null,
        });
    }

    const insertRow = {
        org_id: orgId,
        opportunity_id: opportunityId,
        location_id: locationId,
        primary_person_id: input.primaryPersonId ?? null,
        primary_contact_id: input.primaryContactId ?? null,
        requested_by_user_id: input.requestedByUserId ?? null,
        start_at: input.startAt.toISOString(),
        end_at: input.endAt.toISOString(),
        timezone: tz,
        status_key: status,
        source: input.source,
        form_submission_id: input.formSubmissionId ?? null,
        form_public_link_id: input.formPublicLinkId ?? null,
        metadata: input.metadata ?? {},
    };

    const { data, error } = await supabase.from("tour_bookings").insert(insertRow).select("*").single();
    if (error) throw new Error(`tour_bookings insert: ${error.message}`);
    const row = toRow(data);

    // ATOMICITY (operator trust): everything below is part of the SAME transaction the operator
    // initiated. Previously a failure here (e.g. the opportunity mirror) left the tour_bookings row
    // COMMITTED while the route returned an error — the operator saw a failure next to a booking that
    // actually existed ("ghost booking"). Any failure now COMPENSATES by removing the booking, so the
    // transaction is all-or-nothing: it either completed, or nothing changed.
    const ctx = { correlation_id: input.correlationId ?? null, actor_user_id: input.requestedByUserId ?? null };
    try {
        if (row.status_key === "confirmed") {
            await applyTourBookingOpportunityIntegration(supabase, {
                booking: row,
                kind: "confirmed_mirror",
                actorUserId: input.requestedByUserId ?? null,
                correlationId: input.correlationId ?? null,
            });
        }

        if (status === "requested") {
            await emitTourBookingLifecycleEvent(supabase, "tour_requested", row, { previous_status_key: null }, ctx);
        } else if (status === "pending_approval") {
            await emitTourBookingLifecycleEvent(supabase, "tour_booking_pending", row, { previous_status_key: null }, ctx);
        } else {
            await emitTourBookingLifecycleEvent(supabase, "tour_confirmed", row, { previous_status_key: null }, ctx);
        }
    } catch (e) {
        await compensateFailedTourBookingInsert(supabase, orgId, row.id);
        throw e;
    }

    // Downstream + explicitly best-effort: a comms/notification failure must NEVER roll back a booking
    // the operator already completed (it is not part of the booking transaction).
    if (status !== "requested" && status !== "pending_approval") {
        await afterTourBookingComms("create_confirmed", () =>
            orchestrateTourBookingConfirmed(supabase, {
                orgId,
                booking: row,
                actorUserId: input.requestedByUserId ?? null,
            })
        );
    }

    return row;
}

/**
 * Compensating delete for a booking whose in-transaction follow-up failed. Best-effort: if the
 * compensation itself fails we surface that alongside the original error rather than silently
 * leaving a ghost booking.
 */
async function compensateFailedTourBookingInsert(
    supabase: SupabaseClient,
    orgId: string,
    bookingId: string
): Promise<void> {
    const { error } = await supabase.from("tour_bookings").delete().eq("id", bookingId).eq("org_id", orgId);
    if (error) {
        // eslint-disable-next-line no-console -- integrity breach must be observable, never silent
        console.error(
            `tour_bookings: COMPENSATION FAILED for booking ${bookingId} (org ${orgId}) — a ghost booking may exist: ${error.message}`
        );
    }
}

export async function confirmTourBooking(
    supabase: SupabaseClient,
    orgId: string,
    bookingId: string,
    opts?: { correlationId?: string | null; actorUserId?: string | null }
): Promise<TourBookingRow> {
    const existing = await fetchBooking(supabase, orgId, bookingId);
    if (!existing) throw new Error("tour_bookings: not found");
    if (existing.status_key !== "pending_approval") {
        throw new Error("tour_bookings: confirm only allowed from pending_approval");
    }

    await assertSlotAvailableForWrite(supabase, {
        orgId,
        locationId: existing.location_id,
        userId: existing.requested_by_user_id,
        startAt: new Date(existing.start_at),
        endAt: new Date(existing.end_at),
        excludeBookingId: existing.id,
    });

    const prev = existing.status_key;
    const { data, error } = await supabase
        .from("tour_bookings")
        .update({ status_key: "confirmed" })
        .eq("org_id", orgId)
        .eq("id", bookingId)
        .select("*")
        .single();
    if (error) throw new Error(`tour_bookings confirm: ${error.message}`);
    const row = toRow(data);
    await applyTourBookingOpportunityIntegration(supabase, {
        booking: row,
        kind: "confirmed_mirror",
        actorUserId: opts?.actorUserId ?? null,
        correlationId: opts?.correlationId ?? null,
    });
    await emitTourBookingLifecycleEvent(
        supabase,
        "tour_confirmed",
        row,
        { previous_status_key: prev, previous_start_at: existing.start_at, previous_end_at: existing.end_at },
        { correlation_id: opts?.correlationId ?? null, actor_user_id: opts?.actorUserId ?? null }
    );
    await afterTourBookingComms("confirm", () =>
        orchestrateTourBookingConfirmed(supabase, {
            orgId,
            booking: row,
            actorUserId: opts?.actorUserId ?? null,
        })
    );
    return row;
}

export async function rescheduleTourBooking(
    supabase: SupabaseClient,
    orgId: string,
    bookingId: string,
    input: RescheduleTourBookingInput
): Promise<TourBookingRow> {
    const existing = await fetchBooking(supabase, orgId, bookingId);
    if (!existing) throw new Error("tour_bookings: not found");
    if (!["confirmed", "pending_approval", "requested", "rescheduled"].includes(existing.status_key)) {
        throw new Error("tour_bookings: reschedule not allowed for this status");
    }
    const firmForOppMirror = existing.status_key === "confirmed" || existing.status_key === "rescheduled";
    const nextStart = input.startAt;
    const nextEnd = input.endAt;
    if (!(nextEnd > nextStart)) throw new Error("tour_bookings: end_at must be after start_at");
    const nextLoc = input.locationId != null && String(input.locationId).trim() !== "" ? String(input.locationId).trim() : existing.location_id;
    const nextTz =
        input.timezone != null && String(input.timezone).trim() !== "" ? String(input.timezone).trim() : existing.timezone;

    await assertSlotAvailableForWrite(supabase, {
        orgId,
        locationId: nextLoc,
        userId: existing.requested_by_user_id,
        startAt: nextStart,
        endAt: nextEnd,
        excludeBookingId: existing.id,
    });

    const prevStart = existing.start_at;
    const prevEnd = existing.end_at;
    const prevStatus = existing.status_key;

    const { data, error } = await supabase
        .from("tour_bookings")
        .update({
            start_at: nextStart.toISOString(),
            end_at: nextEnd.toISOString(),
            timezone: nextTz,
            location_id: nextLoc,
        })
        .eq("org_id", orgId)
        .eq("id", bookingId)
        .select("*")
        .single();
    if (error) throw new Error(`tour_bookings reschedule: ${error.message}`);
    const row = toRow(data);
    if (firmForOppMirror) {
        await applyTourBookingOpportunityIntegration(supabase, {
            booking: row,
            kind: "reschedule_mirror",
            correlationId: input.correlationId ?? null,
        });
    }
    await emitTourBookingLifecycleEvent(
        supabase,
        "tour_rescheduled",
        row,
        {
            previous_status_key: prevStatus,
            previous_start_at: prevStart,
            previous_end_at: prevEnd,
            previous_location_id: existing.location_id,
        },
        { correlation_id: input.correlationId ?? null, actor_user_id: null }
    );
    await afterTourBookingComms("reschedule", () =>
        orchestrateTourBookingRescheduled(supabase, {
            orgId,
            booking: row,
        })
    );
    return row;
}

export async function cancelTourBooking(
    supabase: SupabaseClient,
    orgId: string,
    bookingId: string,
    input: CancelTourBookingInput
): Promise<TourBookingRow> {
    const existing = await fetchBooking(supabase, orgId, bookingId);
    if (!existing) throw new Error("tour_bookings: not found");
    if (existing.status_key === "canceled" || existing.status_key === "completed" || existing.status_key === "no_show") {
        return existing;
    }
    const prev = existing.status_key;
    const now = new Date().toISOString();
    const { data, error } = await supabase
        .from("tour_bookings")
        .update({
            status_key: "canceled",
            canceled_at: now,
            canceled_by: String(input.canceledBy).trim() || "unknown",
            cancel_reason: input.cancelReason != null ? String(input.cancelReason) : null,
        })
        .eq("org_id", orgId)
        .eq("id", bookingId)
        .select("*")
        .single();
    if (error) throw new Error(`tour_bookings cancel: ${error.message}`);
    const row = toRow(data);
    await emitTourBookingLifecycleEvent(
        supabase,
        "tour_canceled",
        row,
        { previous_status_key: prev, previous_start_at: existing.start_at, previous_end_at: existing.end_at },
        { correlation_id: input.correlationId ?? null, actor_user_id: null }
    );
    await afterTourBookingComms("cancel", () =>
        orchestrateTourBookingCanceled(supabase, {
            orgId,
            booking: row,
            actorUserId: input.canceledBy,
        })
    );
    await applyTourBookingOpportunityIntegration(supabase, {
        booking: row,
        kind: "canceled",
        actorUserId: input.canceledBy,
        correlationId: input.correlationId ?? null,
    });
    return row;
}

export async function markTourBookingCompleted(
    supabase: SupabaseClient,
    orgId: string,
    bookingId: string,
    opts?: { correlationId?: string | null; actorUserId?: string | null }
): Promise<TourBookingRow> {
    const existing = await fetchBooking(supabase, orgId, bookingId);
    if (!existing) throw new Error("tour_bookings: not found");
    if (existing.status_key !== "confirmed" && existing.status_key !== "rescheduled") {
        throw new Error("tour_bookings: complete only from confirmed or rescheduled");
    }
    const prev = existing.status_key;
    const { data, error } = await supabase
        .from("tour_bookings")
        .update({ status_key: "completed" })
        .eq("org_id", orgId)
        .eq("id", bookingId)
        .select("*")
        .single();
    if (error) throw new Error(`tour_bookings complete: ${error.message}`);
    const row = toRow(data);
    await applyTourBookingOpportunityIntegration(supabase, {
        booking: row,
        kind: "completed",
        correlationId: opts?.correlationId ?? null,
        actorUserId: opts?.actorUserId ?? null,
    });
    await emitTourBookingLifecycleEvent(
        supabase,
        "tour_completed",
        row,
        { previous_status_key: prev },
        { correlation_id: opts?.correlationId ?? null, actor_user_id: null }
    );
    await afterTourBookingComms("complete", () =>
        orchestrateTourBookingCompleted(supabase, {
            orgId,
            booking: row,
        })
    );
    return row;
}

export async function markTourBookingNoShow(
    supabase: SupabaseClient,
    orgId: string,
    bookingId: string,
    opts?: { correlationId?: string | null; actorUserId?: string | null }
): Promise<TourBookingRow> {
    const existing = await fetchBooking(supabase, orgId, bookingId);
    if (!existing) throw new Error("tour_bookings: not found");
    if (existing.status_key !== "confirmed" && existing.status_key !== "rescheduled") {
        throw new Error("tour_bookings: no_show only from confirmed or rescheduled");
    }
    const prev = existing.status_key;
    const { data, error } = await supabase
        .from("tour_bookings")
        .update({ status_key: "no_show" })
        .eq("org_id", orgId)
        .eq("id", bookingId)
        .select("*")
        .single();
    if (error) throw new Error(`tour_bookings no_show: ${error.message}`);
    const row = toRow(data);
    await applyTourBookingOpportunityIntegration(supabase, {
        booking: row,
        kind: "no_show",
        correlationId: opts?.correlationId ?? null,
        actorUserId: opts?.actorUserId ?? null,
    });
    await emitTourBookingLifecycleEvent(
        supabase,
        "tour_no_show",
        row,
        { previous_status_key: prev },
        { correlation_id: opts?.correlationId ?? null, actor_user_id: null }
    );
    await afterTourBookingComms("no_show", () =>
        orchestrateTourBookingNoShow(supabase, {
            orgId,
            booking: row,
        })
    );
    return row;
}
