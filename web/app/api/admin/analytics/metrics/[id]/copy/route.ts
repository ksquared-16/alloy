import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAnalyticsV2AdminMutate } from "@/lib/metrics/platform/adminApiHelpers";
import { copyGlobalMetricToOrg } from "@/lib/metrics/platform/copyTemplate";
import { loadMetricDefinitionById } from "@/lib/metrics/platform/placementResolver";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/admin/analytics/metrics/[id]/copy — copy global template to org (copy-on-first-use). */
export async function POST(_request: NextRequest, context: RouteContext) {
    const gate = await requireAnalyticsV2AdminMutate();
    if (!gate.ok) return gate.response;

    const { id } = await context.params;
    const supabase = createAdminClient();
    const source = await loadMetricDefinitionById(supabase, gate.ctx.orgId, id);
    if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const result = await copyGlobalMetricToOrg(supabase, gate.ctx.orgId, id, gate.ctx.userId);
    if (result.error && !result.item) {
        return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ item: result.item, copied: result.copied });
}
