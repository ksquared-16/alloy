"use client";

import { useCallback, useRef, useState } from "react";

import { findQueueSummaryForSelection } from "@/lib/adminV2/workUnitQueueSelection";
import { resolveWorkUnitFetchQueueKeyFromPill } from "@/lib/adminV2/workUnitQueueSelection";
import { logQueueSwitch } from "@/lib/perf/queueSwitchPerf";
import { shouldApplyWorkUnitQueueRowsResponse } from "@/lib/workspace/workUnitQueueRowFetchApply";
import { shouldSuppressQueueLoadingOnPillSwitch } from "@/lib/workspace/workUnitQueueLaneDisplay";
import {
    resolveActiveWorkViewRuntimeContext,
} from "@/lib/lifecycle/resolveWorkViewRuntimeContext";
import {
    incrementRoutePostShellFetch,
    markRouteFetchTiming,
} from "@/lib/adminV2/routeShellPipeline";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import {
    stageKeyFromLifecycleWorkUnitMetadata,
} from "@/lib/lifecycle/lifecycleStageWorkUnit";
import {
    inferLifecycleQueueRowLoader,
    traceLifecyclePillQueueResult,
} from "@/lib/lifecycle/lifecycleWorkUnitShellPills";
import {
    appendWorkspaceSiteToUrl,
} from "@/lib/adminV2/workspaceSiteFilterClient";
import {
    putWorkUnitLaneCacheEntry,
} from "@/lib/adminV2/viewModel/workUnit/workUnitViewModelSessionCache";
import { dedupeAdminFetch } from "@/lib/workspace/workspaceAdminFetchDedupe";
import { scheduleAdminV2BackgroundWork } from "@/lib/workspace/adminV2DeferBackgroundWork";
import { alloyPerfSet } from "@/lib/perf/alloyPerfGlobal";
import {
    markWorkUnitVmPillSwitchApply,
    markWorkUnitVmPillSwitchCommitted,
    markWorkUnitVmQueueReady,
} from "@/lib/perf/workUnitVmRuntimeTrace";
import {
    resolveWorkUnitQueueRowsFetchLimit,
    WORK_UNIT_QUEUE_REVEAL_FETCH_ROWS,
} from "@/lib/adminV2/workUnitQueueRowsFetchLimit";
import {
    logQueueRowClientCache,
    peekFreshQueueRowCache,
    touchQueueRowCacheOnHit,
    putQueueRowCache,
    queueRowLogicalCacheKey,
    shouldStaleBackgroundRefresh,
    type QueueRowClientCacheBucket,
} from "@/lib/workspace/queueRowClientCache";
import {
    guardLifecycleQueueFetchBeforeApi,
    type ActiveLifecycleWorkUnitSelection,
} from "@/lib/lifecycle/lifecycleActiveWorkUnitSelection";
import type { QueueGrain } from "@/lib/config/queueDefinitionV2Runtime";
import type { WorkUnitQueueRecordFilterState } from "@/lib/workspace/workUnitQueueRecordFilterTypes";
import type { WorkUnitPlacementQueueDiagnostics } from "@/lib/orchestration/placement/applyPlacementToOpportunityQueueRows";
import { readWorkUnitInitialLocationParams } from "@/lib/adminV2/workUnitInitialLocation";

type WorkUnitRow = {
    id: string;
    department_id: string;
    key: string | null;
    name: string | null;
    queue_definition?: unknown;
    metadata?: unknown;
};

type DeptRow = { id: string; name: string | null; key: string | null; metadata?: unknown };

type QueueSummary = {
    key: string;
    label: string;
    description?: string;
    entity_type: "job" | "schedule" | "opportunity";
    priority: "standard" | "attention" | "critical";
    display: "list" | "cards";
    count: number;
    preview: unknown[];
    counts_deferred?: boolean;
    grain?: QueueGrain;
    domain?: string;
    overlay?: boolean;
};

type QueueItemsResult = {
    queue: {
        key: string;
        label: string;
        description?: string;
        entity_type: "job" | "schedule" | "opportunity";
        priority: "standard" | "attention" | "critical";
        display: "list" | "cards";
    };
    items: unknown[];
    total: number;
    limit: number;
    offset: number;
    total_omitted?: boolean;
    placement_projection_diagnostics?: WorkUnitPlacementQueueDiagnostics;
};

