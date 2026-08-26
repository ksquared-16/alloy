/**
 * REGISTERED ACTIONS FOR CHILD ATTENDANCE — five operator intents, no new business rules.
 *
 * Every rule already exists in `lib/childcareOperational/attendance`: event shape validation, the
 * agreement gate, service-date derivation, correction lineage, room requirements. These adapters
 * add exactly two things the domain deliberately does not have — an operator-facing SUBJECT (a
 * child, not an agreement) and an operator-facing INTENT — and delegate everything else.
 *
 * ── MOVE IS ONE EVENT, NOT TWO ──
 *
 * `attendance.move` records a `room_transfer`. Modelling it as check-out + check-in would fabricate
 * a departure that never happened, break the day into two presences, and make "how long were they
 * in the Sunflower Room" unanswerable. The domain has a first-class transfer; this uses it.
 *
 * ── CORRECTIONS ARE APPENDED, NEVER APPLIED ──
 *
 * `attendance.correct` writes a `correction`/`reversal` entry referencing the original event. The
 * table is append-only, so an adapter that tried to edit in place would fail loudly — but the point
 * is that the audit lineage survives, not that the database stops us.
 */

import { randomUUID } from "crypto";

import type { ActionResult, RegisteredAction } from "@/lib/adminV2/actions/actionTypes";
import { resolveAttendanceSubject } from "@/lib/childcareOperational/attendance/resolveAttendanceSubject";
import {
    correctAttendanceEvent,
    recordAttendanceEvent,
} from "@/lib/childcareOperational/attendance/attendanceService";
import type { AttendanceEventKind } from "@/lib/childcareOperational/attendance/attendanceVocabulary";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";

export const ATTENDANCE_CHECK_IN_ACTION_KEY = "attendance.check_in";
export const ATTENDANCE_CHECK_OUT_ACTION_KEY = "attendance.check_out";
export const ATTENDANCE_MOVE_ACTION_KEY = "attendance.move";
export const ATTENDANCE_CORRECT_ACTION_KEY = "attendance.correct";
export const ATTENDANCE_MARK_ABSENT_ACTION_KEY = "attendance.mark_absent";

