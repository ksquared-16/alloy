"use client";

/**
 * Presentation Runtime V2 — WU.SURFACE resolution + intents.
 *
 * Resolves the WorkUnitSurfaceModel from the existing data layer, reused verbatim:
 *   - identity            — slug route context (`WorkUnitSlugRouteHost` owns URL sync)
 *   - work views          — department `work_views_v1` via `resolveActiveWorkViewRuntimeContext`
 *   - queue counts        — GET /api/admin/work-units/{id}/queues (QueueSummary)
 *   - queue rows          — GET /api/admin/queues/{id}/{queueKey} (work-view filters server-side)
 *   - operational answers — OIP warm cache scoped to the work unit
 *   - Focus Panel open    — `useAdminDrawer().openDrawer` (in-page; queue stays mounted)
 *
 * Work View selection is in-page React state (doctrine: path routing only — no
 * query-string routing for view selection). Presentation components receive the resolved
 * model + intents and never fetch (docs/platform/experience/presentation-runtime-v2.md).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { useWorkUnitSlugRouteOptional } from "@/contexts/WorkUnitSlugRouteContext";
import { useWorkspaceSiteFilter } from "@/contexts/WorkspaceSiteFilterContext";
import {
    resolveActiveWorkViewRuntimeContext,
    savedWorkViewsFromDepartmentMetadata,
} from "@/lib/lifecycle/resolveWorkViewRuntimeContext";
import { appendWorkspaceSiteToUrl } from "@/lib/adminV2/workspaceSiteFilterClient";
import { resolveWorkUnitQueueRowsFetchLimit } from "@/lib/adminV2/workUnitQueueRowsFetchLimit";
import { dedupeAdminFetch } from "@/lib/workspace/workspaceAdminFetchDedupe";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import { resolveWorkUnitOipMetricKeys } from "@/lib/kpi/workspaceOipExposure";
import type { QueueItemsResult, QueueSummary } from "@/lib/queues/types";
import { useOperationalAnswers } from "./useOperationalAnswers";
import {
    queueRowModelsFromQueueItemsResult,
    workViewLinkModelsFromConfiguredViews,
    type QueueRowModel,
    type WorkUnitSurfaceIntents,
    type WorkUnitSurfaceModel,
} from "./types";

/** Drawer open provenance for Focus Panel opens from the presentation runtime queue. */
const PRESENTATION_RUNTIME_QUEUE_ROW_OPEN_SOURCE = "presentation_runtime_queue_row";

export type WorkUnitSurfaceRuntime = {
    model: WorkUnitSurfaceModel;
    intents: WorkUnitSurfaceIntents;
};

export function useWorkUnitSurfaceRuntime(): WorkUnitSurfaceRuntime {
    const slugRoute = useWorkUnitSlugRouteOptional();
    const siteFilter = useWorkspaceSiteFilter();
    const selectedSiteId = siteFilter?.selectedSiteId ?? null;
    const { drawer, isOpportunityDrawerOpening, openDrawer } = useAdminDrawer();

    const departmentId = slugRoute?.departmentId ?? null;
    const workUnitId = slugRoute?.workUnitId ?? null;

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

    // Active Work View is in-page state; null = resolver default (first visible view).
    const [selectedWorkViewId, setSelectedWorkViewId] = useState<string | null>(null);

    const runtimeCtx = useMemo(
        () =>
            resolveActiveWorkViewRuntimeContext({
                departmentMetadata: deptMetadata,
                workViewId: selectedWorkViewId,
                queueKey: selectedWorkViewId ? null : slugRoute?.initialQueueKey ?? null,
                queueDefinition,
            }),
        [deptMetadata, selectedWorkViewId, slugRoute?.initialQueueKey, queueDefinition],
    );

    const savedViews = useMemo(() => savedWorkViewsFromDepartmentMetadata(deptMetadata), [deptMetadata]);

    // ── Queue counts: work-unit queue summaries (QueueSummary.count is THE count model) ──
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

    const fetchQueueKey = runtimeCtx.queueKey;
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
        if (!workUnitId || !fetchQueueKey) return;
        const seq = ++queueRequestSeq.current;
        setQueueLoading(true);
        setQueueError(null);
        const qs = new URLSearchParams({
            limit: String(fetchLimit),
            offset: "0",
            count_mode: "exact",
        });
        if (runtimeCtx.workViewId) qs.set("work_view_id", runtimeCtx.workViewId);
        const route = appendWorkspaceSiteToUrl(
            `/api/admin/queues/${encodeURIComponent(workUnitId)}/${encodeURIComponent(fetchQueueKey)}?${qs.toString()}`,
            selectedSiteId,
        );
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
    }, [workUnitId, fetchQueueKey, runtimeCtx.workViewId, selectedSiteId, fetchLimit]);

    const rows = useMemo(
        () => (queueResult ? queueRowModelsFromQueueItemsResult(queueResult) : []),
        [queueResult],
    );

    const totalCount = useMemo(() => {
        if (queueResult && !queueResult.total_omitted) return queueResult.total;
        return settledLaneCount ?? null;
    }, [queueResult, settledLaneCount]);

    // ── Work View pills: same configured views the Workspace tile lists ─────────────────
    const workViews = useMemo(
        () =>
            workViewLinkModelsFromConfiguredViews(savedViews, {
                activeWorkViewId: runtimeCtx.workViewId,
                countForView: (view) => {
                    const laneKey = view.compat_queue_key?.trim();
                    if (!laneKey || !summaries) return null;
                    const summary = summaries.find((s) => s.key === laneKey || s.resolved_queue_key === laneKey);
                    // Deferred counts are placeholder zeros (`summary_mode=initial`) — no badge beats a wrong badge.
                    if (!summary || summary.counts_deferred) return null;
                    return typeof summary.count === "number" ? summary.count : null;
                },
            }),
        [savedViews, runtimeCtx.workViewId, summaries],
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

    // ── Resolved model ───────────────────────────────────────────────────────────────────
    const model = useMemo<WorkUnitSurfaceModel>(
        () => ({
            header: {
                processLabel: slugRoute?.departmentName ?? null,
                workUnitName: slugRoute?.workUnitName ?? "",
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
