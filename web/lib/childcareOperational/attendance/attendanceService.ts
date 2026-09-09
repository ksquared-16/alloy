/**
 * Childcare attendance facts service (P2) — append-only.
 *
 * Records immutable attendance facts and authors corrections/reversals as NEW
 * rows referencing the target (never UPDATE/DELETE). Emits a workflow event per
 * fact. The DB triggers are authoritative; service-layer checks give friendly
 * errors. "Current" state is derived by folding events (see attendanceFold.ts).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    OperationalEnrollmentServiceError,
    trimOrNull,
} from "@/lib/childcareOperational/operationalEnrollmentErrors";
import { assertValidIsoDate } from "@/lib/childcareOperational/effectiveDating";
import { getAgreementById } from "@/lib/childcareOperational/enrollmentAgreementService";
import {
    isAttendanceActorType,
    isAttendanceEventKind,
} from "@/lib/childcareOperational/attendance/attendanceVocabulary";
import { isAbsenceReasonKey } from "@/lib/childcareOperational/attendance/attendanceAbsenceReasons";
import { serviceDateForInstant } from "@/lib/childcareOperational/attendance/attendanceServiceDate";
import type {
    ChildAttendanceEventRow,
    CorrectAttendanceEventInput,
    RecordAttendanceEventInput,
} from "@/lib/childcareOperational/attendance/attendanceTypes";
import { emitAttendanceEvent } from "@/lib/childcareOperational/attendance/attendanceEvents";
import { createHash } from "crypto";

/**
 * Fingerprint of the meaningful content of a fact.
 *
 * Deliberately EXCLUDES correlation_id and the idempotency key itself: two
 * retries of one real event carry different correlations but assert the same
 * thing, and treating that as a conflict would break the retry it exists to
 * support. It includes everything that changes what the fact MEANS, so a
 * producer reusing a key for different content is caught rather than silently
 * handed back someone else's fact.
 */
function fingerprintFact(row: Record<string, unknown>): string {
    const material = [
        "enrollment_agreement_id",
        "customer_member_id",
        "site_location_id",
        "event_kind",
        "entry_type",
        "corrects_event_id",
        "event_at",
        "service_date",
        "room_location_id",
        "from_room_location_id",
        "to_room_location_id",
        "reason_key",
    ]
        .map((k) => `${k}=${row[k] == null ? "" : String(row[k])}`)
        .join("|");
    return createHash("sha256").update(material).digest("hex");
}

function assertValidTimestamp(value: string, field: string): void {
    if (!value || Number.isNaN(new Date(value).getTime())) {
        throw new OperationalEnrollmentServiceError("invalid_input", `${field} must be a valid timestamp`);
    }
}

/**
 * Resolve the org-local service day: explicit serviceDate wins, else derive from
 * eventAt in the supplied timeZone. One of the two must be present.
 */
function resolveServiceDate(input: { serviceDate?: string; timeZone?: string; eventAt: string }): string {
    if (input.serviceDate) {
        assertValidIsoDate(input.serviceDate, "serviceDate");
        return input.serviceDate;
    }
    if (input.timeZone) {
        try {
            return serviceDateForInstant(input.eventAt, input.timeZone);
        } catch (e) {
            throw new OperationalEnrollmentServiceError(
                "invalid_input",
                e instanceof Error ? e.message : "could not derive service date"
            );
        }
    }
    throw new OperationalEnrollmentServiceError(
        "invalid_input",
        "serviceDate or timeZone is required to determine the local service day"
    );
}

function validateEventShape(input: {
    eventKind: string;
    roomLocationId?: string | null;
    fromRoomLocationId?: string | null;
    toRoomLocationId?: string | null;
    actorType: string;
    reasonKey?: string | null;
}): void {
    if (!isAttendanceEventKind(input.eventKind)) {
        throw new OperationalEnrollmentServiceError("invalid_input", `invalid event_kind: ${input.eventKind}`);
    }
    if (!isAttendanceActorType(input.actorType)) {
        throw new OperationalEnrollmentServiceError("invalid_input", `invalid actor_type: ${input.actorType}`);
    }
    // Absence reason is optional, but when present it must be a known reason key.
    if (input.eventKind === "absence" && input.reasonKey && !isAbsenceReasonKey(input.reasonKey)) {
        throw new OperationalEnrollmentServiceError(
            "invalid_input",
            `unknown absence reason_key: ${input.reasonKey}`
        );
    }
    if (input.eventKind === "room_transfer") {
        if (!trimOrNull(input.fromRoomLocationId) || !trimOrNull(input.toRoomLocationId)) {
            throw new OperationalEnrollmentServiceError(
                "invalid_input",
                "room_transfer requires fromRoomLocationId and toRoomLocationId"
            );
        }
    }
    if ((input.eventKind === "check_in" || input.eventKind === "present") && !trimOrNull(input.roomLocationId)) {
        throw new OperationalEnrollmentServiceError(
            "invalid_input",
            `${input.eventKind} requires roomLocationId`
        );
    }
}

