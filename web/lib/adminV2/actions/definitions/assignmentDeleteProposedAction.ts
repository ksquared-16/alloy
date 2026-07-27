/**
 * Registered action: Delete a Proposed assignment (`assignment.delete_proposed`).
 *
 * Proposed (planning-only) rows carry no attendance/billing history and no
 * primary-uniqueness invariant, so the operator can remove them outright — unlike
 * committed assignments, which must be archived/superseded, never deleted. This
 * writes its own `action_executed` audit event because the row (the only place
 * archive-style history would otherwise live) no longer exists after execution.
 */

import { randomUUID } from "crypto";
import type { ActionResult, RegisteredAction } from "@/lib/adminV2/actions/actionTypes";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";
import { deleteProposedOperationalAssignment } from "@/lib/operationalAssignments/operationalAssignmentService";
import { operatorFacingAssignmentError } from "@/lib/operationalAssignments/operatorAssignmentErrors";
import { emitEvent } from "@/lib/emitEvent";

export const ASSIGNMENT_DELETE_PROPOSED_ACTION_KEY = "assignment.delete_proposed";

function t(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

export const assignmentDeleteProposedAction: RegisteredAction = {
    actionKey: ASSIGNMENT_DELETE_PROPOSED_ACTION_KEY,
    defaultLabel: "Delete proposed assignment",
    description: "Remove a Proposed (planning-only) assignment from scheduling projections. Committed assignments are never eligible.",
    supportedEntityTypes: ["child", "person", "schedule"],
    requiredContext: { requiresEntityId: true, requiresOpportunity: false, requiresCustomer: false },
    supportedProcessKeys: [],
    audit: { eventType: "action_executed", category: "record", mutates: true },
    confirmationPolicy: "required",
    bosProposalSupport: false,

    validatePayload(payload) {
        if (!t(payload?.assignment_id)) {
            return {
                ok: false,
                blockers: [{ code: "missing_assignment", message: "assignment_id is required", field: "assignment_id" }],
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

    async buildPreview() {
        return {
            summary: "Delete this Proposed assignment permanently.",
            changes: ["Remove the assignment row", "Excluded from all planning/occupancy projections", "Committed assignments are never eligible for this action"],
        };
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        try {
            const assignmentId = t(payload.assignment_id) || invocation.entityId;
            const row = await deleteProposedOperationalAssignment(supabase, {
                orgId: ctx.orgId,
                assignmentId,
                actorUserId: ctx.userId ?? null,
            });

            try {
                await emitEvent({
                    org_id: ctx.orgId,
                    event_type: "action_executed",
                    entity_type: invocation.entityType,
                    entity_id: invocation.entityId,
                    payload: {
                        action_key: ASSIGNMENT_DELETE_PROPOSED_ACTION_KEY,
                        actor_user_id: ctx.userId ?? null,
                        assignment_id: row.id,
                        customer_member_id: row.customer_member_id,
                        room_location_id: row.room_location_id,
                        schedule_pattern_id: row.schedule_pattern_id,
                        start_date: row.start_date,
                    },
                });
            } catch (e) {
                console.warn("[assignmentDeleteProposedAction] action_executed emit failed", e);
            }

            return {
                ok: true,
                correlationId,
                result: {
                    actionKey: ASSIGNMENT_DELETE_PROPOSED_ACTION_KEY,
                    entityType: invocation.entityType,
                    entityId: invocation.entityId,
                    affectedId: row.id,
                    detail: { assignment_id: row.id, deleted: true },
                },
            };
        } catch (err) {
            if (err instanceof OperationalEnrollmentServiceError) {
                return {
                    ok: false,
                    correlationId,
                    status: err.code === "conflict" ? 409 : err.code === "not_found" ? 404 : 422,
                    error: operatorFacingAssignmentError(err.message),
                };
            }
            throw err;
        }
    },
};
