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
import { tryLoadWorkUnitQueueDefinitionBundle } from "@/lib/config/queueDefinitionV2Runtime";
import { getQueueUiConfig } from "@/lib/ui-v2/queueUiConfig";
import { findAllRecordsQueueKey } from "@/lib/workspace/workUnitQueueDerived";
import {
    resolveWorkViewCanonicalLocation,
    type WorkViewCanonicalLocation,
    type WorkViewCanonicalLocationWorkUnitRow,
} from "@/lib/workspace/resolveWorkViewCanonicalLocation";
import { operatorWorkUnitHrefFromWorkViewSlug } from "@/lib/admin/canonicalOperatorRoutes";
import { workViewRouteKeyFromLabel } from "@/lib/admin/workUnitRouteSlug";
import { appendWorkspaceSiteToPath, appendWorkspaceSiteToUrl } from "@/lib/adminV2/workspaceSiteFilterClient";
import { resolveWorkUnitQueueRowsFetchLimit } from "@/lib/adminV2/workUnitQueueRowsFetchLimit";
import { dedupeAdminFetch } from "@/lib/workspace/workspaceAdminFetchDedupe";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import type { SurfaceDoc } from "@/lib/platform/surfaceBuilder/surfaceDefinition";
import type { QueueItemsResult, QueueSummary } from "@/lib/queues/types";
import { useOperationalAnswers } from "./useOperationalAnswers";
import { refineWorkspaceHeaderCardVms } from "./workspaceHeaderCards";
import {
    seedWorkUnitHeaderCards,
    workUnitHeaderCalculationKeys,
    type WorkUnitHeaderCalculationCardVm,
} from "./workUnitHeaderCards";
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

