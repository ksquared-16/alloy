/**
 * Registered action: Change assignment room (`assignment.change_room`).
 * Effective-dated room move via supersede — never mutates room IDs in place.
 */

import { randomUUID } from "crypto";
import type { ActionResult, RegisteredAction } from "@/lib/adminV2/actions/actionTypes";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";
import { resolveOperationalEnrollmentTodayYmd } from "@/lib/childcareOperational/operationalEnrollmentApi";
import { createOperationalAssignment } from "@/lib/operationalAssignments/operationalAssignmentService";
import { operatorFacingAssignmentError } from "@/lib/operationalAssignments/operatorAssignmentErrors";
import { isValidIsoDateString } from "@/lib/childcareOperational/effectiveDating";

export const ASSIGNMENT_CHANGE_ROOM_ACTION_KEY = "assignment.change_room";

function t(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

export const assignmentChangeRoomAction: RegisteredAction = {
    actionKey: ASSIGNMENT_CHANGE_ROOM_ACTION_KEY,
    defaultLabel: "Move to room",
    description:
        "Move an assignment to another eligible room/operational space with an effective date (history-preserving supersede).",
    supportedEntityTypes: ["child", "person"],
    supportedProcessKeys: [],
    requiredContext: { requiresEntityId: true, requiresOpportunity: false, requiresCustomer: false },
    audit: { eventType: "action_executed", category: "record", mutates: true },
    confirmationPolicy: "required",
    bosProposalSupport: false,

    validatePayload(payload) {
        const src = payload ?? {};
        const startDate = t(src.start_date) || t(src.effective_from);
        if (startDate && !isValidIsoDateString(startDate)) {
            return {
                ok: false,
                blockers: [{ code: "invalid_start_date", message: "Effective date must be YYYY-MM-DD", field: "start_date" }],
            };
        }
        return { ok: true, value: src };
    },

    async resolveEligibility({ payload }) {
        const blockers: { code: string; message: string; field?: string }[] = [];
        if (!t(payload?.supersedes_assignment_id) && !t(payload?.assignment_id)) {
            blockers.push({
                code: "missing_source_assignment",
                message: "Select the assignment to move",
                field: "supersedes_assignment_id",
            });
        }
        if (!t(payload?.room_location_id)) {
            blockers.push({
                code: "missing_target_room",
                message: "Choose a target room or operational space",
                field: "room_location_id",
            });
        }
        if (!t(payload?.start_date) && !t(payload?.effective_from)) {
            blockers.push({
                code: "missing_effective_date",
                message: "Effective date is required",
                field: "start_date",
            });
        }
        if (!t(payload?.schedule_pattern_id)) {
            blockers.push({
                code: "missing_pattern",
                message: "Schedule pattern is required to preserve the assignment",
                field: "schedule_pattern_id",
            });
        }
        if (!t(payload?.assignment_type_id)) {
            blockers.push({
                code: "missing_assignment_type",
                message: "Assignment Category is required",
                field: "assignment_type_id",
            });
        }
        return { eligible: blockers.length === 0, blockers, availableTransitions: [], requiredInputs: [] };
    },

    async buildPreview({ payload }) {
        const room = t(payload?.room_location_label) || t(payload?.room_location_id) || "target room";
        const when = t(payload?.start_date) || t(payload?.effective_from) || "effective date";
        return {
            title: "Move assignment",
            summary: `Move to ${room} effective ${when}. History is preserved; proposed stays planned.`,
            fields: [],
            warnings: [],
            changes: [
                "Close the prior assignment as of the day before the effective date",
                `Open a new assignment in ${room} starting ${when}`,
            ],
        };
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        const subjectType = (t(payload.subject_type) || "child") as "child" | "staff";
        const supersedes = t(payload.supersedes_assignment_id) || t(payload.assignment_id);
        const startDate = t(payload.start_date) || t(payload.effective_from);
        try {
            const todayYmd = await resolveOperationalEnrollmentTodayYmd(supabase, ctx.orgId);
            const agreementId = t(payload.enrollment_agreement_id);
            const memberId = t(payload.customer_member_id) || (subjectType === "child" ? invocation.entityId : "");
            const forcedKind = t(payload.commitment_kind) as "proposed" | "committed" | "";
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
                startDate,
                roomLocationId: t(payload.room_location_id) || null,
                programCategoryId: t(payload.program_category_id) || null,
                assignmentTypeId: t(payload.assignment_type_id) || null,
                isPrimary: payload.is_primary === true,
                supersedesAssignmentId: supersedes || null,
                commitmentKind: forcedKind || (agreementId ? "committed" : "proposed"),
                sourceKey: "operator_change_room",
                actorUserId: ctx.userId ?? null,
                todayYmd,
                metadata: {
                    moved_from_assignment_id: supersedes,
                    move_effective_from: startDate,
                },
            });
            return {
                ok: true,
                correlationId,
                result: {
                    actionKey: ASSIGNMENT_CHANGE_ROOM_ACTION_KEY,
                    entityType: invocation.entityType,
                    entityId: invocation.entityId,
                    affectedId: row.id,
                    detail: {
                        assignment_id: row.id,
                        supersedes_assignment_id: supersedes,
                        room_location_id: row.room_location_id,
                        commitment_kind: row.commitment_kind,
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
