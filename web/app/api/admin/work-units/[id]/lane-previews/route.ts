import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import {
    parseWorkspaceSiteIdFromSearchParams,
    resolveQueueRecordScopeConstraints,
} from "@/lib/admin/resolveQueueRecordScopeConstraints";
import { fetchEffectiveUserDisplayTimezone } from "@/lib/admin/timezoneContract";
import { buildQueueSummariesSharedBootstrap, QueueServiceError } from "@/lib/queues/QueueService";
import {
    loadWorkUnitLanePreviewBundle,
    WORK_UNIT_LANE_PREVIEW_ROW_LIMIT,
} from "@/lib/workspace/workUnitLanePreviewBundle";

function parseRepeatedParam(searchParams: URLSearchParams, name: string): string[] {
    return searchParams
        .getAll(name)
        .map((v) => v.trim())
        .filter(Boolean);
}

/**
 * GET — Bounded lane preview bundle for work-unit pill cache warm-up (post–primary-lane paint).
 * Preview rows only; not authoritative for drawer/entity detail.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const gate = await loadAdminRouteGate();
    if (!gate.ok) return adminRouteGateFailureResponse(gate);

    const { id: workUnitId } = await context.params;
    if (!workUnitId) return NextResponse.json({ error: "Missing work unit id" }, { status: 400 });

    const departmentId = (request.nextUrl.searchParams.get("department_id") ?? "").trim();
    if (!departmentId) {
        return NextResponse.json({ error: "department_id is required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    try {
        const workspaceSiteId = parseWorkspaceSiteIdFromSearchParams(request.nextUrl.searchParams);
        const [wuOrg, scopeBundle, viewerDisplayTimeZone, sharedBootstrap] = await Promise.all([
            assertRowOrg(supabase, "work_units", workUnitId, gate.orgId),
            resolveQueueRecordScopeConstraints(supabase, gate.orgId, gate.dim, workspaceSiteId),
            fetchEffectiveUserDisplayTimezone(supabase, {
                orgId: gate.orgId,
                userId: gate.userId,
            }),
            buildQueueSummariesSharedBootstrap(gate.orgId),
        ]);
        if (!wuOrg.ok) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
        const { recordScopeImpossible, recordScopeConstraints } = scopeBundle;

        const rawLimit = Number(request.nextUrl.searchParams.get("lane_row_limit") ?? WORK_UNIT_LANE_PREVIEW_ROW_LIMIT);
        const rowLimit = Number.isFinite(rawLimit)
            ? Math.min(Math.max(1, Math.floor(rawLimit)), WORK_UNIT_LANE_PREVIEW_ROW_LIMIT)
            : WORK_UNIT_LANE_PREVIEW_ROW_LIMIT;
        const omitTotalCount = request.nextUrl.searchParams.get("omit_total_count") !== "false";
        const primaryQueueKey = (request.nextUrl.searchParams.get("primary_queue_key") ?? "").trim() || null;

        const queueKeys = parseRepeatedParam(request.nextUrl.searchParams, "queue_key");
        const attentionBuckets = parseRepeatedParam(request.nextUrl.searchParams, "attention_bucket");

        const result = await loadWorkUnitLanePreviewBundle({
            ctx: {
                supabase,
                orgId: gate.orgId,
                departmentId,
                workUnitId,
                accessDim: gate.dim,
                recordScopeImpossible,
                recordScopeConstraints,
                viewerDisplayTimeZone,
                sharedBootstrap,
                rowLimit,
                omitTotalCount,
            },
            queueKeys,
            attentionBucketKeys: attentionBuckets,
            primaryQueueKey,
        });

        if ("error" in result && "status" in result) {
            return NextResponse.json({ error: result.error }, { status: result.status });
        }

        return NextResponse.json({
            previews: result.previews,
            capped: result.capped,
            runtime: {
                source: "work_unit_lane_preview_bundle",
                preview_count: result.previews.length,
            },
        });
    } catch (e) {
        if (e instanceof QueueServiceError) {
            return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
        }
        const msg = e instanceof Error && e.message ? e.message : "Unexpected error";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
