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
 *                           response that renders the rows; inactive pills fetch their own
 *                           totals (limit=1) from the same route. Lane summaries only size
 *                           the rows fetch — never a displayed count.
 *   - operational answers — OIP warm cache scoped to the work unit
 *   - Focus Panel open    — `useAdminDrawer().openDrawer` (in-page; queue stays mounted)
 *
 * Work View selection is in-page React state (doctrine: path routing only — no
 * query-string routing for view selection). Presentation components receive the resolved
 * model + intents and never fetch (docs/platform/experience/presentation-runtime-v2.md).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { useWorkspaceOrg } from "@/contexts/WorkspaceOrgContext";
import { useWorkUnitSlugRouteOptional } from "@/contexts/WorkUnitSlugRouteContext";
import { useWorkspaceSiteFilter } from "@/contexts/WorkspaceSiteFilterContext";
import {
    resolveActiveWorkViewRuntimeContext,
    resolveWorkViewBaseQueueKey,
    savedWorkViewsFromDepartmentMetadata,
} from "@/lib/lifecycle/resolveWorkViewRuntimeContext";
import {
    activeLifecycleProcess,
    lifecycleBuilderFromDepartmentMetadata,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import type { WorkViewConfigV1Stored } from "@/lib/lifecycle/workViewsConfigV1";
import { tryLoadWorkUnitQueueDefinitionBundle } from "@/lib/config/queueDefinitionV2Runtime";
import { getQueueUiConfig } from "@/lib/ui-v2/queueUiConfig";
import { findAllRecordsQueueKey } from "@/lib/workspace/workUnitQueueDerived";
import { appendWorkspaceSiteToUrl } from "@/lib/adminV2/workspaceSiteFilterClient";
import { resolveWorkUnitQueueRowsFetchLimit } from "@/lib/adminV2/workUnitQueueRowsFetchLimit";
import { dedupeAdminFetch } from "@/lib/workspace/workspaceAdminFetchDedupe";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import { resolveWorkUnitOipMetricKeys } from "@/lib/kpi/workspaceOipExposure";
import type { QueueItemsResult, QueueSummary } from "@/lib/queues/types";
import { useOperationalAnswers } from "./useOperationalAnswers";
import {
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

/** Rows-API route for a Work View count/rows fetch — the ONE evaluation path for queue numbers. */
function queueRowsRouteForView(args: {
    workUnitId: string;
    baseQueueKey: string;
    workViewId: string | null;
    limit: number;
    selectedSiteId: string | null;
}): string {
    const qs = new URLSearchParams({
        limit: String(args.limit),
        offset: "0",
        count_mode: "exact",
    });
    if (args.workViewId) qs.set("work_view_id", args.workViewId);
    return appendWorkspaceSiteToUrl(
        `/api/admin/queues/${encodeURIComponent(args.workUnitId)}/${encodeURIComponent(args.baseQueueKey)}?${qs.toString()}`,
        args.selectedSiteId,
    );
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
    const [deptMetadata, setDeptMetadata] = useState<unknown | null>(null);
    const [queueDefinition, setQueueDefinition] = useState<unknown | null>(null);
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
        ])
            .then(([dept, wu]) => {
                if (cancelled) return;
                setDeptMetadata((dept as { metadata?: unknown } | null)?.metadata ?? null);
                setQueueDefinition((wu as { queue_definition?: unknown } | null)?.queue_definition ?? null);
            })
            .finally(() => {
                if (!cancelled) setConfigSettled(true);
            });
        return () => {
            cancelled = true;
        };
    }, [departmentId, workUnitId]);

    // Active Work View is in-page state; before any user pill selection the route decides:
    // a work-view slug (`/workspace/work-unit/active-pipeline`) seeds `initialWorkViewId`,
    // a lane slug seeds `initialQueueKey`. null = resolver default (first visible view).
    const [selectedWorkViewId, setSelectedWorkViewId] = useState<string | null>(null);
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

    // ── Per-view counts: SAME evaluation path as the rendered rows ──────────────────────
    // Every visible view's count comes from the queue rows API with that view's
    // `work_view_id` (limit=1, count_mode=exact) — never from lane summaries, which
    // evaluate lanes instead of view predicates (the root cause of swapped pill counts).
    const [viewCounts, setViewCounts] = useState<Record<string, number>>({});
    const viewCountsSeq = useRef(0);

    useEffect(() => {
        if (!workUnitId || !configSettled) return;
        const seq = ++viewCountsSeq.current;
        setViewCounts({}); // identity/config/site changed — stale counts must not linger
        const views = savedViews.filter((view) => view.visible_in_runtime !== false);
        if (!views.length) return;

        const countForViewFetch = async (view: WorkViewConfigV1Stored): Promise<readonly [string, number | null]> => {
            const baseQueueKey = validatedBaseQueueKeyForUnit(
                resolveWorkViewBaseQueueKey(view, null, queueDefinition),
                queueDefinition,
            );
            if (!baseQueueKey) return [view.id, null] as const;
            const route = queueRowsRouteForView({
                workUnitId,
                baseQueueKey,
                workViewId: view.id,
                limit: 1,
                selectedSiteId,
            });
            try {
                const res = await dedupeAdminFetch(route, workspaceDataFetchInit());
                if (!res.ok) return [view.id, null] as const;
                const json = (await res.json().catch(() => null)) as QueueItemsResult | null;
                return [view.id, queueTotalCountFromQueueItemsResult(json)] as const;
            } catch {
                return [view.id, null] as const;
            }
        };

        void Promise.all(views.map(countForViewFetch)).then((entries) => {
            // Stale-response guard: only the latest request generation may apply.
            if (seq !== viewCountsSeq.current) return;
            const next: Record<string, number> = {};
            for (const [id, count] of entries) {
                if (typeof count === "number") next[id] = count;
            }
            setViewCounts(next);
        });
    }, [workUnitId, configSettled, savedViews, queueDefinition, selectedSiteId]);

    // ── Work View pills: same configured views the Workspace tile lists ─────────────────
    // Invariant: the ACTIVE view's count IS `queue.totalCount` (same rows response); inactive
    // views use their own rows-API totals. null while loading → no badge (never a wrong badge).
    const workViews = useMemo(
        () =>
            workViewLinkModelsFromConfiguredViews(savedViews, {
                activeWorkViewId: runtimeCtx.workViewId,
                countForView: (view) => {
                    if (view.id === runtimeCtx.workViewId) return totalCount;
                    return viewCounts[view.id] ?? null;
                },
            }),
        [savedViews, runtimeCtx.workViewId, totalCount, viewCounts],
    );

    // ── Operational answers: OIP warm cache scoped to the work unit ─────────────────────
    const answerKeys = useMemo(() => resolveWorkUnitOipMetricKeys(undefined), []);
    const { answers } = useOperationalAnswers({
        siteId: selectedSiteId,
        workUnitId,
        keys: answerKeys,
    });

    // ── Intents ──────────────────────────────────────────────────────────────────────────
    const selectWorkView = useCallback((workViewId: string) => {
        const id = workViewId.trim();
        if (!id) return;
        setSelectedWorkViewId((prev) => (prev === id ? prev : id));
    }, []);

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
            // owned by WorkUnitSlugRouteHost — not duplicated here.
            const drawerOpen = row.context?.drawer_open ?? null;
            openDrawer({
                type: "opportunities",
                id: drawerOpen?.entity_id?.trim() || row.entityId,
                source: PRESENTATION_RUNTIME_QUEUE_ROW_OPEN_SOURCE,
            });
        },
        [openDrawer],
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

    // ── Resolved model ───────────────────────────────────────────────────────────────────
    const model = useMemo<WorkUnitSurfaceModel>(
        () => ({
            header: {
                processLabel,
                workViewLabel,
            },
            answers,
            workViews,
            queue: {
                rows,
                totalCount,
                loading: queueLoading,
                error: queueError,
            },
            activeWorkViewId: runtimeCtx.workViewId,
            // Above-fold identity + configured views resolved; queue carries its own state.
            ready: slugRoute != null && configSettled,
        }),
        [
            slugRoute,
            processLabel,
            workViewLabel,
            answers,
            workViews,
            rows,
            totalCount,
            queueLoading,
            queueError,
            runtimeCtx.workViewId,
            configSettled,
        ],
    );

    const intents = useMemo<WorkUnitSurfaceIntents>(
        () => ({ selectWorkView, openRecord }),
        [selectWorkView, openRecord],
    );

    return { model, intents };
}
