/**
 * Registered action: Create operational assignment (`assignment.create`).
 * Creates an independent secondary (or first) commitment — never overwrites.
 */

import { randomUUID } from "crypto";
import type { ActionResult, RegisteredAction } from "@/lib/adminV2/actions/actionTypes";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";
import { resolveOperationalEnrollmentTodayYmd } from "@/lib/childcareOperational/operationalEnrollmentApi";
import { createOperationalAssignment } from "@/lib/operationalAssignments/operationalAssignmentService";
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
                blockers: [{ code: "invalid_start_date", message: "start_date must be YYYY-MM-DD", field: "start_date" }],
            };
        }
        return { ok: true, value: src };
    },

    async resolveEligibility({ payload }) {
        const blockers: { code: string; message: string; field?: string }[] = [];
        if (!t(payload?.subject_type)) blockers.push({ code: "missing_subject_type", message: "subject_type is required", field: "subject_type" });
        if (!t(payload?.schedule_pattern_id)) blockers.push({ code: "missing_pattern", message: "schedule_pattern_id is required", field: "schedule_pattern_id" });
        if (!t(payload?.start_date)) blockers.push({ code: "missing_start_date", message: "start_date is required", field: "start_date" });
        // Assignment Type is product vocabulary — never create an ambiguous/default type.
        // First schedule creation remains on the Scheduling POST path; this command requires an explicit type.
        if (!t(payload?.assignment_type_id)) {
            blockers.push({
                code: "missing_assignment_type",
                message: "assignment_type_id is required — choose an Assignment Type (or Duplicate an assignment that has one)",
                field: "assignment_type_id",
            });
        }
        return { eligible: blockers.length === 0, blockers, availableTransitions: [], requiredInputs: [] };
    },

    async buildPreview({ payload }) {
        return {
            summary: `Create ${t(payload?.assignment_type_label) || "assignment"} effective ${t(payload?.start_date) || "—"}.`,
            changes: ["Insert independent assignment row", "Does not overwrite existing assignments"],
        };
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        const subjectType = t(payload.subject_type) as "child" | "staff";
        try {
            const todayYmd = await resolveOperationalEnrollmentTodayYmd(supabase, ctx.orgId);
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
                              enrollmentAgreementId: t(payload.enrollment_agreement_id),
                          },
                schedulePatternId: t(payload.schedule_pattern_id),
                startDate: t(payload.start_date),
                roomLocationId: t(payload.room_location_id) || null,
                programCategoryId: t(payload.program_category_id) || null,
                assignmentTypeId: t(payload.assignment_type_id) || null,
                isPrimary: payload.is_primary === true,
                supersedesAssignmentId: t(payload.supersedes_assignment_id) || null,
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
                    detail: { assignment_id: row.id, is_primary: row.is_primary },
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
