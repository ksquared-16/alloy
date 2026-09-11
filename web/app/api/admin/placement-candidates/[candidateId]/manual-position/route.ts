import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { assertExistingOpportunityMutableInAdminScope, scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { requireAdminOrOps } from "@/lib/adminAuth";
import {
    applyCanonicalSectionOrder,
    releaseManualPositionOverrides,
} from "@/lib/orchestration/placement/placementOverrideMutations";
import { loadWaitlistSectionOrder } from "@/lib/orchestration/placement/loadWaitlistSectionOrder";
import { planPrefixCanonicalOrdinals } from "@/lib/orchestration/placement/waitlistSectionOrderPlan";

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

    /*
     * ── A MOVE IS PLANNED AGAINST THE LIST THE OPERATOR WAS READING ──
     *
     * `pin_ordinal` is a POSITION, and a position only means something relative to a list. So the
     * work unit is required: it names which list, and the server then rebuilds that list itself
     * through the queue projection. The client says WHICH list; it never says what is in it.
     *
     * Refusing without it is deliberate. The alternative — fall back to writing the bare ordinal —
     * is precisely the behaviour that let a section accumulate three rows all claiming ordinal 2,
     * and a silent fallback would reintroduce it for any caller that forgot the field.
     */
    const workUnitId = readOptionalString(body.work_unit_id);
    if (!workUnitId) {
        return NextResponse.json(
            { error: "work_unit_id is required: a position is only meaningful against a specific queue" },
            { status: 400 },
        );
    }

    const section = await loadWaitlistSectionOrder({
        orgId: ctx.orgId,
        workUnitId,
        placementCandidateId: candidateId,
        queueKey: readOptionalString(body.queue_key),
    });
    if (!section) {
        return NextResponse.json(
            { error: "This candidate is not ranked in that work unit's waitlist" },
            { status: 409 },
        );
    }

    if (pinOrdinal < 1 || pinOrdinal > section.finalOrder.length) {
        return NextResponse.json(
            { error: `Enter a position between 1 and ${section.finalOrder.length}.` },
            { status: 400 },
        );
    }

    const plan = planPrefixCanonicalOrdinals({
        finalOrder: section.finalOrder,
        movedId: candidateId,
        target: pinOrdinal,
        currentlyPinnedIds: section.pinnedIds,
    });

    /*
     * The writer checks its own answer before writing it. `reproduces` is the planner replaying its
     * ordinals through the renderer's placement rule and confirming the result is the order it
     * intended. An assertion that never runs is not a guarantee, and the last writer's guarantee was
     * of exactly that kind.
     */
    if (!plan.reproduces) {
        return NextResponse.json(
            { error: "Could not express that position as a stable order; nothing was changed" },
            { status: 409 },
        );
    }

    const resultingPosition = plan.desiredOrder.indexOf(candidateId) + 1;
    if (resultingPosition !== pinOrdinal) {
        // The product contract in one line. If this ever fires, the move is refused rather than
        // applied to a place the operator did not ask for.
        return NextResponse.json(
            { error: "Requested position did not equal the resulting position; nothing was changed" },
            { status: 409 },
        );
    }

    const result = await applyCanonicalSectionOrder(supabase, {
        orgId: ctx.orgId,
        userId: ctx.userId,
        role: ctx.role,
        movedCandidateId: candidateId,
        ordinals: plan.ordinals,
        releasedIds: plan.releasedIds,
        reason: reason || "Manual waitlist position adjustment",
        sectionKey: sectionKey ?? section.sectionKey,
        siteId,
        fromPosition,
        toPosition: pinOrdinal,
        positionTotal: positionTotal ?? section.finalOrder.length,
        direction: body.direction === "up" || body.direction === "down" ? body.direction : null,
    });

    if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(
        {
            ok: true,
            section_key: section.sectionKey,
            position: resultingPosition,
            position_total: section.finalOrder.length,
            overrides_written: result.written,
            overrides_released: result.released,
        },
        { status: 200 },
    );
}
