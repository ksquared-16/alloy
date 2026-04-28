"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { WorkspaceChrome } from "@/components/admin/workspace/WorkspaceChrome";
import { useOperationsWorkspaceData } from "@/hooks/useOperationsWorkspaceData";
import { DepartmentWorkspaceBridgeShell } from "@/components/admin/workspace/DepartmentWorkspaceBridgeShell";
import KPIBlock from "@/app/adminV2/components/workspace/blocks/KPIBlock";
import {
    DepartmentRouteSkeletonBody,
    WsRouteLoadingRibbon,
} from "@/components/admin/workspace/workspaceRouteSkeletons";
import { workspaceRouteParam } from "@/lib/workspace/workspaceRouteParam";
import { validateQueueDefinition, type QueueDefinitionV1 } from "@/lib/config/queueDefinitionSchema";
import {
    getQueueUiConfig,
    partitionQueueUiSections,
    queuePrimaryTotalFromSummaries,
} from "@/lib/ui-v2/queueUiConfig";
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

export default function AdminV2WorkspaceDepartmentPage() {
    const params = useParams();
    const router = useRouter();
    const { openDrawer } = useAdminDrawer();
    const departmentId = workspaceRouteParam(params.departmentId);
    const debugEnabled =
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).has("debug");

    const { dept, title, runtime, error, loading } = useOperationsWorkspaceData(departmentId);

    const deptKey = (dept?.key ?? "").trim().toLowerCase();

    const [enrollmentDeptRightRail, setEnrollmentDeptRightRail] = useState<ResolvedActionForClient[] | null>(null);

    const needsAttentionWorkUnitId = useMemo(() => {
        const wus = runtime.workUnits ?? [];
        const na = wus.find((r) => String(r.key ?? "").trim().toLowerCase() === "needs_attention");
        return na?.id ?? null;
    }, [runtime.workUnits]);

    const [v1Queues, setV1Queues] = useState<V1QueueSummary[] | null>(null);
    const [v1QueuesError, setV1QueuesError] = useState<string | null>(null);
    const [v1QueuesRoute, setV1QueuesRoute] = useState<string | null>(null);
    const [ctxDebug, setCtxDebug] = useState<{
        orgId: string;
        orgName: string | null;
        orgSlug: string | null;
    } | null>(null);

    const [workflowKpis, setWorkflowKpis] = useState<WorkflowKpis>(DEFAULT_WF_KPIS);
    const [workflowsSummary, setWorkflowsSummary] = useState<WorkflowSummaryRow[] | null>(null);

    const primaryWorkUnit = useMemo(() => {
        const wus = runtime.workUnits ?? [];
        for (const w of wus) {
            try {
                const def = validateQueueDefinition(w.queue_definition);
                if (def.version === 1) return w;
            } catch {
                // ignore
            }
        }
        return null;
    }, [runtime.workUnits]);

    const queueDef = useMemo<QueueDefinitionV1 | null>(() => {
        if (!primaryWorkUnit) return null;
        try {
            return validateQueueDefinition(primaryWorkUnit.queue_definition);
        } catch {
            return null;
        }
    }, [primaryWorkUnit]);

    const queueUi = useMemo(() => {
        if (!queueDef) return null;
        return getQueueUiConfig(queueDef);
    }, [queueDef]);

    useEffect(() => {
        if (!debugEnabled) return;
        let cancelled = false;
        (async () => {
            const route = "/api/admin/debug/context";
            try {
                const res = await fetch(route, { credentials: "include" });
                const j = (await res.json().catch(() => ({}))) as {
                    orgId?: string;
                    orgName?: string | null;
                    orgSlug?: string | null;
                    error?: string;
                };
                if (!cancelled) {
                    if (res.ok && typeof j.orgId === "string" && j.orgId) {
                        setCtxDebug({ orgId: j.orgId, orgName: j.orgName ?? null, orgSlug: j.orgSlug ?? null });
                    } else {
                        setCtxDebug(null);
                    }
                }
                console.info("[adminV2][debug] ctx", {
                    route,
                    ok: res.ok,
                    status: res.status,
                    orgId: j.orgId ?? null,
                    orgName: j.orgName ?? null,
                    departmentId,
                    workUnitId: null,
                    error: j.error ?? null,
                });
            } catch (e) {
                console.warn("[adminV2][debug] ctx failed", { departmentId, error: e });
                if (!cancelled) setCtxDebug(null);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [debugEnabled, departmentId]);

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
        const wus = runtime.workUnits ?? [];
        const rows = wus.map((w) => ({
            id: w.id,
            key: String(w.key ?? ""),
            name: w.name ?? null,
            hasQueueDefV1: (() => {
                try {
                    return validateQueueDefinition(w.queue_definition).version === 1;
                } catch {
                    return false;
                }
            })(),
        }));
        const primary = primaryWorkUnit
            ? { id: primaryWorkUnit.id, key: primaryWorkUnit.key, name: primaryWorkUnit.name }
            : null;
        console.info("[adminV2][dept] work units discovered", {
            departmentId,
            deptKey,
            workUnits: rows,
            primaryWorkUnit: primary,
            primaryRoute: primary ? `${WORKSPACE_BASE}/dept/${departmentId}/work-unit/${primary.id}` : null,
        });
    }, [departmentId, deptKey, primaryWorkUnit, runtime.workUnits]);

    useEffect(() => {
        const workUnitId = primaryWorkUnit?.id ?? "";
        if (!workUnitId) {
            setV1Queues(null);
            setV1QueuesError(null);
            setV1QueuesRoute(null);
            return;
        }
        let cancelled = false;
        (async () => {
            const route = `/api/admin/work-units/${encodeURIComponent(workUnitId)}/queues?limit=50`;
            setV1QueuesRoute(route);
            setV1QueuesError(null);
            try {
                const res = await fetch(route, { credentials: "include" });
                const j = (await res.json().catch(() => ({}))) as { error?: string; queues?: V1QueueSummary[] };
                console.info("[adminV2][dept] v1 queues", {
                    route,
                    status: res.status,
                    ok: res.ok,
                    keys: Array.isArray(j.queues) ? (j.queues ?? []).map((q) => q.key) : [],
                    error: j.error ?? null,
                });
                if (!res.ok) {
                    if (!cancelled) {
                        setV1Queues(null);
                        setV1QueuesError(j.error ?? "Failed to load queues");
                    }
                    return;
                }
                if (!cancelled) {
                    setV1Queues((j.queues ?? []) as V1QueueSummary[]);
                    setV1QueuesError(null);
                }
            } catch (e) {
                const msg = e instanceof Error ? e.message : "Failed to load queues";
                console.warn("[adminV2][dept] v1 queues failed", { route, error: e });
                if (!cancelled) {
                    setV1Queues(null);
                    setV1QueuesError(msg);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [departmentId, primaryWorkUnit?.id]);

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
                const res = await fetch(route, workspaceDataFetchInit());
                const j = (await res.json().catch(() => ({}))) as { actions?: { right_rail?: ResolvedActionForClient[] } };
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
    }, [deptKey, departmentId, primaryWorkUnit?.id]);

    const enrollmentDepartmentRailModel = useMemo(() => {
        if (deptKey !== "enrollment" || !primaryWorkUnit) return null;
        return mergeEnrollmentRightRailActions(enrollmentDeptRightRail ?? [], buildEnrollmentDepartmentCommandRail());
    }, [deptKey, enrollmentDeptRightRail, primaryWorkUnit]);

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
                    workUnitId: primaryWorkUnit?.id ?? null,
                    context: {
                        surface: "right_rail",
                        department_id: departmentId,
                        work_unit_id: primaryWorkUnit?.id ?? null,
                    },
                });
                return;
            }
            if (action.actionId === "wu_new_inquiry") {
                window.alert("Coming next: Create inquiry in AdminV2.");
                return;
            }
            if (action.actionId === "dept_open_enrollment_wu" && primaryWorkUnit?.id) {
                router.push(
                    `${WORKSPACE_BASE}/dept/${encodeURIComponent(departmentId)}/work-unit/${encodeURIComponent(primaryWorkUnit.id)}`
                );
                return;
            }
            if (action.actionId === "wu_open_all_inquiries") {
                window.alert("Coming next: Inquiry browser in AdminV2.");
                return;
            }
            if (action.actionId === "wu_open_needs_attention") {
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
        [departmentId, enrollmentRightRailByKey, needsAttentionWorkUnitId, openDrawer, primaryWorkUnit?.id, router]
    );

    const uiSections = useMemo(() => {
        if (!queueUi) return null;
        return partitionQueueUiSections(queueUi);
    }, [queueUi]);

    const primaryTotal = useMemo(() => {
        if (!queueUi || !v1Queues) return null;
        return queuePrimaryTotalFromSummaries({ ui: queueUi, summaries: v1Queues });
    }, [queueUi, v1Queues]);

    const kpis = useMemo(() => {
        if (!queueUi || !v1Queues) return [];
        const totalLabel = (queueUi.primary_total_label ?? "").trim();
        const out: Array<{ id: string; label: string; value: string; lane: "business" }> = [];
        if (totalLabel && primaryTotal != null) {
            out.push({ id: "primary_total", label: totalLabel, value: String(primaryTotal), lane: "business" });
        }
        // Also show up to 5 queue counts in the configured order (first section first).
        const keys = queueUi.sections.flatMap((s) => s.queue_keys);
        const uniq: string[] = [];
        const seen = new Set<string>();
        for (const k of keys) {
            if (seen.has(k)) continue;
            seen.add(k);
            uniq.push(k);
        }
        for (const k of uniq.slice(0, 5)) {
            const q = v1Queues.find((x) => x.key === k);
            if (!q) continue;
            out.push({ id: `q_${q.key}`, label: q.label, value: String(q.count ?? 0), lane: "business" });
        }
        return out;
    }, [primaryTotal, queueUi, v1Queues]);

    const queuesByKey = useMemo(() => {
        const map = new Map<string, V1QueueSummary>();
        for (const q of v1Queues ?? []) map.set(q.key, q);
        return map;
    }, [v1Queues]);

    const renderSectionQueues = (params: { sectionKey: string; sectionLabel: string; queueKeys: string[]; tone?: "critical" | "attention" | "standard" }) => {
        if (!primaryWorkUnit) return null;
        const qs = params.queueKeys
            .map((k) => queuesByKey.get(k) ?? null)
            .filter((x): x is V1QueueSummary => Boolean(x));
        if (qs.length === 0) return null;

        const isCritical = params.tone === "critical";
        const tierCls = isCritical ? "adminv2-ws-wu-queue-card--attention adminv2-ws-wu-queue-card--tier-warning" : "adminv2-ws-wu-queue-card--tier-standard";
        const urg = isCritical ? "warning" : "standard";

        return (
            <section
                className={`adminv2-ws-dept-qsec ${isCritical ? "adminv2-ws-dept-qsec--secondary adminv2-ws-dept-attention-panel" : "adminv2-ws-dept-qsec--primary adminv2-ws-dept-throughput-panel"}`}
                aria-label={params.sectionLabel}
            >
                <header className="adminv2-ws-queue-header">
                    <div className="adminv2-ws-queue-title-row">
                        <h3 className="adminv2-ws-queue-title">{params.sectionLabel}</h3>
                    </div>
                </header>
                <div className="adminv2-ws-wu-v2" data-ws-surface="work_unit">
                    <ul className="adminv2-ws-queue-list" role="list">
                        {qs.map((q) => (
                            <li key={`${params.sectionKey}:${q.key}`} className="adminv2-ws-wu-queue-item-wrap" role="listitem">
                                <Link
                                    href={`${WORKSPACE_BASE}/dept/${encodeURIComponent(departmentId)}/work-unit/${encodeURIComponent(
                                        primaryWorkUnit.id
                                    )}?queue=${encodeURIComponent(q.key)}`}
                                    className={`adminv2-ws-wu-queue-card adminv2-ws-wu-queue-card--compact ${tierCls} flex flex-col items-stretch no-underline text-inherit hover:opacity-[0.98]`}
                                    data-ws-wu-urgency={urg}
                                >
                                    <div className="adminv2-ws-wu-queue-card-compact-text">
                                        <div className="adminv2-ws-wu-queue-card-title adminv2-ws-wu-queue-card-title--compact">
                                            {q.label}
                                        </div>
                                        {q.description ? (
                                            <div className="adminv2-ws-wu-queue-card-sub adminv2-ws-wu-queue-card-sub--compact">
                                                {q.description}
                                            </div>
                                        ) : null}
                                        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] tabular-nums" style={{ color: "var(--d-muted)" }}>
                                            <div>
                                                <span className="font-medium text-alloy-midnight/75">Count</span>{" "}
                                                <span className="text-alloy-midnight/85">{q.count ?? 0}</span>
                                            </div>
                                            <div className="text-right">
                                                <span className="font-medium text-alloy-midnight/75">Value</span>{" "}
                                                <span className="text-alloy-midnight/85">—</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="adminv2-ws-wu-queue-card-compact-aside">
                                        {isCritical ? (
                                            <span
                                                className="adminv2-ws-wu-queue-count-badge adminv2-ws-wu-queue-count-badge--attention"
                                                aria-label={`${q.count} items`}
                                            >
                                                {q.count}
                                            </span>
                                        ) : null}
                                        <span
                                            className={`adminv2-ws-wu-queue-action-chip adminv2-ws-wu-queue-action-chip--open${isCritical ? " adminv2-ws-wu-queue-action-chip--attention-open" : ""}`}
                                        >
                                            Open queue
                                        </span>
                                    </div>
                                </Link>
                            </li>
                        ))}
                    </ul>
                </div>
            </section>
        );
    };

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
            {debugEnabled ? (
                <div className="mb-2 rounded-md border border-admin-border bg-admin-surface-card px-3 py-2 text-[11px] text-alloy-forge/70">
                    <div>
                        <span className="font-semibold text-alloy-forge/80">Debug</span>{" "}
                        <span>org:</span>{" "}
                        <span className="font-mono">{ctxDebug?.orgId ?? "—"}</span>{" "}
                        <span className="ml-2">name:</span>{" "}
                        <span>{ctxDebug?.orgName ?? "—"}</span>
                    </div>
                    <div className="mt-1">
                        <span>route dept:</span> <span className="font-mono">{departmentId}</span>
                    </div>
                </div>
            ) : null}
            {error && !loading && dept ? <p className="text-sm text-amber-800 px-1">{error}</p> : null}
            {!dept ? (
                <div
                    className="rounded-xl border px-4 py-10 text-center text-sm text-alloy-ember/90"
                    style={{ borderColor: "var(--d-border, rgba(39,63,82,0.14))" }}
                >
                    {error ??
                        "This department could not be loaded. Use the workspace link above to pick another department."}
                </div>
            ) : primaryWorkUnit && queueUi ? (
                <DepartmentWorkspaceBridgeShell
                    departmentKey={deptKey}
                    briefTitle={title}
                    briefSubtitle=""
                    signalsSlot={null}
                    kpiSlot={
                        kpis.length ? (
                            <KPIBlock kpis={kpis} surface="default" maxVisible={6} />
                        ) : null
                    }
                    throughputSlot={
                        <div>
                            {v1QueuesError ? (
                                <div className="mb-2 rounded-lg border border-admin-border bg-admin-surface-card px-3 py-2 text-xs text-alloy-ember">
                                    Failed to load configured queue labels: {v1QueuesError}
                                    {v1QueuesRoute ? (
                                        <div className="mt-1 text-[11px] opacity-80">Route: {v1QueuesRoute}</div>
                                    ) : null}
                                </div>
                            ) : null}
                            {(uiSections?.throughput ?? []).map((s) =>
                                renderSectionQueues({ sectionKey: s.key, sectionLabel: s.label, queueKeys: s.queue_keys })
                            )}
                        </div>
                    }
                    attentionSlot={
                        <div>
                            {(uiSections?.attention ?? []).map((s) =>
                                renderSectionQueues({
                                    sectionKey: s.key,
                                    sectionLabel: s.label,
                                    queueKeys: s.queue_keys,
                                    tone: "critical",
                                })
                            )}
                        </div>
                    }
                    contextSlot={
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
                    }
                    railSlot={
                        enrollmentDepartmentRailModel ? (
                            <ActionsBlock
                                model={enrollmentDepartmentRailModel}
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
