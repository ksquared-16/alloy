import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import {
    parseWorkspaceSiteIdFromSearchParams,
    resolveQueueRecordScopeConstraints,
} from "@/lib/admin/resolveQueueRecordScopeConstraints";
import { fetchEffectiveUserDisplayTimezone } from "@/lib/admin/timezoneContract";
import { loadWorkUnitKpiPlacementsServer } from "@/lib/kpi/loadWorkUnitKpiPlacementsServer";
import { QueueServiceError } from "@/lib/queues/QueueService";
import { buildQueueSummariesSharedBootstrap } from "@/lib/queues/QueueService";
import { loadWorkUnitOperationalBootstrap } from "@/lib/workspace/loadWorkUnitOperationalBootstrap";
import { logWorkUnitOperationalBootstrapPerf } from "@/lib/workspace/workUnitOperationalBootstrapPerf";
import { loadRightRailActionsBundleCached } from "@/lib/workspace/rightRailActionsBundleCache";

function parsePrimaryRowLimit(searchParams: URLSearchParams): number {
    const raw = (searchParams.get("primary_row_limit") ?? "10").trim();
    const n = Number(raw);
    if (!Number.isFinite(n)) return 10;
    return Math.min(Math.max(1, Math.floor(n)), 20);
}

function parseSummariesLimit(searchParams: URLSearchParams): number {
    const raw = (searchParams.get("limit") ?? "3").trim();
    const n = Number(raw);
    if (!Number.isFinite(n)) return 3;
    return Math.min(Math.max(1, Math.floor(n)), 100);
}

