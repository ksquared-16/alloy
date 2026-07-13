"use client";

/**
 * Presentation Runtime V2 — WU.SURFACE resolution + intents.
 *
 * Resolves the WorkUnitSurfaceModel from the existing data layer, reused verbatim:
 *   - identity            — slug route context (`WorkUnitSlugRouteHost` owns URL sync);
 *                           header labels come from configured department metadata only
 *   - work views          — department `work_views_v1` via `resolveActiveWorkViewRuntimeContext`
 *   - queue rows + counts — GET /api/admin/queues/{id}/{queueKey}?work_view_id=… — ONE
 *                           evaluation path: the active pill count is the `total` of the same
 *                           response that renders the rows; inactive pills read their views'
 *                           CANONICAL-location totals (`useWorkViewTotals` — host work unit +
 *                           base lane, the same numbers the Workspace tile shows). Lane
 *                           summaries only size the rows fetch — never a displayed count.
 *   - operational answers — OIP warm cache scoped to the work unit
 *   - Focus Panel open    — `useAdminDrawer().openDrawer` (in-page; queue stays mounted)
 *
 * Work View selection: same-host pill clicks swap queue rows + focus panel IN PLACE
 * (Excel tabs — no `router.push`). Cross-host views still soft-navigate to the
 * canonical host work unit. An optimistic/local selection highlights the active pill
 * instantly; the URL owns the view only after cross-host navigation or external entry.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { useWorkspaceOrg } from "@/contexts/WorkspaceOrgContext";
import { useWorkUnitSlugRouteOptional } from "@/contexts/WorkUnitSlugRouteContext";
import { useWorkspaceSiteFilter } from "@/contexts/WorkspaceSiteFilterContext";
import {
    resolveActiveWorkViewRuntimeContext,
    savedWorkViewsFromDepartmentMetadata,
} from "@/lib/lifecycle/resolveWorkViewRuntimeContext";
import {
    activeLifecycleProcess,
    lifecycleBuilderFromDepartmentMetadata,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { QUEUE_ROW_SURFACE_PUBLISHED_EVENT } from "@/lib/adminV2/settings/surfaces/queueRowSurfaceService";
import { isLegacyArtifactProcessName } from "@/lib/admin/buildOperatorLifecycleLanding";
import {
    resolveWorkViewCanonicalLocation,
    type WorkViewCanonicalLocation,
    type WorkViewCanonicalLocationWorkUnitRow,
} from "@/lib/workspace/resolveWorkViewCanonicalLocation";
import { appendWorkspaceSiteToUrl } from "@/lib/adminV2/workspaceSiteFilterClient";
import { resolveWorkUnitQueueRowsFetchLimit } from "@/lib/adminV2/workUnitQueueRowsFetchLimit";
import { dedupeAdminFetch } from "@/lib/workspace/workspaceAdminFetchDedupe";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import {
    OPPORTUNITY_QUEUE_UPDATED_EVENT,
    isQueueMembershipMutationActionKey,
    parseOpportunityQueueUpdatedDetail,
    shouldRefetchWorkUnitQueueRowsForEvent,
    shouldRefreshQueueSummariesForEvent,
} from "@/lib/admin/opportunityQueueRefreshEvent";
import { bustOperatorRuntimeReadCaches } from "@/lib/admin/operatorRuntimeReadCacheBust";
import { prefetchOpportunityDrawerOnRowIntent } from "@/lib/admin/opportunityDrawerIntentPrefetch";
import { markDrawerFamilyWorkspaceTiming } from "@/lib/communications/v2/drawerFamilyWorkspacePrefetchTiming";
import { resolveQueueRowWarmTarget } from "@/lib/presentation/runtime/queueRowWarmTarget";
import { warmOperatorWorkUnitEntryFromHref } from "@/lib/admin/operatorWorkUnitEntryWarm";
import { resolveWorkViewTargetHref } from "@/lib/presentation/runtime/workViewTargetHref";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import { fetchWorkUnitRightRailResolvedActions } from "@/lib/workspace/fetchWorkUnitRightRailResolvedActions";
import { filterRightRailActionsForCurrentWork } from "@/lib/adminV2/runtime/focusPanel/currentWork/filterRightRailActionsForCurrentWork";
import { useOpportunityDrawerVmPayload } from "@/lib/adminV2/viewModel/drawer/vmRuntime/useOpportunityDrawerVmPayload";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import type { QueueItemsResult, QueueSummary } from "@/lib/queues/types";
import { alloyPerfGet } from "@/lib/perf/alloyPerfGlobal";
import {
    beginWorkspaceNav,
    markWorkspaceNavSignal,
    resolveWorkspaceNavMode,
    type WorkspaceNavMode,
} from "@/lib/perf/workspaceNavGraph";
import {
    putWorkUnitSurfaceConfigCache,
    putWorkUnitSurfaceQueueCache,
    putWorkUnitSurfaceSummariesCache,
    putWorkUnitSurfaceRightRailCache,
    invalidateWorkUnitSurfaceCachesForWorkUnit,
    invalidateWorkUnitSurfaceQueueCachesForWorkUnit,
    type WorkUnitViewModelCacheContext,
} from "@/lib/adminV2/viewModel/workUnit/workUnitViewModelSessionCache";
import {
    computeWorkUnitSurfaceInitialSeed,
    resolveWorkUnitReadiness,
    validatedBaseQueueKeyForUnit,
    workUnitSurfaceQueueLane,
    type WorkUnitSurfaceInitialSeed,
} from "./workUnitSurfaceSeed";
import {
    fetchWorkUnitSurfaceConfigBundle,
    queueRowSurfaceIdForDepartment,
} from "./workUnitSurfaceConfigFetch";
import { warmOperatorWorkUnitSurfaceFromHref } from "./warmWorkUnitSurfaceSession";
import { peekRetainedWorkView, putRetainedWorkView } from "./workUnitOperatorContext";
import { useOperationalAnswers } from "./useOperationalAnswers";
import { useWorkUnitHeaderSurfaceConfigState } from "./useWorkUnitHeaderSurfaceConfig";
import {
    buildWorkUnitHeaderPresentationForRuntime,
    workUnitHeaderKpiSourceKeys,
    type WorkUnitHeaderPresentationModel,
} from "./workUnitHeaderSurfaceConfig";
import {
    resolveSelectWorkViewAction,
    shouldAutoOpenFirstRowForView,
} from "./workUnitPillSwitching";
import {
    queueRowsRouteForView,
    useWorkViewTotals,
    workViewTotalKey,
    type WorkViewTotalTarget,
} from "./useWorkViewTotals";
import {
    opportunityQueuePreviewSeedFromRowContext,
    queueRowModelsFromQueueItemsResult,
    queueTotalCountFromQueueItemsResult,
    workViewLinkModelsFromConfiguredViews,
    type QueueRowModel,
    type WorkUnitSurfaceIntents,
    type WorkUnitSurfaceModel,
    type WorkUnitReadiness,
} from "./types";
import { mapQueueRowSurfaceToCompactConfig } from "./queueRowSurfaceConfig";
import {
    queueRowVariantMatchInputFromContext,
    resolveQueueRowPresentation,
} from "./queueRowVariantResolve";
import type { QueueRecordLayoutConfigV3 } from "@/lib/layout/queueRecordLayoutV3";

/** Drawer open provenance for Focus Panel opens from the presentation runtime queue. */
const PRESENTATION_RUNTIME_QUEUE_ROW_OPEN_SOURCE = "presentation_runtime_queue_row";

