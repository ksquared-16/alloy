/**
 * PROCESSING APPROVE → TOUR BOOKING (S7).
 *
 * Runs AFTER `commitApprovedLeadForCase` has committed (or resolved) the family and the
 * Opportunity and the case is completed. It turns the case's pending requested tour into
 * a booking through the canonical Tour service, or records why it could not.
 *
 * Failure semantics — the lead and the tour are separate consequences:
 *   - The lead approval is already committed and is NEVER rolled back by anything here.
 *   - An unavailable time (capacity, a changed schedule, a closure, now too soon, a
 *     different site, an existing active tour) is `needs_rescheduling` with a reason. The
 *     original time stays on the record; no other time is chosen; nothing is sent.
 *   - An unexpected error is `failed`; re-running Approve retries this step.
 *
 * Idempotency — the booking is the truth, and the database holds the line:
 *   - A booking already made for this case (`metadata.processing_case_id`) is found first
 *     and reused, so a retry or a repeated approval never books twice.
 *   - Two concurrent approvals cannot both insert: `createTourBooking` refuses a second
 *     active booking for the Opportunity and the unique index
 *     `ux_tour_bookings_one_active_non_terminal_per_opportunity` enforces it; the S1 capacity
 *     trigger serializes the seat. The loser re-reads and finds the winner's booking.
 *   - The confirmation goes through `orchestrateTourBookingConfirmed`, whose per-booking
 *     idempotency key dedupes a replay — so a retry after a crash between booking and send
 *     completes the send exactly once rather than skipping it or doubling it.
 *
 * Communications are decided where they always are: the Tours policy
 * (`mayCommunicateForTour`: an approved booking whose Opportunity exists) and then canonical
 * recipient eligibility (opt-out, suppression, channel). A tour rule that requires approval
 * yields `pending_approval`, which that policy keeps silent until staff confirm the booking
 * under `tours.book` — Processing acceptance of the LEAD is not approval of the TOUR.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createTourBooking } from "@/lib/tours/bookings/tourBookingService";
import type { CreateTourBookingInput, TourBookingRow } from "@/lib/tours/bookings/types";
import { isTourSlotCapacityConflict } from "@/lib/tours/bookings/tourSlotCapacity";
import { TOUR_TOO_SOON_MESSAGE } from "@/lib/tours/bookings/tourEarliestDate";
import { TOUR_CALENDAR_CLOSED_MESSAGE } from "@/lib/operatingCalendar/operatingCalendarServer";
import { TOUR_BOOKING_ACTIVE_NON_TERMINAL_STATUS_KEYS } from "@/lib/tours/constants";
import {
    orchestrateTourBookingConfirmed,
    runTourCommsOrchestratorBestEffort,
    type TourCommsOrchestrationResult,
} from "@/lib/tours/comms/tourCommsOrchestrator";
import { assertBookingLocationMatchesOpportunity, fetchOpportunityForTourAdmin } from "@/lib/tours/admin/opportunityTourContext";
import { classifyUnofferedTourTime, findOfferedTourSlot } from "./publicTourCalendarServer";
import {
    readRequestedTour,
    REQUESTED_TOUR_METADATA_KEY,
    type RequestedTourCommsOutcome,
    type RequestedTourRecord,
    type RequestedTourRescheduleReason,
} from "./requestedTour";

/** Booking metadata key linking a booking to the Processing case that requested it. */
export const PROCESSING_CASE_BOOKING_METADATA_KEY = "processing_case_id" as const;

export type RequestedTourHandoffOutcome =
    | { kind: "none" }
    | {
          kind: "booked";
          bookingId: string;
          bookingStatus: string;
          /** True when this call found an existing booking rather than creating one. */
          replay: boolean;
          comms: RequestedTourCommsOutcome | null;
      }
    | { kind: "needs_rescheduling"; reason: RequestedTourRescheduleReason; replay: boolean; existingBookingId?: string | null }
    | { kind: "failed"; error: string };

export type MaterializeRequestedTourDeps = {
    createBooking?: typeof createTourBooking;
    orchestrateConfirmed?: typeof orchestrateTourBookingConfirmed;
    findOffered?: typeof findOfferedTourSlot;
    classifyUnoffered?: typeof classifyUnofferedTourTime;
};

type BookingLite = { id: string; status_key: string };

