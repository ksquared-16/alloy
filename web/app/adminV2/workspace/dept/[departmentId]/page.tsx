"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { WorkspaceChrome } from "@/components/admin/workspace/WorkspaceChrome";
import { useOperationsWorkspaceData } from "@/hooks/useOperationsWorkspaceData";
import KPIBlock from "@/app/adminV2/components/workspace/blocks/KPIBlock";
import {
    DepartmentRouteSkeletonBody,
    WsRouteLoadingRibbon,
} from "@/components/admin/workspace/workspaceRouteSkeletons";
import { workspaceRouteParam } from "@/lib/workspace/workspaceRouteParam";
import ActionsBlock from "@/app/adminV2/components/workspace/blocks/ActionsBlock";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import type { WorkspaceAction } from "@/lib/ui-v2/workspace-actions";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import { applyRegistryResolvedActionClient } from "@/lib/admin/actions/applyRegistryResolvedActionClient";
import {
    REGISTRY_RIGHT_RAIL_ACTION_ID_PREFIX,
    mergeEnrollmentRightRailActions,
} from "@/lib/workspace/viewModels/enrollmentRightRailMerge";
import {
    buildEnrollmentDepartmentCommandRail,
} from "@/lib/workspace/viewModels/enrollmentWorkUnitViewModel";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import { AutomationWorkflowsBlock } from "@/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock";

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

type WorkUnitListRow = { id: string; key: string | null; name: string | null };
type WorkUnitSummary = {
    work_unit_id: string;
    total_count: number;
    needs_attention_count: number | null;
};

