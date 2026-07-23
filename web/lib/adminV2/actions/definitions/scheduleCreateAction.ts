/**
 * Registered action: Create schedule (`schedule.create`).
 *
 * The Place-a-Child commit path for a needs-placement child. Per the Scheduling
 * command doctrine, every schedule mutation flows through a registered command;
 * this one delegates its writes to the invariant-owning commit adapter
 * (`commitCreateSchedule` → the effective-dated placement/schedule services), so
 * manual UI, queue, and BOS-confirmed proposals commit identically.
 */

import { randomUUID } from "crypto";
import {
    type ActionResult,
    type RegisteredAction,
} from "@/lib/adminV2/actions/actionTypes";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";
import { resolveOperationalEnrollmentTodayYmd } from "@/lib/childcareOperational/operationalEnrollmentApi";
import { commitCreateSchedule } from "@/lib/scheduling/commit";
import {
    SCHEDULE_CREATE_ACTION_KEY,
    buildScheduleCreateEligibility,
    buildScheduleCreatePreview,
    validateScheduleCreatePayload,
    trimmedValue,
} from "@/lib/scheduling/commands/scheduleCreateInputs";

export { SCHEDULE_CREATE_ACTION_KEY };

export const scheduleCreateAction: RegisteredAction = {
    actionKey: SCHEDULE_CREATE_ACTION_KEY,
    defaultLabel: "Create schedule",
    description: "Place a child by creating their schedule (room + pattern), effective-dated.",
    supportedEntityTypes: ["child"],
    supportedProcessKeys: [],
    requiredContext: { requiresEntityId: true, requiresOpportunity: false, requiresCustomer: false },
    audit: { eventType: "action_executed", category: "record", mutates: true },
    confirmationPolicy: "required",
    bosProposalSupport: false,

    validatePayload(payload) {
        return validateScheduleCreatePayload(payload);
    },

    async resolveEligibility({ payload }) {
        return buildScheduleCreateEligibility(payload);
    },

    async buildPreview({ payload }) {
        return buildScheduleCreatePreview(payload);
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        const enrollmentAgreementId = trimmedValue(payload.enrollment_agreement_id);
        const schedulePatternId = trimmedValue(payload.schedule_pattern_id);
        const startDate = trimmedValue(payload.start_date);
        const roomLocationId = trimmedValue(payload.room_location_id) || null;
        const programCategoryId = trimmedValue(payload.program_category_id) || null;

        if (!enrollmentAgreementId || !schedulePatternId || !startDate) {
            return {
                ok: false,
                correlationId,
                status: 400,
                error: "enrollment_agreement_id, schedule_pattern_id, and start_date are required.",
            };
        }

        try {
            const todayYmd = await resolveOperationalEnrollmentTodayYmd(supabase, ctx.orgId);
            const result = await commitCreateSchedule(supabase, {
                orgId: ctx.orgId,
                enrollmentAgreementId,
                schedulePatternId,
                startDate,
                roomLocationId,
                programCategoryId,
                sourceKey: "operator",
                actorUserId: ctx.userId ?? null,
                todayYmd,
            });

            return {
                ok: true,
                correlationId,
                result: {
                    actionKey: SCHEDULE_CREATE_ACTION_KEY,
                    entityType: "child",
                    entityId: invocation.entityId,
                    affectedId: result.scheduleAssignment.id,
                    detail: {
                        placement_id: result.placement.id,
                        schedule_assignment_id: result.scheduleAssignment.id,
                        created_placement: result.createdPlacement,
                        effective_start: startDate,
                    },
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