/**
 * GET — Single auth pass for work-unit oper critical path + KPI placements + right-rail actions.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const routeT0 = Date.now();
    const tGate0 = Date.now();
    const gate = await loadAdminRouteGate();
    const routeGateMs = Date.now() - tGate0;
    if (!gate.ok) return adminRouteGateFailureResponse(gate);

    const { id: workUnitId } = await context.params;
    if (!workUnitId) return NextResponse.json({ error: "Missing work unit id" }, { status: 400 });

    const departmentId = (request.nextUrl.searchParams.get("department_id") ?? "").trim();
    if (!departmentId) {
        return NextResponse.json({ error: "department_id is required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const tPrep0 = Date.now();
    try {
        const workspaceSiteId = parseWorkspaceSiteIdFromSearchParams(request.nextUrl.searchParams);
        const [wuOrg, scopeBundle, viewerDisplayTimeZone, sharedBootstrapFromPrep] = await Promise.all([
            assertRowOrg(supabase, "work_units", workUnitId, gate.orgId),
            resolveQueueRecordScopeConstraints(supabase, gate.orgId, gate.dim, workspaceSiteId),
            fetchEffectiveUserDisplayTimezone(supabase, {
                orgId: gate.orgId,
                userId: gate.userId,
            }),
            buildQueueSummariesSharedBootstrap(gate.orgId),
        ]);
        const routePrepMs = Date.now() - tPrep0;
        const sharedBootstrapPrepMs = routePrepMs;
        if (!wuOrg.ok) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
        const { recordScopeImpossible, recordScopeConstraints } = scopeBundle;

        const focusQueue = (request.nextUrl.searchParams.get("focus_queue") ?? "").trim();
        const attentionBucketKey = (request.nextUrl.searchParams.get("attention_bucket") ?? "").trim();
        const primaryRowLimit = parsePrimaryRowLimit(request.nextUrl.searchParams);
        const omitTotalCount = request.nextUrl.searchParams.get("omit_total_count") === "true";

        const deferBundle = request.nextUrl.searchParams.get("defer_bundle") === "true";

        const tLoader0 = Date.now();
        const sharedBootstrap = sharedBootstrapFromPrep;

        const attentionResolverPasses = { count: 0 };
        const phases: import("@/lib/workspace/workUnitOperationalBootstrapPerf").WorkUnitBootstrapPerfPhases = {
            shared_bootstrap_ms: sharedBootstrapPrepMs,
        };

        const bootstrapP = loadWorkUnitOperationalBootstrap({
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
                focusQueue,
                attentionBucketKey,
                primaryRowLimit,
                omitTotalCount,
                summariesLimit: parseSummariesLimit(request.nextUrl.searchParams),
                attentionResolverPasses,
                deferPrimaryLaneRows: deferBundle,
            },
            phases,
        });

        const kpiP = deferBundle
            ? Promise.resolve({
                  items: [] as Awaited<ReturnType<typeof loadWorkUnitKpiPlacementsServer>>["items"],
                  scope_has_placements: false,
                  cache_hit: false,
                  ms: 0,
                  deferred: true as const,
              })
            : (async () => {
                  const t0 = Date.now();
                  try {
                      const r = await loadWorkUnitKpiPlacementsServer({ orgId: gate.orgId, departmentId, workUnitId });
                      return { ...r, ms: Date.now() - t0, deferred: false as const };
                  } catch {
                      return {
                          items: [],
                          scope_has_placements: false,
                          cache_hit: false,
                          ms: Date.now() - t0,
                          deferred: false as const,
                      };
                  }
              })();

        const actionsP = deferBundle
            ? Promise.resolve({ actions: [] as Awaited<ReturnType<typeof loadRightRailActionsBundleServer>>, ms: 0, deferred: true as const })
            : (async () => {
                  const t0 = Date.now();
                  try {
                      const r = await loadRightRailActionsBundleCached({
                          orgId: gate.orgId,
                          departmentId,
                          workUnitId,
                      });
                      return {
                          actions: r.actions,
                          ms: r.ms,
                          cache_hit: r.cache_hit,
                          deferred: false as const,
                      };
                  } catch {
                      return { actions: [], ms: Date.now() - t0, cache_hit: false, deferred: false as const };
                  }
              })();

        const [bootstrapResult, kpiResult, actionsResult] = await Promise.all([bootstrapP, kpiP, actionsP]);
        const loaderMs = Date.now() - tLoader0;

        if ("error" in bootstrapResult && "status" in bootstrapResult) {
            return NextResponse.json({ error: bootstrapResult.error }, { status: bootstrapResult.status });
        }

        const { payload, phases: loaderPhases } = bootstrapResult;
        const blockingLoaderMs = loaderMs;
        const totalMs = Date.now() - routeT0;

        const responseBody = {
            ...payload,
            ...(deferBundle
                ? {}
                : {
                      kpi_placements: {
                          items: kpiResult.items,
                          scope_has_placements: kpiResult.scope_has_placements,
                      },
                      right_rail_actions: actionsResult.actions,
                  }),
            runtime: deferBundle
                ? {
                      generated_at: new Date().toISOString(),
                      source: "authoritative_work_unit_bootstrap",
                      bootstrap_total_ms: totalMs,
                      defer_bundle: true as const,
                      deferred: ["primary_lane_rows", "kpi_placements", "right_rail_actions"],
                  }
                : {
                      generated_at: new Date().toISOString(),
                      source: "authoritative_work_unit_bootstrap",
                      bootstrap_total_ms: totalMs,
                      defer_bundle: false as const,
                      deferred: [
                          "workflow_kpis",
                          "queue_row_actions",
                          "adjacent_lane_prefetch",
                          "sidebar_tree",
                          "entity_labels_refresh",
                          "ai_capabilities",
                          "operational_tasks",
                          "unread_count",
                      ],
                  },
        };

        logWorkUnitOperationalBootstrapPerf({
            workUnitId,
            departmentId,
            totalMs,
            routeGateMs,
            prepMs: routePrepMs,
            loaderMs,
            payloadBytes: Buffer.byteLength(JSON.stringify(responseBody), "utf8"),
            deferBundle,
            phases: {
                ...loaderPhases,
                blocking_loader_ms: blockingLoaderMs,
                kpi_placements_ms: kpiResult.ms,
                kpi_placements_cache_hit: kpiResult.cache_hit,
                kpi_placements_deferred: deferBundle,
                right_rail_actions_ms: actionsResult.ms,
                right_rail_actions_cache_hit:
                    "cache_hit" in actionsResult ? actionsResult.cache_hit : undefined,
                right_rail_actions_deferred: deferBundle,
            },
        });

        return NextResponse.json(responseBody);
    } catch (e) {
        if (e instanceof QueueServiceError) {
            return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
        }
        const msg = e instanceof Error && e.message ? e.message : "Unexpected error";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