export default function AdminV2WorkspaceDepartmentPage() {
    const params = useParams();
    const router = useRouter();
    const { openDrawer } = useAdminDrawer();
    const departmentId = workspaceRouteParam(params.departmentId);

    const { dept, title, runtime, error, loading } = useOperationsWorkspaceData(departmentId);

    const deptKey = (dept?.key ?? "").trim().toLowerCase();

    const [enrollmentDeptRightRail, setEnrollmentDeptRightRail] = useState<ResolvedActionForClient[] | null>(null);

    const [workUnits, setWorkUnits] = useState<WorkUnitListRow[] | null>(null);
    const [workUnitsError, setWorkUnitsError] = useState<string | null>(null);
    const [workUnitSummaries, setWorkUnitSummaries] = useState<Record<string, WorkUnitSummary>>({});

    const [workflowKpis, setWorkflowKpis] = useState<WorkflowKpis>(DEFAULT_WF_KPIS);
    const [workflowsSummary, setWorkflowsSummary] = useState<WorkflowSummaryRow[] | null>(null);

    const primaryWorkUnitId = useMemo(() => {
        const list = workUnits ?? [];
        return list[0]?.id ?? null;
    }, [workUnits]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const init = workspaceDataFetchInit();
                const [kRes, sRes] = await Promise.all([
                    fetch("/api/admin/workflow-runs?list=kpis", init),
                    fetch("/api/admin/workflows/summary", init),
                ]);
                const kJson = (await kRes.json().catch(() => ({}))) as Partial<WorkflowKpis>;
                const sJson = (await sRes.json().catch(() => ({}))) as { workflows?: WorkflowSummaryRow[] };
                if (!cancelled) {
                    if (kRes.ok) setWorkflowKpis({ ...DEFAULT_WF_KPIS, ...kJson });
                    if (sRes.ok) {
                        const all = Array.isArray(sJson.workflows) ? sJson.workflows : [];
                        const relevant = all.filter((w) => (w.entity_type ?? "").toLowerCase() === "opportunity");
                        setWorkflowsSummary(relevant);
                    }
                }
            } catch {
                // non-fatal
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!departmentId) return;
        let cancelled = false;
        (async () => {
            try {
                const init = workspaceDataFetchInit();
                const route = `/api/admin/work-units?department_id=${encodeURIComponent(departmentId)}`;
                const res = await fetch(route, init);
                const j = (await res.json().catch(() => ({}))) as { error?: string; items?: WorkUnitListRow[] };
                if (cancelled) return;
                if (!res.ok) {
                    setWorkUnits(null);
                    setWorkUnitsError(j.error ?? "Failed to load work units");
                    return;
                }
                const items = (j.items ?? []).map((w) => ({
                    id: String(w.id),
                    key: w.key ?? null,
                    name: w.name ?? null,
                }));
                setWorkUnits(items);
                setWorkUnitsError(null);
            } catch (e) {
                if (cancelled) return;
                setWorkUnits(null);
                setWorkUnitsError(e instanceof Error ? e.message : "Failed to load work units");
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [departmentId]);

    useEffect(() => {
        const list = workUnits ?? [];
        if (!departmentId || list.length === 0) return;
        let cancelled = false;
        (async () => {
            const init = workspaceDataFetchInit();
            const next: Record<string, WorkUnitSummary> = {};
            await Promise.allSettled(
                list.map(async (wu) => {
                    const route = `/api/admin/work-units/${encodeURIComponent(wu.id)}/queues?limit=50`;
                    const res = await fetch(route, init);
                    const j = (await res.json().catch(() => ({}))) as { error?: string; queues?: V1QueueSummary[] };
                    if (!res.ok) throw new Error(j.error ?? "Failed to load queue summaries");
                    const queues = (j.queues ?? []) as V1QueueSummary[];
                    const total = queues.reduce((acc, q) => acc + (typeof q.count === "number" ? q.count : 0), 0);
                    const needsKey = queues.find((q) => (q.key ?? "").trim().toLowerCase() === "needs_attention");
                    const needs =
                        needsKey && typeof needsKey.count === "number"
                            ? needsKey.count
                            : queues.reduce(
                                  (acc, q) => acc + (q.priority === "attention" || q.priority === "critical" ? q.count : 0),
                                  0
                              );
                    next[wu.id] = {
                        work_unit_id: wu.id,
                        total_count: total,
                        needs_attention_count: Number.isFinite(needs) ? needs : null,
                    };
                })
            );
            if (!cancelled) setWorkUnitSummaries(next);
        })();
        return () => {
            cancelled = true;
        };
    }, [departmentId, workUnits]);

    useEffect(() => {
        if (deptKey !== "enrollment" || !departmentId || !primaryWorkUnitId) {
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
                work_unit_id: primaryWorkUnitId,
            }).toString();
        (async () => {
            try {
                const res = await fetch(route, workspaceDataFetchInit());
                const j = (await res.json().catch(() => ({}))) as { actions?: { right_rail?: ResolvedActionForClient[] }; error?: string };
                if (!cancelled && res.ok) {
                    setEnrollmentDeptRightRail(j.actions?.right_rail ?? []);
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
    }, [deptKey, departmentId, primaryWorkUnitId]);

    const enrollmentDepartmentRailModel = useMemo(() => {
        if (deptKey !== "enrollment") return null;
        return mergeEnrollmentRightRailActions(enrollmentDeptRightRail ?? [], buildEnrollmentDepartmentCommandRail());
    }, [deptKey, enrollmentDeptRightRail]);

    const enrollmentRightRailByKey = useMemo(() => {
        const m = new Map<string, ResolvedActionForClient>();
        for (const a of enrollmentDeptRightRail ?? []) m.set(a.key, a);
        return m;
    }, [enrollmentDeptRightRail]);

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
                    workUnitId: primaryWorkUnitId ?? null,
                    context: {
                        surface: "right_rail",
                        department_id: departmentId,
                        work_unit_id: primaryWorkUnitId ?? null,
                    },
                });
                return;
            }
            if (action.actionId === "wu_new_inquiry") {
                window.alert("Coming next: Create inquiry in AdminV2.");
                return;
            }
            if (action.actionId === "dept_open_enrollment_wu" && primaryWorkUnitId) {
                router.push(
                    `${WORKSPACE_BASE}/dept/${encodeURIComponent(departmentId)}/work-unit/${encodeURIComponent(primaryWorkUnitId)}`
                );
                return;
            }
            if (action.actionId === "wu_open_all_inquiries") {
                window.alert("Coming next: Inquiry browser in AdminV2.");
                return;
            }
            if (action.actionId === "wu_open_needs_attention") {
                const na = (workUnits ?? []).find((w) => String(w.key ?? "").trim().toLowerCase() === "needs_attention");
                const needsAttentionWorkUnitId = na?.id ?? null;
                if (needsAttentionWorkUnitId) {
                    router.push(
                        `${WORKSPACE_BASE}/dept/${encodeURIComponent(departmentId)}/work-unit/${encodeURIComponent(needsAttentionWorkUnitId)}`
                    );
                } else {
                    router.push(`${WORKSPACE_BASE}/dept/${encodeURIComponent(departmentId)}`);
                }
                return;
            }
            if (action.actionId === "wu_manage_work_units") {
                window.location.href = "/adminV2/settings/work-units";
                return;
            }
            if (action.actionId === "wu_workspace_root") {
                router.push(WORKSPACE_BASE);
            }
        },
        [departmentId, enrollmentRightRailByKey, openDrawer, primaryWorkUnitId, router, workUnits]
    );

    const kpis = useMemo(() => {
        const list = workUnits ?? [];
        if (!list.length) return [];
        const totals = list.reduce(
            (acc, wu) => {
                const s = workUnitSummaries[wu.id];
                if (s) {
                    acc.total += s.total_count;
                    acc.needs += s.needs_attention_count ?? 0;
                }
                return acc;
            },
            { total: 0, needs: 0 }
        );
        return [
            { id: "wu_total", label: "Total", value: String(totals.total), lane: "business" as const },
            { id: "wu_needs", label: "Needs attention", value: String(totals.needs), lane: "business" as const },
        ];
    }, [workUnitSummaries, workUnits]);

    const workUnitRowsNode = useMemo(() => {
        if (workUnitsError) {
            return (
                <div className="rounded-xl border border-admin-border bg-admin-surface-card px-4 py-3 text-sm text-alloy-ember">
                    Failed to load work units: {workUnitsError}
                </div>
            );
        }
        const list = workUnits ?? [];
        if (!list.length) {
            return (
                <div className="rounded-xl border border-admin-border bg-admin-surface-card px-4 py-3 text-sm text-alloy-forge/70">
                    No work units configured for this department.
                </div>
            );
        }
        return (
            <section className="rounded-xl border border-admin-border bg-admin-surface-card px-4 py-3">
                <div className="text-sm font-semibold text-alloy-midnight">Work Unit Queue</div>
                <div className="mt-2">
                    <ul className="space-y-2">
                        {list.map((wu) => {
                            const s = workUnitSummaries[wu.id];
                            const total = s ? s.total_count : null;
                            const needs = s ? s.needs_attention_count : null;
                            const href = `${WORKSPACE_BASE}/dept/${encodeURIComponent(departmentId)}/work-unit/${encodeURIComponent(wu.id)}`;
                            return (
                                <li key={wu.id}>
                                    <Link
                                        href={href}
                                        className="flex items-center justify-between rounded-lg border border-admin-border bg-white/50 px-3 py-2 hover:bg-white/80"
                                    >
                                        <div className="min-w-0">
                                            <div className="truncate text-sm font-semibold text-alloy-midnight/85">
                                                {wu.name?.trim() || "Work unit"}
                                            </div>
                                            <div className="mt-0.5 text-[11px] text-alloy-forge/60 font-mono">
                                                {wu.key ?? ""}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 text-xs text-alloy-forge/70">
                                            <div>
                                                <span className="font-semibold text-alloy-midnight/80">{total ?? "—"}</span>{" "}
                                                total
                                            </div>
                                            <div>
                                                <span className="font-semibold text-alloy-midnight/80">{needs ?? "—"}</span>{" "}
                                                needs attention
                                            </div>
                                            <div className="text-alloy-blue font-semibold">→</div>
                                        </div>
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            </section>
        );
    }, [departmentId, workUnitSummaries, workUnits, workUnitsError]);

    if (loading) {
        return (
            <WorkspaceChrome
                variant="bridge"
                breadcrumbs={[
                    { href: WORKSPACE_BASE, label: "Workspace" },
                    { label: "Loading…" },
                ]}
                title={title}
                subtitle=""
            >
                <WsRouteLoadingRibbon label="Loading department" />
                <DepartmentRouteSkeletonBody />
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
            {error && !loading && dept ? <p className="text-sm text-amber-800 px-1">{error}</p> : null}
            {!dept ? (
                <div
                    className="rounded-xl border px-4 py-10 text-center text-sm text-alloy-ember/90"
                    style={{ borderColor: "var(--d-border, rgba(39,63,82,0.14))" }}
                >
                    {error ??
                        "This department could not be loaded. Use the workspace link above to pick another department."}
                </div>
            ) : (
                <div className="adminv2-ws-wu-v2 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
                    <div className="space-y-3">
                        {kpis.length ? <KPIBlock kpis={kpis} surface="default" maxVisible={6} /> : null}
                        {workUnitRowsNode}
                        <AutomationWorkflowsBlock
                            title="Automations"
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
                    <div className="space-y-3">
                        {enrollmentDepartmentRailModel ? (
                            <ActionsBlock
                                model={enrollmentDepartmentRailModel}
                                onAction={onEnrollmentDeptRailAction}
                                title="Actions"
                                surface="department"
                            />
                        ) : null}
                    </div>
                </div>
            )}
        </WorkspaceChrome>
    );
}
