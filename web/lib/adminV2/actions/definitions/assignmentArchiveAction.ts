/**
 * Registered action: Archive operational assignment (`assignment.archive`).
 */

import { randomUUID } from "crypto";
import type { ActionResult, RegisteredAction } from "@/lib/adminV2/actions/actionTypes";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";
import { resolveOperationalEnrollmentTodayYmd } from "@/lib/childcareOperational/operationalEnrollmentApi";
import { archiveOperationalAssignment } from "@/lib/operationalAssignments/archiveOperationalAssignment";
import { isValidIsoDateString } from "@/lib/childcareOperational/effectiveDating";

export const ASSIGNMENT_ARCHIVE_ACTION_KEY = "assignment.archive";

function t(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

export const assignmentArchiveAction: RegisteredAction = {
    actionKey: ASSIGNMENT_ARCHIVE_ACTION_KEY,
    defaultLabel: "Archive assignment",
    description: "End a non-primary operational assignment on an effective date.",
    supportedEntityTypes: ["child", "person", "schedule"],
    requiredContext: { requiresEntityId: true, requiresOpportunity: false, requiresCustomer: false },
    supportedProcessKeys: [],
    audit: { eventType: "action_executed", category: "record", mutates: true },
    confirmationPolicy: "required",
    bosProposalSupport: false,

    validatePayload(payload) {
        const endDate = t(payload?.end_date);
        if (endDate && !isValidIsoDateString(endDate)) {
            return {
                ok: false,
                blockers: [{ code: "invalid_end_date", message: "end_date must be YYYY-MM-DD", field: "end_date" }],
            };
        }
        return { ok: true, value: payload ?? {} };
    },

    async resolveEligibility({ payload }) {
        const blockers: { code: string; message: string; field?: string }[] = [];
        if (!t(payload?.assignment_id)) {
            blockers.push({ code: "missing_assignment", message: "assignment_id is required", field: "assignment_id" });
        }
        return { eligible: blockers.length === 0, blockers, availableTransitions: [], requiredInputs: [] };
    },

    async buildPreview({ payload }) {
        return {
            summary: `Archive assignment effective ${t(payload?.end_date) || "today"}.`,
            changes: ["Set end date", "Mark status ended", "Primary assignments are rejected"],
        };
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        try {
            const todayYmd = await resolveOperationalEnrollmentTodayYmd(supabase, ctx.orgId);
            const row = await archiveOperationalAssignment(supabase, {
                orgId: ctx.orgId,
                assignmentId: t(payload.assignment_id) || invocation.entityId,
                endDate: t(payload.end_date) || todayYmd,
                actorUserId: ctx.userId ?? null,
            });
            return {
                ok: true,
                correlationId,
                result: {
                    actionKey: ASSIGNMENT_ARCHIVE_ACTION_KEY,
                    entityType: invocation.entityType,
                    entityId: invocation.entityId,
                    affectedId: row.id,
                    detail: { assignment_id: row.id, end_date: row.end_date, status: row.status },
                },
            };
        } catch (err) {
            if (err instanceof OperationalEnrollmentServiceError) {
                return {
                    ok: false,
                    correlationId,
                    status: err.code === "conflict" ? 409 : 422,
                    error: err.message,
                };
            }
            throw err;
        }
    },
};
