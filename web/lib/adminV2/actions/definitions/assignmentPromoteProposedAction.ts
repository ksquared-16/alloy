/**
 * Registered action: Promote proposed assignment → committed (`assignment.promote_proposed`).
 */

import { randomUUID } from "crypto";
import type { ActionResult, RegisteredAction } from "@/lib/adminV2/actions/actionTypes";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";
import { promoteProposedAssignment } from "@/lib/operationalAssignments/operationalAssignmentService";
import { operatorFacingAssignmentError } from "@/lib/operationalAssignments/operatorAssignmentErrors";

export const ASSIGNMENT_PROMOTE_PROPOSED_ACTION_KEY = "assignment.promote_proposed";

function t(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

export const assignmentPromoteProposedAction: RegisteredAction = {
    actionKey: ASSIGNMENT_PROMOTE_PROPOSED_ACTION_KEY,
    defaultLabel: "Promote proposed assignment",
    description: "Promote a Proposed (planning) Assignment onto an enrollment agreement as committed truth.",
    supportedEntityTypes: ["child"],
    supportedProcessKeys: [],
    requiredContext: { requiresEntityId: true, requiresOpportunity: false, requiresCustomer: false },
    audit: { eventType: "action_executed", category: "record", mutates: true },
    confirmationPolicy: "required",
    bosProposalSupport: false,

    validatePayload(payload) {
        const blockers: { code: string; message: string; field?: string }[] = [];
        if (!t(payload?.assignment_id)) {
            blockers.push({ code: "missing_assignment", message: "Select a Proposed Assignment to promote", field: "assignment_id" });
        }
        if (!t(payload?.enrollment_agreement_id)) {
            blockers.push({
                code: "missing_agreement",
                message: "Enrollment must be completed before this Assignment can become active",
                field: "enrollment_agreement_id",
            });
        }
        if (blockers.length) return { ok: false, blockers };
        return { ok: true, value: payload ?? {} };
    },

    async resolveEligibility({ payload }) {
        const blockers: { code: string; message: string; field?: string }[] = [];
        if (!t(payload?.assignment_id)) {
            blockers.push({ code: "missing_assignment", message: "Select a Proposed Assignment to promote", field: "assignment_id" });
        }
        if (!t(payload?.enrollment_agreement_id)) {
            blockers.push({
                code: "missing_agreement",
                message: "Enrollment must be completed before this Assignment can become active",
                field: "enrollment_agreement_id",
            });
        }
        return { eligible: blockers.length === 0, blockers, availableTransitions: [], requiredInputs: [] };
    },

    async buildPreview({ payload }) {
        return {
            summary: "Promote Proposed Assignment to committed enrollment Assignment.",
            changes: [
                "Link Assignment to the enrollment agreement",
                "Preserve Category, schedule, room, and dates when valid",
                "Does not create a second Assignment row",
            ],
        };
    },

    async execute({ supabase, ctx, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        try {
            const row = await promoteProposedAssignment(supabase, {
                orgId: ctx.orgId,
                assignmentId: t(payload.assignment_id),
                enrollmentAgreementId: t(payload.enrollment_agreement_id),
                actorUserId: ctx.userId ?? null,
            });
            return {
                ok: true,
                correlationId,
                result: {
                    actionKey: ASSIGNMENT_PROMOTE_PROPOSED_ACTION_KEY,
                    entityType: "child",
                    entityId: row.customer_member_id ?? row.id,
                    affectedId: row.id,
                    detail: { assignment_id: row.id, commitment_kind: "committed" },
                },
            };
        } catch (err) {
            if (err instanceof OperationalEnrollmentServiceError) {
                return {
                    ok: false,
                    correlationId,
                    status: err.code === "conflict" ? 409 : 422,
                    error: operatorFacingAssignmentError(err.message),
                };
            }
            throw err;
        }
    },
};