export type WorkUnitQueueRuntimeLateDeps = {
    attentionBucketKeyRef: React.RefObject<string>;
    commitQueueRowActionsWithLane: (detail: {
        work_unit_id: string;
        department_id: string;
        source: string;
        pill_key?: string;
    }) => void;
    hydrateWorkUnitQueueRowActions: () => Promise<boolean>;
    requestWorkUnitDeferredSupplement: () => void;
    markFirstUsefulPaintOnce: () => void;
};

export type WorkUnitQueueRuntimeDeps = {
    activeLifecycleSelectionRef: React.MutableRefObject<ActiveLifecycleWorkUnitSelection>;
    deptRef: React.RefObject<DeptRow | null>;
    initialLocationRef: React.RefObject<ReturnType<typeof readWorkUnitInitialLocationParams> | null>;
    laneUnmappedOnlyRef: React.RefObject<boolean>;
    lifecyclePillSwitchRetainRowsRef: React.MutableRefObject<boolean>;
    pendingQueueTabPerfRef: React.MutableRefObject<boolean>;
    primaryLaneRowsSettledOnceRef: React.MutableRefObject<boolean>;
    queueRowActionsHydratedRef: React.MutableRefObject<boolean>;
    queueRowClientCacheRef: React.RefObject<Map<string, QueueRowClientCacheBucket<QueueItemsResult>>>;
    queueSummariesRef: React.RefObject<QueueSummary[] | null>;
    recordFiltersRef: React.RefObject<WorkUnitQueueRecordFilterState>;
    selectedQueueKeyRef: React.RefObject<string | null>;
    workUnitRef: React.RefObject<WorkUnitRow | null>;
    setLifecyclePillRetainRows: React.Dispatch<React.SetStateAction<boolean>>;
    setQueuePillPendingKey: React.Dispatch<React.SetStateAction<string | null>>;
    lateDepsRef: React.MutableRefObject<WorkUnitQueueRuntimeLateDeps | null>;
    viewScopeFingerprint: string;
    selectedSiteId: string | null;
    laneUnmappedOnly: boolean;
    departmentId: string;
    orgId: string | null;
};

