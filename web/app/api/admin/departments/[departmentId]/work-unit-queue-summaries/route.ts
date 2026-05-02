import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { getDepartmentWorkUnitQueueSummaries, QueueServiceError } from "@/lib/queues/QueueService";

function parseLimit(searchParams: URLSearchParams): number | undefined {
    const raw = (searchParams.get("limit") ?? "").trim();
    if (!raw) return undefined;
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new QueueServiceError("limit must be a number", 400, "VALIDATION_FAILED");
    const i = Math.floor(n);
    if (i < 1) throw new QueueServiceError("limit must be >= 1", 400, "VALIDATION_FAILED");
    return Math.min(i, 100);
}

function parseWuConcurrency(searchParams: URLSearchParams): number | undefined {
    const raw = (searchParams.get("wu_concurrency") ?? "").trim();
    if (!raw) return undefined;
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new QueueServiceError("wu_concurrency must be a number", 400, "VALIDATION_FAILED");
    const i = Math.floor(n);
    if (i < 1) throw new QueueServiceError("wu_concurrency must be >= 1", 400, "VALIDATION_FAILED");
    return Math.min(i, 8);
}

function parseCountMode(searchParams: URLSearchParams): "exact" | "planned" | undefined {
    const raw = (searchParams.get("count_mode") ?? "").trim().toLowerCase();
    if (!raw || raw === "exact") return undefined;
    if (raw === "planned") return "planned";
    throw new QueueServiceError("count_mode must be exact or planned", 400, "VALIDATION_FAILED");
}

/** GET — Batch queue summaries for all work units in a department. */
export async function GET(request: NextRequest, context: { params: Promise<{ departmentId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { departmentId } = await context.params;
    if (!departmentId) return NextResponse.json({ error: "Missing department id" }, { status: 400 });

    const supabase = createAdminClient();
    const deptOk = await assertRowOrg(supabase, "departments", departmentId, ctx.orgId);
    if (!deptOk.ok) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const t0 = Date.now();
    try {
        const limit = parseLimit(request.nextUrl.searchParams);
        const workUnitConcurrency = parseWuConcurrency(request.nextUrl.searchParams);
        const includePreviews = request.nextUrl.searchParams.get("include_previews") !== "false";
        const countAccuracy = parseCountMode(request.nextUrl.searchParams);
        const payload = await getDepartmentWorkUnitQueueSummaries({
            orgId: ctx.orgId,
            departmentId,
            limit,
            workUnitConcurrency,
            includePreviews,
            countAccuracy,
        });
        const ms = Date.now() - t0;
        if (ms > 400) {
            console.warn("[admin-timing] GET /api/admin/departments/[id]/work-unit-queue-summaries", {
                ms,
                department_id: departmentId,
                work_units: payload.work_units.length,
                include_previews: request.nextUrl.searchParams.get("include_previews") !== "false",
                count_mode: request.nextUrl.searchParams.get("count_mode") || "exact",
            });
        }
        return NextResponse.json(payload);
    } catch (e) {
        if (e instanceof QueueServiceError) {
            return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
        }
        const msg = e instanceof Error && e.message ? e.message : "Unexpected error";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
