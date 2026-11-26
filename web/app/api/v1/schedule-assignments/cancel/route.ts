/**
 * POST /api/v1/schedule-assignments/cancel — an assignment that should never have applied.
 *
 * `change` supersedes: it says these hours were real until the new ones began. This says they never
 * were. The distinction is not cosmetic here — assignments are expanded into concrete expected days
 * by `/api/v1/schedule-days`, so an erroneous assignment left "valid until yesterday" projects
 * attendance nobody ever owed. A cancelled assignment stops projecting, because the projection
 * admits only active and planned rows.
 *
 * The row is retained and turns `canceled`. Retry converges.
 */

import { externalOperationRoute } from "@/lib/platform/external/operationRoute";
import {
    requiredId,
    resolveServiceStateRowInAuthority,
    toScheduleResult,
} from "@/lib/platform/external/resources/serviceStateOperations";
import { cancelScheduleAssignment } from "@/lib/childcareOperational/scheduleAssignmentService";

export const dynamic = "force-dynamic";

export const POST = externalOperationRoute({
    route: "/api/v1/schedule-assignments/cancel",
    operationId: "cancelScheduleAssignment",
    subject: "The schedule assignment",
    perform: async (body, ctx) => {
        const assignment = requiredId(body, "schedule_assignment_id");
        if (!assignment.ok) return assignment;

        const resolved = await resolveServiceStateRowInAuthority(ctx, "schedule_assignments", assignment.value);
        if (!resolved.ok) return resolved;

        const cancelled = await cancelScheduleAssignment(ctx.supabase, {
            orgId: ctx.organizationId,
            assignmentId: resolved.value.id,
        });
        return { ok: true, status: 200, result: toScheduleResult(cancelled as unknown as Record<string, unknown>) };
    },
});
