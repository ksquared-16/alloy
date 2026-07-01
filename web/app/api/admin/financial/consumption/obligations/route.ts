import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import {
    operationalEnrollmentErrorResponse,
    resolveOperationalEnrollmentTodayYmd,
} from "@/lib/childcareOperational/operationalEnrollmentApi";
import {
    getObligationDetail,
    listResolvedObligations,
    recomputeObligation,
    reviewObligation,
} from "@/lib/operationalConsumption/obligationReviewService";
import type { ObligationListFilters, ReviewStatus } from "@/lib/operationalConsumption/obligationReviewTypes";

/**
 * Draft Obligation Review (Operational Consumption, Slice 4) — PRE-POSTING.
 *   GET  ?id=<id>  → one obligation with event + draft charge + explanation + timeline.
 *   GET  (filters) → the review queue (status / review_status / review_required / source_family / event_key).
 *   POST { id, action } → review-only actions: mark_reviewed | flag | suppress | restore | recompute.
 *                         action=recompute with persist=false is a PREVIEW (no write).
 * Role-gated (admin/ops), org-isolated. Never posts / invoices / collects / writes the ledger.
 */
function str(v: string | null): string | null {
    return v != null && v.trim() ? v.trim() : null;
}

export async function GET(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const supabase = createAdminClient();
    try {
        const today = await resolveOperationalEnrollmentTodayYmd(supabase, ctx.orgId);
        const params = request.nextUrl.searchParams;
        const id = str(params.get("id"));
        if (id) {
            const detail = await getObligationDetail(supabase, ctx.orgId, id, today);
            return NextResponse.json({ obligation: detail }, { status: 200 });
        }
        const reviewRequiredRaw = params.get("review_required");
        const filters: ObligationListFilters = {
            status: str(params.get("status")),
            reviewStatus: str(params.get("review_status")) as ReviewStatus | null,
            reviewRequired: reviewRequiredRaw == null ? null : reviewRequiredRaw === "true",
            sourceFamily: str(params.get("source_family")),
            eventKey: str(params.get("event_key")),
        };
        const obligations = await listResolvedObligations(supabase, ctx.orgId, filters);
        return NextResponse.json({ obligations }, { status: 200 });
    } catch (e) {
        return operationalEnrollmentErrorResponse(e);
    }
}

export async function POST(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON", code: "invalid_input" }, { status: 400 });
    }

    const id = String(body.id ?? "").trim();
    const action = String(body.action ?? "").trim();
    if (!id) return NextResponse.json({ error: "id is required", code: "invalid_input" }, { status: 400 });
    if (!action) return NextResponse.json({ error: "action is required", code: "invalid_input" }, { status: 400 });

    const supabase = createAdminClient();
    try {
        const today = await resolveOperationalEnrollmentTodayYmd(supabase, ctx.orgId);
        // Recompute PREVIEW (no write) — distinct from the persisting `recompute` review action.
        if (action === "recompute" && body.persist !== true) {
            const result = await recomputeObligation(supabase, ctx.orgId, id, today, { persist: false, actorUserId: ctx.userId });
            return NextResponse.json({ recompute: result }, { status: 200 });
        }
        const reason = body.reason != null ? String(body.reason) : null;
        const detail = await reviewObligation(supabase, ctx.orgId, id, action, today, { reason, actorUserId: ctx.userId });
        return NextResponse.json({ obligation: detail }, { status: 200 });
    } catch (e) {
        return operationalEnrollmentErrorResponse(e);
    }
}
