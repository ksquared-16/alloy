/**
 * GET /api/v1/enrollments — committed enrollment agreements.
 *
 * An agreement is the commitment that a child is enrolled at a site, from a date, until a date.
 * It is NOT the placement (which room) and NOT the schedule (which days) — those are their own
 * resources because they are their own commitments and change on their own terms.
 *
 * Deliberately absent: the sales-pipeline linkage an agreement carries internally, and the
 * Business Process machinery that produced it. A partner integrates against service state, not
 * against how Alloy operators arrived at it.
 */

import { externalCollectionRoute, uuidFilter } from "@/lib/platform/external/collectionRoute";
import { externalOperationRoute } from "@/lib/platform/external/operationRoute";
import { toPublicEnrollment } from "@/lib/platform/external/resources/serviceStateResources";
import {
    assertChildInAuthority,
    assertSiteInAuthority,
    createOrConverge,
    optionalDate,
    requiredId,
    toEnrollmentResult,
} from "@/lib/platform/external/resources/serviceStateOperations";
import {
    createChildEnrollmentAgreement,
    getOperationalAgreementForMemberSite,
} from "@/lib/childcareOperational/enrollmentAgreementService";

export const dynamic = "force-dynamic";

export const GET = externalCollectionRoute({
    route: "/api/v1/enrollments",
    operationId: "listEnrollments",
    subject: "enrollments",
    rpc: "list_external_enrollments",
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
    toPublic: toPublicEnrollment,
});

/**
 * POST /api/v1/enrollments — start an enrollment.
 *
 * The named intent, delegated to the canonical service that already performs it. A partner says
 * "this child is enrolling at this site from this date"; Alloy's domain rules decide whether that
 * is allowed, and their refusal is what the partner sees.
 *
 * ── IDEMPOTENT WITHOUT A KEY ──
 *
 * An operational agreement already existing for this child at this site converges on it rather
 * than creating a second. That is stronger than a supplied key: it also holds for a partner that
 * never retried and simply asked twice, and for two partners asking at once.
 */
export const POST = externalOperationRoute({
    route: "/api/v1/enrollments",
    operationId: "startEnrollment",
    subject: "The enrollment",
    perform: async (body, ctx) => {
        const child = requiredId(body, "child_id");
        if (!child.ok) return child;
        const site = requiredId(body, "site_id");
        if (!site.ok) return site;
        const startDate = optionalDate(body, "start_date");
        if (!startDate.ok) return startDate;

        // Both identifiers must be independently reachable. Neither is a key.
        const childAllowed = await assertChildInAuthority(ctx, child.value);
        if (!childAllowed.ok) return childAllowed;
        const siteAllowed = await assertSiteInAuthority(ctx, site.value);
        if (!siteAllowed.ok) return siteAllowed;

        const existing = await getOperationalAgreementForMemberSite(
            ctx.supabase,
            ctx.organizationId,
            child.value,
            site.value,
        );
        if (existing) {
            return { ok: true, status: 200, result: toEnrollmentResult(existing as unknown as Record<string, unknown>) };
        }

        const outcome = await createOrConverge(
            () =>
                createChildEnrollmentAgreement(ctx.supabase, {
                    orgId: ctx.organizationId,
                    customerMemberId: child.value,
                    siteLocationId: site.value,
                    startDate: startDate.value,
                    // Provenance: the installation's application, never an operator identity.
                    sourceKey: `external:${ctx.actorLabel}`,
                    todayYmd: ctx.todayYmd,
                }),
            () => getOperationalAgreementForMemberSite(ctx.supabase, ctx.organizationId, child.value, site.value),
        );
        return {
            ok: true,
            status: outcome.created ? 201 : 200,
            result: toEnrollmentResult(outcome.row as unknown as Record<string, unknown>),
        };
    },
});
