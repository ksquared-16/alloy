import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { assertExistingOpportunityMutableInAdminScope, scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { loadOpportunityPlacementCandidates } from "@/lib/orchestration/placement/loadOpportunityPlacementCandidates";

function trimOrEmpty(v: unknown): string {
    return v != null && String(v).trim() !== "" ? String(v).trim() : "";
}

/**
 * GET — Placement candidates for one opportunity (Phase 2 — Card 2).
 * No rank/ordinal; stable shape for drawer / future family_row projection.
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

    try {
        const payload = await loadOpportunityPlacementCandidates({
            supabase,
            orgId: ctx.orgId,
            opportunityId,
        });
        return NextResponse.json(payload);
    } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to load placement candidates";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
