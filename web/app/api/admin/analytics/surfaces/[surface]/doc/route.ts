import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAnalyticsV2AdminContext, requireAnalyticsV2AdminMutate } from "@/lib/metrics/platform/adminApiHelpers";
import {
    isHeaderSurface,
    loadHeaderSurfaceDoc,
    saveHeaderSurfaceDoc,
} from "@/lib/metrics/platform/headerSurfacePersistence";
import type { SurfaceDoc } from "@/lib/platform/surfaceBuilder/surfaceDefinition";
import { requireAnalyticsManageAccess } from "@/lib/admin/canReadAnalytics";

export const dynamic = "force-dynamic";

const normalize = (s: string) => s.replace(/-/g, "_");

function isSurfaceDoc(value: unknown): value is SurfaceDoc {
    return Boolean(value) && typeof value === "object" && Array.isArray((value as { sections?: unknown }).sections);
}

/** GET — load a header surface (workspace_header / work_unit_header) as a builder SurfaceDoc. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ surface: string }> }) {
    const surface = normalize((await params).surface);
    if (!isHeaderSurface(surface)) return NextResponse.json({ error: "Unknown surface" }, { status: 404 });

    const gate = await requireAnalyticsV2AdminContext();
    if (!gate.ok) return gate.response;

    const supabase = createAdminClient();
    const doc = await loadHeaderSurfaceDoc(supabase, gate.ctx.orgId, surface);
    return NextResponse.json({ doc });
}

/** PUT — publish the header SurfaceDoc back to real metric_placements; returns the reloaded doc. */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ surface: string }> }) {
    /*
     * ANALYTICS TRUTH — persists an analytics surface document.
     *
     * This was reachable through ORG CONTEXT ALONE: no capability, no role, only portal
     * admission. `reports.write` is the established owner of this family — the promoted
     * Operational Intelligence model already declares its sibling routes under it — so no
     * vocabulary is invented here.
     */
    const analyticsAuth = await requireAnalyticsManageAccess();
    if (!analyticsAuth.ok) return analyticsAuth.response;

    const surface = normalize((await params).surface);
    if (!isHeaderSurface(surface)) return NextResponse.json({ error: "Unknown surface" }, { status: 404 });

    const gate = await requireAnalyticsV2AdminMutate();
    if (!gate.ok) return gate.response;

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const doc = (body as { doc?: unknown })?.doc ?? body;
    if (!isSurfaceDoc(doc)) return NextResponse.json({ error: "Expected a SurfaceDoc with a sections array" }, { status: 400 });

    const supabase = createAdminClient();
    const saved = await saveHeaderSurfaceDoc(supabase, gate.ctx.orgId, surface, doc);
    return NextResponse.json({ doc: saved });
}
