import { NextRequest, NextResponse } from "next/server";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
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

function parseCountMode(searchParams: URLSearchParams): "exact" | "planned" | undefined {
    const raw = (searchParams.get("count_mode") ?? "").trim().toLowerCase();
    if (!raw || raw === "exact") return undefined;
    if (raw === "planned") return "planned";
    throw new QueueServiceError("count_mode must be exact or planned", 400, "VALIDATION_FAILED");
}

function parseSummaryMode(searchParams: URLSearchParams): "all" | "priority" | "partial" | undefined {
    const raw = (searchParams.get("summary_mode") ?? "").trim().toLowerCase();
    if (!raw || raw === "all") return undefined;
    if (raw === "initial") return "priority";
    if (raw === "priority") return "priority";
    if (raw === "partial") return "partial";
    throw new QueueServiceError("summary_mode must be all, initial, priority, or partial", 400, "VALIDATION_FAILED");
}

function parseOnlyQueueKeys(searchParams: URLSearchParams): Set<string> | undefined {
    const raw = (searchParams.get("only_queue_keys") ?? "").trim();
    if (!raw) return undefined;
    const keys = raw
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);
    if (!keys.length) return undefined;
    return new Set(keys);
}

/** GET — Queue summaries for a work unit. */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const t0 = Date.now();
    try {
        const limit = parseLimit(request.nextUrl.searchParams);
        const includePreviews = request.nextUrl.searchParams.get("include_previews") !== "false";
        const countAccuracy = parseCountMode(request.nextUrl.searchParams);
        const summaryModeParsed = parseSummaryMode(request.nextUrl.searchParams) ?? "all";
        const onlyQueueKeys = parseOnlyQueueKeys(request.nextUrl.searchParams);
        const focusQueue = (request.nextUrl.searchParams.get("focus_queue") ?? "").trim() || null;
        const priorityBudgetRaw = (request.nextUrl.searchParams.get("priority_budget") ?? "").trim();
        let priorityBudget: number | undefined;
        if (priorityBudgetRaw) {
            const n = Number(priorityBudgetRaw);
            if (!Number.isFinite(n)) throw new QueueServiceError("priority_budget must be a number", 400, "VALIDATION_FAILED");
            priorityBudget = Math.min(Math.max(1, Math.floor(n)), 20);
        }

        if (summaryModeParsed === "partial" && (!onlyQueueKeys || onlyQueueKeys.size === 0)) {
            throw new QueueServiceError("only_queue_keys is required when summary_mode=partial", 400, "VALIDATION_FAILED");
        }

        const effectiveSummaryMode: "all" | "priority" | "partial" =
            onlyQueueKeys && onlyQueueKeys.size > 0 ? "partial" : summaryModeParsed === "priority" ? "priority" : "all";

        const payload = await getWorkUnitQueueSummaries({
            orgId: ctx.orgId,
            workUnitId: id,
            limit,
            includePreviews,
            countAccuracy,
            summaryMode: effectiveSummaryMode === "all" ? undefined : effectiveSummaryMode,
            focusQueueKey: effectiveSummaryMode === "priority" ? focusQueue : null,
            priorityBudget,
            partialQueueKeys: effectiveSummaryMode === "partial" ? onlyQueueKeys : undefined,
        });
        const ms = Date.now() - t0;
        if (ms > 150) {
            console.warn("[admin-timing] GET /api/admin/work-units/[id]/queues", {
                ms,
                work_unit_id: id,
                include_previews: request.nextUrl.searchParams.get("include_previews") !== "false",
                count_mode: countAccuracy ?? "exact",
                summary_mode: effectiveSummaryMode,
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

