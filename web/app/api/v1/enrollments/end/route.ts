/**
 * POST /api/v1/enrollments/end — end an enrollment.
 *
 * One external intent, three canonical outcomes, chosen by Alloy rather than by the caller:
 * an agreement that has not started is cancelled, one in service is marked ending on a date, and
 * one whose end date has passed is closed. A partner should not have to know which of those their
 * request becomes — that is exactly the kind of state machine a `PATCH status_key` would push onto
 * them, and getting it wrong would leave a child enrolled.
 */

import { externalOperationRoute } from "@/lib/platform/external/operationRoute";
import {
    optionalDate,
    requiredId,
    resolveEnrollmentInAuthority,
    toEnrollmentResult,
} from "@/lib/platform/external/resources/serviceStateOperations";
import {
    cancelAgreementBeforeStart,
    getAgreementById,
    markAgreementEnded,
    markAgreementEnding,
} from "@/lib/childcareOperational/enrollmentAgreementService";

export const dynamic = "force-dynamic";

export const POST = externalOperationRoute({
    route: "/api/v1/enrollments/end",
    operationId: "endEnrollment",
    subject: "The enrollment",
    perform: async (body, ctx) => {
        const enrollment = requiredId(body, "enrollment_id");
        if (!enrollment.ok) return enrollment;
        const endDate = optionalDate(body, "end_date");
        if (!endDate.ok) return endDate;

        const resolved = await resolveEnrollmentInAuthority(ctx, enrollment.value);
        if (!resolved.ok) return resolved;

        const current = await getAgreementById(ctx.supabase, ctx.organizationId, resolved.value.agreementId);
        if (!current) {
            return { ok: false, error: { code: "not_found", message: "No such resource is available to this installation.", status: 404 } };
        }

        const status = (current as unknown as { status?: string }).status ?? "";

        /*
         * Already ended converges rather than refusing. A partner retrying an end it cannot
         * confirm should reach the same place, not a conflict it has to interpret.
         */
        if (status === "ended" || status === "canceled") {
            return { ok: true, status: 200, result: toEnrollmentResult(current as unknown as Record<string, unknown>) };
        }

        if (status === "pending_start") {
            const cancelled = await cancelAgreementBeforeStart(ctx.supabase, ctx.organizationId, resolved.value.agreementId);
            return { ok: true, status: 200, result: toEnrollmentResult(cancelled as unknown as Record<string, unknown>) };
        }

        if (endDate.value) {
            const ending = await markAgreementEnding(
                ctx.supabase,
                ctx.organizationId,
                resolved.value.agreementId,
                endDate.value,
                ctx.todayYmd,
            );
            return { ok: true, status: 200, result: toEnrollmentResult(ending as unknown as Record<string, unknown>) };
        }

        const ended = await markAgreementEnded(ctx.supabase, ctx.organizationId, resolved.value.agreementId);
        return { ok: true, status: 200, result: toEnrollmentResult(ended as unknown as Record<string, unknown>) };
    },
});
