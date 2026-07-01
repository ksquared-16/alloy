import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAnalyticsV2AdminMutate } from "@/lib/metrics/platform/adminApiHelpers";
import { copyGlobalMetricToOrg } from "@/lib/metrics/platform/copyTemplate";
import { loadMetricDefinitionById } from "@/lib/metrics/platform/placementResolver";
import { apiOk, apiError } from "@/lib/api/apiResponse";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/admin/analytics/metrics/[id]/copy — copy global template to org (copy-on-first-use). */
export async function POST(request: NextRequest, context: RouteContext) {
    const gate = await requireAnalyticsV2AdminMutate();
    if (!gate.ok) return gate.response;

    const { id } = await context.params;
    const supabase = createAdminClient();
    const source = await loadMetricDefinitionById(supabase, gate.ctx.orgId, id);
    if (!source) return apiError("NOT_FOUND", "Not found", 404, undefined, { request });

    const result = await copyGlobalMetricToOrg(supabase, gate.ctx.orgId, id, gate.ctx.userId);
    if (result.error && !result.item) {
        return apiError("BAD_REQUEST", result.error, 400, undefined, { request });
    }

    return apiOk({ item: result.item, copied: result.copied }, { request });
}
