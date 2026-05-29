import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import {
    parseWorkspaceSiteIdFromSearchParams,
    resolveQueueRecordScopeConstraints,
} from "@/lib/admin/resolveQueueRecordScopeConstraints";
import { fetchEffectiveUserDisplayTimezone } from "@/lib/admin/timezoneContract";
import { loadDepartmentKpiPlacementsServer } from "@/lib/kpi/loadDepartmentKpiPlacementsServer";
import {
    buildQueueSummariesSharedBootstrap,
    QueueServiceError,
    type QueueSummaryRequestMode,
} from "@/lib/queues/QueueService";
import { loadDeptOperationalBootstrap } from "@/lib/workspace/loadDeptOperationalBootstrap";
import { logDeptOperationalBootstrapPerf } from "@/lib/workspace/deptOperationalBootstrapPerf";
import { loadRightRailActionsBundleServer } from "@/lib/workspace/loadRightRailActionsBundleServer";
import { attachBootstrapServerPerf } from "@/lib/workspace/bootstrapServerPerfEnvelope";

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

function parseBundleMode(searchParams: URLSearchParams): "reveal" | "prefetch" {
    const raw = (searchParams.get("bundle_mode") ?? "").trim().toLowerCase();
    return raw === "prefetch" ? "prefetch" : "reveal";
}

function parsePriorityBudget(searchParams: URLSearchParams): number | undefined {
    const raw = (searchParams.get("priority_budget") ?? "").trim();
    if (!raw) return undefined;
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new QueueServiceError("priority_budget must be a number", 400, "VALIDATION_FAILED");
    return Math.min(Math.max(1, Math.floor(n)), 20);
}

/**
 * GET — Single auth pass for dept oper critical path + parallel KPI placements + right-rail actions bundle.
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
        const [rowOrg, scopeBundle, viewerDisplayTimeZone, sharedBootstrap] = await Promise.all([
            assertRowOrg(supabase, "departments", departmentId, gate.orgId),
            resolveQueueRecordScopeConstraints(supabase, gate.orgId, gate.dim, workspaceSiteId),
            fetchEffectiveUserDisplayTimezone(supabase, {
                orgId: gate.orgId,
                userId: gate.userId,
            }),
            buildQueueSummariesSharedBootstrap(gate.orgId),
        ]);
        const routePrepMs = Date.now() - tPrep0;
        if (!rowOrg.ok) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
        const { recordScopeImpossible, recordScopeConstraints } = scopeBundle;

        const attentionWorkUnitIdParam = (request.nextUrl.searchParams.get("work_unit_id") ?? "").trim() || null;
        const rightRailWorkUnitId = (request.nextUrl.searchParams.get("right_rail_work_unit_id") ?? "").trim() || "";

        const tLoader0 = Date.now();
        const bootstrapP = loadDeptOperationalBootstrap({
            supabase,
            orgId: gate.orgId,
            departmentId,
            accessDim: gate.dim,
            recordScopeImpossible,
            recordScopeConstraints,
            viewerDisplayTimeZone,
            sharedBootstrap,
            attentionWorkUnitIdParam,
            bundleMode: parseBundleMode(request.nextUrl.searchParams),
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

        const kpiP = (async () => {
            const t0 = Date.now();
            try {
                const r = await loadDepartmentKpiPlacementsServer({ orgId: gate.orgId, departmentId });
                return { ...r, ms: Date.now() - t0 };
            } catch {
                return {
                    items: [],
                    scope_has_placements: false,
                    cache_hit: false,
                    ms: Date.now() - t0,
                };
            }
        })();

        const actionsP = rightRailWorkUnitId
            ? (async () => {
                  const t0 = Date.now();
                  try {
                      const actions = await loadRightRailActionsBundleServer({
                          orgId: gate.orgId,
                          departmentId,
                          workUnitId: rightRailWorkUnitId,
                      });
                      return { actions, ms: Date.now() - t0 };
                  } catch {
                      return { actions: [], ms: Date.now() - t0 };
                  }
              })()
            : Promise.resolve({ actions: [], ms: 0 });

        const [bootstrapResult, kpiResult, actionsResult] = await Promise.all([bootstrapP, kpiP, actionsP]);
        const loaderMs = Date.now() - tLoader0;

        if ("error" in bootstrapResult && "status" in bootstrapResult) {
            return NextResponse.json({ error: bootstrapResult.error }, { status: bootstrapResult.status });
        }

        const { payload, phases } = bootstrapResult;
        const totalMs = Date.now() - routeT0;

        const responseBody = {
            ...payload,
            kpi_placements: {
                items: kpiResult.items,
                scope_has_placements: kpiResult.scope_has_placements,
            },
            right_rail_actions: actionsResult.actions,
        };

        logDeptOperationalBootstrapPerf({
            departmentId,
            totalMs,
            routeGateMs,
            prepMs: routePrepMs,
            loaderMs,
            payloadBytes: Buffer.byteLength(JSON.stringify(responseBody), "utf8"),
            phases: {
                ...phases,
                kpi_placements_ms: kpiResult.ms,
                kpi_placements_cache_hit: kpiResult.cache_hit,
                right_rail_actions_ms: actionsResult.ms,
            },
        });

        const payloadBytes = Buffer.byteLength(JSON.stringify(responseBody), "utf8");
        return NextResponse.json(
            attachBootstrapServerPerf(responseBody, {
                route_gate_ms: routeGateMs,
                route_prep_ms: routePrepMs,
                loader_ms: loaderMs,
                payload_bytes: payloadBytes,
                phases: {
                    ...phases,
                    kpi_placements_ms: kpiResult.ms,
                    kpi_placements_cache_hit: kpiResult.cache_hit,
                    right_rail_actions_ms: actionsResult.ms,
                },
            })
        );
    } catch (e) {
        if (e instanceof QueueServiceError) {
            return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
        }
        const msg = e instanceof Error && e.message ? e.message : "Unexpected error";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
