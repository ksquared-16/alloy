import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { adminContextFailureResponse } from "@/lib/admin/getAdminContext";
import { requireAnalyticsV2AdminMutate } from "@/lib/metrics/platform/adminApiHelpers";
import { loadMetricDefinitionById } from "@/lib/metrics/platform/placementResolver";
import { evaluateAndSnapshotMetric } from "@/lib/metrics/platform/metricSnapshots";
import { apiOk, apiError } from "@/lib/api/apiResponse";
import { requireAnalyticsManageAccess } from "@/lib/admin/canReadAnalytics";
import { scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { snapshotReadableForScope } from "@/lib/metrics/metricScopeGuard";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
    /*
     * ANALYTICS TRUTH — materialises a metric snapshot into metric_platform_snapshots.
     *
     * This was reachable through ORG CONTEXT ALONE: no capability, no role, only portal
     * admission. `reports.write` is the established owner of this family — the promoted
     * Operational Intelligence model already declares its sibling routes under it — so no
     * vocabulary is invented here.
     */
    const analyticsAuth = await requireAnalyticsManageAccess();
    if (!analyticsAuth.ok) return analyticsAuth.response;

    const gate = await requireAnalyticsV2AdminMutate();
    if (!gate.ok) return gate.response;

    const { id } = await context.params;
    const supabase = createAdminClient();
    const definition = await loadMetricDefinitionById(supabase, gate.ctx.orgId, id);
    if (!definition) return apiError("NOT_FOUND", "Not found", 404, undefined, { request });

    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);

    const result = await evaluateAndSnapshotMetric({
        supabase,
        definition,
        ctx: { orgId: gate.ctx.orgId },
    });

    if (result.error) return apiError("INTERNAL", result.error, 500, undefined, { request });

    /*
     * WS0-A — the snapshot is materialised canonically (unrestricted), which is right for what is
     * STORED. What is RETURNED is a read: authority to materialise (`reports.write`) is not
     * authority to see the org figure, so a restricted operator gets the snapshot id and not the
     * value.
     */
    const evaluationVisible = snapshotReadableForScope(scopeDimensionsFromAccess(access), "org", null);
    return apiOk(
        evaluationVisible
            ? { evaluation: result.evaluation, snapshot_id: result.snapshotId }
            : { evaluation: null, evaluation_withheld: "snapshot_scope_wider_than_caller", snapshot_id: result.snapshotId },
        { request }
    );
}
