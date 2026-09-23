/**
 * POST /api/v1/schedule-assignments/change — change a child's committed schedule.
 *
 * SUPERSESSION, as with placement: a new assignment naming the one it replaces, with the prior
 * assignment closed the day before. History is not rewritten, so a partner's mirror stays
 * reconcilable and the schedule that applied last month still reads as it did.
 *
 * This never touches a generated schedule day. A day is a view of the commitment — changing a day
 * means changing the assignment it came from, which is this operation.
 */

import { externalOperationRoute } from "@/lib/platform/external/operationRoute";
import {
    requiredDate,
    requiredId,
    resolveEnrollmentInAuthority,
    toScheduleResult,
} from "@/lib/platform/external/resources/serviceStateOperations";
import { supersedeScheduleAssignment } from "@/lib/childcareOperational/scheduleAssignmentService";

export const dynamic = "force-dynamic";

export const POST = externalOperationRoute({
    route: "/api/v1/schedule-assignments/change",
    operationId: "changeScheduleAssignment",
    subject: "The schedule assignment",
    perform: async (body, ctx) => {
        const enrollment = requiredId(body, "enrollment_id");
        if (!enrollment.ok) return enrollment;
        const pattern = requiredId(body, "schedule_pattern_id");
        if (!pattern.ok) return pattern;
        const startDate = requiredDate(body, "start_date");
        if (!startDate.ok) return startDate;

        const resolved = await resolveEnrollmentInAuthority(ctx, enrollment.value);
        if (!resolved.ok) return resolved;

        const changed = await supersedeScheduleAssignment(ctx.supabase, {
            orgId: ctx.organizationId,
            enrollmentAgreementId: resolved.value.agreementId,
            schedulePatternId: pattern.value,
            startDate: startDate.value,
            sourceKey: `external:${ctx.actorLabel}`,
            todayYmd: ctx.todayYmd,
        });
        return { ok: true, status: 201, result: toScheduleResult(changed as unknown as Record<string, unknown>) };
    },
});