async function readCaseMetadata(supabase: SupabaseClient, orgId: string, caseId: string): Promise<Record<string, unknown> | null> {
    const { data, error } = await supabase
        .from("processing_cases")
        .select("metadata")
        .eq("org_id", orgId)
        .eq("id", caseId)
        .maybeSingle();
    if (error) throw new Error(`processing_cases read: ${error.message}`);
    if (!data) return null;
    const m = (data as { metadata?: unknown }).metadata;
    return m && typeof m === "object" && !Array.isArray(m) ? (m as Record<string, unknown>) : {};
}

/** Merge the request's new state into the case's CURRENT metadata (re-read, never a stale copy). */
async function writeRequestedTour(
    supabase: SupabaseClient,
    orgId: string,
    caseId: string,
    patch: Partial<RequestedTourRecord>
): Promise<RequestedTourRecord | null> {
    const meta = await readCaseMetadata(supabase, orgId, caseId);
    const current = readRequestedTour(meta);
    if (!meta || !current) return null;
    const next: RequestedTourRecord = { ...current, ...patch };
    const { error } = await supabase
        .from("processing_cases")
        .update({ metadata: { ...meta, [REQUESTED_TOUR_METADATA_KEY]: next } })
        .eq("org_id", orgId)
        .eq("id", caseId);
    if (error) throw new Error(`processing_cases requested_tour write: ${error.message}`);
    return next;
}

/** The booking a previous attempt made for this case, whatever its status now. */
export async function findBookingForProcessingCase(
    supabase: SupabaseClient,
    orgId: string,
    caseId: string
): Promise<BookingLite | null> {
    const { data, error } = await supabase
        .from("tour_bookings")
        .select("id, status_key")
        .eq("org_id", orgId)
        .eq(`metadata->>${PROCESSING_CASE_BOOKING_METADATA_KEY}`, caseId)
        .order("created_at", { ascending: true })
        .limit(1);
    if (error) throw new Error(`tour_bookings case lookup: ${error.message}`);
    const row = (data ?? [])[0] as BookingLite | undefined;
    return row ?? null;
}

async function findActiveBookingForOpportunity(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string
): Promise<BookingLite | null> {
    const { data, error } = await supabase
        .from("tour_bookings")
        .select("id, status_key")
        .eq("org_id", orgId)
        .eq("opportunity_id", opportunityId)
        .in("status_key", [...TOUR_BOOKING_ACTIVE_NON_TERMINAL_STATUS_KEYS])
        .limit(1);
    if (error) throw new Error(`tour_bookings active lookup: ${error.message}`);
    return ((data ?? [])[0] as BookingLite | undefined) ?? null;
}

async function loadBookingRow(supabase: SupabaseClient, orgId: string, id: string): Promise<TourBookingRow | null> {
    const { data, error } = await supabase.from("tour_bookings").select("*").eq("org_id", orgId).eq("id", id).maybeSingle();
    if (error) throw new Error(`tour_bookings read: ${error.message}`);
    return (data as TourBookingRow | null) ?? null;
}

/** Canonical enqueue refused the send (opt-out, suppression, STOP hold, unusable channel). */
function isEligibilityRefusal(reason: string | undefined): boolean {
    const r = reason ?? "";
    return r.startsWith("eligibility_blocked:") || r.startsWith("policy:");
}

/**
 * What happened to the confirmation, in operator terms. "Sent" means a message row was
 * queued for delivery; a row the canonical eligibility gate wrote as `blocked` (opt-out,
 * suppression, unusable channel) is "suppressed", with the policy code.
 */
export async function summarizeTourConfirmationComms(
    supabase: SupabaseClient,
    orgId: string,
    result: TourCommsOrchestrationResult | null
): Promise<RequestedTourCommsOutcome> {
    if (!result) return { status: "failed", detail: "orchestrator_error" };
    const ids = result.immediate.map((i) => i.communicationMessageId).filter((x): x is string => typeof x === "string");
    const statusById = new Map<string, string>();
    if (ids.length) {
        const { data } = await supabase.from("communication_messages").select("id, status").eq("org_id", orgId).in("id", ids);
        for (const r of (data ?? []) as { id: string; status: string }[]) statusById.set(r.id, r.status);
    }
    const parts: string[] = [];
    let delivered = 0;
    let suppressed = 0;
    for (const i of result.immediate) {
        const rowStatus = i.communicationMessageId ? statusById.get(i.communicationMessageId) ?? null : null;
        if (i.status === "deduped") delivered += 1;
        else if (i.status === "sent" && rowStatus !== "blocked") delivered += 1;
        else if (i.status === "sent" && rowStatus === "blocked") suppressed += 1;
        else if (i.status === "skipped" || isEligibilityRefusal(i.reason)) suppressed += 1;
        parts.push(`${i.channel}:${rowStatus === "blocked" ? "blocked" : i.status}${i.reason ? `:${i.reason}` : ""}`);
    }
    for (const r of result.skippedReasons) parts.push(`skipped:${r}`);
    const detail = parts.join(", ") || null;
    if (delivered > 0) return { status: "sent", detail };
    if (suppressed > 0 || result.disabled || result.skippedReasons.length > 0) return { status: "suppressed", detail };
    return { status: "failed", detail };
}

