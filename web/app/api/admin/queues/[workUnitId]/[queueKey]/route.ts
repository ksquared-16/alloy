import { NextRequest, NextResponse } from "next/server";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getWorkUnitQueueItems, QueueServiceError } from "@/lib/queues/QueueService";

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
    const ctx = await getAdminContextCached();
    const auth_ms = Date.now() - tAuth0;
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { workUnitId, queueKey } = await context.params;
    if (!workUnitId) return NextResponse.json({ error: "Missing workUnitId" }, { status: 400 });
    if (!queueKey) return NextResponse.json({ error: "Missing queueKey" }, { status: 400 });

    try {
        const { limit, offset } = parseLimitOffset(request.nextUrl.searchParams);
        const { countAccuracy, omitTotalCount } = parseQueueItemsCountOptions(request.nextUrl.searchParams);
        const { result, rowsPerf } = await getWorkUnitQueueItems({
            orgId: ctx.orgId,
            workUnitId,
            queueKey,
            limit,
            offset,
            countAccuracy,
            omitTotalCount,
        });

        const tSer0 = Date.now();
        const bodyJson = JSON.stringify(result);
        const serialize_ms = Date.now() - tSer0;
        const payload_kb = Buffer.byteLength(bodyJson, "utf8") / 1024;
        const total_ms = Date.now() - handlerT0;

        const { enrichment_subtimings_ms: enrichment_subtimings, ...rowsPerfForLog } = rowsPerf;

        console.warn("[perf.queue.rows]", {
            total_ms,
            auth_ms,
            ...rowsPerfForLog,
            enrichment_subtimings,
            serialize_ms,
            row_count: Array.isArray(result.items) ? result.items.length : 0,
            payload_kb: Math.round(payload_kb * 10) / 10,
            queue_key: queueKey,
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
