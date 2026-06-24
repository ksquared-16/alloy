import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { adminContextFailureResponse } from "@/lib/admin/getAdminContext";
import { scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { requireAnalyticsV2AdminContext, zodErrorResponse } from "@/lib/metrics/platform/adminApiHelpers";
import { loadMetricDefinitionById } from "@/lib/metrics/platform/placementResolver";
import { evaluateMetricDefinition } from "@/lib/metrics/platform/metricEvaluator";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
    const gate = await requireAnalyticsV2AdminContext();
    if (!gate.ok) return gate.response;

    const { id } = await context.params;
    const supabase = createAdminClient();
    const definition = await loadMetricDefinitionById(supabase, gate.ctx.orgId, id);
    if (!definition) return NextResponse.json({ error: "Not found" }, { status: 404 });

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        // preview with defaults
    }

    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);

    try {
        const evaluation = await evaluateMetricDefinition({
            supabase,
            definition,
            ctx: {
                orgId: gate.ctx.orgId,
                siteLocationId: typeof body.site_id === "string" ? body.site_id : null,
                workUnitId: typeof body.work_unit_id === "string" ? body.work_unit_id : null,
            },
            accessScope: scopeDimensionsFromAccess(access),
        });
        return NextResponse.json({ evaluation });
    } catch (e) {
        return zodErrorResponse(e);
    }
}