function rescheduleReasonForError(message: string): RequestedTourRescheduleReason | null {
    if (message.includes("active non-terminal booking already exists")) return "existing_active_tour";
    if (message.includes(TOUR_TOO_SOON_MESSAGE)) return "too_soon";
    if (message.includes(TOUR_CALENDAR_CLOSED_MESSAGE)) return "calendar_closed";
    if (message.includes("selected slot is not available")) return "slot_unavailable";
    return null;
}

export async function materializeRequestedTourForCase(
    supabase: SupabaseClient,
    input: { orgId: string; caseId: string; opportunityId: string | null; actorUserId: string | null; now?: Date },
    deps: MaterializeRequestedTourDeps = {}
): Promise<RequestedTourHandoffOutcome> {
    const createBooking = deps.createBooking ?? createTourBooking;
    const orchestrateConfirmed = deps.orchestrateConfirmed ?? orchestrateTourBookingConfirmed;
    const findOffered = deps.findOffered ?? findOfferedTourSlot;
    const classifyUnoffered = deps.classifyUnoffered ?? classifyUnofferedTourTime;
    const { orgId, caseId } = input;
    const now = input.now ?? new Date();

    const meta = await readCaseMetadata(supabase, orgId, caseId);
    const request = readRequestedTour(meta);
    if (!request) return { kind: "none" };

    const confirmOnce = async (booking: TourBookingRow): Promise<RequestedTourCommsOutcome> => {
        if (booking.status_key !== "confirmed" && booking.status_key !== "rescheduled") {
            return { status: "not_applicable", detail: `booking_${booking.status_key}` };
        }
        const result = await runTourCommsOrchestratorBestEffort("processing_approve_tour_confirmed", () =>
            orchestrateConfirmed(supabase, { orgId, booking, actorUserId: input.actorUserId })
        );
        return summarizeTourConfirmationComms(supabase, orgId, result);
    };

    const recordBooked = async (booking: TourBookingRow, replay: boolean, comms: RequestedTourCommsOutcome | null) => {
        const unchanged =
            replay &&
            !comms &&
            request.state === "booked" &&
            request.booking_id === booking.id &&
            request.booking_status === booking.status_key;
        if (unchanged) {
            return { kind: "booked" as const, bookingId: booking.id, bookingStatus: booking.status_key, replay, comms: request.comms ?? null };
        }
        await writeRequestedTour(supabase, orgId, caseId, {
            state: "booked",
            opportunity_id: booking.opportunity_id,
            booking_id: booking.id,
            booking_status: booking.status_key,
            reason: null,
            error: null,
            resolved_at: request.resolved_at ?? now.toISOString(),
            comms: comms ?? request.comms ?? null,
        });
        return { kind: "booked" as const, bookingId: booking.id, bookingStatus: booking.status_key, replay, comms: comms ?? request.comms ?? null };
    };

    const recordReschedule = async (reason: RequestedTourRescheduleReason, existingBookingId: string | null = null) => {
        await writeRequestedTour(supabase, orgId, caseId, {
            state: "needs_rescheduling",
            opportunity_id: input.opportunityId,
            reason,
            booking_id: existingBookingId,
            booking_status: null,
            error: null,
            resolved_at: now.toISOString(),
            attempts: (request.attempts ?? 0) + 1,
            comms: { status: "not_applicable", detail: "no_booking" },
        });
        return { kind: "needs_rescheduling" as const, reason, replay: false, existingBookingId };
    };

    const recordFailed = async (error: string) => {
        await writeRequestedTour(supabase, orgId, caseId, {
            state: "failed",
            opportunity_id: input.opportunityId,
            error: error.slice(0, 500),
            attempts: (request.attempts ?? 0) + 1,
        });
        return { kind: "failed" as const, error };
    };

    // 1. A booking this case already made is the answer — a retry never books twice. If the
    //    earlier attempt stopped before its confirmation was recorded, complete it (deduped).
    const own = await findBookingForProcessingCase(supabase, orgId, caseId);
    if (own) {
        const row = await loadBookingRow(supabase, orgId, own.id);
        if (!row) return { kind: "failed", error: "booking_unreadable" };
        const comms = request.state === "booked" && request.comms ? null : await confirmOnce(row);
        return recordBooked(row, true, comms);
    }
    // 2. A resolved reschedule is the operator's now; Approve never re-picks a time.
    if (request.state === "needs_rescheduling") {
        return { kind: "needs_rescheduling", reason: request.reason ?? "slot_unavailable", replay: true, existingBookingId: request.booking_id ?? null };
    }
    if (!input.opportunityId) return recordFailed("approval produced no opportunity");

    try {
        const opp = await fetchOpportunityForTourAdmin(supabase, orgId, input.opportunityId);
        if (!opp.ok) return recordFailed(`opportunity: ${opp.message}`);
        if (!assertBookingLocationMatchesOpportunity(opp.row, request.location_id).ok) {
            return recordReschedule("location_mismatch");
        }

        // 3. One active tour per Opportunity — an existing family's current tour is kept.
        const active = await findActiveBookingForOpportunity(supabase, orgId, input.opportunityId);
        if (active) return recordReschedule("existing_active_tour", active.id);

        // 4. Revalidate against the CURRENT schedule, calendar and capacity.
        const startAt = new Date(request.start_at);
        const endAt = new Date(request.end_at);
        const offered = await findOffered(supabase, { orgId, locationId: request.location_id, startAt, endAt, now });
        if (!offered) {
            const reason = await classifyUnoffered(supabase, {
                orgId,
                locationId: request.location_id,
                startAt,
                endAt,
                timezone: request.timezone,
                now,
            });
            return recordReschedule(reason);
        }

        let approvalRequired = false;
        if (offered.ruleId) {
            const { data: rule } = await supabase
                .from("tour_availability_rules")
                .select("approval_required")
                .eq("org_id", orgId)
                .eq("id", offered.ruleId)
                .maybeSingle();
            approvalRequired = Boolean((rule as { approval_required?: boolean } | null)?.approval_required);
        }

        const bookingInput: CreateTourBookingInput = {
            orgId,
            opportunityId: input.opportunityId,
            locationId: request.location_id,
            startAt,
            endAt,
            timezone: offered.timezone,
            source: "form_submission",
            // Slot validation reads `requestedByUserId` as the tour HOST filter; a public request
            // names no host, so it must stay null. The accepting operator is recorded in metadata.
            requestedByUserId: null,
            primaryPersonId: opp.row.primary_person_id,
            primaryContactId: opp.row.primary_contact_id,
            formSubmissionId: request.provenance.form_submission_id,
            formPublicLinkId: request.provenance.form_public_link_id,
            approvalRequired,
            // Sent below, once, after the booking is linked to the case.
            deferConfirmationComms: true,
            metadata: {
                [PROCESSING_CASE_BOOKING_METADATA_KEY]: caseId,
                requested_tour_submission_key: request.submission_key,
                rule_id: offered.ruleId ?? null,
                accepted_by_user_id: input.actorUserId,
            },
        };

        let booking: TourBookingRow;
        try {
            booking = await createBooking(supabase, bookingInput);
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            // A concurrent approval may have won: its booking is ours too.
            const winner = await findBookingForProcessingCase(supabase, orgId, caseId);
            if (winner) {
                const row = await loadBookingRow(supabase, orgId, winner.id);
                if (row) return recordBooked(row, true, null);
            }
            if (isTourSlotCapacityConflict(e)) return recordReschedule("slot_unavailable");
            const reason = rescheduleReasonForError(message);
            if (reason) return recordReschedule(reason);
            return recordFailed(message);
        }

        const comms = await confirmOnce(booking);
        return recordBooked(booking, false, comms);
    } catch (e) {
        return recordFailed(e instanceof Error ? e.message : String(e));
    }
}
