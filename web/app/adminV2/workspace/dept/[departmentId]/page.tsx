"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useWorkspaceOrg } from "@/contexts/WorkspaceOrgContext";
import { useWorkspaceSiteFilter } from "@/contexts/WorkspaceSiteFilterContext";
import { appendWorkspaceSiteToUrl } from "@/lib/adminV2/workspaceSiteFilterClient";
import { adminV2CommitNavigation } from "@/lib/adminV2/shellNavigation";
import { logAdminV2NavDebug } from "@/lib/debug/adminV2NavDebug";
import {
    WorkspacePairedOperPanel,
    WorkspacePairedOperPanelsGrid,
} from "@/components/admin/workspace/WorkspacePairedOperPanels";
import { WorkspaceChrome } from "@/components/admin/workspace/WorkspaceChrome";
import { DepartmentWorkspaceBridgeShell } from "@/components/admin/workspace/DepartmentWorkspaceBridgeShell";
import { WorkspaceActionsRailPlaceholder } from "@/components/admin/workspace/WorkspaceActionsRailPlaceholder";
import KPIBlock from "@/app/adminV2/components/workspace/blocks/KPIBlock";
import { DepartmentWorkspaceColdShell } from "@/components/admin/workspace/DepartmentWorkspaceColdShell";
import { KpiStripSkeleton } from "@/components/admin/workspace/KpiStripSkeleton";
import {
    WorkUnitQueueCompactRowSkeleton,
    WorkUnitQueueCompactRowSkeletonList,
} from "@/components/admin/workspace/WorkUnitQueueCompactRowSkeleton";
import { ADMINV2_DEPT_ATTENTION_LOADING_ROW_COUNT } from "@/lib/ui-v2/adminV2LoadingGeometry";
import { workspaceRouteParam } from "@/lib/workspace/workspaceRouteParam";
import ActionsBlock from "@/app/adminV2/components/workspace/blocks/ActionsBlock";
import { useAdminDrawer, useAdminDrawerOptional } from "@/contexts/AdminDrawerContext";
import { useGlobalAssistantOptional } from "@/contexts/GlobalAssistantContext";
import type { WorkspaceAction } from "@/lib/ui-v2/workspace-actions";
import type { KPIVm } from "@/lib/ui-v2/workspace-types";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import { applyRegistryResolvedActionClient } from "@/lib/admin/actions/applyRegistryResolvedActionClient";
import {
    REGISTRY_RIGHT_RAIL_ACTION_ID_PREFIX,
    mergeEnrollmentRightRailActions,
} from "@/lib/workspace/viewModels/enrollmentRightRailMerge";
import { fetchWorkspaceRightRailResolvedActions } from "@/lib/workspace/fetchWorkspaceRightRailResolvedActions";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import { dedupeAdminFetch, dedupeAdminFetchWithTtl } from "@/lib/workspace/workspaceAdminFetchDedupe";
import {
    perfDeptLoad,
    readDepartmentPageCache,
    writeDepartmentPageCache,
} from "@/lib/workspace/adminV2WorkspaceSessionCache";
import { AutomationWorkflowsBlock } from "@/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock";
import {
    ADMIN_V2_WORKFLOW_AUTOMATION_REFRESH,
    workflowAutomationRefreshMatchesPage,
} from "@/lib/adminV2/aiCommandSurface/workflowAssistWorkspaceEvents";
import { fetchWorkflowAutomationWorkspacePanels } from "@/lib/workspace/fetchWorkflowAutomationWorkspacePanels";
import type { WorkflowScopePartitionV1 } from "@/lib/workflows/workflowScopeMetadata";
import { resolveKpisForDepartment } from "@/lib/kpi/resolver";
import type { WorkspaceKpiPlacementRow } from "@/lib/kpi/types";
import { alloyPerfSet } from "@/lib/perf/alloyPerfGlobal";
import { isEnrollmentLikeDepartmentKey } from "@/lib/workspace/enrollmentDepartmentKey";
import { resolveDeptPipelineExecSurface } from "@/lib/workspace/resolveDeptPipelineExecSurface";
import { WorkspaceOperIcon } from "@/components/admin/workspace/WorkspaceOperIcon";
import { compareNeedsAttentionBuckets } from "@/lib/opportunities/needsAttentionBuckets";

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

