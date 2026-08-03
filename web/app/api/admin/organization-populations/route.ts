import { NextRequest, NextResponse } from "next/server";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    createOrganizationPopulationDraft,
    ensureDefaultActiveChildrenPopulation,
    listOrganizationPopulations,
    publishOrganizationPopulation,
} from "@/lib/organizationPopulations/persist";

export const dynamic = "force-dynamic";

function isRecord(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

/** GET /api/admin/organization-populations */
export async function GET() {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }
    try {
        const supabase = createAdminClient();
        await ensureDefaultActiveChildrenPopulation(supabase, {
            orgId: ctx.orgId,
            userId: ctx.userId,
        });
        const populations = await listOrganizationPopulations(supabase, ctx.orgId);
        return NextResponse.json({ populations });
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to list populations" },
            { status: 500 },
        );
    }
}

/** POST /api/admin/organization-populations — create draft (+ optional publish) */
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

    try {
        const supabase = createAdminClient();
        let population = await createOrganizationPopulationDraft(supabase, {
            orgId: ctx.orgId,
            userId: ctx.userId,
            name,
            description: typeof body.description === "string" ? body.description : null,
            predicate: "expected_in_room_on_date",
        });
        if (body.publish === true) {
            population = await publishOrganizationPopulation(supabase, {
                orgId: ctx.orgId,
                userId: ctx.userId,
                id: population.id,
            });
        }
        return NextResponse.json({ population }, { status: 201 });
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Create failed" },
            { status: 500 },
        );
    }
}
