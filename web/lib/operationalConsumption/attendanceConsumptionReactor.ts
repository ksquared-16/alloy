/**
 * D12b — the seam between canonical Attendance and Operational Consumption.
 *
 * Attendance has always emitted `attendance_event_recorded` / `_corrected` /
 * `_reversed` into `workflow_events`, and `attendanceEvents.ts` says of that
 * stream: "downstream consequences (billing, compliance, forecasting) react to
 * events, never poll." Nothing ever did. `attendanceFactTranslation.ts` says the
 * other half out loud — "DELIBERATELY UNWIRED in Wave 1 — it has NO runtime
 * caller. D12b's future reactor will consume it." This is that reactor, and it
 * is the whole of the missing seam.
 *
 * ── WHAT IT READS, AND WHAT IT REFUSES TO READ ──
 *
 * It re-fetches the CANONICAL `child_attendance_events` row by id and interprets
 * that. Never the emitted payload, never a provider inbox row, never an adapter's
 * body. The event is a doorbell; the fact is the record. An event payload can be
 * stale, truncated by a schema version, or shaped by whoever emitted it — and a
 * financial consequence derived from a copy is a consequence nobody can later
 * reconstruct from the ledger it claims to follow.
 *
 * ── WHY IT IS NOT CALLED FROM `attendanceService` ──
 *
 * Attendance must not acquire financial logic, and a check-in must not fail
 * because pricing configuration is missing. The reactor therefore runs AFTER the
 * attendance transaction has committed, reading what that transaction durably
 * left behind. `workflow_events` is the durable hook that already exists; this
 * drains it rather than adding a second event mechanism.
 *
 * ── AT-LEAST-ONCE IS SAFE BY CONSTRUCTION, NOT BY A MARKER ──
 *
 * There is deliberately no "processed" flag. A marker is a second source of
 * truth that can disagree with the work it claims to describe — set before the
 * write and a crash loses the consequence, set after and a crash duplicates the
 * attempt. Convergence comes from the consumption layer's own identity instead:
 * `consumption_events` is unique on (org_id, idempotency_key), and the attendance
 * key is derived from the fact, so the same fact reprocessed a hundred times
 * resolves to the same row. Re-running this drain is always safe.
 *
 * ── FOUR IDENTITIES, DELIBERATELY DISTINCT ──
 *
 *   attendance fact      child_attendance_events.id (append-only, Thread 2)
 *   consumption event    (org_id, idempotency_key) unique index
 *   resolved obligation  resolution_key, reparented on correction
 *   financial artifact   the charge spine's own resolution key
 *
 * Collapsing any two would make a correction either duplicate money or lose its
 * lineage. This module owns only the first-to-second hop.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { deriveAttendanceFactType } from "@/lib/operationalConsumption/attendanceFactTranslation";
import { draftConsumption, type ConsumptionDraftResult } from "@/lib/operationalConsumption/consumptionService";
import type { OperationalFactDto } from "@/lib/operationalConsumption/consumptionTypes";
import {
    ATTENDANCE_EVENT_CORRECTED_EVENT,
    ATTENDANCE_EVENT_RECORDED_EVENT,
    ATTENDANCE_EVENT_REVERSED_EVENT,
} from "@/lib/childcareOperational/attendance/attendanceEvents";

/** The event types this reactor drains. Exactly the attendance fact stream. */
export const ATTENDANCE_CONSUMPTION_EVENT_TYPES = [
    ATTENDANCE_EVENT_RECORDED_EVENT,
    ATTENDANCE_EVENT_CORRECTED_EVENT,
    ATTENDANCE_EVENT_REVERSED_EVENT,
] as const;

export type AttendanceReactionOutcome =
    | { status: "consumed"; attendanceEventId: string; consumptionEventId: string | null; obligationIds: string[]; result: ConsumptionDraftResult }
    | { status: "no_commercial_candidate"; attendanceEventId: string; reason: string }
    | { status: "skipped"; attendanceEventId: string; reason: string };

const FACT_COLUMNS =
    "id, org_id, enrollment_agreement_id, customer_member_id, site_location_id, room_location_id,"
    + " event_kind, entry_type, corrects_event_id, event_at, service_date";