async function assertAgreementAllowsAttendance(
    supabase: SupabaseClient,
    orgId: string,
    enrollmentAgreementId: string
) {
    const agreement = await getAgreementById(supabase, orgId, enrollmentAgreementId);
    if (!agreement) {
        throw new OperationalEnrollmentServiceError("not_found", "Enrollment agreement not found");
    }
    if (agreement.status === "canceled") {
        throw new OperationalEnrollmentServiceError(
            "invalid_state",
            "Cannot record attendance against a canceled agreement",
            { status: agreement.status }
        );
    }
    return agreement;
}

async function insertAttendanceEvent(
    supabase: SupabaseClient,
    row: Record<string, unknown>,
    emit: {
        orgId: string;
        enrollmentAgreementId: string;
        customerMemberId: string;
        siteLocationId: string;
        actorUserId?: string | null;
    }
): Promise<ChildAttendanceEventRow> {
    // All ingestion goes through the RPC so that idempotency is decided in ONE
    // place, inside the database, atomically. A direct table insert here would
    // reintroduce the check-then-insert race the RPC exists to remove.
    const { data, error } = await supabase.rpc("record_child_attendance_event", {
        p_org_id: emit.orgId,
        p_fact: row,
    });

    if (error) {
        // Surface the two idempotency outcomes as domain errors so callers can
        // distinguish "you already sent this" from "the database is unhappy".
        if (error.message?.includes("attendance_idempotency_conflict")) {
            throw new OperationalEnrollmentServiceError(
                "invalid_state",
                "An attendance fact already exists for this idempotency key with different content"
            );
        }
        throw new OperationalEnrollmentServiceError("db_error", error.message);
    }

    const result = data as { ok?: boolean; idempotent?: boolean; event?: ChildAttendanceEventRow } | null;
    if (!result?.event) {
        throw new OperationalEnrollmentServiceError("db_error", "attendance ingestion returned no fact");
    }
    const event = result.event;

    // A replay is not a new fact, so it must not emit a second downstream event.
    // Emitting again would let one real-world arrival bill or notify twice.
    if (result.idempotent) {
        return event;
    }

    await emitAttendanceEvent({
        orgId: emit.orgId,
        attendanceEventId: event.id,
        enrollmentAgreementId: emit.enrollmentAgreementId,
        customerMemberId: emit.customerMemberId,
        siteLocationId: emit.siteLocationId,
        eventKind: event.event_kind,
        entryType: event.entry_type,
        correctsEventId: event.corrects_event_id,
        serviceDate: event.service_date,
        eventAt: event.event_at,
        actorType: event.actor_type,
        sourceType: event.source_type,
        ctx: { actorUserId: emit.actorUserId ?? null },
    });
    return event;
}

function buildRow(args: {
    orgId: string;
    enrollmentAgreementId: string;
    customerMemberId: string;
    siteLocationId: string;
    serviceDate: string;
    input: RecordAttendanceEventInput;
    entryType: "original" | "correction" | "reversal";
    correctsEventId: string | null;
}): Record<string, unknown> {
    const { input } = args;
    return {
        org_id: args.orgId,
        enrollment_agreement_id: args.enrollmentAgreementId,
        customer_member_id: args.customerMemberId,
        site_location_id: args.siteLocationId,
        event_kind: input.eventKind,
        entry_type: args.entryType,
        corrects_event_id: args.correctsEventId,
        event_at: input.eventAt,
        service_date: args.serviceDate,
        room_location_id: trimOrNull(input.roomLocationId),
        from_room_location_id: trimOrNull(input.fromRoomLocationId),
        to_room_location_id: trimOrNull(input.toRoomLocationId),
        actor_type: input.actor.actorType,
        actor_user_id: trimOrNull(input.actor.actorUserId),
        actor_person_id: trimOrNull(input.actor.actorPersonId),
        actor_label: trimOrNull(input.actor.actorLabel),
        source_type: input.actor.sourceType ?? "operator_action",
        source_key: trimOrNull(input.actor.sourceKey) ?? "operator_action",
        reason_key: trimOrNull(input.reasonKey),
        note: trimOrNull(input.note),
        metadata: input.metadata ?? {},
        created_by: trimOrNull(input.actor.actorUserId),
        idempotency_key: trimOrNull(input.idempotencyKey),
        correlation_id: trimOrNull(input.correlationId),
    };
}

/** Record a new original attendance fact (append-only). */
export async function recordAttendanceEvent(
    supabase: SupabaseClient,
    input: RecordAttendanceEventInput
): Promise<ChildAttendanceEventRow> {
    assertValidTimestamp(input.eventAt, "eventAt");
    const serviceDate = resolveServiceDate(input);
    validateEventShape({
        eventKind: input.eventKind,
        roomLocationId: input.roomLocationId,
        fromRoomLocationId: input.fromRoomLocationId,
        toRoomLocationId: input.toRoomLocationId,
        actorType: input.actor.actorType,
        reasonKey: input.reasonKey,
    });

    const agreement = await assertAgreementAllowsAttendance(
        supabase,
        input.orgId,
        input.enrollmentAgreementId
    );

    const row = buildRow({
        orgId: input.orgId,
        enrollmentAgreementId: input.enrollmentAgreementId,
        customerMemberId: agreement.customer_member_id,
        siteLocationId: agreement.site_location_id,
        serviceDate,
        input,
        entryType: "original",
        correctsEventId: null,
    });

    row.payload_fingerprint = fingerprintFact(row);
    return insertAttendanceEvent(supabase, row, {
        orgId: input.orgId,
        enrollmentAgreementId: input.enrollmentAgreementId,
        customerMemberId: agreement.customer_member_id,
        siteLocationId: agreement.site_location_id,
        actorUserId: input.actor.actorUserId,
    });
}

