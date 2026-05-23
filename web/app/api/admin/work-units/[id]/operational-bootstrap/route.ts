import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import {
    parseWorkspaceSiteIdFromSearchParams,
    resolveQueueRecordScopeConstraints,
} from "@/lib/admin/resolveQueueRecordScopeConstraints";
import { fetchEffectiveUserDisplayTimezone } from "@/lib/admin/timezoneContract";
import { QueueServiceError } from "@/lib/queues/QueueService";
import { buildQueueSummariesSharedBootstrap } from "@/lib/queues/QueueService";
import { loadWorkUnitOperationalBootstrap } from "@/lib/workspace/loadWorkUnitOperationalBootstrap";
import { logWorkUnitOperationalBootstrapPerf } from "@/lib/workspace/workUnitOperationalBootstrapPerf";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import {
    loadRightRailActionsBundleCached,
    readRightRailActionsBundleCache,
} from "@/lib/workspace/rightRailActionsBundleCache";
import { buildWorkUnitQueueScopeCacheKey } from "@/lib/workspace/workUnitQueueScopeCacheKey";
import {
    applyWorkUnitBootstrapLoaderCacheHitPhases,
    loadWorkUnitOperationalBootstrapCached,
} from "@/lib/workspace/workUnitOperationalBootstrapServerCache";

/** Matches loader `summaryMode: priority` + `priorityBudget: 6`. */
const WU_REVEAL_SUMMARIES_MODE_KEY = "priority:6";

function parsePrimaryRowLimit(searchParams: URLSearchParams): number {
    const raw = (searchParams.get("primary_row_limit") ?? "8").trim();
    const n = Number(raw);
    if (!Number.isFinite(n)) return 8;
    return Math.min(Math.max(1, Math.floor(n)), 20);
}

function parseSummariesLimit(searchParams: URLSearchParams): number {
    const raw = (searchParams.get("limit") ?? "3").trim();
    const n = Number(raw);
    if (!Number.isFinite(n)) return 3;
    return Math.min(Math.max(1, Math.floor(n)), 100);
}

/**
 * GET — Single auth pass for work-unit oper critical path.
 * KPI placements never block reveal TTFB; right rail attaches only on cache hit.
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

        const summariesLimit = parseSummariesLimit(request.nextUrl.searchParams);
        const queueScopeKey = buildWorkUnitQueueScopeCacheKey({
            accessDim: gate.dim,
            workspaceSiteId,
            recordScopeImpossible,
        });
        const viewerTimezoneIana = viewerDisplayTimeZone?.iana?.trim() || "UTC";

        const loaderCtx = {
            supabase,
            orgId: gate.orgId,
            departmentId,
            workUnitId,
            accessDim: gate.dim,
            queueScopeKey,
            recordScopeImpossible,
            recordScopeConstraints,
            viewerDisplayTimeZone,
            sharedBootstrap,
            focusQueue,
            attentionBucketKey,
            primaryRowLimit,
            omitTotalCount,
            summariesLimit,
            attentionResolverPasses,
            deferPrimaryLaneRows: deferBundle,
        };

        const bootstrapP = loadWorkUnitOperationalBootstrapCached(
            {
                orgId: gate.orgId,
                departmentId,
                workUnitId,
                queueScopeKey,
                summariesLimit,
                summariesModeKey: WU_REVEAL_SUMMARIES_MODE_KEY,
                primaryRowLimit,
                omitTotalCount,
                focusQueue,
                attentionBucketKey,
                deferPrimaryLaneRows: deferBundle,
                viewerTimezoneIana,
            },
            async () => {
                const innerPhases: typeof phases = { shared_bootstrap_ms: sharedBootstrapPrepMs };
                const out = await loadWorkUnitOperationalBootstrap({
                    ctx: loaderCtx,
                    phases: innerPhases,
                });
                return out;
            }
        ).then(({ result, cache_hit, cache_key_digest }) => {
            if (cache_hit && "payload" in result) {
                phases.loader_cache_hit = true;
                phases.loader_cache_key_digest = cache_key_digest;
                Object.assign(phases, applyWorkUnitBootstrapLoaderCacheHitPhases(result.phases));
                return result;
            }
            if ("phases" in result) {
                phases.loader_cache_key_digest = cache_key_digest;
                Object.assign(phases, result.phases);
            }
            return result;
        });

        const bootstrapResult = await bootstrapP;
        const revealBlockingLoaderMs = Date.now() - tLoader0;

        if ("error" in bootstrapResult && "status" in bootstrapResult) {
            return NextResponse.json({ error: bootstrapResult.error }, { status: bootstrapResult.status });
        }

        const { payload, phases: loaderPhases } = bootstrapResult;

        /** KPI is below-fold — never blocks WU reveal gate (client loads via deferred work). */
        phases.kpi_placements_deferred_on_route = true;

        let actionsResult: {
            actions: ResolvedActionForClient[];
            ms: number;
            cache_hit: boolean;
            deferred: boolean;
        } = {
            actions: [],
            ms: 0,
            cache_hit: false,
            deferred: true,
        };

        if (!deferBundle) {
            const cachedRail = readRightRailActionsBundleCache(gate.orgId, departmentId, workUnitId);
            if (cachedRail) {
                actionsResult = {
                    actions: cachedRail,
                    ms: 0,
                    cache_hit: true,
                    deferred: false,
                };
                phases.right_rail_attached_on_route = true;
            } else {
                void loadRightRailActionsBundleCached({
                    orgId: gate.orgId,
                    departmentId,
                    workUnitId,
                }).catch(() => {
                    /* warm cache for next navigation */
                });
            }
        }

        const totalMs = Date.now() - routeT0;

        const responseBody = {
            ...payload,
            ...(deferBundle
                ? {}
                : {
                      ...(actionsResult.deferred ? {} : { right_rail_actions: actionsResult.actions }),
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
                          "kpi_placements",
                          "workflow_kpis",
                          "queue_row_actions",
                          "adjacent_lane_prefetch",
                          "sidebar_tree",
                          "entity_labels_refresh",
                          "ai_capabilities",
                          "operational_tasks",
                          "unread_count",
                          ...(actionsResult.deferred ? (["right_rail_actions"] as const) : []),
                      ],
                  },
        };

        logWorkUnitOperationalBootstrapPerf({
            workUnitId,
            departmentId,
            totalMs,
            routeGateMs,
            prepMs: routePrepMs,
            loaderMs: revealBlockingLoaderMs,
            payloadBytes: Buffer.byteLength(JSON.stringify(responseBody), "utf8"),
            deferBundle,
            phases: {
                ...loaderPhases,
                reveal_blocking_loader_ms: revealBlockingLoaderMs,
                blocking_loader_ms: revealBlockingLoaderMs,
                kpi_placements_ms: 0,
                kpi_placements_cache_hit: false,
                kpi_placements_deferred: true,
                right_rail_actions_ms: actionsResult.ms,
                right_rail_actions_cache_hit: actionsResult.cache_hit,
                right_rail_actions_deferred: actionsResult.deferred || deferBundle,
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