type AttendanceFactRow = {
    id: string;
    org_id: string;
    enrollment_agreement_id: string;
    customer_member_id: string;
    site_location_id: string | null;
    room_location_id: string | null;
    event_kind: string;
    entry_type: string;
    corrects_event_id: string | null;
    event_at: string;
    service_date: string;
};

/** `HH:MM` in the org's service day, from the recorded instant. */
function clockTime(eventAt: string): string | null {
    const d = new Date(eventAt);
    if (Number.isNaN(d.getTime())) return null;
    return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/**
 * React to ONE canonical attendance fact.
 *
 * `today` is passed rather than read from the clock so a replay or a backfill
 * interprets a fact the same way twice. A consequence that depends on when it
 * was reprocessed is not reconstructable.
 */
export async function reactToAttendanceFact(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        attendanceEventId: string;
        today: string;
        actorUserId?: string | null;
        /** Scheduled end of care (HH:MM) when the caller knows it; drives late vs early pickup. */
        lateThresholdTime?: string | null;
    },
): Promise<AttendanceReactionOutcome> {
    const { data, error } = await supabase
        .from("child_attendance_events")
        .select(FACT_COLUMNS)
        .eq("org_id", args.orgId)
        .eq("id", args.attendanceEventId)
        .maybeSingle();

    // A fact this reactor cannot read is not a fact it may guess at.
    if (error) return { status: "skipped", attendanceEventId: args.attendanceEventId, reason: `fact_unreadable: ${error.message}` };
    if (!data) return { status: "skipped", attendanceEventId: args.attendanceEventId, reason: "fact_not_found" };

    const fact = data as unknown as AttendanceFactRow;

    const attendanceFactType = deriveAttendanceFactType({
        eventKind: fact.event_kind as Parameters<typeof deriveAttendanceFactType>[0]["eventKind"],
        checkOutTime: fact.event_kind === "check_out" ? clockTime(fact.event_at) : null,
        lateThresholdTime: args.lateThresholdTime ?? null,
    });

    /*
     * NO FACT TYPE AT ALL is different from a fact type with no commercial
     * consequence, and only the first belongs here. `deriveAttendanceFactType`
     * returns null when it cannot name what happened — an on-time checkout with
     * no threshold to compare against, or a malformed input. That is a
     * translation failure, so the reactor stops.
     *
     * It does NOT stop for facts that translate cleanly and then turn out to
     * carry no money: an ordinary check-in translates to `check_in`, and the
     * INTERPRETER discards it with "Check-in alone carries no commercial
     * meaning". Deciding that here would make this a second interpreter, which
     * is precisely the thing this seam must not become. Operational truth is
     * recorded; whether it means money is not this module's judgement.
     */
    if (!attendanceFactType) {
        return {
            status: "no_commercial_candidate",
            attendanceEventId: fact.id,
            reason: `event_kind '${fact.event_kind}' resolved to no commercial candidate`,
        };
    }

    const dto: OperationalFactDto = {
        sourceFamily: "attendance",
        eventKey: `attendance.${attendanceFactType}`,
        // The SOURCE is the attendance fact itself, so lineage points at the row
        // that caused the money rather than at the agreement it bills to.
        sourceEntityType: "child_attendance_events",
        sourceEntityId: fact.id,
        subjectType: "customer_member",
        subjectId: fact.customer_member_id,
        locationId: fact.site_location_id,
        agreementId: fact.enrollment_agreement_id,
        occursOn: fact.service_date,
        effectiveOn: fact.service_date,
        eventDate: fact.service_date,
        attendanceFactType,
        checkInTime: fact.event_kind === "check_in" ? clockTime(fact.event_at) : null,
        checkOutTime: fact.event_kind === "check_out" ? clockTime(fact.event_at) : null,
        lateThresholdTime: args.lateThresholdTime ?? null,
        // Correction identity, carried so the existing reconciliation path
        // recognises this as a restatement rather than a second event.
        entryType: (fact.entry_type as OperationalFactDto["entryType"]) ?? "original",
        correctsFactId: fact.corrects_event_id,
    };

    const result = await draftConsumption(supabase, args.orgId, dto, args.today, args.actorUserId ?? null);
    return {
        status: "consumed",
        attendanceEventId: fact.id,
        consumptionEventId: result.persisted?.consumptionEventId ?? null,
        obligationIds: result.persisted?.resolvedObligationIds ?? [],
        result,
    };
}
