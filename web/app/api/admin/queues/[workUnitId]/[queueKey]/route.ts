import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import {
    accessScopeRestrictsData,
    departmentIdAllowed,
    fetchWorkUnitDepartmentId,
} from "@/lib/admin/accessScope";
import {
    parseWorkspaceSiteIdFromSearchParams,
    resolveQueueRecordScopeConstraints,
} from "@/lib/admin/resolveQueueRecordScopeConstraints";
import { fetchEffectiveUserDisplayTimezone } from "@/lib/admin/timezoneContract";
import { getWorkUnitQueueItems, QueueServiceError } from "@/lib/queues/QueueService";
import { perfQueueRowsServer } from "@/lib/perf/adminV2PerfLog";

function parseLimitOffset(searchParams: URLSearchParams): { limit?: number; offset?: number } {
    const limitRaw = (searchParams.get("limit") ?? "").trim();
    const offsetRaw = (searchParams.get("offset") ?? "").trim();

    let limit: number | undefined;
    let offset: number | undefined;

    if (limitRaw) {
        const n = Number(limitRaw);
        if (!Number.isFinite(n)) throw new QueueServiceError("limit must be a number", 400, "VALIDATION_FAILED");
        const i = Math.floor(n);
        if (i < 1) throw new QueueServiceError("limit must be >= 1", 400, "VALIDATION_FAILED");
        limit = Math.min(i, 100);
    }

    if (offsetRaw) {
        const n = Number(offsetRaw);
        if (!Number.isFinite(n)) throw new QueueServiceError("offset must be a number", 400, "VALIDATION_FAILED");
        const i = Math.floor(n);
        if (i < 0) throw new QueueServiceError("offset must be >= 0", 400, "VALIDATION_FAILED");
        offset = i;
    }

    return { limit, offset };
}

function parseQueueItemsCountOptions(searchParams: URLSearchParams): {
    countAccuracy: import("@/lib/queues/QueueService").QueueCountAccuracy | undefined;
    omitTotalCount: boolean;
} {
    const countRaw = (searchParams.get("count_mode") ?? "").trim().toLowerCase();
    const omitTotalCount =
        searchParams.get("omit_total_count") === "true" || countRaw === "omit" || countRaw === "none";
    if (omitTotalCount) {
        return { countAccuracy: undefined, omitTotalCount: true };
    }
    if (!countRaw || countRaw === "exact") {
        return { countAccuracy: undefined, omitTotalCount: false };
    }
    if (countRaw === "planned") {
        return { countAccuracy: "planned", omitTotalCount: false };
    }
    throw new QueueServiceError("count_mode must be exact, planned, or omit", 400, "VALIDATION_FAILED");
}

function queueRowsCountModeLabel(
    omitTotalCount: boolean,
    countAccuracy: import("@/lib/queues/QueueService").QueueCountAccuracy | undefined
): "omit" | "exact" | "planned" {
    if (omitTotalCount) return "omit";
    if (countAccuracy === "planned") return "planned";
    return "exact";
}

/** GET — Queue items drill-in for a work unit queue. */
export async function GET(
    request: NextRequest,
    context: { params: Promise<{ workUnitId: string; queueKey: string }> }
) {
    const handlerT0 = Date.now();
    const tAuth0 = Date.now();
    const gate = await loadAdminRouteGate();
    const auth_ms = Date.now() - tAuth0;
    if (!gate.ok) return adminRouteGateFailureResponse(gate);
    const dim = gate.dim;

    const { workUnitId, queueKey } = await context.params;
    if (!workUnitId) return NextResponse.json({ error: "Missing workUnitId" }, { status: 400 });
    if (!queueKey) return NextResponse.json({ error: "Missing queueKey" }, { status: 400 });

    const supabase = createAdminClient();
    const { data: wuExists } = await supabase
        .from("work_units")
        .select("id")
        .eq("id", workUnitId)
        .eq("org_id", gate.orgId)
        .maybeSingle();
    if (!wuExists) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (accessScopeRestrictsData(dim) && dim.departmentScope === "restricted") {
        const deptId = await fetchWorkUnitDepartmentId(supabase, gate.orgId, workUnitId);
        if (!departmentIdAllowed(dim, deptId)) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
    }

    const workspaceSiteId = parseWorkspaceSiteIdFromSearchParams(request.nextUrl.searchParams);
    const { recordScopeImpossible, recordScopeConstraints } = await resolveQueueRecordScopeConstraints(
        supabase,
        gate.orgId,
        dim,
        workspaceSiteId
    );

    try {
        const { limit, offset } = parseLimitOffset(request.nextUrl.searchParams);
        const { countAccuracy, omitTotalCount } = parseQueueItemsCountOptions(request.nextUrl.searchParams);
        const viewerDisplayTimeZone = await fetchEffectiveUserDisplayTimezone(supabase, {
            orgId: gate.orgId,
            userId: gate.userId,
        });
        const attentionBucketKey = (request.nextUrl.searchParams.get("attention_bucket") ?? "").trim() || null;
        const rowMode = (request.nextUrl.searchParams.get("row_mode") ?? "").trim().toLowerCase();
        const rowEnrichment = rowMode === "preview" || rowMode === "reveal" ? "queue_reveal" : "queue_list";
        const { result, rowsPerf } = await getWorkUnitQueueItems({
            orgId: gate.orgId,
            workUnitId,
            queueKey,
            limit,
            offset,
            countAccuracy,
            omitTotalCount,
            recordScopeImpossible,
            recordScopeConstraints,
            viewerDisplayTimeZone,
            attentionBucketKey,
            rowEnrichment,
        });

        const tSer0 = Date.now();
        const bodyJson = JSON.stringify(result);
        const serialize_ms = Date.now() - tSer0;
        const payload_kb = Buffer.byteLength(bodyJson, "utf8") / 1024;
        const total_ms = Date.now() - handlerT0;

        const { enrichment_subtimings_ms: enrichment_subtimings, ...rowsPerfForLog } = rowsPerf;

        perfQueueRowsServer({
            org_id: gate.orgId,
            work_unit_id: workUnitId,
            queue_key: queueKey,
            total_ms,
            auth_ms,
            row_enrichment: rowEnrichment,
            ...rowsPerfForLog,
            enrichment_subtimings,
            serialize_ms,
            row_count: Array.isArray(result.items) ? result.items.length : 0,
            payload_kb: Math.round(payload_kb * 10) / 10,
            count_mode: queueRowsCountModeLabel(omitTotalCount, countAccuracy),
            omit_total_count: omitTotalCount,
        });

        return new NextResponse(bodyJson, {
            status: 200,
            headers: {
                "content-type": "application/json; charset=utf-8",
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
