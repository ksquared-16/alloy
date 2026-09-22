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
import { toPublicEnrollment } from "@/lib/platform/external/resources/serviceStateResources";

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