export function useWorkUnitQueueRuntime(deps: WorkUnitQueueRuntimeDeps) {
    const {
        activeLifecycleSelectionRef,
        deptRef,
        initialLocationRef,
        laneUnmappedOnlyRef,
        lifecyclePillSwitchRetainRowsRef,
        pendingQueueTabPerfRef,
        primaryLaneRowsSettledOnceRef,
        queueRowActionsHydratedRef,
        queueRowClientCacheRef,
        queueSummariesRef,
        recordFiltersRef,
        selectedQueueKeyRef,
        workUnitRef,
        setLifecyclePillRetainRows,
        setQueuePillPendingKey,
        lateDepsRef,
        viewScopeFingerprint,
        selectedSiteId,
        laneUnmappedOnly,
        departmentId,
        orgId,
    } = deps;

    const [queueItems, setQueueItems] = useState<QueueItemsResult | null>(null);
    const [queueItemsError, setQueueItemsError] = useState<string | null>(null);
    const [queueItemsRoute, setQueueItemsRoute] = useState<string | null>(null);
    const [queueItemsLoading, setQueueItemsLoading] = useState(false);
    const queueItemsRequestSeq = useRef(0);
    const queueItemsLastFetchSigRef = useRef<string | null>(null);
    const queueRowLeaseSigsRef = useRef(new Set<string>());

    const fetchQueueItems = useCallback(
        async (
            workUnitId: string,
            queueKey: string,
            _summaries: QueueSummary[] | null,
            options?: {
                force?: boolean;
                prefetchOnly?: boolean;
                quietStaleRefresh?: boolean;
                /** Prefetched rows use canonical `all` cache bucket even when Current tab shows `unmapped` filter UI. */
                logicalUnmapped?: boolean;
                /** When set on Needs attention fetches, avoids a one-frame stale read of `attention_bucket` from URL. */
                attentionBucketOverride?: string | null;
                /** User pill click — bypass in-flight lease and always fetch/apply for target lane. */
                userInitiated?: boolean;
                /** Full list enrichment after reveal-first pill switch (background, no loading shell). */
                backgroundListRefresh?: boolean;
                /** Initial active lane — reveal-first paint, full list upgrades in background. */
                initialLaneReveal?: boolean;
                fromQueueKey?: string | null;
                /** Prefetch/sibling fetch — use this work unit row for queue_definition guard. */
                workUnitRowOverride?: {
                    queue_definition?: unknown;
                    metadata?: unknown;
                } | null;
            }
        ) => {
            const {
                attentionBucketKeyRef,
                commitQueueRowActionsWithLane,
                hydrateWorkUnitQueueRowActions,
                requestWorkUnitDeferredSupplement,
                markFirstUsefulPaintOnce,
            } = lateDepsRef.current!;
            const workUnitRowForGuard =
                options?.workUnitRowOverride ??
                (workUnitRef.current ?
                    {
                        queue_definition: workUnitRef.current.queue_definition,
                        metadata: workUnitRef.current.metadata,
                    }
                :   null);
            const guarded = guardLifecycleQueueFetchBeforeApi({
                workUnitId,
                attemptedQueueKey: queueKey,
                workUnit:
                    workUnitRowForGuard ?
                        {
                            id: workUnitId,
                            queue_definition: workUnitRowForGuard.queue_definition,
                            metadata: workUnitRowForGuard.metadata,
                        }
                    :   null,
                attentionBucketKey:
                    options?.attentionBucketOverride !== undefined
                        ? String(options.attentionBucketOverride ?? "").trim()
                        : attentionBucketKeyRef.current,
                previousWorkUnitId: activeLifecycleSelectionRef.current.workUnitId,
                previousQueueKey: activeLifecycleSelectionRef.current.queueKey,
            });
            if (guarded.blocked) {
                setQueueItemsLoading(false);
                return;
            }
            const skipActionsHydrateBeforeCache =
                options?.userInitiated || options?.prefetchOnly || options?.quietStaleRefresh;
            if (!skipActionsHydrateBeforeCache && !queueRowActionsHydratedRef.current) {
                await hydrateWorkUnitQueueRowActions();
            }
            const queueKeyForLane = guarded.pillKey;
            const apiQueueKey = guarded.apiQueueKey;
            if (!apiQueueKey.trim()) {
                setQueueItemsLoading(false);
                return;
            }
            const summariesForLimit = _summaries ?? queueSummariesRef.current;
            const summaryForLane =
                summariesForLimit && workUnitRef.current
                    ? findQueueSummaryForSelection(summariesForLimit, workUnitRef.current, queueKeyForLane)
                    : null;
            const searchActive = recordFiltersRef.current.search.trim().length > 0;
            const revealFirstFetch =
                !options?.backgroundListRefresh &&
                (options?.quietStaleRefresh ||
                    options?.userInitiated ||
                    options?.prefetchOnly ||
                    options?.initialLaneReveal);
            const fetchLimit =
                revealFirstFetch ?
                    WORK_UNIT_QUEUE_REVEAL_FETCH_ROWS
                :   resolveWorkUnitQueueRowsFetchLimit(summaryForLane?.count, { searchActive });
            const resolvedFetch = resolveWorkUnitFetchQueueKeyFromPill(
                queueKeyForLane,
                options?.attentionBucketOverride !== undefined
                    ? String(options.attentionBucketOverride ?? "").trim()
                    : attentionBucketKeyRef.current,
                workUnitRef.current ? { queue_definition: workUnitRef.current.queue_definition } : undefined
            );
            const logicalUm = options?.logicalUnmapped ?? laneUnmappedOnly;
            const abSnap =
                apiQueueKey.trim().toLowerCase() === "needs_attention"
                    ? (options?.attentionBucketOverride !== undefined
                          ? String(options.attentionBucketOverride ?? "").trim()
                          : resolvedFetch.attentionBucketOverride !== undefined
                            ? String(resolvedFetch.attentionBucketOverride ?? "").trim()
                            : attentionBucketKeyRef.current.trim())
                    : "";
            const fetchSig = `${workUnitId}|${apiQueueKey}|omit|${abSnap}`;
            const logicalKey = queueRowLogicalCacheKey(
                viewScopeFingerprint,
                workUnitId,
                apiQueueKey,
                logicalUm,
                abSnap
            );
            const qs = new URLSearchParams({
                limit: String(fetchLimit),
                offset: "0",
                count_mode: "exact",
                omit_total_count: "true",
            });
            if (abSnap) qs.set("attention_bucket", abSnap);
            const deptMeta = deptRef.current?.metadata;
            if (deptMeta) {
                const wvCtx = resolveActiveWorkViewRuntimeContext({
                    departmentMetadata: deptMeta,
                    workViewId: initialLocationRef.current?.workViewId,
                    queueKey: queueKeyForLane,
                    queueLayoutId: initialLocationRef.current?.queueLayoutId,
                    focusLayoutId: initialLocationRef.current?.focusLayoutId,
                });
                if (wvCtx.workViewId) qs.set("work_view_id", wvCtx.workViewId);
            }
            if (options?.backgroundListRefresh) {
                /* full queue_list enrichment — no row_mode */
            } else if (
                options?.quietStaleRefresh ||
                options?.userInitiated ||
                options?.prefetchOnly ||
                options?.initialLaneReveal
            ) {
                qs.set("row_mode", "reveal");
            }
            const route = appendWorkspaceSiteToUrl(
                `/api/admin/queues/${encodeURIComponent(workUnitId)}/${encodeURIComponent(apiQueueKey)}?${qs.toString()}`,
                selectedSiteId
            );
            const cache = queueRowClientCacheRef.current;

            if (options?.force) {
                cache.delete(queueRowLogicalCacheKey(viewScopeFingerprint, workUnitId, apiQueueKey, false, abSnap));
                cache.delete(queueRowLogicalCacheKey(viewScopeFingerprint, workUnitId, apiQueueKey, true, abSnap));
            }

            if (!options?.force && !options?.prefetchOnly && !options?.quietStaleRefresh) {
                const ent = touchQueueRowCacheOnHit(cache, logicalKey);
                if (ent) {
                    queueItemsLastFetchSigRef.current = fetchSig;
                    setQueueItemsError(null);
                    setQueueItemsRoute(route);
                    setQueuePillPendingKey(null);
                    setQueueItems(ent.payload);
                    setQueueItemsLoading(false);
                    logQueueRowClientCache({
                        event: "hit",
                        work_unit_id: workUnitId,
                        queue_key: apiQueueKey,
                        pill_key: queueKey,
                        attention_bucket_key: abSnap || undefined,
                        age_ms: Date.now() - ent.fetchedAt,
                    });
                    commitQueueRowActionsWithLane({
                        work_unit_id: workUnitId,
                        department_id: departmentId,
                        pill_key: queueKey,
                        source: "lease_cache",
                    });
                    if (options?.userInitiated) {
                        markWorkUnitVmPillSwitchCommitted({
                            department_id: departmentId,
                            work_unit_id: workUnitId,
                            queue_key: apiQueueKey,
                            pill_key: queueKeyForLane,
                            source: "lane_cache",
                        });
                    }
                    if (pendingQueueTabPerfRef.current && typeof window !== "undefined" && typeof performance !== "undefined") {
                        pendingQueueTabPerfRef.current = false;
                        alloyPerfSet("queue_tab_rows_ready", performance.now());
                        markWorkUnitVmPillSwitchApply({
                            department_id: departmentId,
                            work_unit_id: workUnitId,
                            queue_key: apiQueueKey,
                            source: "lease_cache",
                        });
                        markWorkUnitVmPillSwitchCommitted({
                            department_id: departmentId,
                            work_unit_id: workUnitId,
                            queue_key: apiQueueKey,
                            source: "lease_cache",
                        });
                    }
                    markWorkUnitVmQueueReady({
                        department_id: departmentId,
                        work_unit_id: workUnitId,
                        queue_key: apiQueueKey,
                        source: "lease_cache",
                    });
                    markFirstUsefulPaintOnce();
                    primaryLaneRowsSettledOnceRef.current = true;
                    if (shouldStaleBackgroundRefresh(ent.fetchedAt)) {
                        logQueueRowClientCache({
                            event: "stale_refresh",
                            work_unit_id: workUnitId,
                            queue_key: apiQueueKey,
                            pill_key: queueKey,
                            attention_bucket_key: abSnap || undefined,
                            age_ms: Date.now() - ent.fetchedAt,
                        });
                        void fetchQueueItems(workUnitId, queueKey, null, {
                            quietStaleRefresh: true,
                            logicalUnmapped: logicalUm,
                        });
                    }
                    return;
                }
                logQueueRowClientCache({
                    event: "miss",
                    work_unit_id: workUnitId,
                    queue_key: apiQueueKey,
                    pill_key: queueKey,
                    attention_bucket_key: abSnap || undefined,
                    age_ms: null,
                });
            }

            const lease = queueRowLeaseSigsRef.current;

            const runNetwork = async (seq: number, touchUiPerf: boolean) => {
                const init = workspaceDataFetchInit();
                const rowFetchStart =
                    touchUiPerf && typeof performance !== "undefined" ? performance.now() : 0;
                if (touchUiPerf && typeof window !== "undefined" && typeof performance !== "undefined") {
                    alloyPerfSet("queue_rows_request_start", performance.now());
                    alloyPerfSet("rows_req", performance.now());
                    incrementRoutePostShellFetch("work_unit", "queue_items");
                }
                const res = await dedupeAdminFetch(route, init);
                if (touchUiPerf && rowFetchStart) {
                    markRouteFetchTiming("work_unit", "queue_items", rowFetchStart);
                }
                if (touchUiPerf && typeof window !== "undefined" && typeof performance !== "undefined") {
                    alloyPerfSet("queue_rows_response_headers", performance.now());
                    alloyPerfSet("rows_resp", performance.now());
                }
                const json = (await res.json().catch(() => ({}))) as { error?: string };
                if (touchUiPerf && typeof window !== "undefined" && typeof performance !== "undefined") {
                    alloyPerfSet("queue_rows_json_parse_done", performance.now());
                }
                if (!res.ok) {
                    if (res.status === 501) throw new Error("Queue type not supported yet");
                    throw new Error(json.error ?? "Failed to load queue items");
                }
                const payload = json as unknown as QueueItemsResult;
                const attentionBucketMatches =
                    queueKey.trim().toLowerCase() !== "needs_attention" ||
                    attentionBucketKeyRef.current.trim() === abSnap ||
                    options?.attentionBucketOverride !== undefined;
                const stillSelectedPill = selectedQueueKeyRef.current?.trim() ?? "";
                const stillSelectedFetch = resolveWorkUnitFetchQueueKeyFromPill(
                    stillSelectedPill,
                    attentionBucketKeyRef.current,
                    workUnitRef.current ? { queue_definition: workUnitRef.current.queue_definition } : undefined
                );
                const stillSelected =
                    stillSelectedFetch.queueKey === apiQueueKey &&
                    laneUnmappedOnlyRef.current === logicalUm &&
                    attentionBucketMatches;
                if (options?.prefetchOnly) {
                    putQueueRowCache(cache, viewScopeFingerprint, workUnitId, apiQueueKey, payload, abSnap);
                    putWorkUnitLaneCacheEntry(
                        {
                            queuePayload: payload,
                            generation: `${workUnitId}:${apiQueueKey}`,
                            lane: {
                                selectedQueueKey: queueKeyForLane,
                                attentionBucketKey: abSnap || null,
                                laneUnmappedOnly: logicalUm,
                                recordFilterFingerprint: "_",
                            },
                        },
                        {
                            orgId,
                            departmentId,
                            workUnitId,
                            scopeFingerprint: viewScopeFingerprint,
                        }
                    );
                    return;
                }
                if (options?.quietStaleRefresh) {
                    const decision = shouldApplyWorkUnitQueueRowsResponse({
                        requestSeq: seq,
                        latestRequestSeq: queueItemsRequestSeq.current,
                        stillSelected,
                    });
                    if (decision.apply) {
                        putQueueRowCache(cache, viewScopeFingerprint, workUnitId, apiQueueKey, payload, abSnap);
                        setQueueItems(payload);
                        lifecyclePillSwitchRetainRowsRef.current = false;
                        setLifecyclePillRetainRows(false);
                        activeLifecycleSelectionRef.current = {
                            workUnitId,
                            queueKey: queueKeyForLane,
                            stageKey: stageKeyFromLifecycleWorkUnitMetadata(workUnitRef.current?.metadata),
                        };
                        if (options?.userInitiated) {
                            const items = Array.isArray(payload.items) ? payload.items : [];
                            traceLifecyclePillQueueResult({
                                phase: items.length > 0 ? "rows_applied" : "rows_empty",
                                selected_work_unit_id: workUnitId,
                                queue_key: queueKeyForLane,
                                loader: inferLifecycleQueueRowLoader({
                                    work_unit_id: workUnitId,
                                    queue_key: apiQueueKey,
                                    work_unit_metadata: workUnitRef.current?.metadata,
                                    items,
                                }),
                                record_count: items.length,
                                total: typeof payload.total === "number" ? payload.total : null,
                                api_path: route,
                            });
                        }
                    }
                    if (options?.userInitiated) {
                        logQueueSwitch({
                            from_queue: options.fromQueueKey ?? null,
                            to_queue: queueKey,
                            request_id: seq,
                            applied: decision.apply,
                            skipped_reason: decision.skippedReason,
                            selected_queue_after: selectedQueueKeyRef.current,
                        });
                    }
                    return;
                }
                const decision = shouldApplyWorkUnitQueueRowsResponse({
                    requestSeq: seq,
                    latestRequestSeq: queueItemsRequestSeq.current,
                    stillSelected,
                });
                if (process.env.NODE_ENV === "development") {
                    console.log(`[queue-request:${decision.apply ? "apply" : "ignore"}]`, {
                        seq,
                        latestSeq: queueItemsRequestSeq.current,
                        reason: decision.skippedReason ?? "ok",
                        itemsCount: Array.isArray((payload as unknown as { rows?: unknown[] }).rows) ? (payload as unknown as { rows: unknown[] }).rows.length : null,
                        selectedQueueKey: queueKey,
                        currentSelectedQueueKey: selectedQueueKeyRef.current,
                        stillSelected,
                    });
                }
                if (decision.apply) {
                    if (
                        !options?.prefetchOnly &&
                        !options?.quietStaleRefresh &&
                        !options?.userInitiated
                    ) {
                        await hydrateWorkUnitQueueRowActions();
                    }
                    putQueueRowCache(cache, viewScopeFingerprint, workUnitId, apiQueueKey, payload, abSnap);
                    putWorkUnitLaneCacheEntry(
                        {
                            queuePayload: payload,
                            generation: `${workUnitId}:${apiQueueKey}`,
                            lane: {
                                selectedQueueKey: queueKeyForLane,
                                attentionBucketKey: abSnap || null,
                                laneUnmappedOnly: logicalUm,
                                recordFilterFingerprint: "_",
                            },
                        },
                        {
                            orgId,
                            departmentId,
                            workUnitId,
                            scopeFingerprint: viewScopeFingerprint,
                        }
                    );
                    setQueuePillPendingKey(null);
                    setQueueItems(payload);
                    lifecyclePillSwitchRetainRowsRef.current = false;
                    setLifecyclePillRetainRows(false);
                    activeLifecycleSelectionRef.current = {
                        workUnitId,
                        queueKey: queueKeyForLane,
                        stageKey: stageKeyFromLifecycleWorkUnitMetadata(workUnitRef.current?.metadata),
                    };
                    if (options?.userInitiated) {
                        const items = Array.isArray(payload.items) ? payload.items : [];
                        traceLifecyclePillQueueResult({
                            phase: items.length > 0 ? "rows_applied" : "rows_empty",
                            selected_work_unit_id: workUnitId,
                            queue_key: queueKeyForLane,
                            loader: inferLifecycleQueueRowLoader({
                                work_unit_id: workUnitId,
                                queue_key: apiQueueKey,
                                work_unit_metadata: workUnitRef.current?.metadata,
                                items,
                            }),
                            record_count: items.length,
                            total: typeof payload.total === "number" ? payload.total : null,
                            api_path: route,
                        });
                        commitQueueRowActionsWithLane({
                            work_unit_id: workUnitId,
                            department_id: departmentId,
                            pill_key: queueKey,
                            source: "network",
                        });
                        markWorkUnitVmPillSwitchCommitted({
                            department_id: departmentId,
                            work_unit_id: workUnitId,
                            queue_key: apiQueueKey,
                            pill_key: queueKeyForLane,
                            source: "network",
                        });
                    }
                    if (pendingQueueTabPerfRef.current && typeof window !== "undefined" && typeof performance !== "undefined") {
                        pendingQueueTabPerfRef.current = false;
                        requestAnimationFrame(() => {
                            requestAnimationFrame(() => {
                                alloyPerfSet("queue_tab_rows_ready", performance.now());
                                markWorkUnitVmPillSwitchApply({
                                    department_id: departmentId,
                                    work_unit_id: workUnitId,
                                    queue_key: apiQueueKey,
                                    source: "network",
                                });
                            });
                        });
                    }
                    if (typeof window !== "undefined") {
                        console.warn("[pipeline-count-unify]", {
                            source: "queue-rows",
                            work_unit_id: workUnitId,
                            queue_key: queueKey,
                            count: typeof payload.total === "number" ? payload.total : null,
                        });
                    }
                    if (typeof window !== "undefined" && typeof performance !== "undefined") {
                        requestAnimationFrame(() => {
                            requestAnimationFrame(() => {
                                const t = performance.now();
                                alloyPerfSet("queue_rows_state_applied", t);
                                alloyPerfSet("queue_rows_ready", t);
                            });
                        });
                    }
                    markFirstUsefulPaintOnce();
                }
                if (options?.userInitiated) {
                    logQueueSwitch({
                        from_queue: options.fromQueueKey ?? null,
                        to_queue: queueKey,
                        request_id: seq,
                        applied: decision.apply,
                        skipped_reason: decision.skippedReason,
                        buffered_rows_used: false,
                        selected_queue_after: selectedQueueKeyRef.current,
                    });
                }
            };

            if (options?.prefetchOnly) {
                if (peekFreshQueueRowCache(cache, logicalKey)) return;
                if (lease.has(fetchSig)) return;
                lease.add(fetchSig);
                const seq = ++queueItemsRequestSeq.current;
                logQueueRowClientCache({
                    event: "prefetch",
                    work_unit_id: workUnitId,
                    queue_key: apiQueueKey,
                    pill_key: queueKey,
                    attention_bucket_key: abSnap || undefined,
                    age_ms: null,
                });
                try {
                    await runNetwork(seq, false);
                } catch {
                    /* best-effort */
                } finally {
                    lease.delete(fetchSig);
                }
                return;
            }

            if (options?.quietStaleRefresh || options?.backgroundListRefresh) {
                if (lease.has(fetchSig)) return;
                lease.add(fetchSig);
                const seq = ++queueItemsRequestSeq.current;
                try {
                    await runNetwork(seq, false);
                } catch {
                    /* stale/background refresh silent */
                } finally {
                    lease.delete(fetchSig);
                }
                return;
            }

            if (options?.userInitiated) {
                lease.delete(fetchSig);
            } else if (options?.force) {
                lease.delete(fetchSig);
            } else if (lease.has(fetchSig)) {
                return;
            } else {
                lease.add(fetchSig);
            }
            if (!options?.force && fetchSig === queueItemsLastFetchSigRef.current) {
                const ent = touchQueueRowCacheOnHit(cache, logicalKey);
                if (ent) {
                    // Cache hit for the same sig: apply immediately without a network round-trip.
                    lease.delete(fetchSig);
                    setQueuePillPendingKey(null);
                    setQueueItems(ent.payload);
                    setQueueItemsError(null);
                    setQueueItemsLoading(false);
                    commitQueueRowActionsWithLane({
                        work_unit_id: workUnitId,
                        department_id: departmentId,
                        pill_key: queueKey,
                        source: "row_cache",
                    });
                    if (pendingQueueTabPerfRef.current && typeof window !== "undefined" && typeof performance !== "undefined") {
                        pendingQueueTabPerfRef.current = false;
                        alloyPerfSet("queue_tab_rows_ready", performance.now());
                        markWorkUnitVmPillSwitchApply({
                            department_id: departmentId,
                            work_unit_id: workUnitId,
                            source: "row_cache",
                        });
                        markWorkUnitVmPillSwitchCommitted({
                            department_id: departmentId,
                            work_unit_id: workUnitId,
                            source: "row_cache",
                        });
                    }
                    markWorkUnitVmQueueReady({
                        department_id: departmentId,
                        work_unit_id: workUnitId,
                        source: "row_cache",
                    });
                    return;
                }
                // No cache entry (expired or evicted) even though sig matches.
                // Fall through to a fresh network fetch — this recovers from error states
                // where queueItems was cleared to null and the sig was never re-incremented.
                lease.delete(fetchSig);
            }
            queueItemsLastFetchSigRef.current = fetchSig;

            const seq = ++queueItemsRequestSeq.current;
            if (process.env.NODE_ENV === "development") {
                console.log("[queue-request:start]", {
                    seq,
                    workUnitId,
                    selectedQueueKey: queueKey,
                    apiQueueKey,
                    viewScopeFingerprint,
                    userInitiated: options?.userInitiated ?? false,
                });
            }
            const suppressLoadingShell = shouldSuppressQueueLoadingOnPillSwitch({
                user_initiated: options?.userInitiated === true,
                retain_prior_rows: lifecyclePillSwitchRetainRowsRef.current,
            });
            if (!suppressLoadingShell) {
                setQueueItemsLoading(true);
            }
            setQueueItemsError(null);
            setQueueItemsRoute(route);
            setQueueItems((prev) => {
                if (lifecyclePillSwitchRetainRowsRef.current) return prev;
                if (options?.userInitiated) return prev;
                const pk =
                    prev?.queue && typeof (prev.queue as { key?: string }).key === "string"
                        ? (prev.queue as { key: string }).key
                        : null;
                if (pk != null && pk !== apiQueueKey) return null;
                return prev;
            });
            try {
                if (!queueRowActionsHydratedRef.current) {
                    if (options?.userInitiated) {
                        void hydrateWorkUnitQueueRowActions();
                    } else {
                        await hydrateWorkUnitQueueRowActions();
                    }
                }
                await runNetwork(seq, true);
                primaryLaneRowsSettledOnceRef.current = true;
                if (
                    (options?.userInitiated || options?.initialLaneReveal) &&
                    !options?.backgroundListRefresh &&
                    seq === queueItemsRequestSeq.current
                ) {
                    void fetchQueueItems(workUnitId, queueKey, null, {
                        backgroundListRefresh: true,
                        logicalUnmapped: logicalUm,
                        ...(resolvedFetch.attentionBucketOverride !== undefined
                            ? { attentionBucketOverride: resolvedFetch.attentionBucketOverride }
                            : abSnap
                              ? { attentionBucketOverride: abSnap }
                              : {}),
                    });
                }
            } catch (e) {
                if (seq === queueItemsRequestSeq.current) {
                    pendingQueueTabPerfRef.current = false;
                    const hadRetain = lifecyclePillSwitchRetainRowsRef.current;
                    lifecyclePillSwitchRetainRowsRef.current = false;
                    setLifecyclePillRetainRows(false);
                    if (!hadRetain) {
                        setQueueItems(null);
                    }
                    setQueueItemsError(e instanceof Error ? e.message : "Failed to load queue items");
                    if (options?.userInitiated) {
                        traceLifecyclePillQueueResult({
                            phase: "rows_error",
                            selected_work_unit_id: workUnitId,
                            queue_key: queueKey,
                            loader: inferLifecycleQueueRowLoader({
                                work_unit_id: workUnitId,
                                queue_key: apiQueueKey,
                                work_unit_metadata: workUnitRef.current?.metadata,
                            }),
                            record_count: null,
                            error: e instanceof Error ? e.message : "Failed to load queue items",
                            api_path: route,
                        });
                    }
                }
            } finally {
                queueRowLeaseSigsRef.current.delete(fetchSig);
                if (
                    seq === queueItemsRequestSeq.current ||
                    queueRowLeaseSigsRef.current.size === 0
                ) {
                    setQueueItemsLoading(false);
                }
                if (seq === queueItemsRequestSeq.current) {
                    requestWorkUnitDeferredSupplement();
                }
            }
        },
        [
            laneUnmappedOnly,
            viewScopeFingerprint,
            selectedSiteId,
        ]
    );

    const fetchQueueItemsRef = useRef(fetchQueueItems);
    fetchQueueItemsRef.current = fetchQueueItems;

    return {
        fetchQueueItems,
        queueItems,
        setQueueItems,
        queueItemsError,
        setQueueItemsError,
        queueItemsLoading,
        setQueueItemsLoading,
        queueItemsRoute,
        setQueueItemsRoute,
        queueItemsLastFetchSigRef,
        queueRowLeaseSigsRef,
        queueItemsRequestSeq,
    };
}
