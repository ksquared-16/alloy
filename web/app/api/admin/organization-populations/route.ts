/**
 * ORGANIZATION POPULATIONS — who a measurement counts, which is a reporting definition.
 *
 * A Population names the subject set an Operational Intelligence calculation measures
 * (`expected_in_room_on_date`, room-grain), and `evaluateForRoom` and the Calculation Library read
 * it to produce a number. Defining one is analytics configuration, and `reports.write` —
 * ANALYTICS_MANAGE_PERMISSION — already owns every mutation under `organization-calculations/` and
 * `metrics/` that consumes it.
 *
 * It asked `ctx.role !== "admin"`, which admitted an administrator whose package withholds the key
 * and refused a custom Analytics Manager who holds it, on a surface where the Calculation Library
 * beside it had already been decided on the grant.
 *
 * THE AUTHORITY IS BOUNDED BY THE HANDLER, NOT BY THE COLUMN. The draft lands in
 * `org_settings.metadata` under this family's own key: the caller names a population, never a
 * metadata path, so holding `reports.write` does not become a licence to write organization
 * settings generally. That is the same boundary Business Process drew when it declined the
 * attention-rules metadata shape.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAnalyticsManageAccess } from "@/lib/admin/canReadAnalytics";
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
    const analyticsAuth = await requireAnalyticsManageAccess();
    if (!analyticsAuth.ok) return analyticsAuth.response;
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
