"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { WorkspaceChrome } from "@/components/admin/workspace/WorkspaceChrome";
import { DepartmentWorkspaceBridgeShell } from "@/components/admin/workspace/DepartmentWorkspaceBridgeShell";
import KPIBlock from "@/app/adminV2/components/workspace/blocks/KPIBlock";
import { AdminV2RouteLoadingState } from "@/components/admin/workspace/AdminV2RouteLoadingState";
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
import { dedupeAdminFetchWithTtl } from "@/lib/workspace/workspaceAdminFetchDedupe";
import { AutomationWorkflowsBlock } from "@/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock";
import { buildDefaultDepartmentKpis } from "@/lib/kpi/baseline";
import { resolveKpisForDepartment } from "@/lib/kpi/resolver";
import type { WorkspaceKpiPlacementRow } from "@/lib/kpi/types";

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
};

type DeptRow = { id: string; name: string | null; key: string | null };

export default function AdminV2WorkspaceDepartmentPage() {
    const params = useParams();
    const router = useRouter();
    const { openDrawer } = useAdminDrawer();
    const departmentId = workspaceRouteParam(params.departmentId);

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
    const [deptSummariesWaitTimedOut, setDeptSummariesWaitTimedOut] = useState(false);

    /** `undefined` = use baseline strip (placement fetch pending/failed); otherwise resolver output after successful placement fetch. */
    const [deptPlacementStrip, setDeptPlacementStrip] = useState<KPIVm[] | undefined>(undefined);

    const [workflowKpis, setWorkflowKpis] = useState<WorkflowKpis>(DEFAULT_WF_KPIS);
    const [workflowKpisLoading, setWorkflowKpisLoading] = useState(true);
    const [workflowsSummary, setWorkflowsSummary] = useState<WorkflowSummaryRow[] | null>(null);

    const primaryWorkUnit = useMemo(() => {
        const fromDeptList = deptWorkUnits?.[0] ?? null;
        return fromDeptList ? ({ id: fromDeptList.id } as { id: string }) : null;
    }, [deptWorkUnits]);

    useEffect(() => {
        let cancelled = false;
        setWorkflowKpisLoading(true);
        (async () => {
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
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!departmentId) {
            setDept(null);
            setDeptWorkUnits(null);
            setDeptWorkUnitsError(null);
            setDeptError(null);
            setDeptLoading(false);
            return;
        }
        let cancelled = false;
        setDeptLoading(true);
        setDeptError(null);
        setDeptWorkUnitsError(null);
        void (async () => {
            try {
                const init = workspaceDataFetchInit();
                const deptRoute = `/api/admin/departments/${encodeURIComponent(departmentId)}`;
                const wuRoute = `/api/admin/work-units?department_id=${encodeURIComponent(departmentId)}`;
                const [deptRes, wuRes] = await Promise.all([fetch(deptRoute, init), fetch(wuRoute, init)]);

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

                if (!deptRes.ok) {
                    setDept(null);
                    setDeptError(deptJson.error ?? "Failed to load department");
                } else if (deptJson.id) {
                    setDept({
                        id: String(deptJson.id),
                        name: deptJson.name ?? null,
                        key: deptJson.key ?? null,
                    });
                    setDeptError(null);
                } else {
                    setDept(null);
                    setDeptError("Department not found");
                }

                if (!wuRes.ok) {
                    setDeptWorkUnits(null);
                    setDeptWorkUnitsError(wuJson.error ?? "Failed to load work units");
                } else {
                    setDeptWorkUnits((wuJson.items ?? []).map((w) => ({ id: String(w.id), name: w.name ?? null, key: w.key ?? null })));
                    setDeptWorkUnitsError(null);
                }
            } catch (e) {
                if (!cancelled) {
                    setDept(null);
                    setDeptError(e instanceof Error ? e.message : "Failed to load department");
                    setDeptWorkUnits(null);
                    setDeptWorkUnitsError(e instanceof Error ? e.message : "Failed to load work units");
                }
            } finally {
                if (!cancelled) setDeptLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [departmentId]);

    useEffect(() => {
        const list = deptWorkUnits ?? [];
        if (!departmentId || list.length === 0) {
            setDeptWorkUnitSummaries({});
            setDeptQueueSummariesLoading(false);
            setDeptQueueSummariesError(null);
            return;
        }
        let cancelled = false;
        setDeptQueueSummariesLoading(true);
        setDeptQueueSummariesError(null);
        void (async () => {
            try {
                const init = workspaceDataFetchInit();
                // Match work-unit queue badges: exact head counts (not PostgreSQL planned estimates).
                const route = `/api/admin/departments/${encodeURIComponent(departmentId)}/work-unit-queue-summaries?include_previews=false&count_mode=exact`;
                const res = await fetch(route, init);
                const j = (await res.json().catch(() => ({}))) as {
                    error?: string;
                    work_units?: Array<{ id?: string; queues?: V1QueueSummary[]; error?: string }>;
                };
                if (cancelled) return;
                if (!res.ok) {
                    setDeptWorkUnitSummaries({});
                    setDeptQueueSummariesError(j.error ?? "Failed to load queue summaries");
                    return;
                }
                const next: Record<string, { total: number; needs_attention: number | null }> = {};
                for (const row of j.work_units ?? []) {
                    const id = typeof row.id === "string" ? row.id : "";
                    if (!id) continue;
                    if (row.error) {
                        next[id] = { total: 0, needs_attention: null };
                        continue;
                    }
                    const queues = (row.queues ?? []) as V1QueueSummary[];
                    const total = queues.reduce((acc, q) => acc + (typeof q.count === "number" ? q.count : 0), 0);
                    const needsRow = queues.find((q) => (q.key ?? "").trim().toLowerCase() === "needs_attention");
                    const needs = needsRow && typeof needsRow.count === "number" ? needsRow.count : null;
                    next[id] = { total, needs_attention: needs };
                }
                setDeptWorkUnitSummaries(next);
                setDeptQueueSummariesError(null);
            } catch (e) {
                if (!cancelled) {
                    setDeptWorkUnitSummaries({});
                    setDeptQueueSummariesError(e instanceof Error ? e.message : "Failed to load queue summaries");
                }
            } finally {
                if (!cancelled) setDeptQueueSummariesLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [departmentId, deptWorkUnits]);

    useEffect(() => {
        setDeptPlacementStrip(undefined);
    }, [departmentId]);

    useEffect(() => {
        if (!departmentId) return;
        let cancelled = false;
        const init = workspaceDataFetchInit();
        void (async () => {
            try {
                const res = await fetch(
                    `/api/admin/workspace-kpi-placements?surface=department&department_id=${encodeURIComponent(departmentId)}`,
                    { ...(init ?? {}), cache: "no-store" }
                );
                if (!res.ok) {
                    if (!cancelled) setDeptPlacementStrip(undefined);
                    return;
                }
                const j = (await res.json().catch(() => ({}))) as {
                    items?: WorkspaceKpiPlacementRow[];
                    scope_has_placements?: boolean;
                };
                if (cancelled) return;
                const wuList = deptWorkUnits ?? [];
                const { items } = resolveKpisForDepartment({
                    placementRows: j.items ?? [],
                    scopeHasPlacementRows: j.scope_has_placements === true,
                    departmentSurface: "department",
                    deptWorkUnits: wuList,
                    deptWorkUnitSummaries,
                    deptQueueSummariesLoading,
                    deptQueueSummariesError,
                });
                if (!cancelled) setDeptPlacementStrip(items);
            } catch {
                if (!cancelled) setDeptPlacementStrip(undefined);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [departmentId, deptWorkUnits, deptWorkUnitSummaries, deptQueueSummariesLoading, deptQueueSummariesError]);

    useEffect(() => {
        if (!deptQueueSummariesLoading) {
            setDeptSummariesWaitTimedOut(false);
            return;
        }
        const t = window.setTimeout(() => setDeptSummariesWaitTimedOut(true), 10_000);
        return () => clearTimeout(t);
    }, [deptQueueSummariesLoading]);

    useEffect(() => {
        if (deptKey !== "enrollment" || !departmentId || !primaryWorkUnit?.id) {
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

    const enrollmentDepartmentRailModel = useMemo(() => {
        if (deptKey !== "enrollment") return null;
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
        if (deptPlacementStrip !== undefined) return deptPlacementStrip;
        return buildDefaultDepartmentKpis({
            deptWorkUnits: deptWorkUnits ?? [],
            deptWorkUnitSummaries,
            deptQueueSummariesLoading,
            deptQueueSummariesError,
        });
    }, [
        deptPlacementStrip,
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

    const deptMainContentReady =
        Boolean(dept) &&
        (!deptQueueSummariesLoading || deptSummariesWaitTimedOut) &&
        (deptWorkUnits !== null || Boolean(deptWorkUnitsError));

    const renderWorkUnitSection = () => {
        return (
            <section
                className="adminv2-ws-dept-qsec adminv2-ws-dept-qsec--primary adminv2-ws-dept-throughput-panel"
                aria-label="Work Unit Queue"
            >
                <header className="adminv2-ws-queue-header">
                    <div className="adminv2-ws-queue-title-row">
                        <h3 className="adminv2-ws-queue-title">Work Unit Queue</h3>
                    </div>
                </header>
                <div className="adminv2-ws-wu-v2" data-ws-surface="work_unit">
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
                            return (
                                <li key={`wu:${wu.id}`} className="adminv2-ws-wu-queue-item-wrap" role="listitem">
                                    <Link
                                        href={`${WORKSPACE_BASE}/dept/${encodeURIComponent(departmentId)}/work-unit/${encodeURIComponent(wu.id)}`}
                                        className="adminv2-ws-wu-queue-card adminv2-ws-wu-queue-card--compact adminv2-ws-wu-queue-card--tier-standard flex flex-col items-stretch no-underline text-inherit hover:opacity-[0.98]"
                                        data-ws-wu-urgency="standard"
                                    >
                                        <div className="adminv2-ws-wu-queue-card-compact-text">
                                            <div className="adminv2-ws-wu-queue-card-title adminv2-ws-wu-queue-card-title--compact">
                                                {wu.name?.trim() || "Work unit"}
                                            </div>
                                            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] tabular-nums" style={{ color: "var(--d-muted)" }}>
                                                <div>
                                                    <span className="font-medium text-alloy-midnight/75">Total</span>{" "}
                                                    <span className="text-alloy-midnight/85">{total ?? "—"}</span>
                                                </div>
                                                <div className="text-right">
                                                    <span className="font-medium text-alloy-midnight/75">Needs attention</span>{" "}
                                                    <span className="text-alloy-midnight/85">{needs ?? "—"}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="adminv2-ws-wu-queue-card-compact-aside">
                                            <span
                                                className="adminv2-ws-wu-queue-action-chip adminv2-ws-wu-queue-action-chip--open"
                                            >
                                                Open
                                            </span>
                                        </div>
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            </section>
        );
    };

    const renderNeedsAttentionBlock = () => {
        return (
            <section
                className="adminv2-ws-dept-qsec adminv2-ws-dept-qsec--secondary adminv2-ws-dept-attention-panel adminv2-ws-dept-attention-panel--framed"
                aria-label="Needs Attention"
            >
                <header className="adminv2-ws-queue-header">
                    <div className="adminv2-ws-queue-title-row">
                        <h3 className="adminv2-ws-queue-title adminv2-ws-queue-title--section-primary-type">Needs Attention</h3>
                    </div>
                </header>
                <div className="adminv2-ws-wu-v2" data-ws-surface="work_unit">
                    <ul className="adminv2-ws-queue-list" role="list">
                        <li className="adminv2-ws-wu-queue-item-wrap" role="listitem">
                            <Link
                                href={needsAttentionSummary.href}
                                className="adminv2-ws-wu-queue-card adminv2-ws-wu-queue-card--compact adminv2-ws-wu-queue-card--tier-warning flex flex-col items-stretch no-underline text-inherit hover:opacity-[0.98]"
                                data-ws-wu-urgency="attention"
                            >
                                <div className="adminv2-ws-wu-queue-card-compact-text">
                                    <div className="adminv2-ws-wu-queue-card-title adminv2-ws-wu-queue-card-title--compact">
                                        Needs attention
                                    </div>
                                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] tabular-nums" style={{ color: "var(--d-muted)" }}>
                                        <div>
                                            <span className="font-medium text-alloy-midnight/75">Total</span>{" "}
                                            <span className="text-alloy-midnight/85">{needsAttentionSummary.total ?? "—"}</span>
                                        </div>
                                        <div className="text-right">
                                            <span className="font-medium text-alloy-midnight/75">Needs attention</span>{" "}
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
                </div>
            </section>
        );
    };

    if (deptLoading) {
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
                <AdminV2RouteLoadingState variant="department" />
            </WorkspaceChrome>
        );
    }

    if (dept && !deptMainContentReady) {
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
                <AdminV2RouteLoadingState
                    variant="department"
                    title="Preparing workspace"
                    description="Loading work-unit queue summaries…"
                    ribbonLabel="Loading summaries"
                />
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
                    kpiSlot={kpis.length ? <KPIBlock kpis={kpis} maxVisible={5} /> : null}
                    throughputSlot={
                        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                            {renderWorkUnitSection()}
                            {renderNeedsAttentionBlock()}
                        </div>
                    }
                    attentionSlot={null}
                    contextSlot={
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
                    }
                    railSlot={
                        deptKey === "enrollment" &&
                        (enrollmentDepartmentRailModel?.systemActions?.length ?? 0) > 0 ? (
                            <ActionsBlock
                                model={enrollmentDepartmentRailModel!}
                                onAction={onEnrollmentDeptRailAction}
                                title="Actions"
                                surface="department"
                            />
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
