import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAnalyticsV2AdminContext, requireAnalyticsV2AdminMutate } from "@/lib/metrics/platform/adminApiHelpers";
import {
    loadOperationalIntelligenceDoc,
    saveOperationalIntelligenceDoc,
} from "@/lib/metrics/platform/operationalIntelligenceSurfacePersistence";
import type { SurfaceDoc } from "@/lib/platform/surfaceBuilder/surfaceDefinition";

export const dynamic = "force-dynamic";

/** GET — load the Operational Intelligence surface as a builder SurfaceDoc from real placements. */
export async function GET() {
    const gate = await requireAnalyticsV2AdminContext();
    if (!gate.ok) return gate.response;

    const supabase = createAdminClient();
    const doc = await loadOperationalIntelligenceDoc(supabase, gate.ctx.orgId);
    return NextResponse.json({ doc });
}

function isSurfaceDoc(value: unknown): value is SurfaceDoc {
    if (!value || typeof value !== "object") return false;
    const sections = (value as { sections?: unknown }).sections;
    return Array.isArray(sections);
}

/** PUT — publish the edited SurfaceDoc back to real metric_placements; returns the reloaded doc. */
export async function PUT(request: NextRequest) {
    const gate = await requireAnalyticsV2AdminMutate();
    if (!gate.ok) return gate.response;

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const doc = (body as { doc?: unknown })?.doc ?? body;
    if (!isSurfaceDoc(doc)) {
        return NextResponse.json({ error: "Expected a SurfaceDoc with a sections array" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const saved = await saveOperationalIntelligenceDoc(supabase, gate.ctx.orgId, doc);
    return NextResponse.json({ doc: saved });
}