export async function getAttendanceEventById(
    supabase: SupabaseClient,
    orgId: string,
    id: string
): Promise<ChildAttendanceEventRow | null> {
    const { data, error } = await supabase
        .from("child_attendance_events")
        .select("*")
        .eq("org_id", orgId)
        .eq("id", id)
        .maybeSingle();
    if (error) throw new OperationalEnrollmentServiceError("db_error", error.message);
    return data ? (data as ChildAttendanceEventRow) : null;
}

/**
 * Author a correction or reversal as a NEW event referencing the target.
 * The original fact is never mutated. A 'reversal' voids the target; a
 * 'correction' restates it (carry the corrected values on the new row).
 */
export async function correctAttendanceEvent(
    supabase: SupabaseClient,
    input: CorrectAttendanceEventInput
): Promise<ChildAttendanceEventRow> {
    assertValidTimestamp(input.eventAt, "eventAt");
    const serviceDate = resolveServiceDate(input);
    validateEventShape({
        eventKind: input.eventKind,
        roomLocationId: input.roomLocationId,
        fromRoomLocationId: input.fromRoomLocationId,
        toRoomLocationId: input.toRoomLocationId,
        actorType: input.actor.actorType,
        reasonKey: input.reasonKey,
    });

    const target = await getAttendanceEventById(supabase, input.orgId, input.correctsEventId);
    if (!target) {
        throw new OperationalEnrollmentServiceError("not_found", "Target attendance event not found");
    }
    if (target.entry_type === "reversal") {
        throw new OperationalEnrollmentServiceError(
            "invalid_state",
            "Cannot correct or reverse a reversal event"
        );
    }

    const agreement = await assertAgreementAllowsAttendance(
        supabase,
        input.orgId,
        target.enrollment_agreement_id
    );

    const row = buildRow({
        orgId: input.orgId,
        enrollmentAgreementId: target.enrollment_agreement_id,
        customerMemberId: agreement.customer_member_id,
        siteLocationId: agreement.site_location_id,
        serviceDate,
        input: { ...input, enrollmentAgreementId: target.enrollment_agreement_id },
        entryType: input.entryType,
        correctsEventId: target.id,
    });

    row.payload_fingerprint = fingerprintFact(row);
    return insertAttendanceEvent(supabase, row, {
        orgId: input.orgId,
        enrollmentAgreementId: target.enrollment_agreement_id,
        customerMemberId: agreement.customer_member_id,
        siteLocationId: agreement.site_location_id,
        actorUserId: input.actor.actorUserId,
    });
}

export type ListAttendanceEventsFilters = {
    enrollmentAgreementId?: string;
    siteLocationId?: string;
    /**
     * Sites the caller is allowed to see, already intersected with any requested
     * filter. An EMPTY array means "no sites permitted" and returns nothing —
     * distinct from `undefined`, which means org-wide. Collapsing the two would
     * turn a scoped caller into an unscoped one.
     */
    siteLocationIds?: readonly string[];
    customerMemberId?: string;
    serviceDateStart?: string;
    serviceDateEnd?: string;
};

export async function listAttendanceEvents(
    supabase: SupabaseClient,
    orgId: string,
    filters: ListAttendanceEventsFilters = {}
): Promise<ChildAttendanceEventRow[]> {
    let q = supabase.from("child_attendance_events").select("*").eq("org_id", orgId);
    if (filters.enrollmentAgreementId) q = q.eq("enrollment_agreement_id", filters.enrollmentAgreementId);
    if (filters.siteLocationId) q = q.eq("site_location_id", filters.siteLocationId);
    if (filters.siteLocationIds) {
        if (filters.siteLocationIds.length === 0) return [];
        q = q.in("site_location_id", [...filters.siteLocationIds]);
    }
    if (filters.customerMemberId) q = q.eq("customer_member_id", filters.customerMemberId);
    if (filters.serviceDateStart) q = q.gte("service_date", filters.serviceDateStart);
    if (filters.serviceDateEnd) q = q.lte("service_date", filters.serviceDateEnd);
    q = q.order("event_at", { ascending: true });

    const { data, error } = await q;
    if (error) throw new OperationalEnrollmentServiceError("db_error", error.message);
    return (data ?? []) as ChildAttendanceEventRow[];
}

/** Attendance facts are append-only; update/delete is a programming error. */
export function assertNoAttendanceMutation(): never {
    throw new OperationalEnrollmentServiceError(
        "invalid_input",
        "Attendance facts are append-only; author a correction or reversal event instead of mutating"
    );
}
