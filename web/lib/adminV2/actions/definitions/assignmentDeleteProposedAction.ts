/**
 * Registered action: Delete a Proposed assignment (`assignment.delete_proposed`).
 *
 * Covers:
 * 1. Real OA rows with `commitment_kind=proposed` — hard delete the assignment row.
 * 2. Synthetic pre-enrollment drafts (`proposed:<customer_member_id>`) projected from
 *    `process_instances.metadata` — clear schedule draft facts via participation edit.
 *
 * Committed assignments are never eligible (archive/supersede instead).
 */

import { randomUUID } from "crypto";
import type { ActionResult, RegisteredAction } from "@/lib/adminV2/actions/actionTypes";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";
import { applyChildParticipationEdit } from "@/lib/childcareOperational/applyChildParticipationEdit";
import { deleteProposedOperationalAssignment } from "@/lib/operationalAssignments/operationalAssignmentService";
import { operatorFacingAssignmentError } from "@/lib/operationalAssignments/operatorAssignmentErrors";
import { emitEvent } from "@/lib/emitEvent";
import {
    customerMemberIdFromProposedDraftAssignmentId,
    isProposedDraftAssignmentId,
} from "@/lib/scheduling/projection/proposedDraftAssignmentId";

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
            changes: [
                "Remove the proposed schedule from planning projections",
                "Committed assignments are never eligible for this action",
            ],
        };
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        try {
            const assignmentId = t(payload.assignment_id) || invocation.entityId;

            // Pre-enrollment draft projected as `proposed:<member_id>` — clear PI metadata.
            if (isProposedDraftAssignmentId(assignmentId)) {
                const memberId =
                    customerMemberIdFromProposedDraftAssignmentId(assignmentId)
                    || t(invocation.entityId);
                if (!memberId) {
                    return {
                        ok: false,
                        correlationId,
                        status: 422,
                        error: "Could not resolve the child for this proposed schedule.",
                    };
                }
                const cleared = await applyChildParticipationEdit(supabase, {
                    orgId: ctx.orgId,
                    customerMemberId: memberId,
                    actorUserId: ctx.userId ?? null,
                    patch: {
                        schedule_type: null,
                        program_room_cohort_key: null,
                        start_date: null,
                        end_date: null,
                        weekdays: null,
                        scheduleTimes: null,
                    },
                });
                if (!cleared.ok) {
                    return {
                        ok: false,
                        correlationId,
                        status: 422,
                        error: operatorFacingAssignmentError(cleared.error ?? "Could not clear proposed schedule."),
                    };
                }

                try {
                    await emitEvent({
                        org_id: ctx.orgId,
                        event_type: "action_executed",
                        entity_type: invocation.entityType,
                        entity_id: invocation.entityId,
                        payload: {
                            action_key: ASSIGNMENT_DELETE_PROPOSED_ACTION_KEY,
                            actor_user_id: ctx.userId ?? null,
                            assignment_id: assignmentId,
                            customer_member_id: memberId,
                            draft_cleared: true,
                            routed: cleared.routed,
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
                        affectedId: memberId,
                        detail: { assignment_id: assignmentId, deleted: true, draft_cleared: true },
                    },
                };
            }

            const row = await deleteProposedOperationalAssignment(supabase, {
                orgId: ctx.orgId,
                assignmentId,
                actorUserId: ctx.userId ?? null,
            });

            // Clearing the participation draft prevents buildSchedulingProjection from
            // regenerating a synthetic `proposed:<member>` assignment after the last
            // ledger proposed row is removed (no agreement → draft fallback).
            const memberId = t(row.customer_member_id);
            if (memberId) {
                const cleared = await applyChildParticipationEdit(supabase, {
                    orgId: ctx.orgId,
                    customerMemberId: memberId,
                    actorUserId: ctx.userId ?? null,
                    patch: {
                        schedule_type: null,
                        program_room_cohort_key: null,
                        start_date: null,
                        end_date: null,
                        weekdays: null,
                        scheduleTimes: null,
                    },
                });
                if (!cleared.ok) {
                    console.warn(
                        "[assignmentDeleteProposedAction] participation draft clear failed after OA delete",
                        cleared.error,
                    );
                }
            }

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
                        draft_cleared: Boolean(memberId),
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
                    detail: {
                        assignment_id: row.id,
                        deleted: true,
                        draft_cleared: Boolean(memberId),
                    },
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
