import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import {
    makeDefaultSourceDisplayResolverRegistry,
    makeProcessingCaseReadDeps,
} from "@/lib/pos/processingCase/readModel/processingCaseReadModelDb";
import {
    countProcessingCasesByStatus,
    listProcessingCaseQueue,
} from "@/lib/pos/processingCase/readModel/processingCaseReadModelService";
import { buildProcessingQueueRequest } from "@/lib/pos/processingCase/readModel/buildProcessingQueueRequest";
import { recommendationFromFormSubmission } from "@/lib/pos/processingCase/recommendation/recommendationFromSubmission";
import {
    MANUAL_REVIEW_SUMMARY,
    summarizeIntakeRecommendation,
    type QueueRecommendationSummary,
} from "@/lib/pos/processingCase/recommendation/recommendationSummary";
import { parseStoredClassification } from "@/lib/pos/processingCase/classification/processingCaseClassificationDb";
import {
    classificationBadgeFromStored,
    type ClassificationBadgeVM,
} from "@/lib/pos/processingCase/classification/classificationBadge";

export const dynamic = "force-dynamic";

/**
 * Best-effort classification enrichment for the page of rows. Reads the EXISTING
 * stored `metadata.classification` in ONE batched query (no per-case calls, no
 * recompute) and relabels it via the shared badge helper. Cases without a stored
 * classification are simply absent → the UI shows "Awaiting classification".
 */
async function enrichClassifications(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string,
    caseIds: string[]
): Promise<Record<string, ClassificationBadgeVM>> {
    const out: Record<string, ClassificationBadgeVM> = {};
    if (caseIds.length === 0) return out;
    const { data } = await supabase
        .from("processing_cases")
        .select("id, metadata")
        .eq("org_id", orgId)
        .in("id", caseIds);
    for (const row of (data ?? []) as Array<{ id: string; metadata: unknown }>) {
        const badge = classificationBadgeFromStored(parseStoredClassification(row.metadata));
        if (badge) out[row.id] = badge;
    }
    return out;
}

/**
 * Best-effort recommendation enrichment for the page of rows already loaded.
 * Reuses the SAME FP8a computation as the per-case endpoint (no duplicated match
 * logic), runs once per page inside this single request (no N UI calls), and never
 * breaks the queue — any failure degrades that row to "Manual review".
 */
async function enrichRecommendations(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string,
    rows: Array<{ id: string; primarySource: { kind: string; id: string } | null }>
): Promise<Record<string, QueueRecommendationSummary>> {
    const out: Record<string, QueueRecommendationSummary> = {};
    await Promise.all(
        rows.map(async (row) => {
            try {
                const ps = row.primarySource;
                if (ps && ps.kind === "form_submission") {
                    const r = await recommendationFromFormSubmission(supabase, orgId, ps.id);
                    out[row.id] = r.supported ? summarizeIntakeRecommendation(r.recommendation) : MANUAL_REVIEW_SUMMARY;
                } else {
                    out[row.id] = MANUAL_REVIEW_SUMMARY;
                }
            } catch {
                out[row.id] = MANUAL_REVIEW_SUMMARY;
            }
        })
    );
    return out;
}

/**
 * GET /api/admin/processing/queue — read-only Processing Case queue (POS-FP3).
 *
 * Delegates to the FP2 read model for rows/counts, then attaches a thin, best-effort
 * recommendation summary per row (sibling map; the read model is untouched). GET only.
 */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { query, countQuery } = buildProcessingQueueRequest(request.nextUrl.searchParams, ctx.orgId);

    const supabase = createAdminClient();
    const deps = makeProcessingCaseReadDeps(supabase);
    const registry = makeDefaultSourceDisplayResolverRegistry(supabase, ctx.orgId);

    try {
        const [queue, counts] = await Promise.all([
            listProcessingCaseQueue(deps, registry, query),
            countProcessingCasesByStatus(deps, countQuery),
        ]);
        // Enrichment is isolated: if it throws, the queue still returns rows/counts.
        let recommendations: Record<string, QueueRecommendationSummary> = {};
        let classifications: Record<string, ClassificationBadgeVM> = {};
        try {
            const caseIds = queue.rows.map((r) => r.id);
            [recommendations, classifications] = await Promise.all([
                enrichRecommendations(
                    supabase,
                    ctx.orgId,
                    queue.rows.map((r) => ({
                        id: r.id,
                        primarySource: r.primarySource ? { kind: r.primarySource.kind, id: r.primarySource.id } : null,
                    }))
                ),
                enrichClassifications(supabase, ctx.orgId, caseIds),
            ]);
        } catch (enrichErr) {
            console.error("[api/admin/processing/queue] enrichment failed (non-fatal):", enrichErr);
        }
        return NextResponse.json({
            data: { rows: queue.rows, next_cursor: queue.nextCursor, counts, recommendations, classifications },
        });
    } catch (e) {
        // TEMP DIAGNOSTIC (POS-FP3): surface the true underlying error/stack in the
        // server log. The catch previously only returned e.message in the JSON body,
        // so the Next terminal showed just "GET … 500". Remove once root cause is found.
        console.error("[api/admin/processing/queue] 500 — underlying error:", e);
        if (e instanceof Error && e.stack) console.error(e.stack);
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to load processing queue" },
            { status: 500 }
        );
    }
}
