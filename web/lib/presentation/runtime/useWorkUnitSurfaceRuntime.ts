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
 * Work View selection NAVIGATES: a pill click soft-pushes the view's label-derived slug
 * (`/workspace/work-unit/active-pipeline` — path routing only, no query strings, record id
 * not carried). The destination route re-seeds `initialWorkViewId`; an optimistic local
 * selection highlights the pill instantly while the push resolves. Presentation components
 * receive the resolved model + intents and never fetch
 * (docs/platform/experience/presentation-runtime-v2.md).
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
import { isLegacyArtifactProcessName } from "@/lib/admin/buildOperatorLifecycleLanding";
import { tryLoadWorkUnitQueueDefinitionBundle } from "@/lib/config/queueDefinitionV2Runtime";
import { getQueueUiConfig } from "@/lib/ui-v2/queueUiConfig";
import { findAllRecordsQueueKey } from "@/lib/workspace/workUnitQueueDerived";
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
    parseOpportunityQueueUpdatedDetail,
    shouldRefetchWorkUnitQueueRowsForEvent,
    shouldRefreshQueueSummariesForEvent,
} from "@/lib/admin/opportunityQueueRefreshEvent";
import { prefetchOpportunityDrawerOnRowIntent } from "@/lib/admin/opportunityDrawerIntentPrefetch";
import { resolveQueueRowWarmTarget } from "@/lib/presentation/runtime/queueRowWarmTarget";
import { warmOperatorWorkUnitEntryFromHref } from "@/lib/admin/operatorWorkUnitEntryWarm";
import { resolveWorkViewTargetHref } from "@/lib/presentation/runtime/workViewTargetHref";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import { fetchWorkUnitRightRailResolvedActions } from "@/lib/workspace/fetchWorkUnitRightRailResolvedActions";
import type { QueueItemsResult, QueueSummary } from "@/lib/queues/types";
import { useOperationalAnswers } from "./useOperationalAnswers";
import { useWorkUnitHeaderSurfaceConfigState } from "./useWorkUnitHeaderSurfaceConfig";
import {
    buildWorkUnitHeaderPresentationForRuntime,
    workUnitHeaderKpiSourceKeys,
    type WorkUnitHeaderPresentationModel,
} from "./workUnitHeaderSurfaceConfig";
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
} from "./types";
import { mapQueueRowSurfaceToCompactConfig } from "./queueRowSurfaceConfig";
import {
    queueRowVariantMatchInputFromContext,
    resolveQueueRowPresentation,
} from "./queueRowVariantResolve";
import type { QueueRecordLayoutConfigV3 } from "@/lib/layout/queueRecordLayoutV3";

/** Drawer open provenance for Focus Panel opens from the presentation runtime queue. */
const PRESENTATION_RUNTIME_QUEUE_ROW_OPEN_SOURCE = "presentation_runtime_queue_row";

/**
 * Published Queue Row surface id for the Work Unit queue. PRV2's work-unit queue is the
 * OPPORTUNITY queue (`entity_type: "opportunity"`), whose published compact-row surface is
 * "pipeline-queue-row" (GET /api/admin/queue-row-layout/{surfaceId}). Job/schedule lanes
 * have no published queue-row surface → null (skip fetch, generic-context fallback). The
 * queue's entity_type comes from the rows RESULT, not config; to avoid coupling the config
 * batch to the rows fetch we assume the opportunity surface here (documented). If a future
 * work unit exposes a non-opportunity primary queue, derive this from the queue definition.
 */
const WORK_UNIT_QUEUE_ROW_SURFACE_ID = "pipeline-queue-row";

/**
 * Validate a Work View's base lane against THIS work unit's queue definition. A department's
 * Work Views can bind lanes that exist on sibling work units; when the lane is absent here,
 * fall back to this unit's all-records lane — the server still applies the view's predicates
 * via `work_view_id`.
 */
function validatedBaseQueueKeyForUnit(base: string | null, queueDefinition: unknown): string | null {
    const bundle = queueDefinition != null ? tryLoadWorkUnitQueueDefinitionBundle(queueDefinition) : null;
    if (!bundle) return base;
    if (base && bundle.def.queues.some((q) => q.key === base)) return base;
    return findAllRecordsQueueKey(bundle.def, getQueueUiConfig(bundle.def)) ?? base;
}

