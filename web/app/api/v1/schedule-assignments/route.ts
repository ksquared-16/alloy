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
import { toPublicScheduleAssignment } from "@/lib/platform/external/resources/serviceStateResources";

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
