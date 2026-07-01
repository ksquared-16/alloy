import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { assertExistingOpportunityMutableInAdminScope, scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createPlacementOverride } from "@/lib/orchestration/placement/placementOverrideMutations";
import { PLACEMENT_OVERRIDE_KINDS, type PlacementOverrideKind } from "@/lib/orchestration/placement/placementCandidateTypes";
import { getPlacementProfileFromRegistry } from "@/lib/orchestration/placement/placementPresetRegistry";

function asOverrideKind(raw: unknown): PlacementOverrideKind | null {
    const s = typeof raw === "string" ? raw.trim() : "";
    return (PLACEMENT_OVERRIDE_KINDS as readonly string[]).includes(s) ? (s as PlacementOverrideKind) : null;
}

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

/** POST — create active placement override for one candidate (Card 5). */
export async function POST(
    request: NextRequest,
    context: { params: Promise<{ candidateId: string }> }
) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { candidateId } = await context.params;
    if (!candidateId?.trim()) {
        return NextResponse.json({ error: "Missing placement candidate id" }, { status: 400 });
    }

    let body: Record<string, unknown>;
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const overrideKind = asOverrideKind(body.override_kind);
    if (!overrideKind) {
        return NextResponse.json({ error: "override_kind must be pin, tier_boost, or temporary" }, { status: 400 });
    }

    const supabase = createAdminClient();
    if (!(await assertRowOrg(supabase, "placement_candidates", candidateId, ctx.orgId)).ok) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!(await assertCandidateOpportunityScope(supabase, ctx.orgId, candidateId))) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const profile = getPlacementProfileFromRegistry("childcare_enrollment_waitlist_v2") ?? undefined;
    const result = await createPlacementOverride(supabase, {
        orgId: ctx.orgId,
        userId: ctx.userId,
        role: ctx.role,
        placementCandidateId: candidateId,
        override_kind: overrideKind,
        reason: typeof body.reason === "string" ? body.reason : "",
        payload:
            body.payload != null && typeof body.payload === "object" && !Array.isArray(body.payload)
                ? (body.payload as Record<string, unknown>)
                : {},
        expires_at: typeof body.expires_at === "string" ? body.expires_at : null,
        profile,
    });

    if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ ok: true, override: result.override }, { status: 201 });
}