function t(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

function childIdFrom(payload: Record<string, unknown> | undefined, entityId: string | undefined): string {
    return t(payload?.customer_member_id) || t(payload?.child_id) || t(entityId);
}

function mapError(err: unknown, correlationId: string): ActionResult {
    if (err instanceof OperationalEnrollmentServiceError) {
        const status =
            err.code === "not_found" ? 404
            : err.code === "invalid_input" ? 400
            : err.code === "invalid_state" ? 409
            : 500;
        return { ok: false, correlationId, status, error: err.message };
    }
    return {
        ok: false,
        correlationId,
        status: 500,
        error: err instanceof Error ? err.message : String(err),
    };
}

/** Shared shape: every attendance intent acts on a child and needs an effective time. */
const BASE: Pick<
    RegisteredAction,
    "supportedEntityTypes" | "supportedProcessKeys" | "requiredContext" | "audit" | "bosProposalSupport"
> = {
    supportedEntityTypes: ["opportunity_customer_member", "child", "person"],
    supportedProcessKeys: [],
    requiredContext: { requiresEntityId: true, requiresOpportunity: false, requiresCustomer: false },
    audit: { eventType: "action_executed", category: "record", mutates: true },
    bosProposalSupport: false,
};

/**
 * ELIGIBILITY IS RESOLVED SERVER-SIDE, ALWAYS.
 *
 * The card may hide a control, but hiding is presentation. This is where "can this child be checked
 * in right now" is actually decided, so a direct call with a hidden intent meets the same answer.
 */
async function subjectEligibility(
    supabase: Parameters<typeof resolveAttendanceSubject>[0],
    orgId: string,
    childId: string,
): Promise<{ eligible: boolean; blockers: { code: string; message: string; field?: string }[] }> {
    if (!childId) {
        return {
            eligible: false,
            blockers: [{ code: "missing_child", message: "A child is required.", field: "customer_member_id" }],
        };
    }
    const resolved = await resolveAttendanceSubject(supabase, orgId, childId);
    if (!resolved.ok) {
        return { eligible: false, blockers: [{ code: resolved.code, message: resolved.message }] };
    }
    return { eligible: true, blockers: [] };
}

/** One record-an-event adapter; the intent supplies the canonical event kind. */
function recordAction(args: {
    actionKey: string;
    label: string;
    description: string;
    eventKind: AttendanceEventKind;
    summary: (childLabel: string) => string;
    changes: string[];
    requiresToRoom?: boolean;
}): RegisteredAction {
    return {
        ...BASE,
        actionKey: args.actionKey,
        defaultLabel: args.label,
        description: args.description,
        confirmationPolicy: "none",

        validatePayload(payload) {
            const src = payload ?? {};
            if (args.requiresToRoom && !t(src.to_room_location_id)) {
                return {
                    ok: false,
                    blockers: [
                        {
                            code: "missing_destination_room",
                            message: "A destination room is required for a transfer.",
                            field: "to_room_location_id",
                        },
                    ],
                };
            }
            return { ok: true, value: src };
        },

        async resolveEligibility({ supabase, ctx, payload, invocation }) {
            const { eligible, blockers } = await subjectEligibility(
                supabase,
                ctx.orgId,
                childIdFrom(payload, invocation?.entityId),
            );
            return { eligible, blockers, availableTransitions: [], requiredInputs: [] };
        },

        async buildPreview({ payload }) {
            return {
                summary: args.summary(t(payload?.child_label) || "this child"),
                changes: args.changes,
            };
        },

        async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
            const correlationId = randomUUID();
            try {
                const childId = childIdFrom(payload, invocation.entityId);
                const resolved = await resolveAttendanceSubject(supabase, ctx.orgId, childId);
                if (!resolved.ok) {
                    return { ok: false, correlationId, status: 409, error: resolved.message };
                }
                const row = await recordAttendanceEvent(supabase, {
                    orgId: ctx.orgId,
                    enrollmentAgreementId: resolved.subject.enrollmentAgreementId,
                    eventKind: args.eventKind,
                    eventAt: t(payload.event_at) || new Date().toISOString(),
                    timeZone: t(payload.time_zone) || "UTC",
                    roomLocationId: t(payload.room_location_id) || null,
                    // The domain owns the source room; a client-supplied "from" is only a hint and is
                    // ignored when the fold already knows where the child is.
                    fromRoomLocationId: t(payload.from_room_location_id) || null,
                    toRoomLocationId: t(payload.to_room_location_id) || null,
                    reasonKey: t(payload.reason_key) || null,
                    note: t(payload.note) || null,
                    actor: { actorType: "staff", actorUserId: ctx.userId ?? null },
                } as Parameters<typeof recordAttendanceEvent>[1]);

                return {
                    ok: true,
                    correlationId,
                    result: {
                        actionKey: args.actionKey,
                        entityType: invocation.entityType,
                        entityId: childId,
                        affectedId: String((row as { id?: unknown }).id ?? ""),
                        detail: { event_kind: args.eventKind, attendance_event_id: (row as { id?: unknown }).id },
                    },
                };
            } catch (err) {
                return mapError(err, correlationId);
            }
        },
    };
}

export const attendanceCheckInAction = recordAction({
    actionKey: ATTENDANCE_CHECK_IN_ACTION_KEY,
    label: "Check in",
    description: "Record that a child arrived and is present.",
    eventKind: "check_in",
    summary: (c) => `Record that ${c} arrived.`,
    changes: [
        "Append one immutable attendance fact",
        "An active enrolment covering the service date is required",
        "Nothing is overwritten — corrections are separate facts",
    ],
});

export const attendanceCheckOutAction = recordAction({
    actionKey: ATTENDANCE_CHECK_OUT_ACTION_KEY,
    label: "Check out",
    description: "Record that a child departed.",
    eventKind: "check_out",
    summary: (c) => `Record that ${c} departed.`,
    changes: ["Append one immutable attendance fact", "Closes the current presence for the day"],
});

export const attendanceMoveAction = recordAction({
    actionKey: ATTENDANCE_MOVE_ACTION_KEY,
    label: "Move room",
    description: "Record that a child moved to another room.",
    eventKind: "room_transfer",
    requiresToRoom: true,
    summary: (c) => `Record that ${c} moved rooms.`,
    changes: [
        "Append ONE transfer fact — not a check-out plus a check-in",
        "The current room is owned by the attendance fold, not the caller",
    ],
});

