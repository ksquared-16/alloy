/**
 * Registered action: Set primary assignment (`assignment.set_primary`).
 */

import { randomUUID } from "crypto";
import {
    type ActionResult,
    type RegisteredAction,
} from "@/lib/adminV2/actions/actionTypes";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";
import { resolveOperationalEnrollmentTodayYmd } from "@/lib/childcareOperational/operationalEnrollmentApi";
import {
    ASSIGNMENT_SET_PRIMARY_ACTION_KEY,
    setPrimaryOperationalAssignment,
} from "@/lib/operationalAssignments/setPrimaryOperationalAssignment";
import {
    buildAssignmentSetPrimaryEligibility,
    buildAssignmentSetPrimaryPreview,
    validateAssignmentSetPrimaryPayload,
    trimmedValue,
} from "@/lib/operationalAssignments/commands/assignmentSetPrimaryInputs";

export { ASSIGNMENT_SET_PRIMARY_ACTION_KEY };

export const assignmentSetPrimaryAction: RegisteredAction = {
    actionKey: ASSIGNMENT_SET_PRIMARY_ACTION_KEY,
    defaultLabel: "Set primary assignment",
    description:
        "Designate the effective-dated primary (operational home) assignment for a child or staff subject.",
    supportedEntityTypes: ["child", "person"],
    supportedProcessKeys: [],
    requiredContext: { requiresEntityId: true, requiresOpportunity: false, requiresCustomer: false },
    audit: { eventType: "action_executed", category: "record", mutates: true },
    confirmationPolicy: "required",
    bosProposalSupport: false,

    validatePayload(payload) {
        return validateAssignmentSetPrimaryPayload(payload);
    },

    async resolveEligibility({ payload }) {
        return buildAssignmentSetPrimaryEligibility(payload);
    },

    async buildPreview({ payload }) {
        return buildAssignmentSetPrimaryPreview(payload);
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        const subjectType = trimmedValue(payload.subject_type) as "child" | "staff";
        const effectiveDate = trimmedValue(payload.effective_date);
        const promoteAssignmentId = trimmedValue(payload.promote_assignment_id) || null;
        const schedulePatternId = trimmedValue(payload.schedule_pattern_id) || null;

        try {
            const todayYmd = await resolveOperationalEnrollmentTodayYmd(supabase, ctx.orgId);
            const result = await setPrimaryOperationalAssignment(supabase, {
                orgId: ctx.orgId,
                subject:
                    subjectType === "child"
                        ? {
                              type: "child",
                              enrollmentAgreementId: trimmedValue(payload.enrollment_agreement_id),
                          }
                        : {
                              type: "staff",
                              personId: trimmedValue(payload.person_id) || invocation.entityId,
                              siteLocationId: trimmedValue(payload.site_location_id),
                          },
                effectiveDate,
                promoteAssignmentId,
                create: schedulePatternId
                    ? {
                          schedulePatternId,
                          roomLocationId: trimmedValue(payload.room_location_id) || null,
                          programCategoryId: trimmedValue(payload.program_category_id) || null,
                          assignmentTypeId: trimmedValue(payload.assignment_type_id) || null,
                      }
                    : null,
                idempotencyKey: trimmedValue(payload.idempotency_key) || null,
                sourceKey: "operator",
                actorUserId: ctx.userId ?? null,
                todayYmd,
            });

            return {
                ok: true,
                correlationId,
                result: {
                    actionKey: ASSIGNMENT_SET_PRIMARY_ACTION_KEY,
                    entityType: invocation.entityType,
                    entityId: invocation.entityId,
                    affectedId: result.primary.id,
                    detail: {
                        primary_assignment_id: result.primary.id,
                        prior_primary_assignment_id: result.priorPrimaryId,
                        prior_primary_close_date: result.priorPrimaryCloseDate,
                        created: result.created,
                        idempotent: result.idempotent,
                        refresh_targets: result.refreshTargets,
                    },
                },
            };
        } catch (err) {
            if (err instanceof OperationalEnrollmentServiceError) {
                return {
                    ok: false,
                    correlationId,
                    status: err.code === "conflict" ? 409 : err.code === "not_found" ? 404 : 422,
                    error: err.message,
                };
            }
            throw err;
        }
    },
};