type DeptAttentionBucket = {
    key: string;
    label: string;
    description: string | null;
    count: number;
    reason_codes: string[];
    order?: number;
    priority?: number;
    icon?: string | null;
};

type DeptPipelineExecSurface = {
    workUnitId: string;
    panelTitle: string;
    lanes: Array<{
        key: string;
        label: string;
        icon: string | null;
        count: number | null;
        countsDeferred: boolean;
    }>;
};

function DeptOperConsoleQueueRow(props: {
    href: string;
    title: string;
    label: string;
    iconKey?: string | null;
    total: number | null;
    countsDeferred?: boolean;
    totalPending?: boolean;
    variant: "throughput" | "attention";
    attentionBucketKey?: string;
}) {
    const { href, title, label, iconKey, total, countsDeferred, totalPending, variant, attentionBucketKey } = props;
    const adminDrawer = useAdminDrawerOptional();
    const tier =
        variant === "attention"
            ? "adminv2-ws-wu-queue-card--tier-warning adminv2-ws-dept-attention-bucket-tile"
            : "adminv2-ws-wu-queue-card--tier-standard adminv2-ws-dept-pipeline-lane-tile";
    const urgency = variant === "attention" ? "attention" : "standard";
    const iconWellClass =
        variant === "attention"
            ? "adminv2-ws-dept-oper-icon-well adminv2-ws-dept-oper-icon-well--attention"
            : "adminv2-ws-dept-oper-icon-well";
    const totalShown = countsDeferred ? null : total;
    const totalNode =
        countsDeferred || !totalPending || total != null ? (
            <span className="text-alloy-midnight/85">{totalShown ?? "—"}</span>
        ) : (
            <span
                className="inline-block h-3.5 w-6 rounded skeleton-pulse bg-alloy-stone/14 align-middle"
                aria-hidden
            />
        );
    return (
        <a
            href={href}
            onClick={(e) => {
                if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                logAdminV2NavDebug({
                    event: "deptQueueCardClick",
                    clickedHref: href,
                    routerAction: "location.assign",
                });
                e.preventDefault();
                adminV2CommitNavigation(href, { closeDrawer: adminDrawer?.closeDrawer });
            }}
            className={`adminv2-ws-wu-queue-card adminv2-ws-wu-queue-card--compact adminv2-ws-dept-oper-queue-link relative z-[1] cursor-pointer pointer-events-auto ${tier} no-underline text-inherit hover:opacity-[0.98]`}
            data-ws-wu-urgency={urgency}
            data-attention-bucket-key={attentionBucketKey}
            title={title}
        >
            <div className="adminv2-ws-wu-queue-card-compact-text min-w-0">
                <div className="adminv2-ws-dept-oper-row-title">
                    {iconKey ? (
                        <span className={iconWellClass} aria-hidden>
                            <WorkspaceOperIcon name={iconKey} className="adminv2-ws-dept-oper-icon-svg" />
                        </span>
                    ) : null}
                    <div className="adminv2-ws-wu-queue-card-title adminv2-ws-wu-queue-card-title--compact min-w-0">{label}</div>
                </div>
                <div className="adminv2-ws-paired-oper-queue-meta mt-2 tabular-nums" style={{ color: "var(--d-muted)" }}>
                    <div>
                        <span className="font-medium text-alloy-midnight/75">Total</span> {totalNode}
                    </div>
                </div>
            </div>
            <div className="adminv2-ws-wu-queue-card-compact-aside shrink-0 self-center">
                <span className="adminv2-ws-wu-queue-action-chip adminv2-ws-wu-queue-action-chip--open">Open</span>
            </div>
        </a>
    );
}

type DeptAttentionSemantics = {
    candidate_fetch_cap: number;
    raw_candidates_fetched: number;
    candidate_window_saturated: boolean;
    fetch_mode: string;
};