export type WorkUnitSurfaceRuntime = {
    model: WorkUnitSurfaceModel;
    intents: WorkUnitSurfaceIntents;
};

export function useWorkUnitSurfaceRuntime(): WorkUnitSurfaceRuntime {
    const slugRoute = useWorkUnitSlugRouteOptional();
    const siteFilter = useWorkspaceSiteFilter();
    const selectedSiteId = siteFilter?.selectedSiteId ?? null;
    const { drawer, isOpportunityDrawerOpening, openDrawer } = useAdminDrawer();

    // Fetches gate on org readiness: the queue route resolves visibility under the org/auth
    // gate, and a request racing org-context bootstrap 404s transiently.
    const { orgId } = useWorkspaceOrg();
    const departmentId = orgId ? slugRoute?.departmentId ?? null : null;
    const workUnitId = orgId ? slugRoute?.workUnitId ?? null : null;

    // ── Work Views: department metadata (`work_views_v1`) + host queue_definition ──────
    // Dept work units are fetched alongside so every visible view's CANONICAL location
    // (host unit + base lane — `resolveWorkViewCanonicalLocation`) resolves client-side;
    // pill counts and pill navigation both read it.
    const [deptMetadata, setDeptMetadata] = useState<unknown | null>(null);
    const [queueDefinition, setQueueDefinition] = useState<unknown | null>(null);
    const [deptWorkUnits, setDeptWorkUnits] = useState<
        WorkViewCanonicalLocationWorkUnitRow[] | null
    >(null);
    const [queueRowLayoutConfig, setQueueRowLayoutConfig] = useState<QueueRecordLayoutConfigV3 | null>(null);
    const [configSettled, setConfigSettled] = useState(false);

    useEffect(() => {
        if (!departmentId || !workUnitId) return;
        let cancelled = false;
        setConfigSettled(false);
        const init = workspaceDataFetchInit();
        void Promise.all([
            dedupeAdminFetch(`/api/admin/departments/${encodeURIComponent(departmentId)}`, init)
                .then((res) => (res.ok ? res.json() : null))
                .catch(() => null),
            dedupeAdminFetch(`/api/admin/work-units/${encodeURIComponent(workUnitId)}`, init)
                .then((res) => (res.ok ? res.json() : null))
                .catch(() => null),
            dedupeAdminFetch(`/api/admin/work-units?department_id=${encodeURIComponent(departmentId)}`, init)
                .then((res) => (res.ok ? res.json() : null))
                .catch(() => null),
            WORK_UNIT_QUEUE_ROW_SURFACE_ID
                ? dedupeAdminFetch(
                      `/api/admin/queue-row-layout/${encodeURIComponent(WORK_UNIT_QUEUE_ROW_SURFACE_ID)}`,
                      init,
                  )
                      .then((res) => (res.ok ? res.json() : null))
                      .catch(() => null)
                : Promise.resolve(null),
        ])
            .then(([dept, wu, deptUnits, queueRowLayoutRes]) => {
                if (cancelled) return;
                setDeptMetadata((dept as { metadata?: unknown } | null)?.metadata ?? null);
                setQueueDefinition((wu as { queue_definition?: unknown } | null)?.queue_definition ?? null);
                const items = (deptUnits as { items?: unknown } | null)?.items;
                setDeptWorkUnits(
                    Array.isArray(items) ? (items as WorkViewCanonicalLocationWorkUnitRow[]) : null,
                );
                const rowLayout = (queueRowLayoutRes as { config?: unknown } | null)?.config ?? null;
                setQueueRowLayoutConfig(
                    rowLayout
                        && typeof rowLayout === "object"
                        && Array.isArray((rowLayout as { columns?: unknown }).columns)
                        ? (rowLayout as QueueRecordLayoutConfigV3)
                        : null,
                );
            })
            .finally(() => {
                if (!cancelled) setConfigSettled(true);
            });
        return () => {
            cancelled = true;
        };
    }, [departmentId, workUnitId]);

    // Active Work View: the ROUTE decides — a work-view slug (`/workspace/work-unit/
    // active-pipeline`) seeds `initialWorkViewId`, a lane slug seeds `initialQueueKey`.
    // The local selection is only the OPTIMISTIC pill highlight between a pill click and
    // the pushed route re-seeding: it is KEYED to the route slug it was made on, so the
    // moment the route commits (pill push, tile/nav click, back/forward) it derives away
    // and the URL owns the view — no reset effect, no stale in-page selection.
    const routeSlug = slugRoute?.routeSlug ?? null;
    const [optimisticSelection, setOptimisticSelection] = useState<{
        routeSlug: string | null;
        workViewId: string;
    } | null>(null);
    const selectedWorkViewId =
        optimisticSelection && optimisticSelection.routeSlug === routeSlug
            ? optimisticSelection.workViewId
            : null;
    const routeWorkViewId = slugRoute?.initialWorkViewId ?? null;
    const activeWorkViewIdInput = selectedWorkViewId ?? routeWorkViewId;

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
    const [summaries, setSummaries] = useState<QueueSummary[] | null>(null);
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
                if (seq === summariesRequestSeq.current) setSummaries(json.queues ?? []);
            })
            .catch(() => {
                if (seq === summariesRequestSeq.current) setSummaries(null);
            });
    }, [workUnitId, selectedSiteId, queueRefreshNonce]);

    // ── Queue rows: server applies the active Work View's filters (work_view_id) ────────
    const [queueResult, setQueueResult] = useState<QueueItemsResult | null>(null);
    const [queueLoading, setQueueLoading] = useState(false);
    const [queueError, setQueueError] = useState<string | null>(null);
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

    useEffect(() => {
        // Wait for config settle: the lane validation above needs the queue definition, and a
        // rows fetch racing org/config bootstrap 404s transiently.
        if (!workUnitId || !fetchQueueKey || !configSettled) return;
        const seq = ++queueRequestSeq.current;
        setQueueLoading(true);
        setQueueError(null);
        const route = queueRowsRouteForView({
            workUnitId,
            baseQueueKey: fetchQueueKey,
            workViewId: runtimeCtx.workViewId,
            limit: fetchLimit,
            selectedSiteId,
        });
        void dedupeAdminFetch(route, workspaceDataFetchInit())
            .then(async (res) => {
                const json = (await res.json().catch(() => ({}))) as { error?: string };
                if (!res.ok) throw new Error(json.error ?? "Failed to load queue items");
                // Stale-response guard: only the latest request may apply.
                if (seq === queueRequestSeq.current) setQueueResult(json as unknown as QueueItemsResult);
            })
            .catch((e) => {
                if (seq === queueRequestSeq.current) {
                    setQueueResult(null);
                    setQueueError(e instanceof Error ? e.message : "Failed to load queue items");
                }
            })
            .finally(() => {
                if (seq === queueRequestSeq.current) setQueueLoading(false);
            });
    }, [
        workUnitId,
        fetchQueueKey,
        runtimeCtx.workViewId,
        selectedSiteId,
        fetchLimit,
        configSettled,
        queueRefreshNonce,
    ]);

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
            const refetchRows = shouldRefetchWorkUnitQueueRowsForEvent({ detail, visibleOpportunityIds });
            const refreshSummaries = shouldRefreshQueueSummariesForEvent({ detail, visibleOpportunityIds });
            if (refetchRows || refreshSummaries) setQueueRefreshNonce((n) => n + 1);
        };
        window.addEventListener(OPPORTUNITY_QUEUE_UPDATED_EVENT, onQueueUpdated);
        return () => window.removeEventListener(OPPORTUNITY_QUEUE_UPDATED_EVENT, onQueueUpdated);
    }, []);

    // THE count model: the `total` of the same rows response that renders the queue.
    const totalCount = useMemo(() => queueTotalCountFromQueueItemsResult(queueResult), [queueResult]);

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
    });

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

    // ── Intents ──────────────────────────────────────────────────────────────────────────
    const router = useRouter();
    const selectWorkView = useCallback(
        (workViewId: string) => {
            const id = workViewId.trim();
            if (!id) return;
            // Optimistic highlight — the pill flips instantly; once the pushed route
            // commits, the slug-keyed selection derives away and the URL owns the view.
            setOptimisticSelection({ routeSlug, workViewId: id });
            // Soft navigation to the view's LABEL-derived slug (never the internal id) —
            // the SAME URL a Workspace tile or left-nav click produces. Path routing only
            // (no `work_view=`/`queue=` queries); the record id is never carried across
            // view switches. The destination renders the view ON its canonical host, so
            // rendered rows = the pill's canonical total by construction.
            const href = resolveWorkViewTargetHref(id, {
                views: savedViews,
                canonicalLocationByViewId,
                selectedSiteId,
            });
            if (!href) return; // label-less view (config edge): in-page select only
            router.push(href);
        },
        [savedViews, canonicalLocationByViewId, router, selectedSiteId, routeSlug],
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
            }
        },
        [savedViews, canonicalLocationByViewId, selectedSiteId, runtimeCtx.workViewId],
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
            openDrawer({
                type: "opportunities",
                id: drawerOpen?.entity_id?.trim() || row.entityId,
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

    // ── First-row auto-open: once, after the first queue settle (doctrine acceptance) ────
    // WARM step: before the auto-open commits, prefetch the first record's drawer VM so the
    // inline Focus Panel resolves fast + coordinated — `useOpportunityDrawerVmPayload` finds
    // the payload warm and swaps skeleton → published grid with minimal pending time. This
    // reuses the existing hover/focus intent prefetch (no bespoke fetch); the published Focus
    // Panel summary doc is already module-cached (the skeleton mounting triggers it early).
    // Queue behavior is NOT serialized behind FP: the warm call is fire-and-forget and the
    // same auto-open guards (deep-link / drawer-open / zero-rows) are unchanged.
    const autoOpenDoneRef = useRef(false);
    useEffect(() => {
        if (autoOpenDoneRef.current) return;
        if (queueLoading || !queueResult) return; // not settled yet (errors keep waiting)
        autoOpenDoneRef.current = true; // one shot — never re-trigger on view switch/refetch
        if (slugRoute?.routeRecordId) return; // deep link owns the Focus Panel subject
        if ((drawer.type != null && drawer.id != null) || isOpportunityDrawerOpening) return;
        const first = rows[0];
        if (!first) return;
        // Warm the first opportunity record's drawer VM as/just before the auto-open (same
        // resolved id + workspace context openRecord uses), so the payload is in-flight/ready
        // by the time the inline panel mounts.
        const warm = resolveQueueRowWarmTarget(first, {
            departmentId,
            workUnitId,
            workViewId: runtimeCtx.workViewId ?? null,
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
        drawer.type,
        drawer.id,
        isOpportunityDrawerOpening,
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
    const [rightRailActions, setRightRailActions] = useState<ResolvedActionForClient[]>([]);
    useEffect(() => {
        if (!departmentId || !workUnitId) {
            setRightRailActions([]);
            return;
        }
        let cancelled = false;
        void fetchWorkUnitRightRailResolvedActions({
            departmentId,
            workUnitId,
            fetchInit: workspaceDataFetchInit() ?? {},
        })
            .then((list) => {
                if (!cancelled) setRightRailActions(list);
            })
            .catch(() => {
                if (!cancelled) setRightRailActions([]);
            });
        return () => {
            cancelled = true;
        };
    }, [departmentId, workUnitId]);

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
            rightRailActions,
            departmentId,
            workUnitId,
            // Above-fold identity + configured views resolved; queue carries its own state.
            ready:
                slugRoute != null &&
                configSettled &&
                headerConfigLoaded &&
                Boolean(headerPresentation),
        }),
        [
            slugRoute,
            headerPresentation,
            headerConfig,
            processLabel,
            workViewLabel,
            headerConfigLoaded,
            workViews,
            rows,
            totalCount,
            queueRowConfig,
            queueLoading,
            queueError,
            runtimeCtx.workViewId,
            selectedRecordId,
            rightRailActions,
            departmentId,
            workUnitId,
            configSettled,
        ],
    );

    const intents = useMemo<WorkUnitSurfaceIntents>(
        () => ({ selectWorkView, prefetchWorkView, openRecord, prefetchRecord }),
        [selectWorkView, prefetchWorkView, openRecord, prefetchRecord],
    );

    return { model, intents };
}
