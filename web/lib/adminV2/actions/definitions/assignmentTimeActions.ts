/**
 * Registered action for Assignment Time — the operator intent "these are the days
 * and hours this assignment runs".
 *
 * One command, because an operator answers the week as a whole. A per-weekday
 * command would leave the other days' fate ambiguous on every call, and the
 * ambiguity would have to be resolved by a convention nobody could see.
 *
 * ── ATOMICITY LIVES IN THE DATABASE ──
 *
 * Replacing a week is a delete and an insert, and supabase-js has no
 * multi-statement transaction. The handler therefore makes exactly one call, to
 * the Assignment Time function, exactly as the Coverage commands do.
 *
 * ── AUTHORIZATION IS CHECKED HERE, ON THE SERVER ──
 *
 * The assignment is re-read against `ctx.orgId` before anything is written, so a
 * direct API call meets the same refusal a rendered surface would. Hiding a
 * button is not a boundary.
 */

import { randomUUID } from "crypto";

import type { ActionBlocker, ActionResult, RegisteredAction } from "@/lib/adminV2/actions/actionTypes";
import {
    AssignmentTimeRejectedError,
    setAssignmentTime,
    validateAssignmentTimeDays,
    type AssignmentTimeDayInput,
} from "@/lib/assignmentTime/setAssignmentTime";
import type { SupabaseClient } from "@supabase/supabase-js";

export const ASSIGNMENT_SET_TIME_ACTION_KEY = "assignment.set_time";

function t(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

function blocker(code: string, message: string, field?: string): ActionBlocker {
    return { code, message, field: field ?? null };
}

/** The days an operator submitted, in the shape the service validates. */
function readDays(payload: Record<string, unknown> | undefined): AssignmentTimeDayInput[] {
    const raw = payload?.days;
    if (!Array.isArray(raw)) return [];
    return raw.map((d) => {
        const row = (d ?? {}) as Record<string, unknown>;
        return {
            weekday: Number(row.weekday),
            startTime: t(row.start_time ?? row.startTime) || null,
            endTime: t(row.end_time ?? row.endTime) || null,
        };
    });
}

export const assignmentSetTimeAction: RegisteredAction = {
    actionKey: ASSIGNMENT_SET_TIME_ACTION_KEY,
    defaultLabel: "Set assignment hours",
    description:
        "Record which days an assignment runs and the hours it runs on each of them. The reusable pattern is not changed.",
    supportedEntityTypes: ["person"],
    supportedProcessKeys: [],
    requiredContext: { requiresEntityId: false, requiresOpportunity: false, requiresCustomer: false },
    audit: { eventType: "action_executed", category: "record", mutates: true },
    confirmationPolicy: "none",
    bosProposalSupport: false,

    validatePayload(payload) {
        const blockers: ActionBlocker[] = [];
        if (!t(payload?.assignment_id)) {
            blockers.push(blocker("missing_assignment", "assignment_id is required", "assignment_id"));
        }
        if (!Array.isArray(payload?.days)) {
            blockers.push(blocker("missing_days", "days is required", "days"));
        } else {
            for (const problem of validateAssignmentTimeDays(readDays(payload))) {
                blockers.push(blocker("invalid_days", problem, "days"));
            }
        }
        if (blockers.length > 0) return { ok: false, blockers };
        return { ok: true, value: payload ?? {} };
    },

    async resolveEligibility({ payload }) {
        const blockers: ActionBlocker[] = [];
        if (!t(payload?.assignment_id)) {
            blockers.push(blocker("missing_assignment", "assignment_id is required", "assignment_id"));
        }
        return { eligible: blockers.length === 0, blockers, availableTransitions: [], requiredInputs: [] };
    },

    async buildPreview({ payload }) {
        const days = readDays(payload);
        const known = days.filter((d) => d.startTime).length;
        const unknown = days.length - known;
        return {
            summary: `Set hours for ${days.length} ${days.length === 1 ? "day" : "days"} a week.`,
            changes: [
                known > 0 ? `${known} ${known === 1 ? "day has" : "days have"} recorded hours` : "No day has recorded hours",
                ...(unknown > 0 ? [`${unknown} ${unknown === 1 ? "day recurs" : "days recur"} with hours not recorded`] : []),
                "The reusable schedule pattern is not changed",
            ],
        };
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        const assignmentId = t(payload.assignment_id);

        // The assignment must belong to this org before anything is written.
        const target = await readAssignment(supabase, ctx.orgId, assignmentId);
        if (!target) {
            return {
                ok: false,
                correlationId,
                status: 404,
                error: "That assignment was not found.",
                blockers: [blocker("assignment_not_found", "That assignment was not found.", "assignment_id")],
            };
        }

        try {
            const rows = await setAssignmentTime(supabase, {
                assignmentId,
                days: readDays(payload),
                actorUserId: ctx.userId ?? null,
            });
            return {
                ok: true,
                correlationId,
                result: {
                    actionKey: ASSIGNMENT_SET_TIME_ACTION_KEY,
                    entityType: invocation.entityType,
                    entityId: t(invocation.entityId) || target.subject_person_id || assignmentId,
                    affectedId: assignmentId,
                    detail: { assignment_id: assignmentId, weekday_rows: rows },
                },
            };
        } catch (err) {
            if (err instanceof AssignmentTimeRejectedError) {
                return {
                    ok: false,
                    correlationId,
                    status: 422,
                    error: err.message,
                    blockers: [blocker("assignment_time_rejected", err.message, "days")],
                };
            }
            throw err;
        }
    },
};

async function readAssignment(
    supabase: SupabaseClient,
    orgId: string,
    assignmentId: string
): Promise<{ id: string; subject_person_id: string | null } | null> {
    if (!assignmentId) return null;
    const { data, error } = await supabase
        .from("schedule_assignments")
        .select("id, subject_person_id")
        .eq("org_id", orgId)
        .eq("id", assignmentId)
        .maybeSingle();
    if (error) return null;
    return (data as never) ?? null;
}

export const ASSIGNMENT_TIME_ACTIONS: RegisteredAction[] = [assignmentSetTimeAction];
