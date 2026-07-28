import { NextRequest, NextResponse } from "next/server";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    createOrganizationWeightingDraft,
    ensureDefaultFteWeighting,
    ensureDefaultUnweightedWeighting,
    listOrganizationWeightings,
    publishOrganizationWeighting,
} from "@/lib/organizationWeightings/persist";
import type { WeightingSchemeId } from "@/lib/organizationWeightings/types";

export const dynamic = "force-dynamic";

function isRecord(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

/** GET /api/admin/organization-weightings */
export async function GET() {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }
    try {
        const supabase = createAdminClient();
        await ensureDefaultUnweightedWeighting(supabase, { orgId: ctx.orgId, userId: ctx.userId });
        await ensureDefaultFteWeighting(supabase, { orgId: ctx.orgId, userId: ctx.userId });
        const weightings = await listOrganizationWeightings(supabase, ctx.orgId);
        return NextResponse.json({ weightings });
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to list weightings" },
            { status: 500 },
        );
    }
}

/** POST /api/admin/organization-weightings */
export async function POST(req: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Admin role required" }, { status: 403 });
    }
    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    if (!isRecord(body)) return NextResponse.json({ error: "Expected object body" }, { status: 400 });
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
    const scheme = (
        body.scheme === "unweighted" || body.scheme === "days_per_week" ? body.scheme : "days_per_week"
    ) as WeightingSchemeId;

    try {
        const supabase = createAdminClient();
        let weighting = await createOrganizationWeightingDraft(supabase, {
            orgId: ctx.orgId,
            userId: ctx.userId,
            name,
            description: typeof body.description === "string" ? body.description : null,
            scheme,
        });
        if (body.publish === true) {
            weighting = await publishOrganizationWeighting(supabase, {
                orgId: ctx.orgId,
                userId: ctx.userId,
                id: weighting.id,
            });
        }
        return NextResponse.json({ weighting }, { status: 201 });
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Create failed" },
            { status: 500 },
        );
    }
}
