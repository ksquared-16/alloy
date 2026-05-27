import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { assertExistingOpportunityMutableInAdminScope, scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { releasePlacementOverride } from "@/lib/orchestration/placement/placementOverrideMutations";

async function assertCandidateOpportunityScope(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string,
    candidateId: string
) {
    const { data: candidate, error } = await supabase
        .from("placement_candidates")
        .select("opportunity_id")
        .eq("org_id", orgId)
        .eq("id", candidateId)
        .maybeSingle();
    if (error || !candidate?.opportunity_id) return false;

    const access = await getAdminAccessContextCached();
    if (!access.ok) return false;
    return assertExistingOpportunityMutableInAdminScope(
        supabase,
        orgId,
        scopeDimensionsFromAccess(access),
        candidate.opportunity_id
    );
}

/** POST — release (deactivate) an active override; row history preserved (Card 5). */
export async function POST(
    request: NextRequest,
    context: { params: Promise<{ candidateId: string; overrideId: string }> }
) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { candidateId, overrideId } = await context.params;
    if (!candidateId?.trim() || !overrideId?.trim()) {
        return NextResponse.json({ error: "Missing candidate or override id" }, { status: 400 });
    }

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const supabase = createAdminClient();
    if (!(await assertRowOrg(supabase, "placement_candidates", candidateId, ctx.orgId)).ok) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!(await assertCandidateOpportunityScope(supabase, ctx.orgId, candidateId))) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const result = await releasePlacementOverride(supabase, {
        orgId: ctx.orgId,
        userId: ctx.userId,
        role: ctx.role,
        placementCandidateId: candidateId,
        overrideId,
        release_reason: typeof body.release_reason === "string" ? body.release_reason : "",
    });

    if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ ok: true, override: result.override });
}
