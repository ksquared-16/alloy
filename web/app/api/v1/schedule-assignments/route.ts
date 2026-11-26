/**
 * GET /api/v1/schedule-assignments — the committed, effective-dated schedule commitment.
 *
 * This is the CANONICAL schedule resource: a persisted, synchronisable statement of standing
 * intent — which recurring pattern applies to a child, at which site and room, over which dates.
 * Use it when you need to know what was committed and to be told when it changes.
 *
 * For "who is expected on Tuesday", use `/api/v1/schedule-days`, which derives dated occurrences
 * from these rows. That one is a projection and says so: it has no cursor and no sync token.
 *
 * Only children appear here. Staff schedules live in the same internal authority and are excluded
 * by the contract, not by a filter a handler could forget.
 */

import { externalCollectionRoute, uuidFilter } from "@/lib/platform/external/collectionRoute";
import { externalOperationRoute } from "@/lib/platform/external/operationRoute";
import { toPublicScheduleAssignment } from "@/lib/platform/external/resources/serviceStateResources";
import {
    createOrConverge,
    requiredDate,
    requiredId,
    resolveEnrollmentInAuthority,
    toScheduleResult,
} from "@/lib/platform/external/resources/serviceStateOperations";
import {
    createInitialScheduleAssignment,
    getOperationalScheduleAssignmentForAgreement,
} from "@/lib/childcareOperational/scheduleAssignmentService";

export const dynamic = "force-dynamic";

export const GET = externalCollectionRoute({
    route: "/api/v1/schedule-assignments",
    operationId: "listScheduleAssignments",
    subject: "schedule assignments",
    rpc: "list_external_schedule_assignments",
    params: (params) => {
        const child = uuidFilter(params, "child_id");
        if (!child.ok) return child;
        const site = uuidFilter(params, "site_id");
        if (!site.ok) return site;
        return {
            ok: true,
            values: { p_child_id: child.value, p_site_id: site.value, p_status: params.get("status") },
        };
    },
    toPublic: toPublicScheduleAssignment,
});

/**
 * POST /api/v1/schedule-assignments — set the committed schedule for an enrollment.
 *
 * Converges on an existing operational assignment rather than creating a second. To CHANGE one,
 * use `POST /api/v1/schedule-assignments/change`, which supersedes.
 *
 * The pattern is Alloy's, not the partner's: `schedule_pattern_id` names a recurrence the operator
 * has configured. An integration chooses among patterns; it does not invent one.
 */
export const POST = externalOperationRoute({
    route: "/api/v1/schedule-assignments",
    operationId: "setScheduleAssignment",
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

        const existing = await getOperationalScheduleAssignmentForAgreement(
            ctx.supabase,
            ctx.organizationId,
            resolved.value.agreementId,
        );
        if (existing) {
            return { ok: true, status: 200, result: toScheduleResult(existing as unknown as Record<string, unknown>) };
        }

        const outcome = await createOrConverge(
            () =>
                createInitialScheduleAssignment(ctx.supabase, {
                    orgId: ctx.organizationId,
                    enrollmentAgreementId: resolved.value.agreementId,
                    schedulePatternId: pattern.value,
                    startDate: startDate.value,
                    sourceKey: `external:${ctx.actorLabel}`,
                    todayYmd: ctx.todayYmd,
                }),
            () =>
                getOperationalScheduleAssignmentForAgreement(
                    ctx.supabase,
                    ctx.organizationId,
                    resolved.value.agreementId,
                ),
        );
        return {
            ok: true,
            status: outcome.created ? 201 : 200,
            result: toScheduleResult(outcome.row as unknown as Record<string, unknown>),
        };
    },
});
