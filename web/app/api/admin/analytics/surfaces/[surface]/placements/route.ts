import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAnalyticsV2AdminContext } from "@/lib/metrics/platform/adminApiHelpers";
import { resolvePlacementsForSurface } from "@/lib/metrics/platform/placementResolver";
import type { MetricSurface } from "@/lib/metrics/platform/types";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ surface: string }> };

const VALID_SURFACES = new Set<string>([
    "workspace_header",
    "business_process_tile",
    "work_unit_header",
    "drawer",
    "operational_intelligence",
    "dashboard",
    "report",
    "portal",
    "mobile",
]);

export async function GET(request: NextRequest, context: RouteContext) {
    const gate = await requireAnalyticsV2AdminContext();
    if (!gate.ok) return gate.response;

    const { surface } = await context.params;
    if (!VALID_SURFACES.has(surface)) {
        return NextResponse.json({ error: "Invalid surface" }, { status: 400 });
    }

    const surfaceKey = request.nextUrl.searchParams.get("surface_key") ?? "default";
    const placementZone = request.nextUrl.searchParams.get("placement_zone") ?? undefined;

    const supabase = createAdminClient();
    const items = await resolvePlacementsForSurface({
        supabase,
        orgId: gate.ctx.orgId,
        surface: surface as MetricSurface,
        surfaceKey,
        placementZone,
    });

    return NextResponse.json({ items, surface, surface_key: surfaceKey, placement_zone: placementZone ?? null });
}
