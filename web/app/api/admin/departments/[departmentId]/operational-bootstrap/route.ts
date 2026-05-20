import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import {
    parseWorkspaceSiteIdFromSearchParams,
    resolveQueueRecordScopeConstraints,
} from "@/lib/admin/resolveQueueRecordScopeConstraints";
import { fetchEffectiveUserDisplayTimezone } from "@/lib/admin/timezoneContract";
import { QueueServiceError, type QueueSummaryRequestMode } from "@/lib/queues/QueueService";
import { loadDeptOperationalBootstrap } from "@/lib/workspace/loadDeptOperationalBootstrap";
import { logDeptOperationalBootstrapPerf } from "@/lib/workspace/deptOperationalBootstrapPerf";

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

function parseDepartmentSummaryMode(searchParams: URLSearchParams): QueueSummaryRequestMode {
    const raw = (searchParams.get("summary_mode") ?? "").trim().toLowerCase();
    if (!raw || raw === "priority" || raw === "initial") return "priority";
    if (raw === "all") return "all";
    if (raw === "partial") {
        throw new QueueServiceError("summary_mode=partial is not supported for department operational bootstrap", 400, "VALIDATION_FAILED");
    }
    throw new QueueServiceError("summary_mode must be all, initial, priority, or partial", 400, "VALIDATION_FAILED");
}

function parseFocusQueue(searchParams: URLSearchParams): string | null {
    return (searchParams.get("focus_queue") ?? "").trim() || null;
}

function parsePriorityBudget(searchParams: URLSearchParams): number | undefined {
    const raw = (searchParams.get("priority_budget") ?? "").trim();
    if (!raw) return undefined;
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new QueueServiceError("priority_budget must be a number", 400, "VALIDATION_FAILED");
    return Math.min(Math.max(1, Math.floor(n)), 20);
}

/**
 * GET — Single auth pass + shared DB reads for dept oper critical path:
 * department, work units, queue summaries, needs-attention preview, pipeline surface.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ departmentId: string }> }) {
    const routeT0 = Date.now();
    const tGate0 = Date.now();
    const gate = await loadAdminRouteGate();
    const routeGateMs = Date.now() - tGate0;
    if (!gate.ok) return adminRouteGateFailureResponse(gate);

    const { departmentId } = await context.params;
    if (!departmentId) return NextResponse.json({ error: "Missing department id" }, { status: 400 });

    const supabase = createAdminClient();
    const tPrep0 = Date.now();
    try {
        const workspaceSiteId = parseWorkspaceSiteIdFromSearchParams(request.nextUrl.searchParams);
        const [rowOrg, scopeBundle, viewerDisplayTimeZone] = await Promise.all([
            assertRowOrg(supabase, "departments", departmentId, gate.orgId),
            resolveQueueRecordScopeConstraints(supabase, gate.orgId, gate.dim, workspaceSiteId),
            fetchEffectiveUserDisplayTimezone(supabase, {
                orgId: gate.orgId,
                userId: gate.userId,
            }),
        ]);
        const routePrepMs = Date.now() - tPrep0;
        if (!rowOrg.ok) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
        const { recordScopeImpossible, recordScopeConstraints } = scopeBundle;

        const attentionWorkUnitIdParam = (request.nextUrl.searchParams.get("work_unit_id") ?? "").trim() || null;

        const tLoader0 = Date.now();
        const payload = await loadDeptOperationalBootstrap({
            supabase,
            orgId: gate.orgId,
            departmentId,
            accessDim: gate.dim,
            recordScopeImpossible,
            recordScopeConstraints,
            viewerDisplayTimeZone,
            attentionWorkUnitIdParam,
            summaries: {
                limit: parseLimit(request.nextUrl.searchParams),
                workUnitConcurrency: parseWuConcurrency(request.nextUrl.searchParams),
                includePreviews: request.nextUrl.searchParams.get("include_previews") !== "false",
                countAccuracy: parseCountMode(request.nextUrl.searchParams),
                summaryMode: parseDepartmentSummaryMode(request.nextUrl.searchParams),
                focusQueueKey: parseFocusQueue(request.nextUrl.searchParams),
                priorityBudget: parsePriorityBudget(request.nextUrl.searchParams),
            },
        });

        if ("status" in payload && "error" in payload) {
            return NextResponse.json({ error: payload.error }, { status: payload.status });
        }

        const loaderMs = Date.now() - tLoader0;
        const totalMs = Date.now() - routeT0;
        logDeptOperationalBootstrapPerf({
            departmentId,
            totalMs,
            routeGateMs,
            prepMs: routePrepMs,
            loaderMs,
        });

        return NextResponse.json(payload);
    } catch (e) {
        if (e instanceof QueueServiceError) {
            return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
        }
        const msg = e instanceof Error && e.message ? e.message : "Unexpected error";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
