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

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/processing/queue — read-only Processing Case queue (POS-FP3).
 *
 * Delegates directly to the FP2 read model: this route only parses params and
 * serializes FP2 output. No duplicated enrichment / filtering / shaping. GET only.
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
        return NextResponse.json({
            data: { rows: queue.rows, next_cursor: queue.nextCursor, counts },
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