export const attendanceMarkAbsentAction = recordAction({
    actionKey: ATTENDANCE_MARK_ABSENT_ACTION_KEY,
    label: "Mark absent",
    description: "Record that a child is absent for the day.",
    eventKind: "absence",
    summary: (c) => `Record that ${c} is absent today.`,
    changes: ["Append one immutable absence fact", "A reason may be required by policy"],
});

/**
 * CORRECTION — restates or voids a prior fact by reference.
 *
 * `corrects_event_id` is required because a correction without a target is just another original
 * fact wearing the word "correction", and the lineage the audit depends on would be lost.
 */
export const attendanceCorrectAction: RegisteredAction = {
    ...BASE,
    actionKey: ATTENDANCE_CORRECT_ACTION_KEY,
    defaultLabel: "Correct attendance",
    description: "Correct or reverse a previously recorded attendance fact.",
    confirmationPolicy: "required",

    validatePayload(payload) {
        const src = payload ?? {};
        if (!t(src.corrects_event_id)) {
            return {
                ok: false,
                blockers: [
                    {
                        code: "missing_target_event",
                        message: "A correction must name the event it corrects.",
                        field: "corrects_event_id",
                    },
                ],
            };
        }
        const entry = t(src.entry_type) || "correction";
        if (entry !== "correction" && entry !== "reversal") {
            return {
                ok: false,
                blockers: [
                    { code: "invalid_entry_type", message: "entry_type must be correction or reversal", field: "entry_type" },
                ],
            };
        }
        return { ok: true, value: src };
    },

    async resolveEligibility({ supabase, ctx, payload, invocation }) {
        const { eligible, blockers } = await subjectEligibility(
            supabase,
            ctx.orgId,
            childIdFrom(payload, invocation?.entityId),
        );
        return { eligible, blockers, availableTransitions: [], requiredInputs: [] };
    },

    async buildPreview({ payload }) {
        const entry = t(payload?.entry_type) || "correction";
        return {
            summary: entry === "reversal" ? "Void a previously recorded fact." : "Restate a previously recorded fact.",
            changes: [
                "Appends a new fact referencing the original",
                "The original event is preserved — history stays auditable",
            ],
        };
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        try {
            const childId = childIdFrom(payload, invocation.entityId);
            const resolved = await resolveAttendanceSubject(supabase, ctx.orgId, childId);
            if (!resolved.ok) {
                return { ok: false, correlationId, status: 409, error: resolved.message };
            }
            const row = await correctAttendanceEvent(supabase, {
                orgId: ctx.orgId,
                correctsEventId: t(payload.corrects_event_id),
                entryType: (t(payload.entry_type) || "correction") as "correction" | "reversal",
                eventKind: t(payload.event_kind) as AttendanceEventKind,
                eventAt: t(payload.event_at) || new Date().toISOString(),
                timeZone: t(payload.time_zone) || "UTC",
                roomLocationId: t(payload.room_location_id) || null,
                fromRoomLocationId: t(payload.from_room_location_id) || null,
                toRoomLocationId: t(payload.to_room_location_id) || null,
                reasonKey: t(payload.reason_key) || null,
                note: t(payload.note) || null,
                actor: { actorType: "staff", actorUserId: ctx.userId ?? null },
            } as Parameters<typeof correctAttendanceEvent>[1]);

            return {
                ok: true,
                correlationId,
                result: {
                    actionKey: ATTENDANCE_CORRECT_ACTION_KEY,
                    entityType: invocation.entityType,
                    entityId: childId,
                    affectedId: String((row as { id?: unknown }).id ?? ""),
                    detail: { corrects_event_id: t(payload.corrects_event_id) },
                },
            };
        } catch (err) {
            return mapError(err, correlationId);
        }
    },
};

export const childAttendanceActions: RegisteredAction[] = [
    attendanceCheckInAction,
    attendanceCheckOutAction,
    attendanceMoveAction,
    attendanceCorrectAction,
    attendanceMarkAbsentAction,
];
