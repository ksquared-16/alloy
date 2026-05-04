"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useWorkspaceOrg } from "@/contexts/WorkspaceOrgContext";
import { shouldDisableAdminV2LinkPrefetch } from "@/app/adminV2/components/navigation/adminV2HeavyRoutePrefetch";
import { markWorkUnitNavigationStart } from "@/lib/perf/markWorkUnitNavigationStart";
import {
    WorkspacePairedOperPanel,
    WorkspacePairedOperPanelsGrid,
} from "@/components/admin/workspace/WorkspacePairedOperPanels";
import { WorkspaceChrome } from "@/components/admin/workspace/WorkspaceChrome";
import { DepartmentWorkspaceBridgeShell } from "@/components/admin/workspace/DepartmentWorkspaceBridgeShell";
import { WorkspaceActionsRailPlaceholder } from "@/components/admin/workspace/WorkspaceActionsRailPlaceholder";
import KPIBlock from "@/app/adminV2/components/workspace/blocks/KPIBlock";
import { AdminV2RouteLoadingState } from "@/components/admin/workspace/AdminV2RouteLoadingState";
import { KpiStripSkeleton } from "@/components/admin/workspace/KpiStripSkeleton";
import { workspaceRouteParam } from "@/lib/workspace/workspaceRouteParam";
import ActionsBlock from "@/app/adminV2/components/workspace/blocks/ActionsBlock";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import type { WorkspaceAction } from "@/lib/ui-v2/workspace-actions";
import type { KPIVm } from "@/lib/ui-v2/workspace-types";
import type { ResolvedActionForClient, ResolvedActionsBySlot } from "@/lib/admin/actions/types";
import { applyRegistryResolvedActionClient } from "@/lib/admin/actions/applyRegistryResolvedActionClient";
import {
    REGISTRY_RIGHT_RAIL_ACTION_ID_PREFIX,
    mergeEnrollmentRightRailActions,
} from "@/lib/workspace/viewModels/enrollmentRightRailMerge";
import { rightRailResolvedFromActionsPayload } from "@/lib/workspace/rightRailResolvedFromActionsPayload";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import { dedupeAdminFetch, dedupeAdminFetchWithTtl } from "@/lib/workspace/workspaceAdminFetchDedupe";
import {
    perfDeptLoad,
    readDepartmentPageCache,
    writeDepartmentPageCache,
} from "@/lib/workspace/adminV2WorkspaceSessionCache";
import { AutomationWorkflowsBlock } from "@/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock";
import { resolveKpisForDepartment } from "@/lib/kpi/resolver";
import type { WorkspaceKpiPlacementRow } from "@/lib/kpi/types";
import { alloyPerfSet } from "@/lib/perf/alloyPerfGlobal";
import { isEnrollmentLikeDepartmentKey } from "@/lib/workspace/enrollmentDepartmentKey";

const WORKSPACE_BASE = "/adminV2/workspace";

type WorkflowKpis = {
    runs_today: number;
    runs_last_7d: number;
    successful_last_7d: number;
    failed_last_7d: number;
    running_last_7d: number;
    skipped_last_7d: number;
    success_rate_last_7d: number | null;
};

type WorkflowSummaryRow = {
    id: string;
    name: string | null;
    event_type: string | null;
    entity_type: string | null;
    enabled: boolean | null;
    steps_count: number;
    last_run: { id: string; status: string; started_at: string } | null;
};

const DEFAULT_WF_KPIS: WorkflowKpis = {
    runs_today: 0,
    runs_last_7d: 0,
    successful_last_7d: 0,
    failed_last_7d: 0,
    running_last_7d: 0,
    skipped_last_7d: 0,
    success_rate_last_7d: null,
};

type V1QueueSummary = {
    key: string;
    label: string;
    description?: string;
    entity_type: "job" | "schedule" | "opportunity";
    priority: "standard" | "attention" | "critical";
    display: "list" | "cards";
    count: number;
    counts_deferred?: boolean;
};

type DeptRow = { id: string; name: string | null; key: string | null };

