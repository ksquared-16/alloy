import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import {
    accessScopeRestrictsData,
    departmentIdAllowed,
    fetchWorkUnitDepartmentId,
} from "@/lib/admin/accessScope";
import {
    parseWorkspaceSiteIdFromSearchParams,
    resolveQueueRecordScopeConstraints,
} from "@/lib/admin/resolveQueueRecordScopeConstraints";
import { fetchEffectiveUserDisplayTimezoneCached } from "@/lib/admin/timezoneContract";
import { getWorkUnitQueueItems, QueueServiceError } from "@/lib/queues/QueueService";
import {
    applyWorkViewFilterToQueueItemsResult,
    WORK_VIEW_QUEUE_FILTER_FETCH_CAP,
} from "@/lib/lifecycle/operationalProjection";
import {
    fetchDepartmentMetadataForWorkUnit,
    resolveActiveWorkViewRuntimeContext,
} from "@/lib/lifecycle/resolveWorkViewRuntimeContext";
import { projectQueuePreviewRowContexts } from "@/lib/queues/queuePreviewRowContextProjection";
import { documentActorFromAdminGate } from "@/lib/documents/projectPersonProfilePhotos";
import { perfQueueRowsServer } from "@/lib/perf/adminV2PerfLog";
import { buildQueueRowsServerTimingHeader } from "@/lib/perf/queueRowsServerTiming";
import { buildWorkUnitQueueScopeCacheKey } from "@/lib/workspace/workUnitQueueScopeCacheKey";
import {
    buildWorkUnitQueueItemsServerCacheKey,
    readWorkUnitQueueItemsServerCache,
    writeWorkUnitQueueItemsServerCache,
} from "@/lib/workspace/workUnitQueueItemsServerCache";

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
    const gate = await loadAdminRouteGate();
    const auth_ms = Date.now() - tAuth0;
    if (!gate.ok) return adminRouteGateFailureResponse(gate);
    const dim = gate.dim;

    const { workUnitId, queueKey } = await context.params;
    if (!workUnitId) return NextResponse.json({ error: "Missing workUnitId" }, { status: 400 });
    if (!queueKey) return NextResponse.json({ error: "Missing queueKey" }, { status: 400 });

    const supabase = createAdminClient();
    const workspaceSiteId = parseWorkspaceSiteIdFromSearchParams(request.nextUrl.searchParams);

    const tPrep0 = Date.now();
    const [wuExists, scopeBundle, viewerDisplayTimeZone] = await Promise.all([
        supabase
            .from("work_units")
            .select("id")
            .eq("id", workUnitId)
            .eq("org_id", gate.orgId)
            // Operator runtime: an inactive/archived work unit must not serve queue rows (a stale
            // bookmark/URL 404s instead of rendering legacy data). Admin/settings use other reads.
            .eq("is_active", true)
            .maybeSingle(),
        resolveQueueRecordScopeConstraints(supabase, gate.orgId, dim, workspaceSiteId),
        fetchEffectiveUserDisplayTimezoneCached(supabase, {
            orgId: gate.orgId,
            userId: gate.userId,
        }),
    ]);
    const prep_ms = Date.now() - tPrep0;

    if (!wuExists.data) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (accessScopeRestrictsData(dim) && dim.departmentScope === "restricted") {
        const deptId = await fetchWorkUnitDepartmentId(supabase, gate.orgId, workUnitId);
        if (!departmentIdAllowed(dim, deptId)) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
    }

    const { recordScopeImpossible, recordScopeConstraints } = scopeBundle;

    try {
        const { limit, offset } = parseLimitOffset(request.nextUrl.searchParams);
        const { countAccuracy, omitTotalCount } = parseQueueItemsCountOptions(request.nextUrl.searchParams);
        const attentionBucketKey = (request.nextUrl.searchParams.get("attention_bucket") ?? "").trim() || null;
        const rowMode = (request.nextUrl.searchParams.get("row_mode") ?? "").trim().toLowerCase();
        const rowEnrichment = rowMode === "preview" || rowMode === "reveal" ? "queue_reveal" : "queue_list";
        // Deployed instrumentation: surface which caller requested which mode, and how the server
        // resolved it — so a trace shows at a glance whether the canonical surface is on queue_reveal.
        const callerSurface = (request.nextUrl.searchParams.get("caller_surface") ?? "").trim() || "unknown";
        const requestedMode = rowMode || "unset";
        const workViewIdParam =
            (request.nextUrl.searchParams.get("work_view_id") ?? request.nextUrl.searchParams.get("work_view") ?? "").trim()
            || null;

        const queueScopeKey = buildWorkUnitQueueScopeCacheKey({
            accessDim: dim,
            workspaceSiteId,
            recordScopeImpossible,
        });
        const cacheKey = buildWorkUnitQueueItemsServerCacheKey({
            orgId: gate.orgId,
            workUnitId,
            queueKey,
            queueScopeKey,
            attentionBucketKey,
            limit,
            offset,
            rowEnrichment,
            omitTotalCount,
            countAccuracy,
            workViewId: workViewIdParam,
        });

        const cached = readWorkUnitQueueItemsServerCache(cacheKey);
        if (cached) {
            const bodyJson = JSON.stringify(cached.result);
            const payload_kb = Buffer.byteLength(bodyJson, "utf8") / 1024;
            perfQueueRowsServer({
                org_id: gate.orgId,
                work_unit_id: workUnitId,
                queue_key: queueKey,
                total_ms: Date.now() - handlerT0,
                auth_ms,
                prep_ms,
                server_cache_hit: true,
                row_enrichment: rowEnrichment,
                enrichment_mode: cached.rowsPerf.enrichment_mode ?? rowEnrichment,
                requested_mode: requestedMode,
                resolved_mode: rowEnrichment,
                caller_surface: callerSurface,
                row_count: Array.isArray(cached.result.items) ? cached.result.items.length : 0,
                payload_kb: Math.round(payload_kb * 10) / 10,
                count_mode: queueRowsCountModeLabel(omitTotalCount, countAccuracy),
                omit_total_count: omitTotalCount,
            });
            return new NextResponse(bodyJson, {
                status: 200,
                headers: {
                    "content-type": "application/json; charset=utf-8",
                    "x-alloy-queue-rows-cache": "hit",
                    "x-alloy-queue-requested-mode": requestedMode,
                    "x-alloy-queue-resolved-mode": rowEnrichment,
                    "x-alloy-queue-caller-surface": callerSurface,
                    "x-alloy-build-sha": process.env.VERCEL_GIT_COMMIT_SHA ?? "unknown",
                    "Server-Timing": buildQueueRowsServerTimingHeader({
                        cacheHit: true,
                        metrics: {
                            auth: auth_ms,
                            prep: prep_ms,
                            load_def: cached.rowsPerf.load_def_ms,
                            operational_day: cached.rowsPerf.operational_day_ms,
                            base_query: cached.rowsPerf.base_query_ms,
                            count: cached.rowsPerf.count_ms,
                            status_defs: cached.rowsPerf.status_defs_ms,
                            enrichment: cached.rowsPerf.enrichment_ms,
                            service_total: cached.rowsPerf.service_total_ms,
                            total: Date.now() - handlerT0,
                        },
                    }),
                },
            });
        }

        let workViewFilterCtx: ReturnType<typeof resolveActiveWorkViewRuntimeContext> | null = null;
        if (workViewIdParam) {
            const departmentMetadata = await fetchDepartmentMetadataForWorkUnit(supabase, gate.orgId, workUnitId);
            workViewFilterCtx = resolveActiveWorkViewRuntimeContext({
                departmentMetadata,
                workViewId: workViewIdParam,
                queueKey,
            });
        }
        const needsWorkViewFilter = Boolean(workViewFilterCtx?.filters?.length);

        const { result, rowsPerf } = await getWorkUnitQueueItems({
            orgId: gate.orgId,
            workUnitId,
            queueKey,
            limit: needsWorkViewFilter ? WORK_VIEW_QUEUE_FILTER_FETCH_CAP : limit,
            offset: needsWorkViewFilter ? 0 : offset,
            countAccuracy,
            omitTotalCount: needsWorkViewFilter ? true : omitTotalCount,
            recordScopeImpossible,
            recordScopeConstraints,
            viewerDisplayTimeZone,
            attentionBucketKey,
            rowEnrichment,
            documentActor: documentActorFromAdminGate(gate),
        });

        let responseResult = result;
        if (needsWorkViewFilter && workViewFilterCtx?.filters?.length) {
            responseResult = applyWorkViewFilterToQueueItemsResult({
                result,
                filters: workViewFilterCtx.filters,
                match: workViewFilterCtx.match,
                pageLimit: limit,
                pageOffset: offset,
                omitTotalCount,
            });
        }

        // Wire-only compact projection for the canonical visible-row (queue_reveal) surface: the
        // deployed CondensedQueueRow reads only a narrow slice of `_queue_row_context`, so we strip the
        // Focus-Panel-only / predicate-only / detail fields from the serialized context here — AFTER
        // work-view filtering has consumed the base-query facts it needs. Counts, filtering, and
        // `computeWorkViewOperationalSignals` run on base rows before this point and are untouched.
        if (rowEnrichment === "queue_reveal" && Array.isArray(responseResult.items)) {
            responseResult = {
                ...responseResult,
                items: projectQueuePreviewRowContexts(responseResult.items),
            };
        }

        writeWorkUnitQueueItemsServerCache(cacheKey, { result: responseResult, rowsPerf });

        const tSer0 = Date.now();
        const bodyJson = JSON.stringify(responseResult);
        const serialize_ms = Date.now() - tSer0;
        const payload_kb = Buffer.byteLength(bodyJson, "utf8") / 1024;
        const total_ms = Date.now() - handlerT0;

        const { enrichment_subtimings_ms: enrichment_subtimings, ...rowsPerfForLog } = rowsPerf;

        perfQueueRowsServer({
            org_id: gate.orgId,
            work_unit_id: workUnitId,
            queue_key: queueKey,
            total_ms,
            auth_ms,
            prep_ms,
            server_cache_hit: false,
            row_enrichment: rowEnrichment,
            enrichment_mode: rowsPerf.enrichment_mode ?? rowEnrichment,
            requested_mode: requestedMode,
            resolved_mode: rowEnrichment,
            caller_surface: callerSurface,
            enrichment_queries_run: rowsPerf.enrichment_queries_run,
            skipped_enrichment: rowsPerf.skipped_enrichment,
            ...rowsPerfForLog,
            enrichment_subtimings,
            serialize_ms,
            row_count: Array.isArray(result.items) ? result.items.length : 0,
            payload_kb: Math.round(payload_kb * 10) / 10,
            duration_ms: rowsPerf.enrichment_ms,
            count_mode: queueRowsCountModeLabel(omitTotalCount, countAccuracy),
            omit_total_count: omitTotalCount,
        });

        // Same-invocation proof of the mode this exact request resolved to, plus the running build
        // SHA — so a browser/network trace proves whether the canonical caller sent reveal and which
        // build served it, without inferring from source or a deployment record.
        console.info("[queue-mode-proof]", {
            rawRowMode: rowMode || null,
            requested_mode: requestedMode,
            resolved_mode: rowEnrichment,
            caller_surface: callerSurface,
            work_unit_id: workUnitId,
            queue_key: queueKey,
            payload_kb: Math.round(payload_kb * 10) / 10,
            gitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
        });

        return new NextResponse(bodyJson, {
            status: 200,
            headers: {
                "content-type": "application/json; charset=utf-8",
                "x-alloy-queue-rows-cache": "miss",
                "x-alloy-queue-requested-mode": requestedMode,
                "x-alloy-queue-resolved-mode": rowEnrichment,
                "x-alloy-queue-caller-surface": callerSurface,
                "x-alloy-build-sha": process.env.VERCEL_GIT_COMMIT_SHA ?? "unknown",
                "Server-Timing": buildQueueRowsServerTimingHeader({
                    cacheHit: false,
                    metrics: {
                        auth: auth_ms,
                        prep: prep_ms,
                        load_def: rowsPerf.load_def_ms,
                        operational_day: rowsPerf.operational_day_ms,
                        base_query: rowsPerf.base_query_ms,
                        count: rowsPerf.count_ms,
                        status_defs: rowsPerf.status_defs_ms,
                        enrichment: rowsPerf.enrichment_ms,
                        serialize: serialize_ms,
                        service_total: rowsPerf.service_total_ms,
                        total: total_ms,
                    },
                }),
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
