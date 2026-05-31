import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { assertExistingOpportunityMutableInAdminScope, scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { requireAdminOrOps } from "@/lib/adminAuth";
import {
    releaseManualPositionOverrides,
    upsertPlacementPinOverride,
} from "@/lib/orchestration/placement/placementOverrideMutations";

function readOptionalInt(raw: unknown): number | null {
    if (typeof raw === "number" && Number.isFinite(raw)) return Math.trunc(raw);
    if (typeof raw === "string" && raw.trim()) {
        const n = Number.parseInt(raw.trim(), 10);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

function readOptionalString(raw: unknown): string | null {
    return typeof raw === "string" && raw.trim() ? raw.trim() : null;
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

/** POST — apply manual waitlist position (pin override upsert or reset). */
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

    const supabase = createAdminClient();
    if (!(await assertRowOrg(supabase, "placement_candidates", candidateId, ctx.orgId)).ok) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!(await assertCandidateOpportunityScope(supabase, ctx.orgId, candidateId))) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const action = typeof body.action === "string" ? body.action.trim() : "move";
    const fromPosition = readOptionalInt(body.from_position);
    const toPosition = readOptionalInt(body.to_position);
    const positionTotal = readOptionalInt(body.position_total);
    const sectionKey = readOptionalString(body.section_key);
    const siteId = readOptionalString(body.site_id);

    if (action === "reset") {
        const result = await releaseManualPositionOverrides(supabase, {
            orgId: ctx.orgId,
            userId: ctx.userId,
            role: ctx.role,
            placementCandidateId: candidateId,
            release_reason: reason || "Reset manual adjustment",
            fromPosition,
            positionTotal,
            sectionKey,
            siteId,
        });
        if (!result.ok) {
            return NextResponse.json({ error: result.error }, { status: result.status });
        }
        return NextResponse.json({ ok: true, released_ids: result.released_ids });
    }

    const pinOrdinalRaw = body.pin_ordinal;
    const pinOrdinal =
        typeof pinOrdinalRaw === "number"
            ? pinOrdinalRaw
            : typeof pinOrdinalRaw === "string"
              ? Number.parseInt(pinOrdinalRaw, 10)
              : toPosition ?? NaN;

    if (!Number.isFinite(pinOrdinal)) {
        return NextResponse.json({ error: "pin_ordinal is required for manual position" }, { status: 400 });
    }

    const result = await upsertPlacementPinOverride(supabase, {
        orgId: ctx.orgId,
        userId: ctx.userId,
        role: ctx.role,
        placementCandidateId: candidateId,
        pin_ordinal: pinOrdinal,
        reason,
        direction:
            body.direction === "up" || body.direction === "down"
                ? body.direction
                : null,
        fromPosition,
        toPosition: toPosition ?? pinOrdinal,
        positionTotal,
        sectionKey,
        siteId,
    });

    if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ ok: true, override: result.override }, { status: 200 });
}
