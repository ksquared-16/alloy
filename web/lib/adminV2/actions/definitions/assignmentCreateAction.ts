/**
 * Registered action: Create operational assignment (`assignment.create`).
 * Creates an independent secondary (or first) commitment — never overwrites.
 * Supports proposed (planning) rows when no enrollment agreement exists.
 */

import { randomUUID } from "crypto";
import type { ActionResult, RegisteredAction } from "@/lib/adminV2/actions/actionTypes";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";
import { resolveOperationalEnrollmentTodayYmd } from "@/lib/childcareOperational/operationalEnrollmentApi";
import { createOperationalAssignment } from "@/lib/operationalAssignments/operationalAssignmentService";
import { operatorFacingAssignmentError } from "@/lib/operationalAssignments/operatorAssignmentErrors";
import { isValidIsoDateString } from "@/lib/childcareOperational/effectiveDating";

export const ASSIGNMENT_CREATE_ACTION_KEY = "assignment.create";

function t(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

export const assignmentCreateAction: RegisteredAction = {
    actionKey: ASSIGNMENT_CREATE_ACTION_KEY,
    defaultLabel: "Create assignment",
    description: "Create an independent recurring operational assignment for a child or staff subject.",
    supportedEntityTypes: ["child", "person"],
    supportedProcessKeys: [],
    requiredContext: { requiresEntityId: true, requiresOpportunity: false, requiresCustomer: false },
    audit: { eventType: "action_executed", category: "record", mutates: true },
    confirmationPolicy: "required",
    bosProposalSupport: false,

    validatePayload(payload) {
        const src = payload ?? {};
        const startDate = t(src.start_date);
        if (startDate && !isValidIsoDateString(startDate)) {
            return {
                ok: false,
                blockers: [{ code: "invalid_start_date", message: "Start date must be YYYY-MM-DD", field: "start_date" }],
            };
        }
        const endDate = t(src.end_date);
        if (endDate && !isValidIsoDateString(endDate)) {
            return {
                ok: false,
                blockers: [{ code: "invalid_end_date", message: "End date must be YYYY-MM-DD", field: "end_date" }],
            };
        }
        if (startDate && endDate && endDate < startDate) {
            return {
                ok: false,
                blockers: [
                    { code: "invalid_end_date", message: "End date must be on or after the start date", field: "end_date" },
                ],
            };
        }
        return { ok: true, value: src };
    },

    async resolveEligibility({ payload }) {
        const blockers: { code: string; message: string; field?: string }[] = [];
        if (!t(payload?.subject_type)) {
            blockers.push({ code: "missing_subject_type", message: "Subject is required", field: "subject_type" });
        }
        if (!t(payload?.schedule_pattern_id)) {
            blockers.push({ code: "missing_pattern", message: "Choose days and hours (schedule pattern)", field: "schedule_pattern_id" });
        }
        if (!t(payload?.start_date)) {
            blockers.push({ code: "missing_start_date", message: "Start date is required", field: "start_date" });
        }
        if (!t(payload?.assignment_type_id)) {
            blockers.push({
                code: "missing_assignment_type",
                message: "Choose an Assignment Category before saving",
                field: "assignment_type_id",
            });
        }
        const subjectType = t(payload?.subject_type);
        if (subjectType === "child") {
            const hasAgreement = Boolean(t(payload?.enrollment_agreement_id));
            const hasMember = Boolean(t(payload?.customer_member_id) || t(payload?.entity_id));
            const hasSite = Boolean(t(payload?.site_location_id));
            if (!hasAgreement && !(hasMember && hasSite)) {
                blockers.push({
                    code: "missing_child_anchor",
                    message: "Select a child and site to save a Proposed Assignment, or complete enrollment first",
                    field: "customer_member_id",
                });
            }
        }
        return { eligible: blockers.length === 0, blockers, availableTransitions: [], requiredInputs: [] };
    },

    async buildPreview({ payload }) {
        const purpose = t(payload?.assignment_type_label) || "Assignment";
        const proposed = !t(payload?.enrollment_agreement_id);
        return {
            summary: proposed
                ? `Save ${purpose} as Proposed (planning) effective ${t(payload?.start_date) || "—"}.`
                : `Create ${purpose} effective ${t(payload?.start_date) || "—"}.`,
            changes: proposed
                ? [
                      "This child is not enrolled yet — Assignment will be saved as Proposed",
                      "Does not create enrollment or billing",
                      "Does not count as committed attendance",
                  ]
                : ["Insert independent assignment row", "Does not overwrite existing assignments"],
        };
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        const subjectType = t(payload.subject_type) as "child" | "staff";
        try {
            const todayYmd = await resolveOperationalEnrollmentTodayYmd(supabase, ctx.orgId);
            const agreementId = t(payload.enrollment_agreement_id);
            const memberId = t(payload.customer_member_id) || (subjectType === "child" ? invocation.entityId : "");
            const row = await createOperationalAssignment(supabase, {
                orgId: ctx.orgId,
                subject:
                    subjectType === "staff"
                        ? {
                              type: "staff",
                              personId: t(payload.person_id) || invocation.entityId,
                              siteLocationId: t(payload.site_location_id),
                          }
                        : {
                              type: "child",
                              enrollmentAgreementId: agreementId || null,
                              customerMemberId: memberId || null,
                              siteLocationId: t(payload.site_location_id) || null,
                          },
                schedulePatternId: t(payload.schedule_pattern_id),
                startDate: t(payload.start_date),
                endDate: t(payload.end_date) || null,
                roomLocationId: t(payload.room_location_id) || null,
                programCategoryId: t(payload.program_category_id) || null,
                assignmentTypeId: t(payload.assignment_type_id) || null,
                isPrimary: payload.is_primary === true,
                supersedesAssignmentId: t(payload.supersedes_assignment_id) || null,
                commitmentKind: agreementId ? "committed" : "proposed",
                sourceKey: "operator",
                actorUserId: ctx.userId ?? null,
                todayYmd,
                metadata: payload.duplicate_of
                    ? { duplicated_from_assignment_id: t(payload.duplicate_of) }
                    : {},
            });
            return {
                ok: true,
                correlationId,
                result: {
                    actionKey: ASSIGNMENT_CREATE_ACTION_KEY,
                    entityType: invocation.entityType,
                    entityId: invocation.entityId,
                    affectedId: row.id,
                    detail: {
                        assignment_id: row.id,
                        is_primary: row.is_primary,
                        commitment_kind: row.commitment_kind ?? (agreementId ? "committed" : "proposed"),
                    },
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
