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

/** GET — Queue items drill-in for a work unit queue. */
export async function GET(
    request: NextRequest,
    context: { params: Promise<{ workUnitId: string; queueKey: string }> }
) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { workUnitId, queueKey } = await context.params;
    if (!workUnitId) return NextResponse.json({ error: "Missing workUnitId" }, { status: 400 });
    if (!queueKey) return NextResponse.json({ error: "Missing queueKey" }, { status: 400 });

    const t0 = Date.now();
    try {
        const { limit, offset } = parseLimitOffset(request.nextUrl.searchParams);
        const { countAccuracy, omitTotalCount } = parseQueueItemsCountOptions(request.nextUrl.searchParams);
        const result = await getWorkUnitQueueItems({
            orgId: ctx.orgId,
            workUnitId,
            queueKey,
            limit,
            offset,
            countAccuracy,
            omitTotalCount,
        });
        const tSer0 = Date.now();
        const response = NextResponse.json(result);
        const serializeMs = Date.now() - tSer0;
        const ms = Date.now() - t0;
        if (ms > 200) {
            console.warn("[admin-timing] GET /api/admin/queues/[workUnitId]/[queueKey]", {
                ms,
                response_serialize_ms: serializeMs,
                work_unit_id: workUnitId,
                queue_key: queueKey,
                count_mode: omitTotalCount ? "omit" : countAccuracy ?? "exact",
            });
        }
        return response;
    } catch (e) {
        if (e instanceof QueueServiceError) {
            return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
        }
        const msg = e instanceof Error && e.message ? e.message : "Unexpected error";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