// ── Trust Closure navigation-mode classification ─────────────────────────────────────────────
// Classified from real cache + prefetch evidence, not the slug alone (a remount is not "warm"
// merely because the slug was seen):
//   - a cached composition is present AND this slug was navigated before → `return`;
//   - a cached composition is present but this slug was NOT navigated before → `prefetched`
//     (a prewarm wrote it ahead of the first visit);
//   - no cache, first navigation since a full page load → `cold`;
//   - no cache, a soft navigation within the already-hydrated app → `warm`.
// Module-scoped so it survives the surface unmount/remount that IS the defect.
const seenWorkUnitNavSlugs = new Set<string>();
let firstWorkspaceNavSincePageLoad = true;

function classifyWorkspaceNavMode(slug: string, hasCachedComposition: boolean): WorkspaceNavMode {
    return resolveWorkspaceNavMode({
        seenBefore: seenWorkUnitNavSlugs.has(slug),
        firstSinceLoad: firstWorkspaceNavSincePageLoad,
        hasCachedComposition,
    });
}


export type WorkUnitSurfaceRuntime = {
    model: WorkUnitSurfaceModel;
    intents: WorkUnitSurfaceIntents;
};

export function useWorkUnitSurfaceRuntime(): WorkUnitSurfaceRuntime {
    const slugRoute = useWorkUnitSlugRouteOptional();
    const siteFilter = useWorkspaceSiteFilter();
    const selectedSiteId = siteFilter?.selectedSiteId ?? null;
    const { drawer, openDrawer, closeDrawer } = useAdminDrawer();

    // Fetches gate on org readiness: the queue route resolves visibility under the org/auth
    // gate, and a request racing org-context bootstrap 404s transiently.
    const { orgId, principalUserId, accessScopeFingerprint } = useWorkspaceOrg();
    const departmentId = orgId ? slugRoute?.departmentId ?? null : null;
    const workUnitId = orgId ? slugRoute?.workUnitId ?? null : null;

    // Session-cache scope — the same org/dept/wu/user/scope key the view-model cache uses. Org id
    // is part of the key, so a cache read can never cross tenants.
    const cacheContext = useMemo<WorkUnitViewModelCacheContext>(
        () => ({
            orgId,
            departmentId,
            workUnitId,
            userId: principalUserId,
            scopeFingerprint: accessScopeFingerprint,
        }),
        [orgId, departmentId, workUnitId, principalUserId, accessScopeFingerprint],
    );

    // Read-through seed, computed exactly once per surface mount (lazy initializer). On a return
    // navigation (the surface remounts) this holds the prior config + rows for instant first paint;
    // on cold entry it is the empty seed. Stable for the mount's life — never re-set.
    const [seed] = useState<WorkUnitSurfaceInitialSeed>(() =>
        computeWorkUnitSurfaceInitialSeed({ cacheContext, slugRoute, selectedSiteId }),
    );
    // Current cache scope for the once-subscribed mutation listener (which cannot close over it).
    const cacheContextRef = useRef(cacheContext);
    cacheContextRef.current = cacheContext;

    // ── Work Views: department metadata (`work_views_v1`) + host queue_definition ──────
    // Dept work units are fetched alongside so every visible view's CANONICAL location
    // (host unit + base lane — `resolveWorkViewCanonicalLocation`) resolves client-side;
    // pill counts and pill navigation both read it.
    const [deptMetadata, setDeptMetadata] = useState<unknown | null>(() => seed.config?.deptMetadata ?? null);
    const [queueDefinition, setQueueDefinition] = useState<unknown | null>(
        () => seed.config?.queueDefinition ?? null,
    );
    const [deptWorkUnits, setDeptWorkUnits] = useState<
        WorkViewCanonicalLocationWorkUnitRow[] | null
    >(() => seed.config?.deptWorkUnits ?? null);
    const [queueRowLayoutConfig, setQueueRowLayoutConfig] = useState<QueueRecordLayoutConfigV3 | null>(
        () => seed.config?.queueRowLayoutConfig ?? null,
    );
    const [queueRowSurfaceIdState, setQueueRowSurfaceIdState] = useState<string>(
        () => seed.config?.queueRowSurfaceId ?? "pipeline-queue-row",
    );
    // Seeded config → the surface is already established: `configSettled` starts true so the queue
    // rows effect fires immediately (no re-establish gate) and the seeded rows show without a skeleton.
    const [configSettled, setConfigSettled] = useState(() => seed.config != null);
    // The mount seed applies only to the first config-effect run (its context). Later runs (a slug
    // change without remount) ignore it and re-establish normally.
    const configSeedConsumedRef = useRef(false);

    useEffect(() => {
        if (!departmentId || !workUnitId) return;
        const useSeed = !configSeedConsumedRef.current && seed.config != null;
        configSeedConsumedRef.current = true;
        // Fresh cached config → skip the whole config→layout waterfall for this navigation.
        if (useSeed && seed.configFresh) {
            setConfigSettled(true);
            return;
        }
        let cancelled = false;
        // Seeded-stale keeps the established surface visible during the silent revalidate (SWR); only
        // a genuine cold establish (or a cross-host switch within a live mount) drops the gate so the
        // new unit shows its establish state. The queue reveal gate is re-armed separately (below).
        if (!useSeed) {
            setConfigSettled(false);
            const surfaceId = queueRowSurfaceIdForDepartment(departmentId, null);
            setQueueRowSurfaceIdState(surfaceId);
        }
        const init = workspaceDataFetchInit() ?? undefined;
        // One shared config-bundle fetch — the SAME function the navigation prewarm uses, so a
        // prefetch writes exactly the entry this effect would (no divergent shape, no second contract).
        void fetchWorkUnitSurfaceConfigBundle({ departmentId, workUnitId, fetchInit: init })
            .then((bundle) => {
                if (cancelled) return;
                // A failure shell (transient 404/network) must not overwrite good seeded config nor
                // poison the cache; leave the prior/seeded config in place and let SWR retry.
                if (!bundle.ok && seed.config != null) return;
                setDeptMetadata(bundle.deptMetadata);
                setQueueRowSurfaceIdState(bundle.queueRowSurfaceId);
                setQueueDefinition(bundle.queueDefinition);
                setDeptWorkUnits(bundle.deptWorkUnits);
                setQueueRowLayoutConfig(bundle.queueRowLayoutConfig);
                // Write-back only a real config, so a later fresh-skip never trusts an empty bundle.
                if (bundle.ok) putWorkUnitSurfaceConfigCache(bundle, cacheContext);
            })
            .catch(() => {
                /* graceful: leave prior/seeded config in place */
            })
            .finally(() => {
                if (!cancelled) setConfigSettled(true);
            });
        return () => {
            cancelled = true;
        };
    }, [departmentId, workUnitId, cacheContext, seed]);

    // Active Work View: route seeds the landing view; same-host pill clicks override via
    // `localWorkViewId` (Excel-tab swap — no navigation). Cross-host clicks use optimistic
    // highlight until `router.push` commits the destination slug.
    const routeSlug = slugRoute?.routeSlug ?? null;
    // Retained selection: on a return to this unit (no explicit Work View in the URL) restore the
    // operator's last in-page Work View. An explicit route view (deep link / cross-host landing)
    // always wins over the retained one.
    const [localWorkViewId, setLocalWorkViewId] = useState<string | null>(() =>
        slugRoute?.initialWorkViewId ? null : peekRetainedWorkView(orgId, workUnitId),
    );
    const [optimisticSelection, setOptimisticSelection] = useState<{
        routeSlug: string | null;
        workViewId: string;
    } | null>(null);

    // Reset the in-page selection only when the unit/route ACTUALLY changes (a cross-host switch),
    // not on the initial mount — otherwise the retained-view seed above would be wiped immediately.
    const workViewResetKeyRef = useRef(`${workUnitId ?? ""}|${routeSlug ?? ""}`);
    useEffect(() => {
        const nextKey = `${workUnitId ?? ""}|${routeSlug ?? ""}`;
        if (workViewResetKeyRef.current === nextKey) return;
        workViewResetKeyRef.current = nextKey;
        setLocalWorkViewId(slugRoute?.initialWorkViewId ? null : peekRetainedWorkView(orgId, workUnitId));
    }, [workUnitId, routeSlug, slugRoute?.initialWorkViewId, orgId]);

    const selectedWorkViewId =
        optimisticSelection && optimisticSelection.routeSlug === routeSlug
            ? optimisticSelection.workViewId
            : null;
    const routeWorkViewId = slugRoute?.initialWorkViewId ?? null;
    const activeWorkViewIdInput = localWorkViewId ?? selectedWorkViewId ?? routeWorkViewId;

    const runtimeCtx = useMemo(
        () =>
            resolveActiveWorkViewRuntimeContext({
                departmentMetadata: deptMetadata,
                workViewId: activeWorkViewIdInput,
                queueKey: activeWorkViewIdInput ? null : slugRoute?.initialQueueKey ?? null,
                queueDefinition,
            }),
        [deptMetadata, activeWorkViewIdInput, slugRoute?.initialQueueKey, queueDefinition],
    );

    const savedViews = useMemo(() => savedWorkViewsFromDepartmentMetadata(deptMetadata), [deptMetadata]);

    // ── Queue lane summaries: FETCH-SIZING HEURISTIC ONLY (never a pill/badge count) ──────
    // Pill counts and `queue.totalCount` come from the queue rows API (`work_view_id`
    // predicate path) — the same evaluation that renders the rows. Lane summaries evaluate
    // lanes (`compat_queue_key`), a DIFFERENT path that disagrees with view predicates; they
    // are kept only to size the rows fetch so the loaded page covers the lane.
    const [summaries, setSummaries] = useState<QueueSummary[] | null>(() => seed.summaries);
    const summariesRequestSeq = useRef(0);

    // ── Live refresh: re-run the queue + summary + totals fetches when a mutation dispatches
    // `adminv2:opportunity-updated` (e.g. Create Lead adds a New Leads row). The queue/summary
    // GETs are not response-cached (dedupeAdminFetch coalesces in-flight only), so bumping this
    // nonce into their effect deps refetches fresh; it also folds into useWorkViewTotals' scope
    // key so the pill/badge counts re-resolve. Scoped by the shared decision helpers so an
    // off-screen person edit never forces a lane refetch.
    const [queueRefreshNonce, setQueueRefreshNonce] = useState(0);
    const visibleRowIdsRef = useRef<readonly string[]>([]);

    useEffect(() => {
        if (!workUnitId) return;
        const seq = ++summariesRequestSeq.current;
        const qs = new URLSearchParams({
            include_previews: "false",
            count_mode: "exact",
            limit: "3",
            summary_mode: "initial",
        });
        const route = appendWorkspaceSiteToUrl(
            `/api/admin/work-units/${encodeURIComponent(workUnitId)}/queues?${qs.toString()}`,
            selectedSiteId,
        );
        void dedupeAdminFetch(route, workspaceDataFetchInit())
            .then(async (res) => {
                const json = (await res.json().catch(() => ({}))) as { queues?: QueueSummary[]; error?: string };
                if (!res.ok) throw new Error(json.error ?? "Failed to load queues");
                if (seq === summariesRequestSeq.current) {
                    const nextSummaries = json.queues ?? [];
                    setSummaries(nextSummaries);
                    putWorkUnitSurfaceSummariesCache(nextSummaries, cacheContext, selectedSiteId);
                }
            })
            .catch(() => {
                if (seq === summariesRequestSeq.current) setSummaries(null);
            });
    }, [workUnitId, selectedSiteId, queueRefreshNonce, cacheContext]);

    // ── Queue rows: server applies the active Work View's filters (work_view_id) ────────
    // Seeded from the session cache on mount so a return navigation renders the prior rows instantly;
    // the effect below still revalidates (SWR) and writes fresh rows back.
    const [queueResult, setQueueResult] = useState<QueueItemsResult | null>(() => seed.queueResult);
    const [queueLoading, setQueueLoading] = useState(false);
    const [queueError, setQueueError] = useState<string | null>(null);
    // "The first queue request for this surface has resolved (rows or error)." Seeded true on a
    // return so the atomic-reveal gate is satisfied immediately; a background revalidate never
    // clears it (it keys on settled-once, not `queueLoading`), so SWR cannot re-blank the surface.
    const [queueSettledOnce, setQueueSettledOnce] = useState(() => seed.queueResult != null);
    const queueRequestSeq = useRef(0);

    const fetchQueueKey = useMemo(
        () => validatedBaseQueueKeyForUnit(runtimeCtx.queueKey, queueDefinition),
        [runtimeCtx.queueKey, queueDefinition],
    );
    const summaryForLane = useMemo(
        () => summaries?.find((s) => s.key === fetchQueueKey || s.resolved_queue_key === fetchQueueKey) ?? null,
        [summaries, fetchQueueKey],
    );
    const settledLaneCount =
        summaryForLane && !summaryForLane.counts_deferred && typeof summaryForLane.count === "number"
            ? summaryForLane.count
            : undefined;
    const fetchLimit = resolveWorkUnitQueueRowsFetchLimit(settledLaneCount);
    // Decouple the active-row fetch from the SUMMARY request: the rows fetch reads the latest
    // fetch-size at fire time from this ref, but `fetchLimit` is NOT a rows-effect dependency — so a
    // summary arriving after the rows fetch never triggers a duplicate rows request. If summaries are
    // already present they size the first fetch; if not, the reveal fetch uses the safe default.
    const fetchLimitRef = useRef(fetchLimit);
    fetchLimitRef.current = fetchLimit;

    // Fresh seeded rows (a prefetch or a very recent return) → skip the initial revalidate so a
    // prefetched navigation launches NO duplicate rows request. One-shot: any later lane/view/site
    // change or mutation nonce still refetches.
    const skipFreshQueueFetchRef = useRef(seed.queueFresh === true);

    useEffect(() => {
        // Wait for config settle: the lane validation above needs the queue definition, and a
        // rows fetch racing org/config bootstrap 404s transiently.
        if (!workUnitId || !fetchQueueKey || !configSettled) return;
        if (skipFreshQueueFetchRef.current) {
            skipFreshQueueFetchRef.current = false;
            return;
        }
        const seq = ++queueRequestSeq.current;
        setQueueLoading(true);
        setQueueError(null);
        const route = queueRowsRouteForView({
            workUnitId,
            baseQueueKey: fetchQueueKey,
            workViewId: runtimeCtx.workViewId,
            limit: fetchLimitRef.current,
            selectedSiteId,
        });
        void dedupeAdminFetch(route, workspaceDataFetchInit())
            .then(async (res) => {
                const json = (await res.json().catch(() => ({}))) as { error?: string };
                if (!res.ok) throw new Error(json.error ?? "Failed to load queue items");
                // Stale-response guard: only the latest request may apply.
                if (seq === queueRequestSeq.current) {
                    const nextQueue = json as unknown as QueueItemsResult;
                    setQueueResult(nextQueue);
                    // Write-back: persist rows for this lane so return navigation is instant.
                    putWorkUnitSurfaceQueueCache(
                        { queueResult: nextQueue },
                        cacheContext,
                        workUnitSurfaceQueueLane(fetchQueueKey, runtimeCtx.workViewId, selectedSiteId),
                    );
                }
            })
            .catch((e) => {
                if (seq === queueRequestSeq.current) {
                    // Queue-lane hold: retain prior rows on fetch failure — never masquerade as empty.
                    setQueueError(e instanceof Error ? e.message : "Failed to load queue items");
                }
            })
            .finally(() => {
                if (seq === queueRequestSeq.current) {
                    setQueueLoading(false);
                    setQueueSettledOnce(true);
                }
            });
        // fetchLimit intentionally excluded — read from fetchLimitRef so a late summary never refetches.
    }, [
        workUnitId,
        fetchQueueKey,
        runtimeCtx.workViewId,
        selectedSiteId,
        configSettled,
        queueRefreshNonce,
        cacheContext,
    ]);

    // Cross-host switch within a live mount: re-arm the queue reveal gate so the destination unit
    // reveals only once its OWN rows are present. A fresh mount / return navigation is seeded (the
    // gate starts satisfied), never re-armed — the ref starts equal to the mount's work unit.
    const queueGateWorkUnitRef = useRef(workUnitId);
    useEffect(() => {
        if (queueGateWorkUnitRef.current === workUnitId) return;
        queueGateWorkUnitRef.current = workUnitId;
        setQueueSettledOnce(false);
    }, [workUnitId]);

    // No resolvable queue lane (config settled but the unit exposes no queue key): nothing to wait
    // for — satisfy the gate so the surface reveals its (empty) composition instead of hanging.
    useEffect(() => {
        if (configSettled && !fetchQueueKey) setQueueSettledOnce(true);
    }, [configSettled, fetchQueueKey]);

    const rows = useMemo(() => {
        const base = queueResult ? queueRowModelsFromQueueItemsResult(queueResult) : [];
        // Per-row Queue Row Variant resolution: only when the published surface defines variants.
        // Absent variants → base rows unchanged (each uses the surface Default via queue.rowConfig).
        if (!queueRowLayoutConfig?.variants?.length) return base;
        return base.map((row) => {
            if (!row.context) return row;
            const input = queueRowVariantMatchInputFromContext(row.context, {
                workViewId: runtimeCtx.workViewId,
            });
            const { rowConfig, focus } = resolveQueueRowPresentation(
                queueRowLayoutConfig,
                row.context,
                input,
            );
            return { ...row, rowConfig, focus: focus ?? undefined };
        });
    }, [queueResult, queueRowLayoutConfig, runtimeCtx.workViewId]);

    // Keep the visible-row id set current for the refresh listener without re-subscribing it.
    useEffect(() => {
        visibleRowIdsRef.current = rows.map((r) => r.entityId);
    }, [rows]);

    // Subscribe once: a queue-mutation broadcast bumps the nonce (see decl above). The shared
    // helpers decide whether THIS event touches the lane (membership change / visible row), so
    // an unrelated off-screen edit is ignored.
    useEffect(() => {
        if (typeof window === "undefined") return;
        const onQueueUpdated = (ev: Event) => {
            const detail = parseOpportunityQueueUpdatedDetail(ev);
            const visibleOpportunityIds = visibleRowIdsRef.current;
            if (isQueueMembershipMutationActionKey(detail?.action_key)) {
                bustOperatorRuntimeReadCaches();
            }
            const refetchRows = shouldRefetchWorkUnitQueueRowsForEvent({ detail, visibleOpportunityIds });
            const refreshSummaries = shouldRefreshQueueSummariesForEvent({ detail, visibleOpportunityIds });
            if (refetchRows || refreshSummaries) {
                // Narrowest correct invalidation: drop only the DATA projections (rows / summaries /
                // counts) for THIS work unit so a return cannot resurrect pre-mutation rows, while the
                // session-stable config and configured right-rail actions are retained (a data
                // mutation never changes them). The active lane also refetches (nonce) and writes the
                // fresh rows back, so the surface stays current in place — no route reconstruction.
                invalidateWorkUnitSurfaceQueueCachesForWorkUnit({ context: cacheContextRef.current });
                setQueueRefreshNonce((n) => n + 1);
            }
        };
        window.addEventListener(OPPORTUNITY_QUEUE_UPDATED_EVENT, onQueueUpdated);
        return () => window.removeEventListener(OPPORTUNITY_QUEUE_UPDATED_EVENT, onQueueUpdated);
    }, []);

    // Configuration publish (queue-row surface republished) — the config projection changed, so drop
    // the FULL surface cache for this work unit (config + rows + right-rail) so a return re-resolves
    // it. Operational record data is invalidated with it (its projection depends on the config).
    useEffect(() => {
        if (typeof window === "undefined") return;
        const onConfigPublished = () => {
            invalidateWorkUnitSurfaceCachesForWorkUnit({ context: cacheContextRef.current });
        };
        window.addEventListener(QUEUE_ROW_SURFACE_PUBLISHED_EVENT, onConfigPublished);
        return () => window.removeEventListener(QUEUE_ROW_SURFACE_PUBLISHED_EVENT, onConfigPublished);
    }, []);

    // THE count model: the `total` of the same rows response that renders the queue.
    const rawQueueTotalCount = useMemo(
        () => queueTotalCountFromQueueItemsResult(queueResult),
        [queueResult],
    );

    // Compact-row slot config from the published Queue Row surface (visibility + labels).
    // Presentation-only: does NOT touch row order/membership/count. Generic-context fallback
    // (all slots visible, no overrides) when the surface is unpublished / the fetch failed.
    const queueRowConfig = useMemo(
        () => mapQueueRowSurfaceToCompactConfig(queueRowLayoutConfig).slots,
        [queueRowLayoutConfig],
    );

    // ── Canonical locations: where each visible view's count/rows are DEFINED ───────────
    // Host work unit + base lane per view (`resolveWorkViewCanonicalLocation`) — the same
    // location the Workspace tile counts, the left-nav hrefs, and the by-slug resolver
    // target, so every surface reads one number per view.
    const canonicalLocationByViewId = useMemo(() => {
        const map = new Map<string, WorkViewCanonicalLocation>();
        if (!departmentId || !deptWorkUnits?.length) return map;
        for (const view of savedViews) {
            if (view.visible_in_runtime === false) continue;
            const location = resolveWorkViewCanonicalLocation(view, deptWorkUnits, departmentId);
            if (location) map.set(view.id, location);
        }
        return map;
    }, [savedViews, deptWorkUnits, departmentId]);

    // ── Per-view counts: canonical-location totals (SAME source as the Workspace tile) ──
    // Every visible view's count comes from the queue rows API with that view's
    // `work_view_id` (limit=1, count_mode=exact) at its canonical location — never from
    // lane summaries, which evaluate lanes instead of view predicates (the root cause of
    // swapped pill counts).
    const workViewTotalTargets = useMemo<WorkViewTotalTarget[]>(() => {
        const out: WorkViewTotalTarget[] = [];
        for (const [viewId, location] of canonicalLocationByViewId) {
            out.push({
                viewId,
                workUnitId: location.workUnitId,
                baseQueueKey: location.baseQueueKey,
            });
        }
        return out;
    }, [canonicalLocationByViewId]);

    const canonicalTotals = useWorkViewTotals({
        targets: workViewTotalTargets,
        selectedSiteId,
        enabled: configSettled,
        refreshToken: queueRefreshNonce,
        cacheContext,
    });
    const totalCount = useMemo(() => {
        const activeViewId = runtimeCtx.workViewId?.trim() || null;
        const location = activeViewId ? canonicalLocationByViewId.get(activeViewId) : null;
        const retained =
            location && activeViewId
                ? canonicalTotals.get(workViewTotalKey(location.workUnitId, activeViewId))
                : null;

        if (!queueLoading && !queueError && rawQueueTotalCount != null) {
            return rawQueueTotalCount;
        }

        // While the destination queue is in flight, never show a stale rows-response total
        // from the prior active view — retain the last settled canonical count instead.
        if ((queueLoading || queueError) && retained != null) return retained;

        return rawQueueTotalCount;
    }, [
        rawQueueTotalCount,
        queueLoading,
        queueError,
        runtimeCtx.workViewId,
        canonicalLocationByViewId,
        canonicalTotals,
    ]);


    // ── Work View pills: same configured views the Workspace tile lists ─────────────────
    // Invariant: the ACTIVE view's count IS `queue.totalCount` (same rows response as the
    // rendered rows); inactive views read their canonical-location totals. null while
    // loading → no badge (never a wrong badge).
    const workViews = useMemo(
        () =>
            workViewLinkModelsFromConfiguredViews(savedViews, {
                activeWorkViewId: runtimeCtx.workViewId,
                countForView: (view) => {
                    if (view.id === runtimeCtx.workViewId) return totalCount;
                    const location = canonicalLocationByViewId.get(view.id);
                    if (!location) return null;
                    return (
                        canonicalTotals.get(workViewTotalKey(location.workUnitId, view.id)) ?? null
                    );
                },
            }),
        [savedViews, runtimeCtx.workViewId, totalCount, canonicalLocationByViewId, canonicalTotals],
    );

    // ── Work Unit Header: published entity_layouts config + OIP warm cache ─────────────
    const { config: headerConfig, loaded: headerConfigLoaded } = useWorkUnitHeaderSurfaceConfigState();

    // ── Header identity fallbacks (when title/subtitle unset in published config) ───────
    const processLabel = useMemo(() => {
        const configured = activeLifecycleProcess(
            lifecycleBuilderFromDepartmentMetadata(deptMetadata),
        )?.name?.trim();
        const cleanConfigured =
            configured && !isLegacyArtifactProcessName(configured) ? configured : null;
        return cleanConfigured || slugRoute?.departmentName || null;
    }, [deptMetadata, slugRoute?.departmentName]);
    const workViewLabel = runtimeCtx.workView?.label?.trim() || null;

    const headerKpiKeys = useMemo(() => workUnitHeaderKpiSourceKeys(headerConfig), [headerConfig]);
    const { resolved: headerMetricsResolved, settled: headerMetricsSettled } = useOperationalAnswers({
        siteId: selectedSiteId,
        workUnitId,
        keys: headerKpiKeys,
    });

    const lastCompleteHeader = useRef<WorkUnitHeaderPresentationModel | null>(null);
    const headerPresentation = useMemo(() => {
        if (!headerConfigLoaded || !headerMetricsSettled) {
            return lastCompleteHeader.current;
        }
        const next = buildWorkUnitHeaderPresentationForRuntime(headerConfig, {
            fallbackTitle: processLabel,
            fallbackSubtitle: workViewLabel,
            resolved: headerMetricsResolved,
        });
        lastCompleteHeader.current = next;
        return next;
    }, [
        headerConfig,
        headerConfigLoaded,
        headerMetricsResolved,
        headerMetricsSettled,
        processLabel,
        workViewLabel,
    ]);

    // ── First-row auto-open: re-arm on every work-view change after rows settle ─────────
    const autoOpenedForViewRef = useRef<string | null>(null);
    const forceAutoOpenViewRef = useRef<string | null>(null);

    // ── Intents ──────────────────────────────────────────────────────────────────────────
    const router = useRouter();
    const selectWorkView = useCallback(
        (workViewId: string) => {
            const targetInputs = {
                views: savedViews,
                canonicalLocationByViewId,
                selectedSiteId,
            };
            const action = resolveSelectWorkViewAction({
                workViewId,
                currentWorkViewId: runtimeCtx.workViewId,
                currentWorkUnitId: workUnitId,
                canonicalLocationByViewId,
                targetInputs,
            });
            if (action.kind === "noop") return;

            // Clear stale focus panel immediately — URL record segment strips via drawer sync.
            closeDrawer();

            forceAutoOpenViewRef.current = action.workViewId;
            autoOpenedForViewRef.current = null;

            if (action.kind === "in-page") {
                setLocalWorkViewId(action.workViewId);
                setOptimisticSelection(null);
                // Retain the operator's choice so a return to this unit restores this Work View.
                putRetainedWorkView(orgId, workUnitId, action.workViewId);
                return;
            }

            setLocalWorkViewId(null);
            setOptimisticSelection({ routeSlug, workViewId: action.workViewId });
            router.push(action.href);
        },
        [
            savedViews,
            canonicalLocationByViewId,
            router,
            selectedSiteId,
            routeSlug,
            runtimeCtx.workViewId,
            workUnitId,
            orgId,
            closeDrawer,
        ],
    );

    // Hover/focus warm: prefetch the target route of a Work View pill — the SAME route
    // selectWorkView will push — so switching views lands on a resolved host without a cold
    // shell (matters most for views hosted on a different work unit). Skips the active view
    // (already here) and unresolvable views. Reuses the shared operator-entry warm the left
    // nav uses for its work-view links; fire-and-forget + deduped, safe per pointer.
    const prefetchWorkView = useCallback(
        (workViewId: string) => {
            const id = workViewId.trim();
            if (!id || id === runtimeCtx.workViewId) return;
            const href = resolveWorkViewTargetHref(id, {
                views: savedViews,
                canonicalLocationByViewId,
                selectedSiteId,
            });
            if (href) {
                warmOperatorWorkUnitEntryFromHref(href, selectedSiteId, "work_view_pill_intent");
                // Warm the target unit's surface session into the SAME cache the runtime seeds from,
                // under this session's org/user/scope so navigation consumes the prefetch.
                warmOperatorWorkUnitSurfaceFromHref(href, selectedSiteId, {
                    orgId,
                    userId: principalUserId,
                    scopeFingerprint: accessScopeFingerprint,
                });
            }
        },
        [
            savedViews,
            canonicalLocationByViewId,
            selectedSiteId,
            runtimeCtx.workViewId,
            orgId,
            principalUserId,
            accessScopeFingerprint,
        ],
    );

    const openRecord = useCallback(
        (row: QueueRowModel) => {
            if (row.entityType === "job") {
                openDrawer({
                    type: "jobs",
                    id: row.entityId,
                    jobRecordSurface: "drawer",
                    source: PRESENTATION_RUNTIME_QUEUE_ROW_OPEN_SOURCE,
                });
                return;
            }
            if (row.entityType === "schedule") {
                openDrawer({
                    type: "schedules",
                    id: row.entityId,
                    source: PRESENTATION_RUNTIME_QUEUE_ROW_OPEN_SOURCE,
                });
                return;
            }
            // Opportunity rows: the frozen contract's drawer_open is authoritative identity
            // (grouped rows anchor on the case opportunity). URL sync after openDrawer is
            // owned by WorkUnitSlugRouteHost — not duplicated here. The workspace context
            // scopes header actions / focus-panel layout to this work unit + active view;
            // the preview seed lets the inline Focus Panel own the clicked subject identity
            // before the record payload resolves (resolveFocusPanelSubjectReveal).
            const drawerOpen = row.context?.drawer_open ?? null;
            const opportunityId = drawerOpen?.entity_id?.trim() || row.entityId;
            markDrawerFamilyWorkspaceTiming("queue_row_click", {
                entity_id: opportunityId,
                entity_type: row.entityType,
            });
            openDrawer({
                type: "opportunities",
                id: opportunityId,
                source: PRESENTATION_RUNTIME_QUEUE_ROW_OPEN_SOURCE,
                opportunityWorkspaceContext:
                    departmentId && workUnitId ?
                        {
                            work_unit_id: workUnitId,
                            department_id: departmentId,
                            work_view_id: runtimeCtx.workViewId ?? null,
                        }
                        : null,
                opportunityQueuePreviewSeed: opportunityQueuePreviewSeedFromRowContext(row.context),
            });
        },
        [openDrawer, departmentId, workUnitId, runtimeCtx.workViewId],
    );

    // Hover/focus warm: prefetch a row's Focus Panel record VM before the click so opening is
    // instant. Mirrors the first-row auto-open warm below and the Workspace-tile hover prewarm;
    // reuses the hover-safe intent prefetch (bootstrap + primary, never full-hydrate on hover)
    // so it never competes with the active lane. Fire-and-forget + deduped — safe per pointer.
    const prefetchRecord = useCallback(
        (row: QueueRowModel) => {
            const target = resolveQueueRowWarmTarget(row, {
                departmentId,
                workUnitId,
                workViewId: runtimeCtx.workViewId ?? null,
            });
            if (target) {
                prefetchOpportunityDrawerOnRowIntent(target.id, target.context, target.seed);
            }
        },
        [departmentId, workUnitId, runtimeCtx.workViewId],
    );

    useEffect(() => {
        const viewId = runtimeCtx.workViewId?.trim() || null;
        if (!viewId) return;
        if (autoOpenedForViewRef.current === viewId) return;
        if (queueLoading || !queueResult) return;

        const forceAutoOpen = forceAutoOpenViewRef.current === viewId;
        const shouldOpen = shouldAutoOpenFirstRowForView({
            viewId,
            autoOpenedViewId: autoOpenedForViewRef.current,
            queueLoading,
            queueSettled: true,
            rowCount: rows.length,
            routeRecordId: slugRoute?.routeRecordId ?? null,
            forceAutoOpenViewId: forceAutoOpen ? viewId : null,
        });

        autoOpenedForViewRef.current = viewId;
        if (forceAutoOpen) forceAutoOpenViewRef.current = null;

        if (!shouldOpen) return;

        const first = rows[0];
        if (!first) return;
        const warm = resolveQueueRowWarmTarget(first, {
            departmentId,
            workUnitId,
            workViewId: viewId,
        });
        if (warm) {
            prefetchOpportunityDrawerOnRowIntent(warm.id, warm.context, warm.seed);
        }
        openRecord(first);
    }, [
        queueLoading,
        queueResult,
        rows,
        slugRoute?.routeRecordId,
        openRecord,
        departmentId,
        workUnitId,
        runtimeCtx.workViewId,
    ]);

    // ── Selected record: the drawer store is THE selection state (no parallel store) ────
    const selectedRecordId =
        drawer.type === "opportunities" && drawer.id != null ? String(drawer.id) : null;

    // ── Right Rail actions: the configured action lane for this work unit ────────────────
    // The runtime is the single owner of surface data fetching. Load the resolved actions
    // directly from the bundle route (handles the bootstrap defer caveat — see the PR-V2
    // right-rail handoff §5), expose them on the model; RR.SURFACE renders + the existing
    // action runtime executes. Deduped + TTL, so no double-fetch. Never invents actions.
    const [rightRailActions, setRightRailActions] = useState<ResolvedActionForClient[]>(
        () => seed.rightRailActions ?? [],
    );
    // Settled if seeded from cache (a return renders the action rail immediately, then revalidates).
    const [rightRailSettled, setRightRailSettled] = useState(() => seed.rightRailActions != null);
    const { displayVm } = useOpportunityDrawerVmPayload();
    const { canMutate: authCanMutate } = useAdminAuth();
    useEffect(() => {
        if (!departmentId || !workUnitId) {
            setRightRailActions([]);
            setRightRailSettled(false);
            return;
        }
        let cancelled = false;
        // Seeded-stale keeps the rail settled during the silent revalidate; only a cold establish
        // drops it so the empty rail anchor shows until the actions resolve.
        if (seed.rightRailActions == null) setRightRailSettled(false);
        void fetchWorkUnitRightRailResolvedActions({
            departmentId,
            workUnitId,
            fetchInit: workspaceDataFetchInit() ?? {},
        })
            .then((list) => {
                if (!cancelled) {
                    setRightRailActions(list);
                    putWorkUnitSurfaceRightRailCache(list, cacheContext);
                }
            })
            .catch(() => {
                if (!cancelled && seed.rightRailActions == null) setRightRailActions([]);
            })
            .finally(() => {
                if (!cancelled) setRightRailSettled(true);
            });
        return () => {
            cancelled = true;
        };
    }, [departmentId, workUnitId, cacheContext, seed]);

    const filteredRightRailActions = useMemo(
        () =>
            filterRightRailActionsForCurrentWork(rightRailActions, {
                stageWorkRuntime: displayVm?.workspace.stage_work_runtime,
                canMutate: authCanMutate,
            }),
        [rightRailActions, displayVm?.workspace.stage_work_runtime, authCanMutate],
    );

    // ── Atomic-reveal readiness (Trust Closure) ─────────────────────────────────────────────
    // The primary composition includes the queue rows: `coldCompositionReady` requires the queue to
    // have settled once, so cold entry holds ONE skeleton until header + pills + counts + rows are
    // ready together (no region-by-region reveal), while a seeded return is ready on first render
    // (queue seeded → `queueSettledOnce` true). A background SWR revalidate keeps `queueSettledOnce`
    // true and `queueResult` non-null, so it never returns the surface to a loading boundary.
    const readiness = useMemo<WorkUnitReadiness>(
        () =>
            resolveWorkUnitReadiness({
                hasIdentity: slugRoute != null,
                configSettled,
                headerConfigLoaded,
                hasHeaderPresentation: Boolean(headerPresentation),
                queueSettledOnce,
                rightRailSettled,
                queueLoading,
                openedFromCache: seed.config != null && seed.queueResult != null,
            }),
        [
            slugRoute,
            configSettled,
            headerConfigLoaded,
            headerPresentation,
            queueSettledOnce,
            rightRailSettled,
            queueLoading,
            seed,
        ],
    );

    // ── Resolved model ───────────────────────────────────────────────────────────────────
    const model = useMemo<WorkUnitSurfaceModel>(
        () => ({
            header: headerPresentation ?? buildWorkUnitHeaderPresentationForRuntime(headerConfig, {
                fallbackTitle: processLabel,
                fallbackSubtitle: workViewLabel,
                resolved: null,
            }),
            workViews,
            queue: {
                rows,
                totalCount,
                loading: queueLoading,
                error: queueError,
                rowConfig: queueRowConfig,
            },
            activeWorkViewId: runtimeCtx.workViewId,
            selectedRecordId,
            rightRailActions: filteredRightRailActions,
            departmentId,
            workUnitId,
            // Atomic reveal: the surface is ready only when its primary composition (incl. queue
            // rows) is established. `ready` mirrors `readiness.coldCompositionReady` for the render mode.
            ready: readiness.coldCompositionReady,
            readiness,
        }),
        [
            headerPresentation,
            headerConfig,
            processLabel,
            workViewLabel,
            workViews,
            rows,
            totalCount,
            queueRowConfig,
            queueLoading,
            queueError,
            runtimeCtx.workViewId,
            selectedRecordId,
            filteredRightRailActions,
            departmentId,
            workUnitId,
            readiness,
        ],
    );

    // ── Trust Closure instrumentation: open a nav record + stamp the §3 composition markers ─────
    // Purely observational (dev/staging-gated inside the recorder). `shell_visible` = identity
    // resolved (frame can render); `coherent_content` = shell + primary queue rows composed as one
    // (the atomic-reveal point); `interaction_ready` = rows + action rail settled. First-write-wins.
    useEffect(() => {
        if (!workUnitId || !routeSlug) return;
        const navStart = alloyPerfGet("work_unit_navigation_start");
        const freshStart =
            typeof navStart === "number" &&
            typeof performance !== "undefined" &&
            performance.now() - navStart < 8000
                ? navStart
                : undefined;
        const hasCachedComposition = seed.config != null && seed.queueResult != null;
        beginWorkspaceNav(routeSlug, classifyWorkspaceNavMode(routeSlug, hasCachedComposition), freshStart);
        seenWorkUnitNavSlugs.add(routeSlug);
        firstWorkspaceNavSincePageLoad = false;
    }, [workUnitId, routeSlug, seed]);

    useEffect(() => {
        if (slugRoute != null) markWorkspaceNavSignal("shell_visible");
    }, [slugRoute]);

    useEffect(() => {
        // The atomic-reveal point: header + pills + counts + primary rows composed as one.
        if (readiness.coldCompositionReady) markWorkspaceNavSignal("coherent_content");
    }, [readiness.coldCompositionReady]);

    useEffect(() => {
        if (readiness.interactionReady) markWorkspaceNavSignal("interaction_ready");
    }, [readiness.interactionReady]);

    const intents = useMemo<WorkUnitSurfaceIntents>(
        () => ({ selectWorkView, prefetchWorkView, openRecord, prefetchRecord }),
        [selectWorkView, prefetchWorkView, openRecord, prefetchRecord],
    );

    return { model, intents };
}
