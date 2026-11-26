/**
 * REGISTERED ACTIONS FOR PLANNED ABSENCE — the operator intents behind "she's off
 * sick", "he's on holiday", "back on Thursday" and "cancel that".
 *
 * ── WHY THESE ARE NOT `attendance.mark_absent` ──
 *
 * `attendance.mark_absent` appends an observed absence FACT. For a phone call at
 * seven in the morning that is a witness statement about something nobody has
 * witnessed, and for next week's holiday it is a fact about a day that has not
 * happened. The attendance ledger records what occurred; what is EXPECTED to
 * occur is a different kind of statement and belongs on the operational
 * expectations the roster already reads.
 *
 * So these author intent, and the physical record stays free to disagree with it
 * — which is the whole point: a child who arrives during her own holiday shows as
 * here AND unexpected, instead of the plan quietly swallowing the fact or the
 * fact quietly erasing the plan.
 *
 * `attendance.mark_absent` stays registered and working. It is no longer what the
 * operator surfaces call, and it should not gain new callers.
 *
 * ── WHY THERE IS NO CLOSURE ACTION HERE ──
 *
 * A closure's subject is a site or a room, and the action runtime's entity
 * vocabulary has no location. Inventing one is a platform change with a much
 * wider blast radius than this thread. Closure authoring therefore goes through
 * the service-day-exception route, which applies the IDENTICAL authorization
 * primitive — so the two paths cannot disagree about who may write, which is the
 * property that actually matters. Recorded as convergence debt.
 */

import { randomUUID } from "crypto";

import type { ActionResult, RegisteredAction } from "@/lib/adminV2/actions/actionTypes";
import { resolveAttendanceSubject } from "@/lib/childcareOperational/attendance/resolveAttendanceSubject";
import { resolveOperationalEnrollmentTodayYmd } from "@/lib/childcareOperational/operationalEnrollmentApi";
import { authorServiceDayException } from "@/lib/childcareOperational/attendance/authorServiceDayException";
import {
    markChildAway,
    reviseChildAway,
    withdrawChildAway,
} from "@/lib/childcareOperational/attendance/serviceDayExceptionCommands";
import { serviceDayReasonLabel } from "@/lib/childcareOperational/attendance/serviceDayCopy";
import type { AuthoringInput } from "@/lib/operationalExpectations/intake/authoringTypes";

