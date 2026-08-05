import type { SupabaseClient } from "@supabase/supabase-js";
import { computeAvailableTourSlots } from "@/lib/tours/availability/computeAvailableTourSlots";
import { isSlotOffered } from "@/lib/tours/availability/internalCompute";
import type {
    CancelTourBookingInput,
    CreateTourBookingInput,
    RescheduleTourBookingInput,
    TourBookingRow,
} from "@/lib/tours/bookings/types";
import { TOUR_BOOKING_ACTIVE_NON_TERMINAL_STATUS_KEYS, type TourLifecycleEventType } from "@/lib/tours/constants";
import { emitTourBookingLifecycleEvent } from "@/lib/tours/events/tourLifecycleEvents";
import { applyTourBookingOpportunityIntegration } from "@/lib/tours/opportunity/tourBookingOpportunityIntegration";
import { recordTourStageSyncFollowUp } from "@/lib/tours/opportunity/tourStageSyncFollowUp";
import type { TourStageSyncFailure } from "@/lib/tours/opportunity/tourStageSyncFollowUp";
import { associateTourBookingToStageWork } from "@/lib/lifecycle/associateTourBookingToStageWork";
import {
    orchestrateTourBookingCanceled,
    orchestrateTourBookingCompleted,
    orchestrateTourBookingConfirmed,
    orchestrateTourBookingNoShow,
    orchestrateTourBookingRescheduled,
    runTourCommsOrchestratorBestEffort,
    type TourCommsOrchestrationResult,
} from "@/lib/tours/comms/tourCommsOrchestrator";
import {
    runPlatformTransaction,
    type PlatformTransactionStep,
} from "@/lib/platform/transaction/platformTransaction";

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