/** Drawer open provenance for Focus Panel opens from the presentation runtime queue. */
const PRESENTATION_RUNTIME_QUEUE_ROW_OPEN_SOURCE = "presentation_runtime_queue_row";

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
    // The published "Work Unit Header" surface doc — fetched in the SAME config Promise.all
    // so the header card SET is known at configSettled (reveals with title + pills, no late
    // pop-in). null on error / no publish → the seed uses the code-owned fallback.
    const [headerDoc, setHeaderDoc] = useState<SurfaceDoc | null>(null);
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
            // Published "Work Unit Header" surface doc — org-scoped, rides configSettled so
            // the header card SET reveals with the title + pills. Never rejects the batch.
            dedupeAdminFetch(`/api/admin/analytics/surfaces/work_unit_header/doc`, init)
                .then((res) => (res.ok ? res.json() : null))
                .catch(() => null),
        ])
            .then(([dept, wu, deptUnits, headerDocRes]) => {
                if (cancelled) return;
                setDeptMetadata((dept as { metadata?: unknown } | null)?.metadata ?? null);
                setQueueDefinition((wu as { queue_definition?: unknown } | null)?.queue_definition ?? null);
                const items = (deptUnits as { items?: unknown } | null)?.items;
                setDeptWorkUnits(
                    Array.isArray(items) ? (items as WorkViewCanonicalLocationWorkUnitRow[]) : null,
                );
                const doc = (headerDocRes as { doc?: unknown } | null)?.doc ?? null;
                setHeaderDoc(
                    doc && typeof doc === "object" && Array.isArray((doc as { sections?: unknown }).sections)
                        ? (doc as SurfaceDoc)
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
    }, [workUnitId, selectedSiteId]);

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
    }, [workUnitId, fetchQueueKey, runtimeCtx.workViewId, selectedSiteId, fetchLimit, configSettled]);

    const rows = useMemo(
        () => (queueResult ? queueRowModelsFromQueueItemsResult(queueResult) : []),
        [queueResult],
    );

    // THE count model: the `total` of the same rows response that renders the queue.
    const totalCount = useMemo(() => queueTotalCountFromQueueItemsResult(queueResult), [queueResult]);

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

    // ── Header calculations: the published Work Unit Header surface ─────────────────────
    // The card SET is fixed once the surface doc settles (it rides `configSettled`, so the
    // strip reveals with the title + pills — no separate late fetch, no pop-in). Seed from
    // the doc when it has cards, else the code-owned fallback. The warm cache only refines
    // value/status in place afterward (set/order/labels/chrome never change).
    const [seededHeaderCards, setSeededHeaderCards] = useState<WorkUnitHeaderCalculationCardVm[]>([]);
    const headerSeededRef = useRef(false);
    useEffect(() => {
        if (headerSeededRef.current || !configSettled) return;
        headerSeededRef.current = true;
        setSeededHeaderCards(seedWorkUnitHeaderCards(headerDoc));
    }, [configSettled, headerDoc]);

    const headerCalculationKeys = useMemo(
        () => workUnitHeaderCalculationKeys(seededHeaderCards),
        [seededHeaderCards],
    );
    const { resolved: headerCalculationsResolved } = useOperationalAnswers({
        siteId: selectedSiteId,
        workUnitId,
        keys: headerCalculationKeys,
    });
    const headerCalculations = useMemo(
        () =>
            headerCalculationsResolved
                ? refineWorkspaceHeaderCardVms(seededHeaderCards, headerCalculationsResolved)
                : seededHeaderCards,
        [seededHeaderCards, headerCalculationsResolved],
    );

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
            const view = savedViews.find((v) => v.id === id) ?? null;
            const targetRouteKey =
                canonicalLocationByViewId.get(id)?.routeKey ??
                workViewRouteKeyFromLabel(view?.label);
            if (!targetRouteKey) return; // label-less view (config bug): in-page select only
            router.push(
                appendWorkspaceSiteToPath(
                    operatorWorkUnitHrefFromWorkViewSlug(targetRouteKey),
                    selectedSiteId,
                ),
            );
        },
        [savedViews, canonicalLocationByViewId, router, selectedSiteId, routeSlug],
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

    // ── First-row auto-open: once, after the first queue settle (doctrine acceptance) ────
    const autoOpenDoneRef = useRef(false);
    useEffect(() => {
        if (autoOpenDoneRef.current) return;
        if (queueLoading || !queueResult) return; // not settled yet (errors keep waiting)
        autoOpenDoneRef.current = true; // one shot — never re-trigger on view switch/refetch
        if (slugRoute?.routeRecordId) return; // deep link owns the Focus Panel subject
        if ((drawer.type != null && drawer.id != null) || isOpportunityDrawerOpening) return;
        const first = rows[0];
        if (first) openRecord(first);
    }, [
        queueLoading,
        queueResult,
        rows,
        slugRoute?.routeRecordId,
        drawer.type,
        drawer.id,
        isOpportunityDrawerOpening,
        openRecord,
    ]);

    // ── Header identity: configured labels ONLY (no internal keys, no humanized slugs) ──
    // Title = the configured lifecycle process label from department metadata; department
    // name is the fallback while metadata loads / when no process is configured. Subtitle =
    // the ACTIVE configured Work View's label. Work-unit `name` never surfaces (internal
    // structure name, e.g. "Enrollment Pipeline").
    const processLabel = useMemo(() => {
        const configured = activeLifecycleProcess(
            lifecycleBuilderFromDepartmentMetadata(deptMetadata),
        )?.name?.trim();
        return configured || slugRoute?.departmentName || null;
    }, [deptMetadata, slugRoute?.departmentName]);
    const workViewLabel = runtimeCtx.workView?.label?.trim() || null;

    // ── Selected record: the drawer store is THE selection state (no parallel store) ────
    const selectedRecordId =
        drawer.type === "opportunities" && drawer.id != null ? String(drawer.id) : null;

    // ── Resolved model ───────────────────────────────────────────────────────────────────
    const model = useMemo<WorkUnitSurfaceModel>(
        () => ({
            header: {
                processLabel,
                workViewLabel,
                calculations: headerCalculations,
            },
            workViews,
            queue: {
                rows,
                totalCount,
                loading: queueLoading,
                error: queueError,
            },
            activeWorkViewId: runtimeCtx.workViewId,
            selectedRecordId,
            // Above-fold identity + configured views resolved; queue carries its own state.
            ready: slugRoute != null && configSettled,
        }),
        [
            slugRoute,
            processLabel,
            workViewLabel,
            headerCalculations,
            workViews,
            rows,
            totalCount,
            queueLoading,
            queueError,
            runtimeCtx.workViewId,
            selectedRecordId,
            configSettled,
        ],
    );

    const intents = useMemo<WorkUnitSurfaceIntents>(
        () => ({ selectWorkView, openRecord }),
        [selectWorkView, openRecord],
    );

    return { model, intents };
}