export const ATTENDANCE_PLAN_ABSENCE_ACTION_KEY = "attendance.plan_absence";
export const ATTENDANCE_REVISE_ABSENCE_ACTION_KEY = "attendance.revise_absence";
export const ATTENDANCE_WITHDRAW_ABSENCE_ACTION_KEY = "attendance.withdraw_absence";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function t(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

function childIdFrom(payload: Record<string, unknown> | undefined, entityId: string | undefined): string {
    return t(payload?.customer_member_id) || t(payload?.child_id) || t(entityId);
}

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

function datesFrom(payload: Record<string, unknown>): { fromDate: string; toDate: string | null } {
    const fromDate = t(payload.from_date) || t(payload.service_date);
    const toDate = t(payload.to_date) || null;
    return { fromDate, toDate };
}

/** Shared payload rules: a reason, a real start date, and a range that runs forwards. */
function validateExceptionPayload(payload: Record<string, unknown> | undefined, needsPredecessor: boolean) {
    const src = payload ?? {};
    const blockers: { code: string; message: string; field?: string }[] = [];

    /*
     * A reason and a date are both DEFAULTED rather than demanded.
     *
     * The operator surfaces ask for a reason, and should — a closed list is
     * countable where free text is not. But a caller that cannot ask must still be
     * able to say a child is not coming in, and "we were not told why" is a
     * truthful answer where a required field would produce an invented one. The
     * date defaults to the organisation's own service day, resolved server-side.
     */
    const { fromDate, toDate } = datesFrom(src);
    if (fromDate && !ISO_DATE.test(fromDate)) {
        blockers.push({ code: "invalid_date", message: "The start date is not a date.", field: "from_date" });
    }
    if (toDate && !ISO_DATE.test(toDate)) {
        blockers.push({ code: "invalid_date", message: "The end date is not a date.", field: "to_date" });
    }
    if (toDate && ISO_DATE.test(fromDate) && ISO_DATE.test(toDate) && toDate < fromDate) {
        blockers.push({
            code: "invalid_range",
            message: "The last day must be on or after the first.",
            field: "to_date",
        });
    }
    if (needsPredecessor && !t(src.predecessor_id)) {
        // Without it the change is not a change — it is a second, competing plan
        // for the same child on the same day.
        blockers.push({
            code: "missing_predecessor",
            message: "This change must say which plan it replaces.",
            field: "predecessor_id",
        });
    }

    return blockers.length > 0 ? { ok: false as const, blockers } : { ok: true as const, value: src };
}

/** One adapter; the intent supplies which command builder to use. */
function exceptionAction(args: {
    actionKey: string;
    label: string;
    description: string;
    needsPredecessor: boolean;
    summary: (childLabel: string, reason: string | null) => string;
    changes: string[];
    build: (params: {
        idempotencyKey: string;
        actorUserId: string;
        reasonKey: string;
        note: string | null;
        childId: string;
        range: { fromDate: string; toDate: string | null };
        predecessorId: string;
    }) => AuthoringInput;
}): RegisteredAction {
    return {
        ...BASE,
        actionKey: args.actionKey,
        defaultLabel: args.label,
        description: args.description,
        confirmationPolicy: "none",

        validatePayload(payload) {
            return validateExceptionPayload(payload, args.needsPredecessor);
        },

        async resolveEligibility({ supabase, ctx, payload, invocation }) {
            const childId = childIdFrom(payload, invocation?.entityId);
            if (!childId) {
                return {
                    eligible: false,
                    blockers: [{ code: "missing_child", message: "A child is required.", field: "customer_member_id" }],
                    availableTransitions: [],
                    requiredInputs: [],
                };
            }
            const resolved = await resolveAttendanceSubject(supabase, ctx.orgId, childId);
            if (!resolved.ok) {
                return {
                    eligible: false,
                    blockers: [{ code: resolved.code, message: resolved.message }],
                    availableTransitions: [],
                    requiredInputs: [],
                };
            }
            return { eligible: true, blockers: [], availableTransitions: [], requiredInputs: [] };
        },

        async buildPreview({ payload }) {
            return {
                summary: args.summary(t(payload?.child_label) || "this child", serviceDayReasonLabel(t(payload?.reason_key))),
                changes: args.changes,
            };
        },

        async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
            const correlationId = randomUUID();
            const childId = childIdFrom(payload, invocation.entityId);
            const actorUserId = t(ctx.userId);
            if (!actorUserId) {
                return { ok: false, correlationId, status: 403, error: "An authenticated operator is required." };
            }
            if (!ctx.accessScope) {
                // Unscoped-unknown is denied, never treated as org-wide.
                return { ok: false, correlationId, status: 403, error: "Attendance scope could not be resolved for this caller." };
            }

            const resolved = await resolveAttendanceSubject(supabase, ctx.orgId, childId);
            if (!resolved.ok) {
                return { ok: false, correlationId, status: 409, error: resolved.message };
            }

            const dates = datesFrom(payload);
            const fromDate = dates.fromDate || (await resolveOperationalEnrollmentTodayYmd(supabase, ctx.orgId));
            const toDate = dates.toDate;
            let input: AuthoringInput;
            try {
                input = args.build({
                    // A repeat of the same operator gesture is a new decision
                    // unless the caller says otherwise, exactly as for capture.
                    idempotencyKey: t(payload.idempotency_key) || correlationId,
                    actorUserId,
                    reasonKey: t(payload.reason_key) || "unspecified",
                    note: t(payload.note) || null,
                    childId,
                    range: { fromDate, toDate },
                    predecessorId: t(payload.predecessor_id),
                });
            } catch (err) {
                return { ok: false, correlationId, status: 400, error: err instanceof Error ? err.message : String(err) };
            }

            const outcome = await authorServiceDayException({
                supabase,
                orgId: ctx.orgId,
                actorUserId,
                dim: ctx.accessScope,
                siteLocationId: resolved.subject.siteLocationId,
                input,
            });

            if (outcome.status === "denied") {
                return { ok: false, correlationId, status: outcome.httpStatus, error: outcome.message };
            }
            if (outcome.status === "authored") {
                return {
                    ok: true,
                    correlationId,
                    result: {
                        actionKey: args.actionKey,
                        entityType: invocation.entityType,
                        entityId: childId,
                        affectedId: outcome.act.id,
                        detail: {
                            from_date: fromDate,
                            to_date: toDate,
                            reason_key: t(payload.reason_key) || "unspecified",
                            replaces: outcome.act.supersedesExpectationId,
                        },
                    },
                };
            }
            if (outcome.status === "disabled") {
                return {
                    ok: false,
                    correlationId,
                    status: 409,
                    error: "Planned absences are not switched on for this organisation.",
                };
            }
            if (outcome.status === "conflict") {
                return { ok: false, correlationId, status: 409, error: outcome.message };
            }
            if (outcome.status === "rejected") {
                return { ok: false, correlationId, status: outcome.code === "unauthorized" ? 403 : 400, error: outcome.message };
            }
            return { ok: false, correlationId, status: 500, error: "That change could not be saved." };
        },
    };
}

export const attendancePlanAbsenceAction = exceptionAction({
    actionKey: ATTENDANCE_PLAN_ABSENCE_ACTION_KEY,
    label: "Mark absent",
    description: "Record that a child is not expected in, today or on future days.",
    needsPredecessor: false,
    summary: (child, reason) => (reason ? `${child} will not be in — ${reason.toLowerCase()}.` : `${child} will not be in.`),
    changes: ["The child stops showing as an unexplained missing arrival", "The day's schedule is unchanged"],
    build: ({ childId, range, ...rest }) => markChildAway({ ...rest, childId, range }),
});

export const attendanceReviseAbsenceAction = exceptionAction({
    actionKey: ATTENDANCE_REVISE_ABSENCE_ACTION_KEY,
    label: "Change these dates",
    description: "Change the days or the reason a child is not expected in.",
    needsPredecessor: true,
    summary: (child) => `Change the days ${child} is away.`,
    changes: ["The earlier plan is superseded, not erased"],
    build: ({ childId, range, predecessorId, ...rest }) =>
        reviseChildAway({ ...rest, childId, range, predecessorId }),
});

export const attendanceWithdrawAbsenceAction = exceptionAction({
    actionKey: ATTENDANCE_WITHDRAW_ABSENCE_ACTION_KEY,
    label: "They'll be in after all",
    description: "Withdraw a planned absence so the child is expected in again.",
    needsPredecessor: true,
    summary: (child) => `${child} is expected in after all.`,
    changes: ["The child is expected again, and missed if they do not arrive"],
    build: ({ childId, range, predecessorId, ...rest }) =>
        withdrawChildAway({ ...rest, childId, range, predecessorId }),
});

export const serviceDayExceptionActions: RegisteredAction[] = [
    attendancePlanAbsenceAction,
    attendanceReviseAbsenceAction,
    attendanceWithdrawAbsenceAction,
];
