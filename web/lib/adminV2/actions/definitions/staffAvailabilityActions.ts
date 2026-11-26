/**
 * Staff availability commands.
 *
 * THREE COMMANDS, NOT A CRUD SURFACE. Each names something an operator does: set
 * the recurring pattern, add a dated exception, cancel one.
 *
 * SET IS ONE COMMAND FOR THE WHOLE WEEK, not one per window. An operator does not
 * think "add Tuesday" — they think "this is when she can work". Taking the week as
 * a unit is also what makes supersession honest: the service can end-date the
 * outgoing pattern in the same act, which a per-window edit could not do without
 * leaving the two halves of a change briefly disagreeing.
 *
 * THERE IS DELIBERATELY NO "DELETE PATTERN". Availability is effective-dated, and
 * the point of that is answering "was she available that Tuesday in March" after
 * the pattern changed. Setting an empty week closes the pattern and keeps history;
 * a delete would destroy the context that past schedules were made in.
 *
 * Every command addresses the PERSON subject and names the employment in its
 * payload, matching the qualification commands: availability belongs to the
 * employment, and the employment is reached through the person on screen.
 */

import { randomUUID } from "crypto";

import type { ActionResult, RegisteredAction } from "@/lib/adminV2/actions/actionTypes";
import {
    addAvailabilityException,
    cancelAvailabilityException,
    isValidYmd,
    normalizeTime,
    setRecurringAvailability,
    StaffAvailabilityError,
} from "@/lib/staffAvailability/staffAvailabilityService";

export const AVAILABILITY_SET_ACTION_KEY = "staff_availability.set_recurring";
export const AVAILABILITY_ADD_EXCEPTION_ACTION_KEY = "staff_availability.add_exception";
export const AVAILABILITY_CANCEL_EXCEPTION_ACTION_KEY = "staff_availability.cancel_exception";

