/**
 * POST /api/v1/enrollments/void — an enrollment that never represented service.
 *
 * ── THE THREE ENDINGS, AND WHY A PARTNER NEEDS ALL THREE ──
 *
 *   ended     service happened and concluded
 *   canceled  a commitment was withdrawn before it began
 *   voided    the record was created or activated in error and was never real
 *
 * `/enrollments/end` already reaches the first two: it cancels an agreement that has not started
 * and ends one that has. Neither can tell the truth about a mistake. Ending one asserts that care
 * was delivered — and because the external visibility law treats `ended` as real history, it would
 * keep publishing the child, their household and their relationships to partners forever.
 *
 * ── IT IS REFUSED WHERE IT WOULD BE A LIE ──
 *
 * If attendance was recorded under the enrollment, a child actually arrived, and that is service
 * whatever the operator now wishes. The canonical fold decides — reversed and superseded facts do
 * not count — and a surviving fact makes this a `409`. Void is for records that were never real,
 * not for history someone regrets.
 *
 * Nothing is deleted. The enrollment stays readable on `GET /api/v1/enrollments` with
 * `status: "voided"`, its update clock advances, and the transition arrives on a normal
 * `updated_since` pass. Its placements and schedule assignments are cancelled in the same act, so
 * no operational row is left pointing at an enrollment that says it was never valid.
 *
 * Safe to retry: voiding an already-voided enrollment returns it unchanged.
 */

import { externalOperationRoute } from "@/lib/platform/external/operationRoute";
import {
    requiredId,
    resolveEnrollmentInAuthority,
    toEnrollmentResult,
} from "@/lib/platform/external/resources/serviceStateOperations";
import { voidChildEnrollmentAgreement } from "@/lib/childcareOperational/enrollmentAgreementService";

export const dynamic = "force-dynamic";

export const POST = externalOperationRoute({
    route: "/api/v1/enrollments/void",
    operationId: "voidEnrollment",
    subject: "The enrollment",
    perform: async (body, ctx) => {
        const enrollment = requiredId(body, "enrollment_id");
        if (!enrollment.ok) return enrollment;

        const resolved = await resolveEnrollmentInAuthority(ctx, enrollment.value);
        if (!resolved.ok) return resolved;

        const voided = await voidChildEnrollmentAgreement(
            ctx.supabase,
            ctx.organizationId,
            resolved.value.agreementId,
        );
        return { ok: true, status: 200, result: toEnrollmentResult(voided as unknown as Record<string, unknown>) };
    },
});
