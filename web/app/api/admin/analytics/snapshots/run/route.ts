import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { isInternalCronAuthorized } from "@/lib/admin/cronAuth";
import { getAdminContextCached, adminContextFailureResponse } from "@/lib/admin/getAdminContext";
import { requireAnalyticsManageAccess } from "@/lib/admin/canReadAnalytics";
import {
    runAllOrgMetricPlatformSnapshots,
    runMetricSnapshotsForOrg,
} from "@/lib/metrics/platform/metricSnapshotRunner";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/analytics/snapshots/run
 * Auth: x-cron-token (all orgs) or admin session (single org).
 */
export async function POST(request: NextRequest) {
    const cronOk = isInternalCronAuthorized(request);
    let orgId: string | null = null;

    if (!cronOk) {
        const ctx = await getAdminContextCached();
        if (!ctx.ok) return adminContextFailureResponse(ctx);
        /*
         * THE OPERATOR BRANCH ASKS FOR ANALYTICS AUTHORITY; THE CRON BRANCH IS UNTOUCHED.
         *
         * Running snapshots materialises analytics truth into metric_platform_snapshots, so an
         * operator invoking it needs `reports.write` — the key the promoted Operational
         * Intelligence model already uses for the sibling routes. The role TITLE that stood here
         * admitted an admin whose package withholds that key and refused a custom Analytics
         * Writer who holds it.
         *
         * `isInternalCronAuthorized` above is machine authentication on a separate credential and
         * is deliberately left alone: it is not a role title standing in for a capability.
         */
        const analyticsAuth = await requireAnalyticsManageAccess();
        if (!analyticsAuth.ok) return analyticsAuth.response;
        orgId = ctx.orgId;
    }

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        // defaults
    }

    const metricDefinitionIds = Array.isArray(body.metric_definition_ids)
        ? (body.metric_definition_ids as string[])
        : undefined;
    const orgIdFilter = typeof body.org_id === "string" ? body.org_id : orgId;

    const supabase = createAdminClient();

    if (cronOk && !orgIdFilter) {
        const result = await runAllOrgMetricPlatformSnapshots({
            supabase,
            metricDefinitionIds,
        });
        return NextResponse.json({ mode: "cron_all_orgs", ...result });
    }

    if (!orgIdFilter) {
        return NextResponse.json({ error: "org_id required" }, { status: 400 });
    }

    const result = await runMetricSnapshotsForOrg(supabase, {
        orgId: orgIdFilter,
        metricDefinitionIds,
        contextType: typeof body.context_type === "string" ? body.context_type : "org",
        contextId: typeof body.context_id === "string" ? body.context_id : null,
        workUnitId: typeof body.work_unit_id === "string" ? body.work_unit_id : null,
        siteLocationId: typeof body.site_id === "string" ? body.site_id : null,
    });

    return NextResponse.json({ mode: cronOk ? "cron_single_org" : "admin_single_org", ...result });
}
