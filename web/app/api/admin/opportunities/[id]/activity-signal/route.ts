import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { loadOpportunityActivitySignal } from "@/lib/admin/loadOpportunityActivitySignal";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { assertExistingOpportunityMutableInAdminScope, scopeDimensionsFromAccess } from "@/lib/admin/accessScope";

function trimOrEmpty(v: unknown): string {
    return v != null && String(v).trim() !== "" ? String(v).trim() : "";
}

/**
 * GET — Activity Signals V1 for a single opportunity (workflow_events + metadata rules).
 * Used by AdminEntityDrawer header; mirrors queue enrichment without N duplicate implementations.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { id: opportunityId } = await context.params;
    if (!trimOrEmpty(opportunityId)) {
        return NextResponse.json({ error: "Missing opportunity id" }, { status: 400 });
    }

    const supabase = createAdminClient();
    if (!(await assertRowOrg(supabase, "opportunities", opportunityId, ctx.orgId)).ok) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const accessDim = scopeDimensionsFromAccess(access);
    if (!(await assertExistingOpportunityMutableInAdminScope(supabase, ctx.orgId, accessDim, opportunityId))) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { data: opp, error: oppErr } = await supabase
        .from("opportunities")
        .select("id, status_key, work_unit_id, location_id")
        .eq("id", opportunityId)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (oppErr || !opp) {
        return NextResponse.json({ error: oppErr?.message ?? "Not found" }, { status: 404 });
    }

    const row = opp as { status_key?: string | null; work_unit_id?: string | null };
    const statusKey = trimOrEmpty(row.status_key) || "";
    const workUnitId = trimOrEmpty(row.work_unit_id) || null;

    let sig;
    try {
        sig = await loadOpportunityActivitySignal({
            supabase,
            orgId: ctx.orgId,
            opportunityId,
            statusKey: statusKey || null,
            workUnitId,
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to load activity signal";
        return NextResponse.json({ error: msg }, { status: 500 });
    }

    return NextResponse.json(sig);
}