export default function AdminV2WorkspaceDepartmentPage() {
    const params = useParams();
    const router = useRouter();
    const { openDrawer } = useAdminDrawer();
    const { orgId } = useWorkspaceOrg();
    const departmentId = workspaceRouteParam(params.departmentId);

    /** True when layout applied readDepartmentPageCache for this dept (mirrors workspace root seeded shell). */
    const seededDeptShellRef = useRef(false);
    const deptActionsPerfKeyRef = useRef<string | null>(null);
    const deptKpisPerfKeyRef = useRef<string | null>(null);

    const [dept, setDept] = useState<DeptRow | null>(null);
    const [deptLoading, setDeptLoading] = useState(true);
    const [deptError, setDeptError] = useState<string | null>(null);

    const deptKey = (dept?.key ?? "").trim().toLowerCase();
    const title = useMemo(() => dept?.name?.trim() || "Department", [dept?.name]);

    const [enrollmentDeptRightRail, setEnrollmentDeptRightRail] = useState<ResolvedActionForClient[] | null>(null);

    const [deptWorkUnits, setDeptWorkUnits] = useState<Array<{ id: string; name: string | null; key: string | null }> | null>(null);
    const [deptWorkUnitsError, setDeptWorkUnitsError] = useState<string | null>(null);
    const [deptWorkUnitSummaries, setDeptWorkUnitSummaries] = useState<Record<string, { total: number; needs_attention: number | null }>>(
        {}
    );
    const [deptQueueSummariesLoading, setDeptQueueSummariesLoading] = useState(false);
    const [deptQueueSummariesError, setDeptQueueSummariesError] = useState<string | null>(null);

    /**
     * `undefined` = placement config not loaded yet → baseline strip.
     * When loaded, resolver output is derived in `kpis` (summaries may still update without refetching placement).
     */
    const [deptPlacementRows, setDeptPlacementRows] = useState<WorkspaceKpiPlacementRow[] | undefined>(undefined);
    const [deptScopeHasPlacements, setDeptScopeHasPlacements] = useState(false);

    const [workflowKpis, setWorkflowKpis] = useState<WorkflowKpis>(DEFAULT_WF_KPIS);
    const [workflowKpisLoading, setWorkflowKpisLoading] = useState(false);
    const [workflowsSummary, setWorkflowsSummary] = useState<WorkflowSummaryRow[] | null>(null);

    const primaryWorkUnit = useMemo(() => {
        const fromDeptList = deptWorkUnits?.[0] ?? null;
        return fromDeptList ? ({ id: fromDeptList.id } as { id: string }) : null;
    }, [deptWorkUnits]);

    /** Session cache → shell before paint (revisit dept/workspace round-trips feel instant). */
    useLayoutEffect(() => {
        seededDeptShellRef.current = false;
        deptActionsPerfKeyRef.current = null;
        deptKpisPerfKeyRef.current = null;
        if (!departmentId || !orgId) return;
        const hit = readDepartmentPageCache(orgId, departmentId);
        if (!hit || hit.dept.id !== departmentId) return;
        seededDeptShellRef.current = true;
        setDept(hit.dept);
        setDeptWorkUnits(hit.workUnits);
        setDeptWorkUnitSummaries(hit.workUnitSummaries ?? {});
        setDeptQueueSummariesLoading(hit.summariesComplete ? false : true);
        setDeptQueueSummariesError(null);
        setDeptLoading(false);
        perfDeptLoad({
            phase: "shell_seed",
            ms: 0,
            source: "cache",
            org_id: orgId,
            department_id: departmentId,
            client_cache_hit: true,
        });
    }, [departmentId, orgId]);

    /** Workflow KPIs deferred until department shell geometry has committed — off the navigation critical path. */
    useEffect(() => {
        if (!departmentId || deptLoading || !dept?.id || deptWorkUnits === null) return;
        let cancelled = false;
        const load = async () => {
            if (cancelled) return;
            setWorkflowKpisLoading(true);
            try {
                const init = workspaceDataFetchInit();
                const [kRes, sRes] = await Promise.all([
                    fetch("/api/admin/workflow-runs?list=kpis", init),
                    fetch("/api/admin/workflows/summary?variant=workspace", init),
                ]);
                const kBody = (await kRes.json().catch(() => ({}))) as { kpis?: Partial<WorkflowKpis> };
                const sJson = (await sRes.json().catch(() => ({}))) as { workflows?: WorkflowSummaryRow[] };
                if (!cancelled) {
                    if (kRes.ok && kBody.kpis) setWorkflowKpis({ ...DEFAULT_WF_KPIS, ...kBody.kpis });
                    if (sRes.ok) {
                        const all = Array.isArray(sJson.workflows) ? sJson.workflows : [];
                        const relevant = all.filter((w) => (w.entity_type ?? "").toLowerCase() === "opportunity");
                        setWorkflowsSummary(relevant);
                    }
                }
            } catch {
                // non-fatal
            } finally {
                if (!cancelled) setWorkflowKpisLoading(false);
            }
        };
        let idleId = 0;
        if (typeof window !== "undefined" && typeof requestIdleCallback !== "undefined") {
            idleId = requestIdleCallback(
                () => {
                    void load();
                },
                { timeout: 2000 }
            );
        } else {
            idleId = window.setTimeout(() => {
                void load();
            }, 160);
        }
        return () => {
            cancelled = true;
            if (typeof window !== "undefined" && typeof cancelIdleCallback !== "undefined") {
                cancelIdleCallback(idleId);
            } else if (typeof window !== "undefined") {
                window.clearTimeout(idleId);
            }
        };
    }, [departmentId, deptLoading, dept?.id, deptWorkUnits]);

    useEffect(() => {
        if (!departmentId) {
            seededDeptShellRef.current = false;
            setDept(null);
            setDeptWorkUnits(null);
            setDeptWorkUnitsError(null);
            setDeptError(null);
            setDeptWorkUnitSummaries({});
            setDeptQueueSummariesLoading(false);
            setDeptQueueSummariesError(null);
            setDeptLoading(false);
            return;
        }

        let cancelled = false;
        deptActionsPerfKeyRef.current = null;
        deptKpisPerfKeyRef.current = null;
        const tAnchor =
            typeof performance !== "undefined" && typeof window !== "undefined" ? performance.now() : 0;
        const seedSnap = seededDeptShellRef.current ? readDepartmentPageCache(orgId, departmentId) : null;

        if (!seededDeptShellRef.current) {
            setDeptLoading(true);
        }
        setDeptError(null);
        setDeptWorkUnitsError(null);
        setDeptQueueSummariesLoading(seedSnap ? !seedSnap.summariesComplete : true);
        setDeptQueueSummariesError(null);

        const summariesRoute = `/api/admin/departments/${encodeURIComponent(departmentId)}/work-unit-queue-summaries?include_previews=false&count_mode=exact&summary_mode=priority&priority_budget=5`;

        const applySummariesJson = (
            deptIdStr: string,
            j: {
                error?: string;
                work_units?: Array<{
                    id?: string;
                    queues?: V1QueueSummary[];
                    error?: string;
                    work_unit_scope_total?: number | null;
                    work_unit_scope_queue_key?: string | null;
                }>;
            },
            ok: boolean
        ): Record<string, { total: number; needs_attention: number | null }> => {
            if (!ok) {
                setDeptWorkUnitSummaries({});
                setDeptQueueSummariesError(j.error ?? "Failed to load queue summaries");
                return {};
            }
            const next: Record<string, { total: number; needs_attention: number | null }> = {};
            for (const row of j.work_units ?? []) {
                const id = typeof row.id === "string" ? row.id : "";
                if (!id || row.error) continue;
                const queues = (row.queues ?? []) as V1QueueSummary[];
                const total =
                    typeof row.work_unit_scope_total === "number" && Number.isFinite(row.work_unit_scope_total)
                        ? Math.max(0, Math.floor(row.work_unit_scope_total))
                        : null;
                if (total == null) continue;
                const needsRow = queues.find((q) => (q.key ?? "").trim().toLowerCase() === "needs_attention");
                const needs =
                    needsRow && needsRow.counts_deferred !== true && typeof needsRow.count === "number"
                        ? needsRow.count
                        : null;
                next[id] = { total, needs_attention: needs };
                if (typeof window !== "undefined") {
                    console.warn("[pipeline-count-unify]", {
                        source: "department",
                        department_id: deptIdStr,
                        work_unit_id: id,
                        queue_key: row.work_unit_scope_queue_key ?? null,
                        count: total,
                    });
                }
            }
            setDeptWorkUnitSummaries(next);
            setDeptQueueSummariesError(null);
            return next;
        };

        async function refreshQueueSummaries(deptCommit: DeptRow | null, wuCommit: Array<{ id: string; name: string | null; key: string | null }>) {
            if (cancelled) return;
            try {
                const init = workspaceDataFetchInit();
                const sumRes = await dedupeAdminFetch(summariesRoute, init ?? {}).catch(() => null as Response | null);
                const j = (await (sumRes?.json().catch(() => ({})) ?? Promise.resolve({}))) as Parameters<
                    typeof applySummariesJson
                >[1];
                if (cancelled) return;
                let ok = false;
                let nextSummaries: Record<string, { total: number; needs_attention: number | null }>;
                if (!sumRes) {
                    nextSummaries = applySummariesJson(
                        departmentId,
                        { error: "Failed to load queue summaries" },
                        false
                    );
                } else {
                    ok = sumRes.ok;
                    nextSummaries = applySummariesJson(departmentId, j, ok);
                }

                perfDeptLoad({
                    phase: "summaries_ready",
                    ms: Math.round((typeof performance !== "undefined" ? performance.now() : 0) - tAnchor),
                    source: "network",
                    org_id: orgId,
                    department_id: departmentId,
                });

                if (orgId && deptCommit) {
                    writeDepartmentPageCache(orgId, {
                        dept: deptCommit,
                        workUnits: wuCommit,
                        workUnitSummaries: nextSummaries,
                        summariesComplete: ok,
                    });
                }
            } finally {
                if (!cancelled) setDeptQueueSummariesLoading(false);
            }
        }

        void (async () => {
            const routeStart = typeof performance !== "undefined" ? performance.now() : 0;
            if (typeof performance !== "undefined" && typeof window !== "undefined") {
                alloyPerfSet("department_start", routeStart);
            }
            try {
                const init = workspaceDataFetchInit() ?? {};
                const deptRoute = `/api/admin/departments/${encodeURIComponent(departmentId)}`;
                const wuRoute = `/api/admin/work-units?department_id=${encodeURIComponent(departmentId)}`;
                const [deptRes, wuRes] = await Promise.all([
                    dedupeAdminFetch(deptRoute, init),
                    dedupeAdminFetch(wuRoute, init),
                ]);

                const deptJson = (await deptRes.json().catch(() => ({}))) as {
                    error?: string;
                    id?: string;
                    name?: string | null;
                    key?: string | null;
                };
                const wuJson = (await wuRes.json().catch(() => ({}))) as {
                    error?: string;
                    items?: Array<{ id: string; name?: string | null; key?: string | null }>;
                };

                if (cancelled) return;

                let deptCommit: DeptRow | null = null;
                let wuCommit: Array<{ id: string; name: string | null; key: string | null }> = [];

                if (!deptRes.ok) {
                    setDept(null);
                    setDeptError(deptJson.error ?? "Failed to load department");
                } else if (deptJson.id) {
                    deptCommit = {
                        id: String(deptJson.id),
                        name: deptJson.name ?? null,
                        key: deptJson.key ?? null,
                    };
                    setDept(deptCommit);
                    setDeptError(null);
                } else {
                    setDept(null);
                    setDeptError("Department not found");
                }

                if (!wuRes.ok) {
                    setDeptWorkUnits(null);
                    setDeptWorkUnitsError(wuJson.error ?? "Failed to load work units");
                } else {
                    wuCommit = (wuJson.items ?? []).map((w) => ({
                        id: String(w.id),
                        name: w.name ?? null,
                        key: w.key ?? null,
                    }));
                    setDeptWorkUnits(wuCommit);
                    setDeptWorkUnitsError(null);
                }

                const cachedMidFetch = seededDeptShellRef.current ? readDepartmentPageCache(orgId, departmentId) : null;
                if (orgId && deptCommit) {
                    writeDepartmentPageCache(orgId, {
                        dept: deptCommit,
                        workUnits: wuCommit,
                        workUnitSummaries:
                            cachedMidFetch?.summariesComplete && cachedMidFetch.dept.id === departmentId ?
                                cachedMidFetch.workUnitSummaries
                            :   {},
                        summariesComplete:
                            !!(cachedMidFetch?.summariesComplete && cachedMidFetch.dept.id === departmentId),
                    });
                }

                if (!cancelled) {
                    setDeptLoading(false);
                    perfDeptLoad({
                        phase: "shell_ready",
                        ms: Math.round((typeof performance !== "undefined" ? performance.now() : 0) - tAnchor),
                        source: "network",
                        org_id: orgId,
                        department_id: departmentId,
                    });
                }

                if (deptCommit && deptRes.ok && wuRes.ok) {
                    void refreshQueueSummaries(deptCommit, wuCommit);
                } else if (!cancelled) {
                    setDeptQueueSummariesLoading(false);
                }

                if (typeof performance !== "undefined" && typeof window !== "undefined") {
                    alloyPerfSet("department_ready", performance.now());
                }
            } catch (e) {
                if (!cancelled) {
                    setDept(null);
                    setDeptError(e instanceof Error ? e.message : "Failed to load department");
                    setDeptWorkUnits(null);
                    setDeptWorkUnitsError(e instanceof Error ? e.message : "Failed to load work units");
                    setDeptWorkUnitSummaries({});
                    setDeptQueueSummariesError(e instanceof Error ? e.message : "Failed to load queue summaries");
                    setDeptQueueSummariesLoading(false);
                    setDeptLoading(false);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [departmentId, orgId]);

    useEffect(() => {
        if (!departmentId) return;
        deptKpisPerfKeyRef.current = null;
        setDeptPlacementRows(undefined);
        setDeptScopeHasPlacements(false);
        let cancelled = false;
        const init = workspaceDataFetchInit();
        const t0 =
            typeof performance !== "undefined" && typeof window !== "undefined" ? performance.now() : 0;
        const placementUrl = `/api/admin/workspace-kpi-placements?surface=department&department_id=${encodeURIComponent(departmentId)}`;
        void (async () => {
            const logKpisPerf = () => {
                if (typeof performance === "undefined" || typeof window === "undefined" || cancelled) return;
                if (deptKpisPerfKeyRef.current === departmentId) return;
                deptKpisPerfKeyRef.current = departmentId;
                perfDeptLoad({
                    phase: "kpis_ready",
                    ms: Math.round(performance.now() - t0),
                    source: "background",
                    org_id: orgId,
                    department_id: departmentId,
                });
            };

            try {
                const res = await dedupeAdminFetchWithTtl(placementUrl, { ...(init ?? {}), cache: "no-store" }, 8000);
                if (!res.ok) {
                    if (!cancelled) {
                        setDeptPlacementRows([]);
                        setDeptScopeHasPlacements(false);
                    }
                    logKpisPerf();
                    return;
                }
                const j = (await res.json().catch(() => ({}))) as {
                    items?: WorkspaceKpiPlacementRow[];
                    scope_has_placements?: boolean;
                };
                if (cancelled) return;
                setDeptPlacementRows(j.items ?? []);
                setDeptScopeHasPlacements(j.scope_has_placements === true);
                logKpisPerf();
            } catch {
                if (!cancelled) {
                    setDeptPlacementRows([]);
                    setDeptScopeHasPlacements(false);
                }
                logKpisPerf();
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [departmentId, orgId]);

    const departmentPageBlockingLoad = useMemo(() => {
        if (!departmentId) return false;
        return deptLoading;
    }, [departmentId, deptLoading]);

    useEffect(() => {
        if (!isEnrollmentLikeDepartmentKey(deptKey) || !departmentId || !primaryWorkUnit?.id) {
            setEnrollmentDeptRightRail(null);
            return;
        }
        let cancelled = false;
        const route =
            `/api/admin/actions?` +
            new URLSearchParams({
                surface: "right_rail",
                entity_type: "opportunity",
                department_id: departmentId,
                work_unit_id: primaryWorkUnit.id,
            }).toString();
        (async () => {
            try {
                const init = workspaceDataFetchInit();
                const res = await dedupeAdminFetchWithTtl(route, init, 1500);
                const j = (await res.json().catch(() => ({}))) as { actions?: ResolvedActionsBySlot; error?: string };
                if (!cancelled && res.ok) {
                    setEnrollmentDeptRightRail(rightRailResolvedFromActionsPayload(j.actions));
                } else if (!cancelled) {
                    setEnrollmentDeptRightRail([]);
                }
            } catch {
                if (!cancelled) setEnrollmentDeptRightRail([]);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [deptKey, departmentId, primaryWorkUnit?.id]);

    useEffect(() => {
        if (!isEnrollmentLikeDepartmentKey(deptKey) || !departmentId || enrollmentDeptRightRail === null) return;
        const sig = `${departmentId}:rail`;
        if (deptActionsPerfKeyRef.current === sig) return;
        deptActionsPerfKeyRef.current = sig;
        perfDeptLoad({
            phase: "actions_ready",
            ms: 0,
            source: "network",
            org_id: orgId,
            department_id: departmentId,
        });
    }, [deptKey, departmentId, enrollmentDeptRightRail]);

    const enrollmentDepartmentRailModel = useMemo(() => {
        if (!isEnrollmentLikeDepartmentKey(deptKey)) return null;
        return mergeEnrollmentRightRailActions(enrollmentDeptRightRail ?? [], {
            primaries: [],
            systemActions: [],
            quickOperations: [],
            overflow: [],
        });
    }, [deptKey, enrollmentDeptRightRail]);

    const enrollmentRightRailByKey = useMemo(() => {
        const m = new Map<string, ResolvedActionForClient>();
        for (const a of enrollmentDeptRightRail ?? []) m.set(a.key, a);
        return m;
    }, [enrollmentDeptRightRail]);

    const kpis = useMemo(() => {
        const wuList = deptWorkUnits ?? [];
        if (deptPlacementRows === undefined) {
            return [];
        }
        return resolveKpisForDepartment({
            placementRows: deptPlacementRows,
            scopeHasPlacementRows: deptScopeHasPlacements,
            departmentSurface: "department",
            deptWorkUnits: wuList,
            deptWorkUnitSummaries,
            deptQueueSummariesLoading,
            deptQueueSummariesError,
        }).items;
    }, [
        deptPlacementRows,
        deptScopeHasPlacements,
        deptQueueSummariesError,
        deptQueueSummariesLoading,
        deptWorkUnitSummaries,
        deptWorkUnits,
    ]);

    const needsAttentionSummary = useMemo(() => {
        const list = deptWorkUnits ?? [];
        const explicitNeedsAttentionWu = list.find((w) => (w.key ?? "").trim().toLowerCase() === "needs_attention") ?? null;
        const total: number | null =
            list.length === 0 || deptQueueSummariesLoading || deptQueueSummariesError
                ? null
                : Object.values(deptWorkUnitSummaries).reduce((acc, s) => acc + (s.needs_attention ?? 0), 0);
        const targetWu = explicitNeedsAttentionWu ?? list[0] ?? null;
        const href =
            targetWu != null
                ? `${WORKSPACE_BASE}/dept/${encodeURIComponent(departmentId)}/work-unit/${encodeURIComponent(targetWu.id)}?queue=needs_attention`
                : `${WORKSPACE_BASE}/dept/${encodeURIComponent(departmentId)}`;
        return { total, href };
    }, [departmentId, deptQueueSummariesError, deptQueueSummariesLoading, deptWorkUnitSummaries, deptWorkUnits]);

    const needsAttentionHref = needsAttentionSummary.href;

    const onEnrollmentDeptRailAction = useCallback(
        async (action: WorkspaceAction) => {
            if (action.type !== "actions.block") return;
            if (action.actionId.startsWith(REGISTRY_RIGHT_RAIL_ACTION_ID_PREFIX)) {
                const key = action.actionId.slice(REGISTRY_RIGHT_RAIL_ACTION_ID_PREFIX.length);
                const resolved = enrollmentRightRailByKey.get(key);
                if (!resolved) return;
                await applyRegistryResolvedActionClient(resolved, {
                    router,
                    openDrawer,
                    departmentId,
                    workUnitId: primaryWorkUnit?.id ?? null,
                    needsAttentionHref,
                    context: {
                        surface: "right_rail",
                        department_id: departmentId,
                        work_unit_id: primaryWorkUnit?.id ?? null,
                    },
                });
                return;
            }
            window.alert("Coming next: This action is not configured yet.");
        },
        [departmentId, enrollmentRightRailByKey, needsAttentionHref, openDrawer, primaryWorkUnit?.id, router]
    );

    const throughputPairedPanels = (
        <WorkspacePairedOperPanelsGrid>
            <WorkspacePairedOperPanel tone="throughput" ariaLabel="Work Unit Queue" title="Work Unit Queue">
                <ul className="adminv2-ws-queue-list" role="list">
                    {deptWorkUnitsError ? (
                        <li className="adminv2-ws-wu-queue-item-wrap" role="listitem">
                            <div className="rounded-lg border border-admin-border bg-white/50 px-3 py-2 text-xs text-alloy-ember">
                                Failed to load work units: {deptWorkUnitsError}
                            </div>
                        </li>
                    ) : null}
                    {(deptWorkUnits ?? []).map((wu) => {
                        const s = deptWorkUnitSummaries[wu.id];
                        const total = s ? s.total : null;
                        const needs = s ? s.needs_attention : null;
                        const wuHref = `${WORKSPACE_BASE}/dept/${encodeURIComponent(departmentId)}/work-unit/${encodeURIComponent(wu.id)}`;
                        return (
                            <li key={`wu:${wu.id}`} className="adminv2-ws-wu-queue-item-wrap" role="listitem">
                                <Link
                                    href={wuHref}
                                    prefetch={shouldDisableAdminV2LinkPrefetch(wuHref) ? false : undefined}
                                    onClick={markWorkUnitNavigationStart}
                                    className="adminv2-ws-wu-queue-card adminv2-ws-wu-queue-card--compact adminv2-ws-wu-queue-card--tier-standard no-underline text-inherit hover:opacity-[0.98]"
                                    data-ws-wu-urgency="standard"
                                >
                                    <div className="adminv2-ws-wu-queue-card-compact-text">
                                        <div className="adminv2-ws-wu-queue-card-title adminv2-ws-wu-queue-card-title--compact">
                                            {wu.name?.trim() || "Work unit"}
                                        </div>
                                        <div
                                            className="adminv2-ws-paired-oper-queue-meta mt-2 grid grid-cols-2 gap-x-3 gap-y-1 tabular-nums"
                                            style={{ color: "var(--d-muted)" }}
                                        >
                                            <div>
                                                <span className="font-medium text-alloy-midnight/75">Total</span>{" "}
                                                <span className="text-alloy-midnight/85">{total ?? "—"}</span>
                                            </div>
                                            <div className="text-right">
                                                <span className="font-medium text-alloy-midnight/75 whitespace-nowrap">
                                                    Needs attention
                                                </span>{" "}
                                                <span className="text-alloy-midnight/85">{needs ?? "—"}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="adminv2-ws-wu-queue-card-compact-aside">
                                        <span className="adminv2-ws-wu-queue-action-chip adminv2-ws-wu-queue-action-chip--open">
                                            Open
                                        </span>
                                    </div>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            </WorkspacePairedOperPanel>
            <WorkspacePairedOperPanel
                tone="attention"
                ariaLabel="Needs Attention"
                title="Needs Attention"
                titleClassName="adminv2-ws-queue-title--section-primary-type"
            >
                <ul className="adminv2-ws-queue-list" role="list">
                    <li className="adminv2-ws-wu-queue-item-wrap" role="listitem">
                        <Link
                            href={needsAttentionSummary.href}
                            prefetch={shouldDisableAdminV2LinkPrefetch(needsAttentionSummary.href) ? false : undefined}
                            onClick={markWorkUnitNavigationStart}
                            className="adminv2-ws-wu-queue-card adminv2-ws-wu-queue-card--compact adminv2-ws-wu-queue-card--tier-warning no-underline text-inherit hover:opacity-[0.98]"
                            data-ws-wu-urgency="attention"
                        >
                            <div className="adminv2-ws-wu-queue-card-compact-text">
                                <div className="adminv2-ws-wu-queue-card-title adminv2-ws-wu-queue-card-title--compact">
                                    Needs attention
                                </div>
                                <div
                                    className="adminv2-ws-paired-oper-queue-meta mt-2 grid grid-cols-2 gap-x-3 gap-y-1 tabular-nums"
                                    style={{ color: "var(--d-muted)" }}
                                >
                                    <div>
                                        <span className="font-medium text-alloy-midnight/75">Total</span>{" "}
                                        <span className="text-alloy-midnight/85">{needsAttentionSummary.total ?? "—"}</span>
                                    </div>
                                    <div className="text-right">
                                        <span className="font-medium text-alloy-midnight/75 whitespace-nowrap">
                                            Needs attention
                                        </span>{" "}
                                        <span className="text-alloy-midnight/85">{needsAttentionSummary.total ?? "—"}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="adminv2-ws-wu-queue-card-compact-aside">
                                <span className="adminv2-ws-wu-queue-action-chip adminv2-ws-wu-queue-action-chip--open">Open</span>
                            </div>
                        </Link>
                    </li>
                </ul>
            </WorkspacePairedOperPanel>
        </WorkspacePairedOperPanelsGrid>
    );

    if (departmentPageBlockingLoad) {
        return (
            <WorkspaceChrome
                variant="bridge"
                breadcrumbs={[
                    { href: WORKSPACE_BASE, label: "Workspace" },
                    { label: "Loading…" },
                ]}
                title="Loading…"
                subtitle=""
            >
                <AdminV2RouteLoadingState variant="department" showRibbon={false} />
            </WorkspaceChrome>
        );
    }

    return (
        <WorkspaceChrome
            variant="bridge"
            breadcrumbs={[
                { href: WORKSPACE_BASE, label: "Workspace" },
                { href: `${WORKSPACE_BASE}/dept/${departmentId}`, label: title },
            ]}
            title={title}
            subtitle=""
        >
            {deptWorkUnitsError && dept ? <p className="text-sm text-alloy-ember px-1">{deptWorkUnitsError}</p> : null}
            {deptQueueSummariesError && dept ? <p className="text-sm text-alloy-ember px-1">{deptQueueSummariesError}</p> : null}
            {!dept ? (
                <div
                    className="rounded-xl border px-4 py-10 text-center text-sm text-alloy-ember/90"
                    style={{ borderColor: "var(--d-border, rgba(39,63,82,0.14))" }}
                >
                    {deptError ??
                        "This department could not be loaded. Use the workspace link above to pick another department."}
                </div>
            ) : primaryWorkUnit ? (
                <DepartmentWorkspaceBridgeShell
                    departmentKey={deptKey}
                    briefTitle={title}
                    briefSubtitle=""
                    signalsSlot={null}
                    kpiSlot={
                        deptPlacementRows === undefined ? (
                            <KpiStripSkeleton id="dept-kpi-skeleton" />
                        ) : kpis.length ? (
                            <div className="adminv2-ws-soft-content-reveal">
                                <KPIBlock kpis={kpis} maxVisible={5} />
                            </div>
                        ) : null
                    }
                    throughputSlot={throughputPairedPanels}
                    attentionSlot={null}
                    contextSlot={
                        <div
                            className="adminv2-ws-dept-v2-workflows-strip"
                            data-ws-lane-kind="automation_workflows"
                        >
                            <AutomationWorkflowsBlock
                                title="Automations"
                                kpisLoading={workflowKpisLoading}
                                kpis={{
                                    runs_today: workflowKpis.runs_today,
                                    failed_last_7d: workflowKpis.failed_last_7d,
                                    running_last_7d: workflowKpis.running_last_7d,
                                    success_rate_last_7d: workflowKpis.success_rate_last_7d,
                                }}
                                workflows={workflowsSummary}
                                href="/adminV2/workflows"
                            />
                        </div>
                    }
                    railSlot={
                        isEnrollmentLikeDepartmentKey(deptKey) && primaryWorkUnit ? (
                            (enrollmentDepartmentRailModel?.systemActions?.length ?? 0) > 0 ? (
                                <div className="adminv2-ws-soft-content-reveal">
                                    <ActionsBlock
                                        model={enrollmentDepartmentRailModel!}
                                        onAction={onEnrollmentDeptRailAction}
                                        title="Actions"
                                        surface="department"
                                    />
                                </div>
                            ) : (
                                <WorkspaceActionsRailPlaceholder />
                            )
                        ) : null
                    }
                />
            ) : (
                <div
                    className="rounded-xl border px-4 py-10 text-center text-sm text-alloy-midnight/55"
                    style={{ borderColor: "var(--d-border, rgba(39,63,82,0.14))" }}
                >
                    No configured Work Unit UI was found for this department.
                </div>
            )}
        </WorkspaceChrome>
    );
}
