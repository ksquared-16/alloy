import { NextRequest, NextResponse } from "next/server";
import { adminContextFailureResponse, getAdminContext } from "@/lib/admin/getAdminContext";
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

/** GET — Queue items drill-in for a work unit queue. */
export async function GET(
    request: NextRequest,
    context: { params: Promise<{ workUnitId: string; queueKey: string }> }
) {
    const ctx = await getAdminContext();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { workUnitId, queueKey } = await context.params;
    if (!workUnitId) return NextResponse.json({ error: "Missing workUnitId" }, { status: 400 });
    if (!queueKey) return NextResponse.json({ error: "Missing queueKey" }, { status: 400 });

    try {
        const { limit, offset } = parseLimitOffset(request.nextUrl.searchParams);
        const result = await getWorkUnitQueueItems({
            orgId: ctx.orgId,
            workUnitId,
            queueKey,
            limit,
            offset,
        });
        return NextResponse.json(result);
    } catch (e) {
        if (e instanceof QueueServiceError) {
            return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
        }
        const msg = e instanceof Error && e.message ? e.message : "Unexpected error";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