function t(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

/**
 * Failure translation.
 *
 * The SHAPE is the contract: `{ ok, correlationId, status, error }` with `error` a
 * STRING. Slice 3 returned a nested object cast through `as unknown as
 * ActionResult`; it typechecked, registered, and every execution came back 500
 * while the write had already committed. No casts here — if this drifts, the
 * compiler says so instead of production.
 */
function failureResult(correlationId: string, err: unknown): ActionResult {
    const known = err instanceof StaffAvailabilityError;
    const code = known ? (err as StaffAvailabilityError).code : "internal_error";
    const status =
        code === "not_found" ? 404 : code === "conflict" ? 409 : code === "invalid_input" ? 422 : 500;
    return {
        ok: false,
        correlationId,
        status,
        error: known
            ? (err as StaffAvailabilityError).message
            : "That availability change could not be completed.",
        blockers: [{ code, message: known ? (err as StaffAvailabilityError).message : "Unexpected error" }],
    };
}

/** The success envelope the runtime validates, built once so the commands cannot disagree. */
function okResult(
    actionKey: string,
    correlationId: string,
    entityId: string,
    affectedId: string | null,
    detail: Record<string, unknown>,
): ActionResult {
    return { ok: true, correlationId, result: { actionKey, entityType: "person", entityId, affectedId, detail } };
}

const baseShape = {
    supportedEntityTypes: ["person"] as const,
    supportedProcessKeys: [] as const,
    requiredContext: { requiresEntityId: true, requiresOpportunity: false, requiresCustomer: false },
    audit: { eventType: "action_executed" as const, category: "record" as const, mutates: true },
    confirmationPolicy: "none" as const,
    bosProposalSupport: false,
};

type RawWindow = { weekday?: unknown; start_time?: unknown; end_time?: unknown };

function readWindows(payload: Record<string, unknown> | null | undefined): RawWindow[] {
    const raw = payload?.windows;
    return Array.isArray(raw) ? (raw as RawWindow[]) : [];
}

export const staffAvailabilitySetRecurringAction: RegisteredAction = {
    ...baseShape,
    actionKey: AVAILABILITY_SET_ACTION_KEY,
    defaultLabel: "Set availability",
    description:
        "Set when this employment can work, as a weekly pattern effective from a date. The previous pattern is kept and end-dated rather than overwritten.",

    validatePayload(payload) {
        const src = payload ?? {};
        const blockers: { code: string; message: string; field?: string }[] = [];
        if (!isValidYmd(t(src.effective_start))) {
            blockers.push({ code: "invalid_effective_start", message: "effective_start must be a real YYYY-MM-DD date", field: "effective_start" });
        }
        const end = t(src.effective_end);
        if (end && !isValidYmd(end)) {
            blockers.push({ code: "invalid_effective_end", message: "effective_end must be a real YYYY-MM-DD date", field: "effective_end" });
        }
        if (end && isValidYmd(t(src.effective_start)) && end < t(src.effective_start)) {
            blockers.push({ code: "effective_end_before_start", message: "Availability cannot end before it begins.", field: "effective_end" });
        }
        for (const w of readWindows(src)) {
            const day = Number(w.weekday);
            if (!Number.isInteger(day) || day < 0 || day > 6) {
                blockers.push({ code: "invalid_weekday", message: "Each window needs a weekday from 0 (Sunday) to 6", field: "windows" });
                break;
            }
            const s = normalizeTime(w.start_time);
            const e = normalizeTime(w.end_time);
            if (!s || !e) {
                blockers.push({ code: "invalid_window_time", message: "Each window needs valid HH:MM times", field: "windows" });
                break;
            }
            if (e <= s) {
                blockers.push({ code: "window_time_order", message: "A window must end after it starts.", field: "windows" });
                break;
            }
        }
        return blockers.length > 0 ? { ok: false, blockers } : { ok: true, value: src };
    },

    async resolveEligibility({ payload }) {
        const blockers = t(payload?.employment_id)
            ? []
            : [{ code: "missing_employment", message: "employment_id is required", field: "employment_id" }];
        return { eligible: blockers.length === 0, blockers, availableTransitions: [], requiredInputs: [] };
    },

    async buildPreview({ payload }) {
        const count = readWindows(payload).length;
        return {
            summary: count === 0
                ? "Close the recurring availability pattern from this date."
                : `Set ${count} availability window${count === 1 ? "" : "s"} from this date.`,
            changes: [
                "Record the new weekly pattern",
                "End-date the previous pattern the day before, keeping it as history",
            ],
        };
    },

    async execute({ supabase, ctx, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        try {
            const res = await setRecurringAvailability(supabase, {
                orgId: ctx.orgId,
                employmentId: t(payload.employment_id),
                effectiveStart: t(payload.effective_start),
                effectiveEnd: t(payload.effective_end) || null,
                windows: readWindows(payload).map((w) => ({
                    weekday: Number(w.weekday),
                    startTime: t(w.start_time),
                    endTime: t(w.end_time),
                })),
                actorUserId: ctx.userId ?? null,
            });
            return okResult(AVAILABILITY_SET_ACTION_KEY, correlationId, t(payload.employment_id),
                res.windows[0]?.id ?? null, { superseded_to: res.superseded_to, windows: res.windows });
        } catch (err) {
            return failureResult(correlationId, err);
        }
    },
};

export const staffAvailabilityAddExceptionAction: RegisteredAction = {
    ...baseShape,
    actionKey: AVAILABILITY_ADD_EXCEPTION_ACTION_KEY,
    defaultLabel: "Add availability exception",
    description:
        "Record that one date differs from the usual pattern — unavailable, or available for specific hours. The exception replaces the pattern for that date.",

    validatePayload(payload) {
        const src = payload ?? {};
        const blockers: { code: string; message: string; field?: string }[] = [];
        if (!isValidYmd(t(src.exception_date))) {
            blockers.push({ code: "invalid_date", message: "exception_date must be a real YYYY-MM-DD date", field: "exception_date" });
        }
        const kind = t(src.exception_kind);
        if (kind !== "unavailable" && kind !== "available") {
            blockers.push({ code: "invalid_kind", message: "exception_kind must be unavailable or available", field: "exception_kind" });
        }
        if (kind === "available") {
            const s = normalizeTime(src.start_time);
            const e = normalizeTime(src.end_time);
            if (!s || !e) {
                blockers.push({ code: "missing_times", message: "An available exception needs start and end times.", field: "start_time" });
            } else if (e <= s) {
                blockers.push({ code: "window_time_order", message: "A window must end after it starts.", field: "end_time" });
            }
        }
        if (kind === "unavailable" && (t(src.start_time) || t(src.end_time))) {
            // Times on an unavailable row would be stored and then ignored, which is
            // how a record comes to say something the resolver does not honour.
            blockers.push({ code: "unexpected_times", message: "An unavailable exception carries no times.", field: "start_time" });
        }
        return blockers.length > 0 ? { ok: false, blockers } : { ok: true, value: src };
    },

    async resolveEligibility({ payload }) {
        const blockers = t(payload?.employment_id)
            ? []
            : [{ code: "missing_employment", message: "employment_id is required", field: "employment_id" }];
        return { eligible: blockers.length === 0, blockers, availableTransitions: [], requiredInputs: [] };
    },

    async buildPreview({ payload }) {
        const kind = t(payload?.exception_kind);
        return {
            summary: kind === "unavailable"
                ? "Mark this date unavailable, whatever the usual pattern says."
                : "Make this date available for specific hours, replacing the usual pattern.",
            changes: ["Record the exception", "Leave the recurring pattern untouched"],
        };
    },

    async execute({ supabase, ctx, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        try {
            const row = await addAvailabilityException(supabase, {
                orgId: ctx.orgId,
                employmentId: t(payload.employment_id),
                date: t(payload.exception_date),
                kind: t(payload.exception_kind) as "unavailable" | "available",
                startTime: t(payload.start_time) || null,
                endTime: t(payload.end_time) || null,
                reason: t(payload.reason) || null,
                actorUserId: ctx.userId ?? null,
            });
            return okResult(AVAILABILITY_ADD_EXCEPTION_ACTION_KEY, correlationId,
                t(payload.employment_id), row.id, { exception: row });
        } catch (err) {
            return failureResult(correlationId, err);
        }
    },
};

export const staffAvailabilityCancelExceptionAction: RegisteredAction = {
    ...baseShape,
    actionKey: AVAILABILITY_CANCEL_EXCEPTION_ACTION_KEY,
    defaultLabel: "Cancel availability exception",
    // The action vocabulary is destructive | none | required; "required" is the
    // confirm-before-execute tier. Withdrawing an exception changes who can be
    // asked to work on a date, so it is worth a deliberate second act.
    confirmationPolicy: "required" as const,
    description:
        "Withdraw a dated exception so the usual pattern applies again. The exception is deactivated, never deleted.",

    validatePayload(payload) {
        const src = payload ?? {};
        return t(src.exception_id)
            ? { ok: true, value: src }
            : { ok: false, blockers: [{ code: "missing_exception", message: "exception_id is required", field: "exception_id" }] };
    },

    async resolveEligibility({ payload }) {
        const blockers = t(payload?.exception_id)
            ? []
            : [{ code: "missing_exception", message: "exception_id is required", field: "exception_id" }];
        return { eligible: blockers.length === 0, blockers, availableTransitions: [], requiredInputs: [] };
    },

    async buildPreview() {
        return {
            summary: "Withdraw this exception; the usual pattern applies again.",
            changes: ["Deactivate the exception", "Keep it as history — it explains past scheduling"],
        };
    },

    async execute({ supabase, ctx, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        try {
            const row = await cancelAvailabilityException(
                supabase, ctx.orgId, t(payload.exception_id), ctx.userId ?? null);
            return okResult(AVAILABILITY_CANCEL_EXCEPTION_ACTION_KEY, correlationId,
                t(payload.employment_id), row.id, { exception: row });
        } catch (err) {
            return failureResult(correlationId, err);
        }
    },
};

/** Registered together so the registry cannot carry one command and miss another. */
export const STAFF_AVAILABILITY_ACTIONS = [
    staffAvailabilitySetRecurringAction,
    staffAvailabilityAddExceptionAction,
    staffAvailabilityCancelExceptionAction,
];
