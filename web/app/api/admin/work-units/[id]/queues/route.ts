import { NextRequest, NextResponse } from "next/server";
import { adminContextFailureResponse, getAdminContext } from "@/lib/admin/getAdminContext";
import { getWorkUnitQueueSummaries, QueueServiceError } from "@/lib/queues/QueueService";

function parseLimit(searchParams: URLSearchParams): number | undefined {
    const raw = (searchParams.get("limit") ?? "").trim();
    if (!raw) return undefined;
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new QueueServiceError("limit must be a number", 400, "VALIDATION_FAILED");
    const i = Math.floor(n);
    if (i < 1) throw new QueueServiceError("limit must be >= 1", 400, "VALIDATION_FAILED");
    return Math.min(i, 100);
}

/** GET — Queue summaries for a work unit. */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContext();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const t0 = Date.now();
    try {
        const limit = parseLimit(request.nextUrl.searchParams);
        const queues = await getWorkUnitQueueSummaries({
            orgId: ctx.orgId,
            workUnitId: id,
            limit,
        });
        const ms = Date.now() - t0;
        if (ms > 150) {
            console.warn("[admin-timing] GET /api/admin/work-units/[id]/queues", { ms, work_unit_id: id });
        }
        return NextResponse.json({ queues });
    } catch (e) {
        if (e instanceof QueueServiceError) {
            return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
        }
        const msg = e instanceof Error && e.message ? e.message : "Unexpected error";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