export default function AdminV2WorkspaceDepartmentPage() {
    const params = useParams();
    const router = useRouter();
    const { openDrawer } = useAdminDrawer();
    const { orgId, principalUserId, accessScopeFingerprint } = useWorkspaceOrg();
    const siteFilter = useWorkspaceSiteFilter();
    const selectedSiteId = siteFilter?.selectedSiteId ?? null;
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
    const [workflowPartitions, setWorkflowPartitions] = useState<WorkflowScopePartitionV1 | null>(null);
    const globalAssistant = useGlobalAssistantOptional();

    const [deptAttentionBuckets, setDeptAttentionBuckets] = useState<DeptAttentionBucket[] | null>(null);
    const [deptAttentionPreviewTotal, setDeptAttentionPreviewTotal] = useState<number | null>(null);
    const [deptAttentionBucketsLoading, setDeptAttentionBucketsLoading] = useState(false);
    const [deptAttentionBucketsError, setDeptAttentionBucketsError] = useState<string | null>(null);
    const [deptAttentionSemantics, setDeptAttentionSemantics] = useState<DeptAttentionSemantics | null>(null);
    const [deptBucketCountScope, setDeptBucketCountScope] = useState<string | null>(null);

    const [deptPipelineExecSurface, setDeptPipelineExecSurface] = useState<DeptPipelineExecSurface | null>(null);
    const [deptPipelineExecLoading, setDeptPipelineExecLoading] = useState(false);

    const primaryWorkUnit = useMemo(() => {
        const list = deptWorkUnits ?? [];
        const pipeline =
            list.find((w) => (w.key ?? "").trim().toLowerCase() === "enrollment_pipeline") ?? null;
        if (pipeline) return { id: pipeline.id };
        const na = list.find((w) => (w.key ?? "").trim().toLowerCase() === "needs_attention") ?? null;
        if (na) return { id: na.id };
        const first = list[0] ?? null;
        return first ? { id: first.id } : null;
    }, [deptWorkUnits]);

    /** Session cache → shell before paint (revisit dept/workspace round-trips feel instant). */
    useLayoutEffect(() => {
        seededDeptShellRef.current = false;
        deptActionsPerfKeyRef.current = null;
        deptKpisPerfKeyRef.current = null;
        if (!departmentId || !orgId) return;
        const hit = readDepartmentPageCache(orgId, departmentId, principalUserId, accessScopeFingerprint);
        if (!hit || hit.dept.id !== departmentId) return;
        seededDeptShellRef.current = true;
        setDept(hit.dept);
        setDeptWorkUnits(hit.workUnits);
        /** Never hydrate numeric summaries from sessionStorage — avoids stale org-wide counts when scope narrows. */
        setDeptWorkUnitSummaries({});
        setDeptQueueSummariesLoading(true);
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
    }, [departmentId, orgId, principalUserId, accessScopeFingerprint]);

    useEffect(() => {
        if (!globalAssistant || !departmentId) return;
        globalAssistant.setWorkspaceScope({
            department_id: departmentId,
            department_name: dept?.name ?? null,
        });
        return () => globalAssistant.setWorkspaceScope(null);
    }, [globalAssistant, departmentId, dept?.name]);

    const refreshWorkflowPanels = useCallback(async () => {
        if (!departmentId) return;
        setWorkflowKpisLoading(true);
        try {
            const { kpis, partitions } = await fetchWorkflowAutomationWorkspacePanels({
                department_id: departmentId,
                init: workspaceDataFetchInit(),
            });
            setWorkflowKpis({ ...DEFAULT_WF_KPIS, ...kpis });
            if (partitions) setWorkflowPartitions(partitions);
        } catch {
            // non-fatal
        } finally {
            setWorkflowKpisLoading(false);
        }
    }, [departmentId]);

    const askWorkflowAssist = useCallback(() => {
        const label = dept?.name?.trim() || "this department";
        globalAssistant?.focusCommandBar({
            seedCommand: `Show workflows for ${label}`,
            expandThread: true,
        });
    }, [globalAssistant, dept?.name]);

    /** Workflow KPIs deferred until department shell geometry has committed — off the navigation critical path. */
    useEffect(() => {
        if (!departmentId || deptLoading || !dept?.id || deptWorkUnits === null) return;
        let cancelled = false;
        let idleId = 0;
        const run = () => {
            if (!cancelled) void refreshWorkflowPanels();
        };
        if (typeof window !== "undefined" && typeof requestIdleCallback !== "undefined") {
            idleId = requestIdleCallback(run, { timeout: 2000 });
        } else {
            idleId = window.setTimeout(run, 160);
        }
        return () => {
            cancelled = true;
            if (typeof window !== "undefined" && typeof cancelIdleCallback !== "undefined") {
                cancelIdleCallback(idleId);
            } else if (typeof window !== "undefined") {
                window.clearTimeout(idleId);
            }
        };
    }, [departmentId, deptLoading, dept?.id, deptWorkUnits, refreshWorkflowPanels]);

    useEffect(() => {
        if (!departmentId) return;
        const onRefresh = (ev: Event) => {
            const detail = (ev as CustomEvent<{ department_id?: string | null; work_unit_id?: string | null }>).detail;
            if (!workflowAutomationRefreshMatchesPage(detail, { department_id: departmentId })) return;
            void refreshWorkflowPanels();
        };
        window.addEventListener(ADMIN_V2_WORKFLOW_AUTOMATION_REFRESH, onRefresh);
        return () => window.removeEventListener(ADMIN_V2_WORKFLOW_AUTOMATION_REFRESH, onRefresh);
    }, [departmentId, refreshWorkflowPanels]);

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
        if (!seededDeptShellRef.current) {
            setDeptLoading(true);
        }
        setDeptError(null);
        setDeptWorkUnitsError(null);
        setDeptQueueSummariesLoading(true);
        setDeptQueueSummariesError(null);

        const summariesRoute = appendWorkspaceSiteToUrl(
            `/api/admin/departments/${encodeURIComponent(departmentId)}/work-unit-queue-summaries?include_previews=false&count_mode=exact&summary_mode=priority&priority_budget=5`,
            selectedSiteId
        );

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
                    writeDepartmentPageCache(orgId, principalUserId, accessScopeFingerprint, {
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
                deptKpisPerfKeyRef.current = null;
                if (!cancelled) {
                    setDeptPlacementRows(undefined);
                    setDeptScopeHasPlacements(false);
                }
                const placementT0 =
                    typeof performance !== "undefined" && typeof window !== "undefined" ? performance.now() : 0;
                const placementUrl = `/api/admin/workspace-kpi-placements?surface=department&department_id=${encodeURIComponent(departmentId)}`;
                const placementP = dedupeAdminFetchWithTtl(placementUrl, { ...(init ?? {}), cache: "no-store" }, 8000);
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

                if (orgId && deptCommit) {
                    writeDepartmentPageCache(orgId, principalUserId, accessScopeFingerprint, {
                        dept: deptCommit,
                        workUnits: wuCommit,
                        workUnitSummaries: {},
                        summariesComplete: false,
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
                    const pipelineCandidates = wuCommit.filter(
                        (w) => (w.key ?? "").trim().toLowerCase() !== "needs_attention"
                    );
                    if (pipelineCandidates.length) {
                        setDeptPipelineExecLoading(true);
                        void (async () => {
                            try {
                                const enroll = pipelineCandidates.find(
                                    (w) => (w.key ?? "").trim().toLowerCase() === "enrollment_pipeline"
                                );
                                const detailMap = new Map<string, { queue_definition?: unknown; department_id?: string | null }>();
                                if (enroll) {
                                    const detailRes = await dedupeAdminFetch(
                                        `/api/admin/work-units/${encodeURIComponent(enroll.id)}`,
                                        workspaceDataFetchInit() ?? {}
                                    );
                                    if (detailRes.ok) {
                                        detailMap.set(
                                            enroll.id,
                                            (await detailRes.json().catch(() => ({}))) as {
                                                queue_definition?: unknown;
                                                department_id?: string | null;
                                            }
                                        );
                                    }
                                }
                                const surface = await resolveDeptPipelineExecSurface({
                                    departmentId,
                                    candidates: pipelineCandidates,
                                    init: workspaceDataFetchInit() ?? {},
                                    workUnitDetailById: detailMap,
                                });
                                if (!cancelled) {
                                    setDeptPipelineExecSurface(surface);
                                }
                            } catch {
                                if (!cancelled) setDeptPipelineExecSurface(null);
                            } finally {
                                if (!cancelled) setDeptPipelineExecLoading(false);
                            }
                        })();
                    } else {
                        setDeptPipelineExecSurface(null);
                        setDeptPipelineExecLoading(false);
                    }

                    void Promise.all([
                        refreshQueueSummaries(deptCommit, wuCommit),
                        (async () => {
                            if (cancelled) return;
                            try {
                                const res = await placementP;
                                if (!res.ok) {
                                    if (!cancelled) {
                                        setDeptPlacementRows([]);
                                        setDeptScopeHasPlacements(false);
                                    }
                                } else {
                                    const j = (await res.json().catch(() => ({}))) as {
                                        items?: WorkspaceKpiPlacementRow[];
                                        scope_has_placements?: boolean;
                                    };
                                    if (!cancelled) {
                                        setDeptPlacementRows(j.items ?? []);
                                        setDeptScopeHasPlacements(j.scope_has_placements === true);
                                    }
                                }
                            } catch {
                                if (!cancelled) {
                                    setDeptPlacementRows([]);
                                    setDeptScopeHasPlacements(false);
                                }
                            }
                            if (
                                !cancelled &&
                                typeof performance !== "undefined" &&
                                typeof window !== "undefined" &&
                                deptKpisPerfKeyRef.current !== departmentId
                            ) {
                                deptKpisPerfKeyRef.current = departmentId;
                                perfDeptLoad({
                                    phase: "kpis_ready",
                                    ms: Math.round(performance.now() - placementT0),
                                    source: "background",
                                    org_id: orgId,
                                    department_id: departmentId,
                                });
                            }
                        })(),
                        (async () => {
                            if (cancelled) return;
                            setDeptAttentionBucketsLoading(true);
                            setDeptAttentionBucketsError(null);
                            try {
                                const init = workspaceDataFetchInit();
                                const naWu = wuCommit.find(
                                    (w) => (w.key ?? "").trim().toLowerCase() === "needs_attention"
                                );
                                const baseUrl = `/api/admin/departments/${encodeURIComponent(departmentId)}/opportunity-attention-preview`;
                                const url =
                                    naWu != null
                                        ? `${baseUrl}?work_unit_id=${encodeURIComponent(naWu.id)}`
                                        : baseUrl;
                                const res = await dedupeAdminFetch(url, init ?? {});
                                const j = (await res.json().catch(() => ({}))) as {
                                    error?: string;
                                    total?: number;
                                    needs_attention_buckets?: DeptAttentionBucket[];
                                    opportunity_needs_attention_semantics?: DeptAttentionSemantics | null;
                                    bucket_count_scope?: string | null;
                                };
                                if (cancelled) return;
                                if (!res.ok) {
                                    setDeptAttentionBuckets(null);
                                    setDeptAttentionPreviewTotal(null);
                                    setDeptAttentionSemantics(null);
                                    setDeptBucketCountScope(null);
                                    setDeptAttentionBucketsError(j.error ?? "Needs attention preview failed");
                                    return;
                                }
                                const buckets = Array.isArray(j.needs_attention_buckets) ? j.needs_attention_buckets : [];
                                setDeptAttentionBuckets(buckets);
                                setDeptAttentionPreviewTotal(typeof j.total === "number" ? j.total : null);
                                setDeptAttentionSemantics(j.opportunity_needs_attention_semantics ?? null);
                                setDeptBucketCountScope(typeof j.bucket_count_scope === "string" ? j.bucket_count_scope : null);
                                setDeptAttentionBucketsError(null);
                            } catch (e) {
                                if (!cancelled) {
                                    setDeptAttentionBucketsError(
                                        e instanceof Error ? e.message : "Needs attention preview failed"
                                    );
                                    setDeptAttentionBuckets(null);
                                    setDeptAttentionPreviewTotal(null);
                                    setDeptAttentionSemantics(null);
                                    setDeptBucketCountScope(null);
                                }
                            } finally {
                                if (!cancelled) setDeptAttentionBucketsLoading(false);
                            }
                        })(),
                    ]);
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
    }, [departmentId, orgId, principalUserId, accessScopeFingerprint, selectedSiteId]);

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
        (async () => {
            try {
                const init = workspaceDataFetchInit();
                const list = await fetchWorkspaceRightRailResolvedActions({
                    departmentId,
                    workUnitId: primaryWorkUnit.id,
                    fetchInit: init,
                });
                if (!cancelled) setEnrollmentDeptRightRail(list);
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
        const targetWu = explicitNeedsAttentionWu ?? list[0] ?? null;
        const href =
            targetWu != null
                ? `${WORKSPACE_BASE}/dept/${encodeURIComponent(departmentId)}/work-unit/${encodeURIComponent(targetWu.id)}?queue=needs_attention`
                : `${WORKSPACE_BASE}/dept/${encodeURIComponent(departmentId)}`;
        return {
            href,
            targetWuId: targetWu?.id ?? null,
            needsAttentionWorkUnitId: explicitNeedsAttentionWu?.id ?? null,
        };
    }, [departmentId, deptWorkUnits]);

    const needsAttentionHref = needsAttentionSummary.href;

    const sortedDeptAttentionBuckets = useMemo(() => {
        const list = deptAttentionBuckets ?? [];
        return [...list].sort((a, b) =>
            compareNeedsAttentionBuckets(
                { priority: a.priority, order: a.order ?? 0, label: a.label },
                { priority: b.priority, order: b.order ?? 0, label: b.label },
            ),
        );
    }, [deptAttentionBuckets]);

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

    const execPanelTitle = deptPipelineExecSurface?.panelTitle ?? "Work Unit Queue";

    const throughputLaneBody = (
        <ul className="adminv2-ws-queue-list" role="list">
                    {deptWorkUnitsError ? (
                        <li className="adminv2-ws-wu-queue-item-wrap" role="listitem">
                            <div className="rounded-lg border border-admin-border bg-white/50 px-3 py-2 text-xs text-alloy-ember">
                                Failed to load work units: {deptWorkUnitsError}
                            </div>
                        </li>
                    ) : null}
                    {deptPipelineExecSurface && deptPipelineExecSurface.lanes.length > 0 ? (
                        <>
                            {deptPipelineExecSurface.lanes.map((lane) => {
                                const wuHref = `${WORKSPACE_BASE}/dept/${encodeURIComponent(departmentId)}/work-unit/${encodeURIComponent(deptPipelineExecSurface.workUnitId)}`;
                                const href = `${wuHref}?queue=${encodeURIComponent(lane.key)}`;
                                return (
                                    <li key={`pipe:${lane.key}`} className="adminv2-ws-wu-queue-item-wrap" role="listitem">
                                        <DeptOperConsoleQueueRow
                                            href={href}
                                            title={`${lane.label}. Total ${lane.countsDeferred ? "deferred" : lane.count ?? "—"}.`}
                                            label={lane.label}
                                            iconKey={lane.icon}
                                            total={lane.count}
                                            countsDeferred={lane.countsDeferred}
                                            variant="throughput"
                                        />
                                    </li>
                                );
                            })}
                        </>
                    ) : deptPipelineExecLoading && (deptWorkUnits ?? []).length > 0 ? (
                        <WorkUnitQueueCompactRowSkeletonList
                            count={Math.min((deptWorkUnits ?? []).length, 5)}
                            variant="throughput"
                            ariaLabel="Loading pipeline lanes"
                        />
                    ) : (
                        <>
                            {deptQueueSummariesLoading && (deptWorkUnits ?? []).length > 0 ? (
                                <WorkUnitQueueCompactRowSkeleton variant="throughput" />
                            ) : null}
                            {(deptWorkUnits ?? []).map((wu) => {
                                const s = deptWorkUnitSummaries[wu.id];
                                const total = s ? s.total : null;
                                const wuHref = `${WORKSPACE_BASE}/dept/${encodeURIComponent(departmentId)}/work-unit/${encodeURIComponent(wu.id)}`;
                                return (
                                    <li key={`wu:${wu.id}`} className="adminv2-ws-wu-queue-item-wrap" role="listitem">
                                        <DeptOperConsoleQueueRow
                                            href={wuHref}
                                            title={`${wu.name?.trim() || "Work unit"}. Total ${total ?? "—"}.`}
                                            label={wu.name?.trim() || "Work unit"}
                                            iconKey={null}
                                            total={total}
                                            totalPending={deptQueueSummariesLoading && total == null}
                                            variant="throughput"
                                        />
                                    </li>
                                );
                            })}
                        </>
                    )}
                </ul>
    );

    const attentionLaneBody = (
                <ul className="adminv2-ws-queue-list" role="list">
                    {deptAttentionBucketsError ? (
                        <li className="adminv2-ws-wu-queue-item-wrap" role="listitem">
                            <div className="rounded-lg border border-admin-border bg-white/50 px-3 py-2 text-xs text-alloy-ember">
                                {deptAttentionBucketsError}
                            </div>
                        </li>
                    ) : null}
                    {deptAttentionBucketsLoading && !sortedDeptAttentionBuckets.length
                        ? Array.from({ length: ADMINV2_DEPT_ATTENTION_LOADING_ROW_COUNT }, (_, i) => (
                              <WorkUnitQueueCompactRowSkeleton key={`attn-skel-${i}`} variant="attention" />
                          ))
                        : null}
                    {!deptAttentionBucketsLoading && !deptAttentionBucketsError && sortedDeptAttentionBuckets.length === 0 ? (
                        <li className="adminv2-ws-wu-queue-item-wrap" role="listitem">
                            <div className="rounded-lg border border-admin-border bg-white/50 px-3 py-3 text-xs text-alloy-midnight/60">
                                No Needs Attention types configured.
                            </div>
                        </li>
                    ) : null}
                    {sortedDeptAttentionBuckets.map((b) => {
                        const drillWuId =
                            needsAttentionSummary.needsAttentionWorkUnitId ?? needsAttentionSummary.targetWuId;
                        const drillBase =
                            drillWuId != null
                                ? `${WORKSPACE_BASE}/dept/${encodeURIComponent(departmentId)}/work-unit/${encodeURIComponent(drillWuId)}`
                                : needsAttentionHref;
                        const query =
                            drillWuId != null
                                ? `queue=needs_attention&attention_bucket=${encodeURIComponent(b.key)}`
                                : "";
                        const href = query !== "" ? `${drillBase}?${query}` : drillBase;
                        return (
                            <li key={`attn:${b.key}`} className="adminv2-ws-wu-queue-item-wrap" role="listitem">
                                <DeptOperConsoleQueueRow
                                    href={href}
                                    title={`${b.label}. Total ${b.count}.`}
                                    label={b.label}
                                    iconKey={b.icon}
                                    total={b.count}
                                    variant="attention"
                                    attentionBucketKey={b.key}
                                />
                            </li>
                        );
                    })}
                </ul>
    );

    const throughputPairedPanels = (
        <div className="adminv2-ws-soft-content-reveal">
            <WorkspacePairedOperPanelsGrid>
                <WorkspacePairedOperPanel tone="throughput" ariaLabel={execPanelTitle} title={execPanelTitle}>
                    {throughputLaneBody}
                </WorkspacePairedOperPanel>
                <WorkspacePairedOperPanel
                    tone="attention"
                    ariaLabel="Needs Attention"
                    title="Needs Attention"
                    titleClassName="adminv2-ws-queue-title--section-primary-type"
                >
                    {attentionLaneBody}
                </WorkspacePairedOperPanel>
            </WorkspacePairedOperPanelsGrid>
        </div>
    );

    if (departmentPageBlockingLoad) {
        return <DepartmentWorkspaceColdShell departmentTitle={dept?.name?.trim() || "Department"} />;
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
                                partitions={workflowPartitions}
                                href="/adminV2/workflows"
                                onAskWorkflowAssist={askWorkflowAssist}
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