function errorText(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * Thrown when a tour lifecycle transaction did not commit. Carries the transaction envelope so
 * a caller can tell the operator the one thing they actually need to know: whether anything
 * changed. `changed === false` means the rollback is proven; `true` with `integrityBreach` set
 * means it is not, and "just try again" is the wrong advice.
 */
export class TourBookingTransactionError extends Error {
    readonly changed: boolean;
    readonly correlationId: string;
    readonly integrityBreach?: { step: string; error: string; detail: string };

    constructor(params: {
        message: string;
        changed: boolean;
        correlationId: string;
        integrityBreach?: { step: string; error: string; detail: string };
    }) {
        super(params.message);
        this.name = "TourBookingTransactionError";
        this.changed = params.changed;
        this.correlationId = params.correlationId;
        this.integrityBreach = params.integrityBreach;
    }
}

/**
 * Every tour lifecycle change runs through the Platform Transaction Contract, so none of them
 * re-implement abort/compensation. Preconditions live in `validate` (nothing has been written
 * when they fail); the booking write, the opportunity metadata mirror and the lifecycle event
 * are INSIDE the boundary.
 *
 * Declared OUTSIDE it, degrading rather than rolling back:
 *   - communications
 *   - stage/work sufficiency
 *   - stage synchronization follow-up
 *
 * The canonical `tour_bookings` row is domain truth. Business Process stage movement and
 * messaging are downstream consequences: observable and retryable, but never part of the
 * transaction that decides whether the parent successfully booked. A tenant with no
 * configured transition for a tour signal still gets a real booking — and an operator-visible
 * follow-up saying the process did not advance.
 */
async function commitTourBookingTransaction(params: {
    capability: string;
    correlationId?: string | null;
    actorUserId?: string | null;
    subject: Record<string, string | null | undefined>;
    idempotencyKey?: string | null;
    validate: () => Promise<{ ok: true } | { ok: false; message: string }>;
    steps: () => PlatformTransactionStep[];
    value: () => TourBookingRow;
}): Promise<TourBookingRow> {
    const tx = await runPlatformTransaction<TourBookingRow>({
        capability: params.capability,
        correlationId: params.correlationId ?? null,
        actorUserId: params.actorUserId ?? null,
        subject: params.subject,
        idempotencyKey: params.idempotencyKey ?? null,
        validate: params.validate,
        steps: params.steps,
        value: params.value,
    });

    if (!tx.ok) {
        throw new TourBookingTransactionError({
            message: tx.message ?? "tour_bookings: transaction failed",
            changed: tx.changed,
            correlationId: tx.correlation_id,
            integrityBreach: tx.integrity_breach,
        });
    }
    return tx.value as TourBookingRow;
}

/** Mutable booking fields captured before a lifecycle write, so it has an exact inverse. */
type BookingSnapshot = Partial<TourBookingRow>;

function snapshotBooking(row: TourBookingRow, fields: Array<keyof TourBookingRow>): BookingSnapshot {
    const snapshot: BookingSnapshot = {};
    for (const field of fields) {
        (snapshot as Record<string, unknown>)[field as string] = row[field];
    }
    return snapshot;
}

async function restoreBooking(
    supabase: SupabaseClient,
    orgId: string,
    bookingId: string,
    snapshot: BookingSnapshot
): Promise<void> {
    const { error } = await supabase.from("tour_bookings").update(snapshot).eq("org_id", orgId).eq("id", bookingId);
    if (error) throw new Error(`tour_bookings restore: ${error.message}`);
}

export async function createTourBooking(supabase: SupabaseClient, input: CreateTourBookingInput): Promise<TourBookingRow> {
    const orgId = String(input.orgId).trim();
    const opportunityId = String(input.opportunityId).trim();
    const locationId = String(input.locationId).trim();
    const tz = String(input.timezone).trim();
    const status = resolveInitialStatus(input);
    const ctx = { correlation_id: input.correlationId ?? null, actor_user_id: input.requestedByUserId ?? null };

    let row: TourBookingRow | null = null;
    let mirrorUndo: (() => Promise<void>) | undefined;
    let stageSyncFailure: TourStageSyncFailure | undefined;

    return commitTourBookingTransaction({
        capability: "schedule_tour",
        correlationId: input.correlationId ?? null,
        actorUserId: input.requestedByUserId ?? null,
        subject: { org_id: orgId, opportunity_id: opportunityId },
        // A double-submitted booking for the same slot joins the running transaction.
        idempotencyKey: `${orgId}:${opportunityId}:${input.startAt.toISOString()}`,
        validate: async () => {
            if (!tz) return { ok: false, message: "tour_bookings: timezone required" };
            if (!(input.endAt > input.startAt)) {
                return { ok: false, message: "tour_bookings: end_at must be after start_at" };
            }
            try {
                await assertNoOtherActiveBooking(supabase, orgId, opportunityId, null);
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
            } catch (e) {
                return { ok: false, message: errorText(e) };
            }
            return { ok: true };
        },
        steps: () => [
            {
                name: "insert_booking",
                stage: "persist",
                run: async () => {
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
                    row = toRow(data);
                    return row;
                },
                compensate: async () => {
                    if (!row) return;
                    const { error } = await supabase
                        .from("tour_bookings")
                        .delete()
                        .eq("id", row.id)
                        .eq("org_id", orgId);
                    if (error) throw new Error(`tour_bookings compensating delete: ${error.message}`);
                },
            },
            {
                name: "opportunity_integration",
                stage: "business_process",
                run: async () => {
                    if (!row || row.status_key !== "confirmed") return null;
                    const applied = await applyTourBookingOpportunityIntegration(supabase, {
                        booking: row,
                        kind: "confirmed_mirror",
                        actorUserId: input.requestedByUserId ?? null,
                        correlationId: input.correlationId ?? null,
                    });
                    mirrorUndo = applied?.undo;
                    stageSyncFailure = applied?.stageSyncFailure;
                    return applied;
                },
                compensate: async () => {
                    await mirrorUndo?.();
                },
            },
            {
                // The booking is domain truth; an unapplied stage rule is a downstream
                // consequence. Declared OUTSIDE so it can never revoke the booking, and
                // recorded so the operator sees follow-up rather than silence.
                name: "stage_sync_follow_up",
                stage: "business_process",
                boundary: "outside",
                run: async () => {
                    if (!row || !stageSyncFailure) return null;
                    return recordTourStageSyncFollowUp({
                        supabase,
                        orgId,
                        opportunityId: row.opportunity_id,
                        bookingId: row.id,
                        failure: stageSyncFailure,
                        actorUserId: input.requestedByUserId ?? null,
                        correlationId: input.correlationId ?? null,
                    });
                },
            },
            {
                // Soft: booking + stage signal already committed. Map schedule_tour → outcome when configured.
                name: "stage_work_sufficiency",
                stage: "business_process",
                boundary: "outside",
                run: async () => {
                    if (!row || row.status_key !== "confirmed") return null;
                    const actor = (input.requestedByUserId ?? "").trim();
                    if (!actor) return null;
                    return associateTourBookingToStageWork({
                        supabase,
                        orgId,
                        userId: actor,
                        opportunityId: row.opportunity_id,
                        result: "confirmed",
                        bookingId: row.id,
                    });
                },
            },
            {
                name: "lifecycle_event",
                stage: "activity",
                run: async () => {
                    if (!row) return null;
                    const eventKey =
                        status === "requested" ? "tour_requested"
                        : status === "pending_approval" ? "tour_booking_pending"
                        : "tour_confirmed";
                    await emitTourBookingLifecycleEvent(supabase, eventKey, row, { previous_status_key: null }, ctx);
                    return eventKey;
                },
            },
            {
                name: "confirmation_comms",
                stage: "relationships",
                // Declared downstream: a notification failure must NEVER revoke a booking the
                // operator completed. It degrades the result instead of rolling it back.
                boundary: "outside",
                run: async () => {
                    if (!row || status === "requested" || status === "pending_approval") return null;
                    // The caller owns the send. It has post-booking credentials to mint
                    // first, and a confirmation without them is a dead end for the parent.
                    if (input.deferConfirmationComms) return null;
                    const booking = row;
                    await afterTourBookingComms("create_confirmed", () =>
                        orchestrateTourBookingConfirmed(supabase, {
                            orgId,
                            booking,
                            actorUserId: input.requestedByUserId ?? null,
                        })
                    );
                    return true;
                },
            },
        ],
        value: () => row as TourBookingRow,
    });
}

/**
 * Shared shape for the lifecycle transitions (confirm / reschedule / cancel / complete /
 * no_show). Each one used to COMMIT the booking update and then run the opportunity
 * integration and the lifecycle event unguarded — exactly the ghost shape that was fixed for
 * `create` and left in place here: a mirror failure returned an error to the operator next to
 * a booking whose status had already changed.
 */
async function runTourBookingLifecycleTransition(params: {
    supabase: SupabaseClient;
    capability: string;
    orgId: string;
    bookingId: string;
    correlationId?: string | null;
    actorUserId?: string | null;
    /** Preconditions + the row they were checked against. Runs before anything is written. */
    prepare: () => Promise<
        | { ok: false; message: string }
        | {
              ok: true;
              existing: TourBookingRow;
              patch: Partial<TourBookingRow>;
              /** Fields to snapshot for the inverse. */
              restoreFields: Array<keyof TourBookingRow>;
          }
    >;
    integration?: (row: TourBookingRow) => Parameters<typeof applyTourBookingOpportunityIntegration>[1] | null;
    lifecycleEvent: (
        row: TourBookingRow,
        existing: TourBookingRow
    ) => { key: TourLifecycleEventType; previous: Record<string, unknown> };
    comms?: (row: TourBookingRow) => { label: string; run: () => Promise<TourCommsOrchestrationResult> } | null;
}): Promise<TourBookingRow> {
    const { supabase, orgId, bookingId } = params;
    let prepared: { existing: TourBookingRow; patch: Partial<TourBookingRow>; restoreFields: Array<keyof TourBookingRow> } | null =
        null;
    let snapshot: BookingSnapshot = {};
    let row: TourBookingRow | null = null;
    let mirrorUndo: (() => Promise<void>) | undefined;
    let stageSyncFailure: TourStageSyncFailure | undefined;

    return commitTourBookingTransaction({
        capability: params.capability,
        correlationId: params.correlationId ?? null,
        actorUserId: params.actorUserId ?? null,
        subject: { org_id: orgId, booking_id: bookingId },
        idempotencyKey: `${orgId}:${bookingId}:${params.capability}`,
        validate: async () => {
            try {
                const result = await params.prepare();
                if (!result.ok) return { ok: false, message: result.message };
                prepared = result;
                snapshot = snapshotBooking(result.existing, result.restoreFields);
                return { ok: true };
            } catch (e) {
                return { ok: false, message: errorText(e) };
            }
        },
        steps: () => [
            {
                name: "booking_status",
                stage: "persist",
                run: async () => {
                    const { data, error } = await supabase
                        .from("tour_bookings")
                        .update(prepared!.patch)
                        .eq("org_id", orgId)
                        .eq("id", bookingId)
                        .select("*")
                        .single();
                    if (error) throw new Error(`tour_bookings ${params.capability}: ${error.message}`);
                    row = toRow(data);
                    return row;
                },
                compensate: async () => {
                    await restoreBooking(supabase, orgId, bookingId, snapshot);
                },
            },
            {
                name: "opportunity_integration",
                stage: "business_process",
                run: async () => {
                    const args = params.integration?.(row!);
                    if (!args) return null;
                    const applied = await applyTourBookingOpportunityIntegration(supabase, args);
                    mirrorUndo = applied?.undo;
                    stageSyncFailure = applied?.stageSyncFailure;
                    return applied;
                },
                compensate: async () => {
                    await mirrorUndo?.();
                },
            },
            {
                // Same boundary as the create path: an unapplied stage rule is reported,
                // never allowed to revoke a lifecycle change the parent or operator made.
                name: "stage_sync_follow_up",
                stage: "business_process",
                boundary: "outside",
                run: async () => {
                    if (!row || !stageSyncFailure) return null;
                    return recordTourStageSyncFollowUp({
                        supabase,
                        orgId,
                        opportunityId: row.opportunity_id,
                        bookingId: row.id,
                        failure: stageSyncFailure,
                        actorUserId: params.actorUserId ?? null,
                        correlationId: params.correlationId ?? null,
                    });
                },
            },
            {
                name: "lifecycle_event",
                stage: "activity",
                run: async () => {
                    const event = params.lifecycleEvent(row!, prepared!.existing);
                    await emitTourBookingLifecycleEvent(supabase, event.key, row!, event.previous, {
                        correlation_id: params.correlationId ?? null,
                        actor_user_id: params.actorUserId ?? null,
                    });
                    return event.key;
                },
            },
            {
                name: "notification_comms",
                stage: "relationships",
                boundary: "outside",
                run: async () => {
                    const comms = params.comms?.(row!);
                    if (!comms) return null;
                    await afterTourBookingComms(comms.label, comms.run);
                    return true;
                },
            },
        ],
        value: () => row as TourBookingRow,
    });
}

export async function confirmTourBooking(
    supabase: SupabaseClient,
    orgId: string,
    bookingId: string,
    opts?: { correlationId?: string | null; actorUserId?: string | null }
): Promise<TourBookingRow> {
    return runTourBookingLifecycleTransition({
        supabase,
        capability: "confirm_tour",
        orgId,
        bookingId,
        correlationId: opts?.correlationId ?? null,
        actorUserId: opts?.actorUserId ?? null,
        prepare: async () => {
            const existing = await fetchBooking(supabase, orgId, bookingId);
            if (!existing) return { ok: false, message: "tour_bookings: not found" };
            if (existing.status_key !== "pending_approval") {
                return { ok: false, message: "tour_bookings: confirm only allowed from pending_approval" };
            }
            await assertSlotAvailableForWrite(supabase, {
                orgId,
                locationId: existing.location_id,
                userId: existing.requested_by_user_id,
                startAt: new Date(existing.start_at),
                endAt: new Date(existing.end_at),
                excludeBookingId: existing.id,
            });
            return {
                ok: true,
                existing,
                patch: { status_key: "confirmed" } as Partial<TourBookingRow>,
                restoreFields: ["status_key"],
            };
        },
        integration: (row) => ({
            booking: row,
            kind: "confirmed_mirror",
            actorUserId: opts?.actorUserId ?? null,
            correlationId: opts?.correlationId ?? null,
        }),
        lifecycleEvent: (_row, existing) => ({
            key: "tour_confirmed",
            previous: {
                previous_status_key: existing.status_key,
                previous_start_at: existing.start_at,
                previous_end_at: existing.end_at,
            },
        }),
        comms: (row) => ({
            label: "confirm",
            run: () => orchestrateTourBookingConfirmed(supabase, { orgId, booking: row, actorUserId: opts?.actorUserId ?? null }),
        }),
    });
}

export async function rescheduleTourBooking(
    supabase: SupabaseClient,
    orgId: string,
    bookingId: string,
    input: RescheduleTourBookingInput
): Promise<TourBookingRow> {
    let firmForOppMirror = false;

    return runTourBookingLifecycleTransition({
        supabase,
        capability: "reschedule_tour",
        orgId,
        bookingId,
        correlationId: input.correlationId ?? null,
        prepare: async () => {
            const existing = await fetchBooking(supabase, orgId, bookingId);
            if (!existing) return { ok: false, message: "tour_bookings: not found" };
            if (!["confirmed", "pending_approval", "requested", "rescheduled"].includes(existing.status_key)) {
                return { ok: false, message: "tour_bookings: reschedule not allowed for this status" };
            }
            if (!(input.endAt > input.startAt)) {
                return { ok: false, message: "tour_bookings: end_at must be after start_at" };
            }
            firmForOppMirror = existing.status_key === "confirmed" || existing.status_key === "rescheduled";
            const nextLoc =
                input.locationId != null && String(input.locationId).trim() !== "" ?
                    String(input.locationId).trim()
                :   existing.location_id;
            const nextTz =
                input.timezone != null && String(input.timezone).trim() !== "" ?
                    String(input.timezone).trim()
                :   existing.timezone;

            await assertSlotAvailableForWrite(supabase, {
                orgId,
                locationId: nextLoc,
                userId: existing.requested_by_user_id,
                startAt: input.startAt,
                endAt: input.endAt,
                excludeBookingId: existing.id,
            });

            return {
                ok: true,
                existing,
                patch: {
                    start_at: input.startAt.toISOString(),
                    end_at: input.endAt.toISOString(),
                    timezone: nextTz,
                    location_id: nextLoc,
                } as Partial<TourBookingRow>,
                restoreFields: ["start_at", "end_at", "timezone", "location_id"],
            };
        },
        integration: (row) =>
            firmForOppMirror ?
                { booking: row, kind: "reschedule_mirror", correlationId: input.correlationId ?? null }
            :   null,
        lifecycleEvent: (_row, existing) => ({
            key: "tour_rescheduled",
            previous: {
                previous_status_key: existing.status_key,
                previous_start_at: existing.start_at,
                previous_end_at: existing.end_at,
                previous_location_id: existing.location_id,
            },
        }),
        comms: (row) =>
            input.deferLifecycleComms
                ? null
                : {
                      label: "reschedule",
                      run: () => orchestrateTourBookingRescheduled(supabase, { orgId, booking: row }),
                  },
    });
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
    return runTourBookingLifecycleTransition({
        supabase,
        capability: "cancel_tour",
        orgId,
        bookingId,
        correlationId: input.correlationId ?? null,
        actorUserId: input.canceledBy,
        prepare: async () => ({
            ok: true,
            existing,
            patch: {
                status_key: "canceled",
                canceled_at: new Date().toISOString(),
                canceled_by: String(input.canceledBy).trim() || "unknown",
                cancel_reason: input.cancelReason != null ? String(input.cancelReason) : null,
            } as Partial<TourBookingRow>,
            restoreFields: ["status_key", "canceled_at", "canceled_by", "cancel_reason"],
        }),
        // The cancel signal is what drives the configured attention rule, so it belongs INSIDE
        // the boundary. It previously ran AFTER the best-effort comms, meaning a downstream
        // notification could fire for a cancellation the Business Process never learned about.
        integration: (row) => ({
            booking: row,
            kind: "canceled",
            actorUserId: input.canceledBy,
            correlationId: input.correlationId ?? null,
        }),
        lifecycleEvent: (_row, prior) => ({
            key: "tour_canceled",
            previous: {
                previous_status_key: prior.status_key,
                previous_start_at: prior.start_at,
                previous_end_at: prior.end_at,
            },
        }),
        comms: (row) =>
            input.deferLifecycleComms
                ? null
                : {
                      label: "cancel",
                      run: () => orchestrateTourBookingCanceled(supabase, { orgId, booking: row, actorUserId: input.canceledBy }),
                  },
    });
}

export async function markTourBookingCompleted(
    supabase: SupabaseClient,
    orgId: string,
    bookingId: string,
    opts?: { correlationId?: string | null; actorUserId?: string | null }
): Promise<TourBookingRow> {
    return runTourBookingLifecycleTransition({
        supabase,
        capability: "complete_tour",
        orgId,
        bookingId,
        correlationId: opts?.correlationId ?? null,
        actorUserId: opts?.actorUserId ?? null,
        prepare: async () => {
            const existing = await fetchBooking(supabase, orgId, bookingId);
            if (!existing) return { ok: false, message: "tour_bookings: not found" };
            if (existing.status_key !== "confirmed" && existing.status_key !== "rescheduled") {
                return { ok: false, message: "tour_bookings: complete only from confirmed or rescheduled" };
            }
            return {
                ok: true,
                existing,
                patch: { status_key: "completed" } as Partial<TourBookingRow>,
                restoreFields: ["status_key"],
            };
        },
        integration: (row) => ({
            booking: row,
            kind: "completed",
            correlationId: opts?.correlationId ?? null,
            actorUserId: opts?.actorUserId ?? null,
        }),
        lifecycleEvent: (_row, existing) => ({
            key: "tour_completed",
            previous: { previous_status_key: existing.status_key },
        }),
        comms: (row) => ({
            label: "complete",
            run: () => orchestrateTourBookingCompleted(supabase, { orgId, booking: row }),
        }),
    });
}

export async function markTourBookingNoShow(
    supabase: SupabaseClient,
    orgId: string,
    bookingId: string,
    opts?: { correlationId?: string | null; actorUserId?: string | null }
): Promise<TourBookingRow> {
    return runTourBookingLifecycleTransition({
        supabase,
        capability: "no_show_tour",
        orgId,
        bookingId,
        correlationId: opts?.correlationId ?? null,
        actorUserId: opts?.actorUserId ?? null,
        prepare: async () => {
            const existing = await fetchBooking(supabase, orgId, bookingId);
            if (!existing) return { ok: false, message: "tour_bookings: not found" };
            if (existing.status_key !== "confirmed" && existing.status_key !== "rescheduled") {
                return { ok: false, message: "tour_bookings: no_show only from confirmed or rescheduled" };
            }
            return {
                ok: true,
                existing,
                patch: { status_key: "no_show" } as Partial<TourBookingRow>,
                restoreFields: ["status_key"],
            };
        },
        integration: (row) => ({
            booking: row,
            kind: "no_show",
            correlationId: opts?.correlationId ?? null,
            actorUserId: opts?.actorUserId ?? null,
        }),
        lifecycleEvent: (_row, existing) => ({
            key: "tour_no_show",
            previous: { previous_status_key: existing.status_key },
        }),
        comms: (row) => ({
            label: "no_show",
            run: () => orchestrateTourBookingNoShow(supabase, { orgId, booking: row }),
        }),
    });
}
