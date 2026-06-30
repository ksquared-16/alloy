"use client";

import { CANONICAL_ADMIN_WORKSPACE } from "@/lib/admin/canonicalAdminRoutes";
import { resolveCreatedLeadFocusPanelHref } from "@/lib/admin/canonicalOperatorRoutes";

import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
    type MouseEvent,
} from "react";
import { useParams, useRouter } from "next/navigation";
import { useWorkspaceOrg } from "@/contexts/WorkspaceOrgContext";
import { getEntityLabel, useEntityLabels } from "@/contexts/EntityLabelsContext";
import { useWorkspaceSiteFilter } from "@/contexts/WorkspaceSiteFilterContext";
import {
    appendWorkspaceSiteToPath,
    appendWorkspaceSiteToUrl,
    workspaceViewCacheFingerprint,
} from "@/lib/adminV2/workspaceSiteFilterClient";
import { adminV2CommitNavigation } from "@/lib/adminV2/shellNavigation";
import { logAdminV2NavDebug } from "@/lib/debug/adminV2NavDebug";
import {
    WorkspacePairedOperPanel,
    WorkspacePairedOperPanelsGrid,
} from "@/components/admin/workspace/WorkspacePairedOperPanels";
import { WorkspaceChrome } from "@/components/admin/workspace/WorkspaceChrome";
import { DepartmentWorkspaceBridgeShell } from "@/components/admin/workspace/DepartmentWorkspaceBridgeShell";
import KPIBlock from "@/app/adminV2/components/workspace/blocks/KPIBlock";
import { workspaceRouteParam } from "@/lib/workspace/workspaceRouteParam";
import { WorkspaceCommandRailActionsSection } from "@/app/adminV2/components/workspace/WorkspaceCommandRailActionsSection";
import { countActionsVm } from "@/lib/bos/countActionsVm";
import { useAdminDrawer, useAdminDrawerOptional } from "@/contexts/AdminDrawerContext";
import { useGlobalAssistantOptional } from "@/contexts/GlobalAssistantContext";
import type { WorkspaceAction } from "@/lib/ui-v2/workspace-actions";
import type { KPIVm } from "@/lib/ui-v2/workspace-types";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import { applyRegistryResolvedActionClient } from "@/lib/admin/actions/applyRegistryResolvedActionClient";
import { CreateLeadCommandSurface } from "@/components/platform/commands/createLead/CreateLeadCommandSurface";
import WorkUnitScheduleTourRecordPickerModal from "@/components/admin/workspace/WorkUnitScheduleTourRecordPickerModal";
import { openTourScheduleModalForOpportunity } from "@/lib/tours/actions/tourBookingActionClient";
import {
    REGISTRY_RIGHT_RAIL_ACTION_ID_PREFIX,
    mergeEnrollmentRightRailActions,
} from "@/lib/workspace/viewModels/enrollmentRightRailMerge";
import { fetchWorkspaceRightRailResolvedActions } from "@/lib/workspace/fetchWorkspaceRightRailResolvedActions";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import { ADMINV2_ABOVE_FOLD_CACHE_TTL_MS } from "@/lib/adminV2/adminV2AboveFoldCacheContracts";
import { logPrefetchAdminV2 } from "@/lib/adminV2/adminV2PrefetchInstrumentation";
import { prefetchVisibleWorkUnitBootstrapsFromDept } from "@/lib/adminV2/workUnitBootstrapPrefetchFromDept";
import { dedupeAdminFetch, dedupeAdminFetchWithTtl, dedupeAdminFetchWithTtlMeta, LIFECYCLE_SIBLING_FETCH_TTL_MS } from "@/lib/workspace/workspaceAdminFetchDedupe";
import { prefetchWorkUnitOperationalBootstrapFromDeptHref } from "@/lib/adminV2/workUnitBootstrapPrefetchFromDept";
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
import {
    mergeDeptWorkUnitSummariesForKpis,
    synthesizeDeptKpiWorkUnitSummaries,
} from "@/lib/workspace/synthesizeDeptKpiWorkUnitSummaries";
import type { WorkspaceKpiPlacementRow } from "@/lib/kpi/types";
import {
    markRouteBootstrapReturned,
    markRouteFirstAboveFoldStable,
    markRouteShellVisible,
    registerRouteLoadingOwner,
    resetRouteShellTrace,
    unregisterRouteLoadingOwner,
} from "@/lib/adminV2/routeShellPipeline";
import { recordBootstrapPayloadBytes } from "@/lib/perf/adminV2SpeedSprintTrace";
import {
    logAdminV2DuplicateFetchSuppressed,
    logDeptBootstrapBreakdown,
} from "@/lib/perf/adminV2BootstrapBreakdown";
import { peelBootstrapServerPerf } from "@/lib/workspace/bootstrapServerPerfEnvelope";
import { alloyPerfSet } from "@/lib/perf/alloyPerfGlobal";
import { setAdminV2PrimarySurfacePending } from "@/lib/perf/adminV2PrimarySurfaceGate";
import { scheduleAdminV2BackgroundWork } from "@/lib/workspace/adminV2DeferBackgroundWork";
import { logAdminV2LegacyFanOut } from "@/lib/adminV2/runtime/adminV2LegacyFanOutDiagnostics";
import { isAdminV2OperNavigationActive } from "@/lib/perf/alloyPerfGlobal";
import { isEnrollmentLikeDepartmentKey } from "@/lib/workspace/enrollmentDepartmentKey";
import {
    computeDeptRevealGate,
    deptRevealActionsReady,
    deptRevealKpiStripReady,
    deptRevealShellReady,
    deptRevealWorkUnitsReady,
    markDeptRevealGatePhases,
    markDeptRevealGateStart,
    resetDeptRevealGatePerf,
} from "@/lib/adminV2/deptRevealGate";
import { DeptPageLoadingGate } from "@/app/adminV2/components/workspace/DeptPageLoadingGate";
import { resolveDeptWorkUnitDisplayLabel } from "@/lib/workspace/workUnitShellDisplayTitle";
import {
    buildLifecycleStageOrderIndex,
    lifecycleDeptThroughputWorkUnits,
    mapBootstrapWorkUnits,
    sortByLifecycleStageOrder,
    sortLifecycleDeptWorkUnits,
    type DeptWorkUnitListRow,
} from "@/lib/lifecycle/sortLifecycleDeptWorkUnits";

function mapDeptWorkUnitRows(
    items: Array<{ id: string; name?: string | null; key?: string | null; sort_order?: number | null; metadata?: unknown }>
): DeptWorkUnitListRow[] {
    return sortLifecycleDeptWorkUnits(
        items.map((w) => ({
            id: String(w.id),
            name: w.name ?? null,
            key: w.key ?? null,
            sort_order: w.sort_order ?? null,
            metadata: w.metadata,
        }))
    );
}
import {
    departmentReservesOperationalActionsRail,
    deptUsesBuilderOwnedLifecycleRuntime,
    isLifecycleStageWorkUnitRow,
    type LifecycleWorkUnitDeptRuntimeDebug,
} from "@/lib/lifecycle/builderOwnedLifecycleRuntime";
import {
    deptKpiWorkUnitsForLifecycleVisibility,
    resolveDeptRightRailWorkUnitId,
} from "@/lib/lifecycle/lifecycleKpiPresentation";
import { ADMIN_V2_SETTINGS_LIFECYCLE_PATH } from "@/lib/adminV2/settings/lifecycleSettingsPaths";
import { resolveDeptPipelineExecSurface } from "@/lib/workspace/resolveDeptPipelineExecSurface";
import { WorkspaceOperIcon } from "@/components/admin/workspace/WorkspaceOperIcon";
import { compareNeedsAttentionBuckets } from "@/lib/opportunities/needsAttentionBuckets";
import {
    deptOperNavClickAckProps,
    deptOperNavClickedKey,
    markDeptOperNavClickAck,
    parseWorkUnitNavFromDeptOperHref,
    workspaceDeptQueueNavHref,
    subscribeDeptOperNavClickAck,
    getDeptOperNavClickAckSnapshot,
} from "@/lib/adminV2/navigation";

const WORKSPACE_BASE = CANONICAL_ADMIN_WORKSPACE;

/** Locked before oper region reveal — may upgrade wu_summaries → pipeline_lanes until first reveal (PERF-B-01). */
type DeptThroughputPresentation = "pipeline_lanes" | "wu_summaries" | "empty";

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

type DeptRow = { id: string; name: string | null; key: string | null; metadata?: unknown };

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

function isModifiedDeptOperNavClick(e: MouseEvent<HTMLAnchorElement>): boolean {
    return e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.defaultPrevented;
}

function warmWorkUnitBootstrapFromDeptOperHref(
    href: string,
    departmentId: string,
    selectedSiteId: string | null | undefined
): void {
    prefetchWorkUnitOperationalBootstrapFromDeptHref(href, departmentId, selectedSiteId ?? null);
}

function DeptOperConsoleQueueRow(props: {
    href: string;
    departmentId: string;
    title: string;
    label: string;
    iconKey?: string | null;
    total: number | null;
    countsDeferred?: boolean;
    totalPending?: boolean;
    variant: "throughput" | "attention";
    attentionBucketKey?: string;
}) {
    const {
        href,
        departmentId,
        title,
        label,
        iconKey,
        total,
        countsDeferred,
        totalPending,
        variant,
        attentionBucketKey,
    } = props;
    const adminDrawer = useAdminDrawerOptional();
    const selectedSiteId = useWorkspaceSiteFilter()?.selectedSiteId ?? null;
    useSyncExternalStore(subscribeDeptOperNavClickAck, getDeptOperNavClickAckSnapshot, () => null);
    const clickedKey = deptOperNavClickedKey(href);
    const ackProps = deptOperNavClickAckProps(clickedKey);
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

    const commitHardNav = () => {
        logAdminV2NavDebug({
            event: "deptQueueCardClick",
            clickedHref: href,
            routerAction: "location.assign",
        });
        adminV2CommitNavigation(href, { closeDrawer: adminDrawer?.closeDrawer });
    };

    return (
        <a
            href={href}
            onPointerDown={(e) => {
                if (isModifiedDeptOperNavClick(e)) return;
                warmWorkUnitBootstrapFromDeptOperHref(href, departmentId, selectedSiteId);
            }}
            onClick={(e) => {
                if (isModifiedDeptOperNavClick(e)) return;
                e.preventDefault();
                warmWorkUnitBootstrapFromDeptOperHref(href, departmentId, selectedSiteId);
                markDeptOperNavClickAck(clickedKey);
                commitHardNav();
            }}
            className={`adminv2-ws-wu-queue-card adminv2-ws-wu-queue-card--compact adminv2-ws-dept-oper-queue-link adminv2-interactive-surface relative z-[1] cursor-pointer pointer-events-auto ${tier} no-underline text-inherit`}
            data-ws-wu-urgency={urgency}
            data-attention-bucket-key={attentionBucketKey}
            title={title}
            {...ackProps}
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
    const viewScopeFingerprint = workspaceViewCacheFingerprint(accessScopeFingerprint, selectedSiteId);
    const { labels: entityLabels } = useEntityLabels();
    const departmentId = workspaceRouteParam(params.departmentId);

    /** True when layout applied readDepartmentPageCache for this dept (mirrors workspace root seeded shell). */
    const seededDeptShellRef = useRef(false);
    const deptActionsPerfKeyRef = useRef<string | null>(null);
    const deptKpisPerfKeyRef = useRef<string | null>(null);
    const enrollmentRightRailPrefetchRef = useRef<ResolvedActionForClient[] | null>(null);

    const [dept, setDept] = useState<DeptRow | null>(null);
    const [deptLoading, setDeptLoading] = useState(true);
    const [deptError, setDeptError] = useState<string | null>(null);

    const deptKey = (dept?.key ?? "").trim().toLowerCase();
    const title = useMemo(() => dept?.name?.trim() || "Department", [dept?.name]);

    const [enrollmentDeptRightRail, setEnrollmentDeptRightRail] = useState<ResolvedActionForClient[] | null>(null);
    const [enrollmentDeptActionsSettled, setEnrollmentDeptActionsSettled] = useState(false);

    const [deptWorkUnits, setDeptWorkUnits] = useState<Array<{ id: string; name: string | null; key: string | null }> | null>(null);
    const [deptWorkUnitsError, setDeptWorkUnitsError] = useState<string | null>(null);
    const [deptLifecycleWuDebug, setDeptLifecycleWuDebug] =
        useState<LifecycleWorkUnitDeptRuntimeDebug | null>(null);
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
    /** One-shot per dept/site navigation — throughput UI family does not change after oper reveal. */
    const [deptThroughputPresentation, setDeptThroughputPresentation] =
        useState<DeptThroughputPresentation | null>(null);
    const [deptOperPanelTitleLocked, setDeptOperPanelTitleLocked] = useState("Work Unit Queue");
    const [createLeadOpen, setCreateLeadOpen] = useState(false);
    const [scheduleTourPickerOpen, setScheduleTourPickerOpen] = useState(false);

    const openScheduleTourRecordPicker = useCallback(() => {
        setScheduleTourPickerOpen(true);
    }, []);

    const openScheduleTourForOpportunity = useCallback(
        (opportunityId: string) => {
            const id = opportunityId.trim();
            if (!id) return;
            openTourScheduleModalForOpportunity(id, (opts) => openDrawer({ type: "opportunities", id: opts.id }));
            setScheduleTourPickerOpen(false);
        },
        [openDrawer]
    );

    const primaryWorkUnit = useMemo(() => {
        const list = deptWorkUnits ?? [];
        const pipeline =
            list.find((w) => (w.key ?? "").trim().toLowerCase() === "enrollment_pipeline") ?? null;
        if (pipeline) return { id: pipeline.id, key: pipeline.key };
        const na = list.find((w) => (w.key ?? "").trim().toLowerCase() === "needs_attention") ?? null;
        if (na) return { id: na.id, key: na.key };
        const first = list[0] ?? null;
        return first ? { id: first.id, key: first.key } : null;
    }, [deptWorkUnits]);

    /** Session cache → title only before paint; operational state clears until network confirms (PR-4.6). */
    useLayoutEffect(() => {
        resetDeptRevealGatePerf();
        seededDeptShellRef.current = false;
        deptActionsPerfKeyRef.current = null;
        deptKpisPerfKeyRef.current = null;
        enrollmentRightRailPrefetchRef.current = null;
        setEnrollmentDeptActionsSettled(false);
        setDeptThroughputPresentation(null);
        setDeptOperPanelTitleLocked("Work Unit Queue");
        setDeptPipelineExecSurface(null);
        setDeptPipelineExecLoading(false);
        setDeptWorkUnits(null);
        setDeptWorkUnitsError(null);
        setDeptWorkUnitSummaries({});
        setDeptQueueSummariesLoading(true);
        setDeptQueueSummariesError(null);
        setDeptAttentionBuckets(null);
        setDeptAttentionBucketsLoading(false);
        setDeptAttentionBucketsError(null);
        setDeptAttentionPreviewTotal(null);
        setDeptAttentionSemantics(null);
        setDeptBucketCountScope(null);
        setEnrollmentDeptRightRail(null);
        setDeptPlacementRows(undefined);
        setDeptScopeHasPlacements(false);

        if (!departmentId || !orgId) return;
        const hit = readDepartmentPageCache(orgId, departmentId, principalUserId, viewScopeFingerprint);
        if (!hit || hit.dept.id !== departmentId) return;
        seededDeptShellRef.current = true;
        setDept(hit.dept);
        const expectsPipeline = (hit.workUnits ?? []).some(
            (w) => (w.key ?? "").trim().toLowerCase() === "enrollment_pipeline"
        );
        if (expectsPipeline) {
            setDeptPipelineExecLoading(true);
        }
        setDeptWorkUnits(mapBootstrapWorkUnits(hit.workUnits));
        setDeptLoading(false);

        // Restore summaries — lets deptThroughputBodyReady pass immediately for non-pipeline depts.
        if (hit.summariesComplete && hit.workUnitSummaries) {
            setDeptWorkUnitSummaries(hit.workUnitSummaries);
            setDeptQueueSummariesLoading(false);
        }

        // Restore attention — prevents the attention panel from blocking the reveal gate.
        if (Array.isArray(hit.attentionBuckets)) {
            setDeptAttentionBuckets(hit.attentionBuckets as DeptAttentionBucket[]);
            setDeptAttentionPreviewTotal(hit.attentionPreviewTotal ?? null);
            setDeptAttentionBucketsLoading(false);
        }

        // Restore KPI placements — satisfies deptRevealKpiStripReady (placement_rows_defined).
        if (hit.kpiPlacementRows !== undefined && hit.kpiPlacementRows !== null) {
            setDeptPlacementRows(hit.kpiPlacementRows as WorkspaceKpiPlacementRow[]);
            setDeptScopeHasPlacements(hit.kpiScopeHasPlacements ?? false);
        }

        perfDeptLoad({
            phase: "shell_seed",
            ms: 0,
            source: "cache",
            org_id: orgId,
            department_id: departmentId,
            client_cache_hit: true,
        });
    }, [departmentId, orgId, principalUserId, viewScopeFingerprint, selectedSiteId]);

    const setGlobalAssistantWorkspaceScope = globalAssistant?.setWorkspaceScope;
    useEffect(() => {
        if (!setGlobalAssistantWorkspaceScope || !departmentId) return;
        setGlobalAssistantWorkspaceScope({
            department_id: departmentId,
            department_name: dept?.name ?? null,
        });
        return () => setGlobalAssistantWorkspaceScope(null);
    }, [setGlobalAssistantWorkspaceScope, departmentId, dept?.name]);

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

    useEffect(() => {
        if (!departmentId) return;
        resetRouteShellTrace("department");
        registerRouteLoadingOwner("department", "page");
        markRouteShellVisible("department", { departmentId });
        return () => unregisterRouteLoadingOwner("department", "page");
    }, [departmentId]);

    /** Workflow panels — far off critical path; never compete with dept bootstrap. */
    useEffect(() => {
        if (!departmentId || deptLoading || !dept?.id || deptWorkUnits === null) return;
        return scheduleAdminV2BackgroundWork(
            () => {
                if (!isAdminV2OperNavigationActive(12_000)) void refreshWorkflowPanels();
            },
            { idleTimeoutMs: 10_000, fallbackMs: 4000 }
        );
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
        enrollmentRightRailPrefetchRef.current = null;
        const tAnchor =
            typeof performance !== "undefined" && typeof window !== "undefined" ? performance.now() : 0;
        if (!seededDeptShellRef.current) {
            setDeptLoading(true);
        }
        setDeptError(null);
        setDeptWorkUnitsError(null);
        setDeptLifecycleWuDebug(null);
        setDeptQueueSummariesLoading(true);
        setDeptQueueSummariesError(null);
        setDeptAttentionBuckets(null);
        setDeptAttentionBucketsLoading(false);
        setDeptAttentionBucketsError(null);
        setDeptAttentionPreviewTotal(null);
        setDeptAttentionSemantics(null);
        setDeptBucketCountScope(null);
        setEnrollmentDeptRightRail(null);
        setDeptThroughputPresentation(null);
        setDeptOperPanelTitleLocked("Work Unit Queue");
        setDeptPipelineExecSurface(null);
        setDeptPipelineExecLoading(false);
        setDeptPlacementRows(undefined);
        setDeptScopeHasPlacements(false);

        const init = workspaceDataFetchInit() ?? {};
        const cacheHit =
            orgId && departmentId
                ? readDepartmentPageCache(orgId, departmentId, principalUserId, viewScopeFingerprint)
                : null;
        const cacheWuList =
            cacheHit && cacheHit.dept.id === departmentId ? (cacheHit.workUnits ?? []) : [];
        const cacheNaWuId =
            cacheWuList.find((w) => (w.key ?? "").trim().toLowerCase() === "needs_attention")?.id ?? null;

        const railWuFromCache = resolveDeptRightRailWorkUnitId(cacheWuList, isLifecycleStageWorkUnitRow);
        const bootstrapQs = new URLSearchParams({
            include_previews: "false",
            count_mode: "exact",
            summary_mode: "priority",
            priority_budget: "5",
        });
        if (railWuFromCache) bootstrapQs.set("right_rail_work_unit_id", railWuFromCache);
        const bootstrapRoute = appendWorkspaceSiteToUrl(
            `/api/admin/departments/${encodeURIComponent(departmentId)}/operational-bootstrap?${bootstrapQs.toString()}`,
            selectedSiteId
        );
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
            }
            setDeptWorkUnitSummaries(next);
            setDeptQueueSummariesError(null);
            return next;
        };

        const applyAttentionPayload = (j: {
            error?: string;
            total?: number;
            needs_attention_buckets?: DeptAttentionBucket[];
            opportunity_needs_attention_semantics?: DeptAttentionSemantics | null;
            bucket_count_scope?: string | null;
        }) => {
            const buckets = Array.isArray(j.needs_attention_buckets) ? j.needs_attention_buckets : [];
            setDeptAttentionBuckets(buckets);
            setDeptAttentionPreviewTotal(typeof j.total === "number" ? j.total : null);
            setDeptAttentionSemantics(j.opportunity_needs_attention_semantics ?? null);
            setDeptBucketCountScope(typeof j.bucket_count_scope === "string" ? j.bucket_count_scope : null);
            setDeptAttentionBucketsError(null);
        };

        let pipelineProbeStarted = false;

        async function runDeptPipelineProbe(
            wuCommit: Array<{ id: string; name: string | null; key: string | null }>
        ) {
            if (deptUsesBuilderOwnedLifecycleRuntime(dept?.metadata, wuCommit)) {
                if (!cancelled) {
                    setDeptPipelineExecSurface(null);
                    setDeptPipelineExecLoading(false);
                }
                return;
            }
            const pipelineCandidates = wuCommit.filter(
                (w) => (w.key ?? "").trim().toLowerCase() !== "needs_attention"
            );
            if (!pipelineCandidates.length) {
                if (!cancelled) {
                    setDeptPipelineExecSurface(null);
                    setDeptPipelineExecLoading(false);
                }
                return;
            }
            if (pipelineProbeStarted) return;
            pipelineProbeStarted = true;
            if (!cancelled) setDeptPipelineExecLoading(true);
            try {
                const enroll = pipelineCandidates.find(
                    (w) => (w.key ?? "").trim().toLowerCase() === "enrollment_pipeline"
                );
                const detailMap = new Map<
                    string,
                    { queue_definition?: unknown; department_id?: string | null }
                >();
                if (enroll) {
                    const detailRes = await dedupeAdminFetch(
                        `/api/admin/work-units/${encodeURIComponent(enroll.id)}`,
                        init
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
                    init,
                    workUnitDetailById: detailMap,
                });
                if (!cancelled) setDeptPipelineExecSurface(surface);
            } catch {
                if (!cancelled) setDeptPipelineExecSurface(null);
            } finally {
                if (!cancelled) setDeptPipelineExecLoading(false);
            }
        }

        async function fetchDeptAttentionPreview(naWuId: string | null) {
            if (cancelled) return;
            setDeptAttentionBucketsLoading(true);
            setDeptAttentionBucketsError(null);
            try {
                const baseUrl = `/api/admin/departments/${encodeURIComponent(departmentId)}/opportunity-attention-preview`;
                const url =
                    naWuId != null
                        ? `${baseUrl}?work_unit_id=${encodeURIComponent(naWuId)}`
                        : baseUrl;
                const res = await dedupeAdminFetch(url, init);
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
                applyAttentionPayload(j);
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
        }

        async function refreshQueueSummaries(deptCommit: DeptRow | null, wuCommit: Array<{ id: string; name: string | null; key: string | null }>) {
            if (cancelled) return;
            try {
                const sumRes = await dedupeAdminFetchWithTtl(summariesRoute, init, LIFECYCLE_SIBLING_FETCH_TTL_MS).catch(
                    () => null as Response | null,
                );
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
                    writeDepartmentPageCache(orgId, principalUserId, viewScopeFingerprint, {
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

        const runDeferredKpiPlacements = () => {
            const placementT0 =
                typeof performance !== "undefined" && typeof window !== "undefined" ? performance.now() : 0;
            const placementUrl = `/api/admin/workspace-kpi-placements?surface=department&department_id=${encodeURIComponent(departmentId)}`;
            let placementP: ReturnType<typeof dedupeAdminFetchWithTtl> | undefined;
            const cancelPlacementDefer = scheduleAdminV2BackgroundWork(
                () => {
                    placementP = dedupeAdminFetchWithTtl(
                        placementUrl,
                        { ...(init ?? {}), cache: "no-store" },
                        8000
                    );
                },
                { idleTimeoutMs: 3000, fallbackMs: 120 }
            );
            void (async () => {
                if (cancelled) return;
                cancelPlacementDefer();
                try {
                    const res = await (placementP ??
                        dedupeAdminFetchWithTtl(placementUrl, { ...(init ?? {}), cache: "no-store" }, 8000));
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
                            // Persist KPI placements into session cache so the next warm navigation
                            // can restore them immediately without waiting for the bootstrap.
                            if (orgId) {
                                const existing = readDepartmentPageCache(
                                    orgId,
                                    departmentId,
                                    principalUserId,
                                    viewScopeFingerprint
                                );
                                if (existing && existing.dept.id === departmentId) {
                                    writeDepartmentPageCache(orgId, principalUserId, viewScopeFingerprint, {
                                        dept: existing.dept,
                                        workUnits: existing.workUnits,
                                        workUnitSummaries: existing.workUnitSummaries,
                                        summariesComplete: existing.summariesComplete,
                                        attentionBuckets: existing.attentionBuckets ?? null,
                                        attentionPreviewTotal: existing.attentionPreviewTotal ?? null,
                                        kpiPlacementRows: j.items ?? null,
                                        kpiScopeHasPlacements: j.scope_has_placements === true,
                                    });
                                }
                            }
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
            })();
        };

        void (async () => {
            markDeptRevealGateStart({ departmentId });
            setAdminV2PrimarySurfacePending(true, "department_bootstrap_effect");
            const routeStart = typeof performance !== "undefined" ? performance.now() : 0;
            if (typeof performance !== "undefined" && typeof window !== "undefined") {
                alloyPerfSet("department_start", routeStart);
            }
            setDeptAttentionBucketsLoading(true);
            try {
                deptKpisPerfKeyRef.current = null;
                if (!cancelled) {
                    setDeptPlacementRows(undefined);
                    setDeptScopeHasPlacements(false);
                }

                const cachePipelineCandidates = cacheWuList.filter(
                    (w) => (w.key ?? "").trim().toLowerCase() !== "needs_attention"
                );
                if (cachePipelineCandidates.length && !cancelled) {
                    setDeptPipelineExecLoading(true);
                }

                try {
                    const bootstrapClientT0 =
                        typeof performance !== "undefined" ? performance.now() : 0;
                    const bootstrapMeta = await dedupeAdminFetchWithTtlMeta(
                        bootstrapRoute,
                        init,
                        ADMINV2_ABOVE_FOLD_CACHE_TTL_MS.dept_above_fold
                    );
                    const bootstrapRes = bootstrapMeta.response;
                    if (!bootstrapRes.ok && !cancelled) {
                        logAdminV2LegacyFanOut({
                            surface: "department",
                            reason: "bootstrap_unavailable",
                            departmentId,
                            status: bootstrapRes.status,
                        });
                    }
                    if (bootstrapRes.ok && !cancelled) {
                        const parseT0 = typeof performance !== "undefined" ? performance.now() : 0;
                        const rawBootstrap = (await bootstrapRes.json().catch(() => ({}))) as Record<string, unknown>;
                        const parseT1 = typeof performance !== "undefined" ? performance.now() : 0;
                        const { payload: peeled, serverPerf } = peelBootstrapServerPerf(rawBootstrap);
                        const applyT0 = typeof performance !== "undefined" ? performance.now() : 0;
                        const b = peeled as {
                            error?: string;
                            department?: { id?: string; name?: string | null; key?: string | null };
                            work_units?: Array<{ id: string; name?: string | null; key?: string | null }>;
                            summaries?: Parameters<typeof applySummariesJson>[1];
                            attention?: Parameters<typeof applyAttentionPayload>[0];
                            pipeline_surface?: DeptPipelineExecSurface | null;
                            lifecycle_work_unit_runtime?: LifecycleWorkUnitDeptRuntimeDebug | null;
                            kpi_placements?: {
                                items?: WorkspaceKpiPlacementRow[];
                                scope_has_placements?: boolean;
                            };
                            right_rail_actions?: ResolvedActionForClient[];
                        };
                        try {
                            const payloadBytes = new TextEncoder().encode(JSON.stringify(b)).length;
                            recordBootstrapPayloadBytes("department", payloadBytes);
                            logPrefetchAdminV2(
                                "department",
                                bootstrapMeta.cache_hit
                                    ? "hit"
                                    : bootstrapMeta.inflight_join
                                      ? "inflight_join"
                                      : "miss",
                                {
                                    department_id: departmentId,
                                    url: bootstrapRoute,
                                    payload_kb: Math.round((payloadBytes / 1024) * 10) / 10,
                                }
                            );
                        } catch {
                            /* non-fatal */
                        }
                        const deptCommit =
                            b.department?.id != null
                                ? {
                                      id: String(b.department.id),
                                      name: b.department.name ?? null,
                                      key: b.department.key ?? null,
                                      metadata: (b.department as { metadata?: unknown }).metadata,
                                  }
                                : null;
                        const wuCommit = mapDeptWorkUnitRows(b.work_units ?? []);
                        if (deptCommit) {
                            setDept(deptCommit);
                            setDeptError(null);
                        } else {
                            setDept(null);
                            setDeptError("Department not found");
                        }
                        setDeptWorkUnits(wuCommit);
                        setDeptWorkUnitsError(null);
                        setDeptLifecycleWuDebug(b.lifecycle_work_unit_runtime ?? null);
                        const nextSummaries = applySummariesJson(departmentId, b.summaries ?? {}, true);
                        if (b.attention && !b.attention.error) {
                            applyAttentionPayload(b.attention);
                        } else {
                            setDeptAttentionBuckets([]);
                            setDeptAttentionPreviewTotal(null);
                            setDeptAttentionSemantics(null);
                            setDeptBucketCountScope(null);
                            setDeptAttentionBucketsError(b.attention?.error ?? null);
                        }
                        const pipelineCandidates = wuCommit.filter(
                            (w) => (w.key ?? "").trim().toLowerCase() !== "needs_attention"
                        );
                        const bootstrapBuilderOwned = deptUsesBuilderOwnedLifecycleRuntime(
                            (b.department as { metadata?: unknown } | undefined)?.metadata,
                            wuCommit
                        );
                        if (pipelineCandidates.length && !bootstrapBuilderOwned) {
                            setDeptPipelineExecLoading(true);
                        }
                        setDeptPipelineExecSurface(
                            bootstrapBuilderOwned ? null : (b.pipeline_surface ?? null)
                        );
                        setDeptPipelineExecLoading(false);
                        const kpiSummaries = mergeDeptWorkUnitSummariesForKpis(
                            nextSummaries,
                            synthesizeDeptKpiWorkUnitSummaries({
                                departmentId,
                                workUnits: wuCommit,
                                attention: b.attention,
                                pipelineSurface: b.pipeline_surface ?? null,
                            })
                        );
                        setDeptWorkUnitSummaries(kpiSummaries);
                        setDeptQueueSummariesLoading(false);
                        setDeptAttentionBucketsLoading(false);
                        setDeptLoading(false);
                        if (b.kpi_placements) {
                            setDeptPlacementRows(b.kpi_placements.items ?? []);
                            setDeptScopeHasPlacements(b.kpi_placements.scope_has_placements === true);
                            if (
                                typeof performance !== "undefined" &&
                                typeof window !== "undefined" &&
                                deptKpisPerfKeyRef.current !== departmentId
                            ) {
                                deptKpisPerfKeyRef.current = departmentId;
                                perfDeptLoad({
                                    phase: "kpis_ready",
                                    ms: Math.round((typeof performance !== "undefined" ? performance.now() : 0) - tAnchor),
                                    source: "network",
                                    org_id: orgId,
                                    department_id: departmentId,
                                });
                            }
                        }
                        if (Array.isArray(b.right_rail_actions)) {
                            enrollmentRightRailPrefetchRef.current = b.right_rail_actions;
                            setEnrollmentDeptRightRail(b.right_rail_actions);
                            setEnrollmentDeptActionsSettled(true);
                        } else if (
                            !departmentReservesOperationalActionsRail({
                                departmentKey: deptCommit?.key,
                                departmentMetadata: deptCommit?.metadata,
                                workUnits: wuCommit,
                            })
                        ) {
                            setEnrollmentDeptActionsSettled(true);
                        }
                        if (orgId && deptCommit) {
                            writeDepartmentPageCache(orgId, principalUserId, viewScopeFingerprint, {
                                dept: deptCommit,
                                workUnits: wuCommit,
                                workUnitSummaries: kpiSummaries,
                                summariesComplete: true,
                                // Persist attention for warm-navigation reveal without blocking on bootstrap.
                                attentionBuckets: Array.isArray(b.attention?.needs_attention_buckets)
                                    ? b.attention!.needs_attention_buckets
                                    : null,
                                attentionPreviewTotal: typeof b.attention?.total === "number"
                                    ? b.attention!.total
                                    : null,
                                // Persist KPI placements so deptRevealKpiStripReady passes from cache.
                                kpiPlacementRows: b.kpi_placements?.items ?? null,
                                kpiScopeHasPlacements: b.kpi_placements?.scope_has_placements ?? false,
                            });
                        }
                        perfDeptLoad({
                            phase: "bootstrap_ready",
                            ms: Math.round((typeof performance !== "undefined" ? performance.now() : 0) - tAnchor),
                            source: "network",
                            org_id: orgId,
                            department_id: departmentId,
                        });
                        markRouteBootstrapReturned("department", { departmentId });
                        perfDeptLoad({
                            phase: "shell_ready",
                            ms: Math.round((typeof performance !== "undefined" ? performance.now() : 0) - tAnchor),
                            source: "network",
                            org_id: orgId,
                            department_id: departmentId,
                        });
                        perfDeptLoad({
                            phase: "summaries_ready",
                            ms: Math.round((typeof performance !== "undefined" ? performance.now() : 0) - tAnchor),
                            source: "network",
                            org_id: orgId,
                            department_id: departmentId,
                        });
                        if (deptCommit && !b.kpi_placements) {
                            runDeferredKpiPlacements();
                        } else if (deptCommit && b.kpi_placements) {
                            logAdminV2DuplicateFetchSuppressed({
                                surface: "department",
                                fetch: "kpi_placements",
                                reason: "bootstrap_included_kpi_placements",
                                departmentId,
                            });
                        }
                        const applyT1 = typeof performance !== "undefined" ? performance.now() : 0;
                        logDeptBootstrapBreakdown({
                            departmentId,
                            serverPerf,
                            client: {
                                client_fetch_ttfb_ms:
                                    bootstrapClientT0 > 0 && parseT0 > 0 ? parseT0 - bootstrapClientT0 : undefined,
                                client_json_parse_ms:
                                    parseT0 > 0 && parseT1 > 0 ? parseT1 - parseT0 : undefined,
                                client_state_apply_ms:
                                    applyT0 > 0 && applyT1 > 0 ? applyT1 - applyT0 : undefined,
                                client_total_ms:
                                    bootstrapClientT0 > 0 && applyT1 > 0 ? applyT1 - bootstrapClientT0 : undefined,
                                cache_hit: bootstrapMeta.cache_hit,
                                inflight_join: bootstrapMeta.inflight_join,
                                payload_bytes: new TextEncoder().encode(JSON.stringify(peeled)).length,
                            },
                            duplicate_fetch_guard:
                                deptCommit && b.kpi_placements ? "kpi_placements_in_bootstrap" : null,
                        });
                        if (typeof performance !== "undefined" && typeof window !== "undefined") {
                            alloyPerfSet("department_ready", performance.now());
                        }
                        return;
                    }
                } catch {
                    if (!cancelled) {
                        logAdminV2LegacyFanOut({
                            surface: "department",
                            reason: "bootstrap_error",
                            departmentId,
                        });
                    }
                    /* fall through to legacy fan-out */
                }

                /** Legacy fan-out when bootstrap unavailable — no parallel bootstrap work. */
                const summariesFetchPromise = refreshQueueSummaries(null, []);

                const deptRoute = `/api/admin/departments/${encodeURIComponent(departmentId)}`;
                const wuRoute = `/api/admin/work-units?department_id=${encodeURIComponent(departmentId)}`;
                const [deptRes, wuRes] = await Promise.all([
                    dedupeAdminFetch(deptRoute, init),
                    dedupeAdminFetch(wuRoute, init),
                ]);
                void summariesFetchPromise;

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
                    wuCommit = mapDeptWorkUnitRows(wuJson.items ?? []);
                    const pipelineCandidatesEarly = wuCommit.filter(
                        (w) => (w.key ?? "").trim().toLowerCase() !== "needs_attention"
                    );
                    if (pipelineCandidatesEarly.length) {
                        setDeptPipelineExecLoading(true);
                    }
                    setDeptWorkUnits(wuCommit);
                    setDeptWorkUnitsError(null);
                }

                if (orgId && deptCommit) {
                    writeDepartmentPageCache(orgId, principalUserId, viewScopeFingerprint, {
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
                    void runDeptPipelineProbe(wuCommit);

                    const naWu = wuCommit.find((w) => (w.key ?? "").trim().toLowerCase() === "needs_attention");
                    const naWuId = naWu?.id ?? cacheNaWuId ?? null;
                    void fetchDeptAttentionPreview(naWuId);

                    runDeferredKpiPlacements();
                } else if (!cancelled) {
                    setDeptQueueSummariesLoading(false);
                    setDeptAttentionBuckets([]);
                    setDeptAttentionBucketsLoading(false);
                }

                if (typeof performance !== "undefined" && typeof window !== "undefined") {
                    alloyPerfSet("department_ready", performance.now());
                    markRouteBootstrapReturned("department", { departmentId, path: "legacy_fanout" });
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
                    setDeptAttentionBuckets([]);
                    setDeptAttentionBucketsLoading(false);
                    setDeptLoading(false);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [departmentId, orgId, principalUserId, viewScopeFingerprint, selectedSiteId]);

    /** Full cold shell only until department identity exists — revisit/cache keeps bridge chrome (shell-first). */
    const departmentPageBlockingLoad = useMemo(() => {
        if (!departmentId) return false;
        return deptLoading && !dept?.id;
    }, [departmentId, deptLoading, dept?.id]);

    const builderOwnedLifecycleRuntime = useMemo(
        () => deptUsesBuilderOwnedLifecycleRuntime(dept?.metadata, deptWorkUnits ?? []),
        [dept?.metadata, deptWorkUnits]
    );

    const deptExpectsPipelineLanes = useMemo(() => {
        if (builderOwnedLifecycleRuntime) return false;
        const list = deptWorkUnits ?? [];
        if (!list.length) return false;
        return list.some((w) => (w.key ?? "").trim().toLowerCase() === "enrollment_pipeline");
    }, [deptWorkUnits, builderOwnedLifecycleRuntime]);

    useEffect(() => {
        setDeptThroughputPresentation(null);
        setDeptOperPanelTitleLocked("Work Unit Queue");
    }, [departmentId, selectedSiteId]);

    /** Decide throughput row family before oper region reveal (pipeline lanes vs per-WU summaries). */
    useEffect(() => {
        if (!departmentId || !dept?.id || departmentPageBlockingLoad) return;
        if (deptThroughputPresentation != null) {
            const canUpgradeToPipeline =
                !builderOwnedLifecycleRuntime &&
                deptThroughputPresentation === "wu_summaries" &&
                deptExpectsPipelineLanes &&
                !deptPipelineExecLoading &&
                Boolean(deptPipelineExecSurface?.lanes?.length);
            if (!canUpgradeToPipeline) return;
        }
        if (deptWorkUnits === null) {
            if (deptWorkUnitsError) {
                setDeptThroughputPresentation("empty");
                setDeptOperPanelTitleLocked("Work Unit Queue");
            }
            return;
        }

        const list = deptWorkUnits;
        if (!list.length) {
            setDeptThroughputPresentation("empty");
            setDeptOperPanelTitleLocked("Work Unit Queue");
            return;
        }

        if (deptExpectsPipelineLanes) {
            if (deptPipelineExecLoading) return;
            if (deptPipelineExecSurface?.lanes?.length) {
                setDeptThroughputPresentation("pipeline_lanes");
                const pipelineWu = (deptWorkUnits ?? []).find(
                    (w) => w.id === deptPipelineExecSurface.workUnitId
                );
                const panelLabel = pipelineWu
                    ? resolveDeptWorkUnitDisplayLabel(pipelineWu)
                    : deptPipelineExecSurface.panelTitle?.trim() || "Work Unit Queue";
                setDeptOperPanelTitleLocked(panelLabel);
                return;
            }
            if (deptQueueSummariesLoading) return;
            setDeptThroughputPresentation("wu_summaries");
            setDeptOperPanelTitleLocked("Work Unit Queue");
            return;
        }

        if (deptQueueSummariesLoading) return;
        setDeptThroughputPresentation("wu_summaries");
        setDeptOperPanelTitleLocked("Work Unit Queue");
    }, [
        departmentId,
        dept?.id,
        departmentPageBlockingLoad,
        deptThroughputPresentation,
        deptWorkUnits,
        deptExpectsPipelineLanes,
        deptPipelineExecLoading,
        deptPipelineExecSurface,
        deptQueueSummariesLoading,
        deptWorkUnitsError,
    ]);

    const deptThroughputWuRows = useMemo(() => {
        const list = (deptWorkUnits ?? []) as DeptWorkUnitListRow[];
        const sorted = lifecycleDeptThroughputWorkUnits(list, builderOwnedLifecycleRuntime);
        // P1 — re-sort by canonical /settings/lifecycle stage order (sync-independent of work_units.sort_order).
        return sortByLifecycleStageOrder(sorted, buildLifecycleStageOrderIndex(dept?.metadata));
    }, [deptWorkUnits, builderOwnedLifecycleRuntime, dept?.metadata]);

    /** Throughput panel has real rows or a confirmed final empty — not an unresolved blank list (PERF-B-02 tighten). */
    const deptThroughputBodyReady = useMemo(() => {
        if (!dept || departmentPageBlockingLoad) return false;
        if (deptWorkUnits === null) return Boolean(deptWorkUnitsError);
        if (!deptThroughputPresentation) return false;

        if (deptThroughputPresentation === "empty") {
            return deptThroughputWuRows.length === 0;
        }

        if (deptThroughputPresentation === "pipeline_lanes") {
            return Boolean(deptPipelineExecSurface?.lanes?.length);
        }

        if (deptQueueSummariesLoading && !deptQueueSummariesError) return false;
        if (deptWorkUnitsError || deptQueueSummariesError) return true;
        if (deptThroughputWuRows.length === 0) return true;

        return deptThroughputWuRows.every((wu) => {
            const s = deptWorkUnitSummaries[wu.id];
            return s !== undefined && !deptQueueSummariesLoading;
        });
    }, [
        dept,
        departmentPageBlockingLoad,
        deptWorkUnits,
        deptThroughputPresentation,
        deptThroughputWuRows,
        deptPipelineExecSurface,
        deptQueueSummariesLoading,
        deptQueueSummariesError,
        deptWorkUnitsError,
        deptWorkUnitSummaries,
    ]);

    /** Needs Attention: fetch settled with a definitive buckets array (empty allowed) — not `null` while unresolved. */
    const deptAttentionBodyReady = useMemo(() => {
        if (!dept || departmentPageBlockingLoad) return false;
        if (deptWorkUnits === null) return deptWorkUnitsError != null;
        if (deptAttentionBucketsLoading) return false;
        if (deptAttentionBucketsError) return true;
        return deptAttentionBuckets !== null;
    }, [
        dept,
        departmentPageBlockingLoad,
        deptWorkUnits,
        deptAttentionBucketsLoading,
        deptAttentionBucketsError,
        deptAttentionBuckets,
        deptWorkUnitsError,
    ]);

    const deptOperationalSurfaceReady =
        deptThroughputBodyReady && deptAttentionBodyReady && deptThroughputPresentation != null;

    const deptWorkUnitsResolved = deptWorkUnits !== null || deptWorkUnitsError != null;

    const deptPipelineProbeSettled = !deptExpectsPipelineLanes || !deptPipelineExecLoading;

    const deptShellReady = Boolean(departmentId && dept?.id && !departmentPageBlockingLoad);

    /** Gates Pipeline + Needs Attention for coordinated dept above-fold reveal. */
    const deptOperationalRegionReady = useMemo(() => {
        if (!deptShellReady) return false;
        if (!deptWorkUnitsResolved) return false;
        if (!deptPipelineProbeSettled) return false;
        if (!deptOperationalSurfaceReady) return false;
        if (
            deptExpectsPipelineLanes &&
            Boolean(deptPipelineExecSurface?.lanes?.length) &&
            deptThroughputPresentation !== "pipeline_lanes"
        ) {
            return false;
        }
        return true;
    }, [
        deptShellReady,
        deptWorkUnitsResolved,
        deptPipelineProbeSettled,
        deptOperationalSurfaceReady,
        deptExpectsPipelineLanes,
        deptPipelineExecSurface,
        deptThroughputPresentation,
    ]);

    const deptLifecycleWuRows = useMemo(
        () => (deptWorkUnits ?? []).filter((w) => isLifecycleStageWorkUnitRow(w)),
        [deptWorkUnits]
    );

    const deptBuilderOwnedNoLifecycleWu =
        builderOwnedLifecycleRuntime &&
        deptWorkUnits !== null &&
        !deptWorkUnitsError &&
        deptLifecycleWuRows.length === 0;

    const deptConfirmedNoWorkUnits =
        !builderOwnedLifecycleRuntime &&
        deptWorkUnits !== null &&
        deptWorkUnits.length === 0 &&
        !deptWorkUnitsError;

    const reserveDeptActionsRail = departmentReservesOperationalActionsRail({
        departmentKey: deptKey,
        departmentMetadata: dept?.metadata,
        workUnits: deptWorkUnits ?? [],
    });

    const deptRevealGate = useMemo(() => {
        const shell_ready = deptRevealShellReady({
            department_id: departmentId,
            department_loaded: Boolean(dept?.id),
            bootstrap_loading: departmentPageBlockingLoad,
        });
        const work_units_ready = deptRevealWorkUnitsReady({ work_units_resolved: deptWorkUnitsResolved });
        const kpi_strip_ready = deptRevealKpiStripReady({
            placement_rows_defined: deptPlacementRows !== undefined,
        });
        const actions_ready = deptRevealActionsReady({
            reserve_actions_rail: reserveDeptActionsRail,
            enrollment_actions_settled: enrollmentDeptActionsSettled,
        });
        return computeDeptRevealGate({
            shell_ready,
            work_units_ready,
            operational_region_ready: deptOperationalRegionReady,
            kpi_strip_ready,
            actions_ready,
        });
    }, [
        departmentId,
        dept?.id,
        departmentPageBlockingLoad,
        deptWorkUnitsResolved,
        deptPlacementRows,
        reserveDeptActionsRail,
        enrollmentDeptActionsSettled,
        deptOperationalRegionReady,
    ]);

    const deptAboveFoldPageReady = deptRevealGate.above_fold_ready;

    useEffect(() => {
        markDeptRevealGatePhases(deptRevealGate, { departmentId });
    }, [deptRevealGate, departmentId]);

    useEffect(() => {
        if (!deptAboveFoldPageReady) return;
        markRouteFirstAboveFoldStable("department", { departmentId, source: "reveal_gate" });
    }, [deptAboveFoldPageReady, departmentId]);

    useEffect(() => {
        if (!deptAboveFoldPageReady || !departmentId) return;
        const cancel = scheduleAdminV2BackgroundWork(
            () => {
                const hrefs = deptThroughputWuRows.slice(0, 3).map((wu) =>
                    appendWorkspaceSiteToPath(
                        workspaceDeptQueueNavHref(WORKSPACE_BASE, departmentId, wu.id, null),
                        selectedSiteId
                    )
                );
                prefetchVisibleWorkUnitBootstrapsFromDept({
                    departmentId,
                    hrefs,
                    selectedSiteId,
                    reason: "dept_idle_visible",
                });
            },
            { idleTimeoutMs: 2000, fallbackMs: 450 }
        );
        return cancel;
    }, [deptAboveFoldPageReady, departmentId, deptThroughputWuRows, selectedSiteId]);

    const lifecycleRailWorkUnitId = useMemo(() => {
        if (!builderOwnedLifecycleRuntime) return null;
        return resolveDeptRightRailWorkUnitId(deptWorkUnits ?? [], isLifecycleStageWorkUnitRow) || null;
    }, [builderOwnedLifecycleRuntime, deptWorkUnits]);

    /** Department / lifecycle rail — parallel with oper region. */
    useEffect(() => {
        const railWuId = builderOwnedLifecycleRuntime
            ? lifecycleRailWorkUnitId
            : isEnrollmentLikeDepartmentKey(deptKey)
              ? primaryWorkUnit?.id ?? null
              : lifecycleRailWorkUnitId ?? primaryWorkUnit?.id ?? null;
        if (!departmentId) return;
        if (!deptWorkUnitsResolved) return;
        if (!railWuId) {
            setEnrollmentDeptRightRail([]);
            setEnrollmentDeptActionsSettled(true);
            return;
        }

        const prefetched = enrollmentRightRailPrefetchRef.current;
        if (prefetched) {
            enrollmentRightRailPrefetchRef.current = null;
            setEnrollmentDeptRightRail(prefetched);
            setEnrollmentDeptActionsSettled(true);
            return;
        }

        if (enrollmentDeptActionsSettled && enrollmentDeptRightRail !== null) return;

        let cancelled = false;
        void fetchWorkspaceRightRailResolvedActions({
            departmentId,
            workUnitId: railWuId,
            fetchInit: workspaceDataFetchInit() ?? {},
            placementSurfaces: ["department"],
        })
            .then((list) => {
                if (!cancelled) setEnrollmentDeptRightRail(Array.isArray(list) ? list : []);
            })
            .catch(() => {
                if (!cancelled) setEnrollmentDeptRightRail([]);
            })
            .finally(() => {
                if (!cancelled) setEnrollmentDeptActionsSettled(true);
            });
        return () => {
            cancelled = true;
        };
    }, [
        departmentId,
        primaryWorkUnit?.id,
        builderOwnedLifecycleRuntime,
        lifecycleRailWorkUnitId,
        deptWorkUnitsResolved,
        enrollmentDeptActionsSettled,
        enrollmentDeptRightRail,
        reserveDeptActionsRail,
        deptKey,
    ]);

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
        if (!reserveDeptActionsRail) return null;
        return mergeEnrollmentRightRailActions(enrollmentDeptRightRail ?? [], {
            primaries: [],
            systemActions: [],
            quickOperations: [],
            overflow: [],
        });
    }, [reserveDeptActionsRail, enrollmentDeptRightRail]);

    const enrollmentDepartmentActionCount = useMemo(() => {
        if (!enrollmentDepartmentRailModel) return null;
        return countActionsVm(enrollmentDepartmentRailModel, "department");
    }, [enrollmentDepartmentRailModel]);

    const enrollmentRightRailByKey = useMemo(() => {
        const m = new Map<string, ResolvedActionForClient>();
        for (const a of enrollmentDeptRightRail ?? []) m.set(a.key, a);
        return m;
    }, [enrollmentDeptRightRail]);

    const kpis = useMemo(() => {
        const wuList = deptKpiWorkUnitsForLifecycleVisibility(
            deptWorkUnits ?? [],
            builderOwnedLifecycleRuntime,
            isLifecycleStageWorkUnitRow
        );
        if (deptPlacementRows === undefined) {
            return [];
        }
        const items = resolveKpisForDepartment({
            placementRows: deptPlacementRows,
            scopeHasPlacementRows: deptScopeHasPlacements,
            departmentSurface: "department",
            deptWorkUnits: wuList,
            deptWorkUnitSummaries,
            deptQueueSummariesLoading,
            deptQueueSummariesError,
        }).items;
        return items;
    }, [
        deptPlacementRows,
        deptScopeHasPlacements,
        deptQueueSummariesError,
        deptQueueSummariesLoading,
        deptWorkUnitSummaries,
        deptWorkUnits,
        builderOwnedLifecycleRuntime,
    ]);

    const needsAttentionSummary = useMemo(() => {
        const list = deptWorkUnits ?? [];
        const explicitNeedsAttentionWu = list.find((w) => (w.key ?? "").trim().toLowerCase() === "needs_attention") ?? null;
        const targetWu = explicitNeedsAttentionWu ?? list[0] ?? null;
        const hrefRaw =
            targetWu != null
                ? `${WORKSPACE_BASE}/dept/${encodeURIComponent(departmentId)}/work-unit/${encodeURIComponent(targetWu.id)}?queue=needs_attention`
                : `${WORKSPACE_BASE}/dept/${encodeURIComponent(departmentId)}`;
        const href = appendWorkspaceSiteToPath(hrefRaw, selectedSiteId);
        return {
            href,
            targetWuId: targetWu?.id ?? null,
            needsAttentionWorkUnitId: explicitNeedsAttentionWu?.id ?? null,
        };
    }, [departmentId, deptWorkUnits, selectedSiteId]);

    const needsAttentionHref = needsAttentionSummary.href;

    useEffect(() => {
        const onOpenCreateLead = (ev: Event) => {
            const detail = (ev as CustomEvent<{ department_id?: string | null }>).detail;
            if (detail?.department_id && detail.department_id !== departmentId) return;
            setCreateLeadOpen(true);
        };
        window.addEventListener("adminv2:open-create-lead", onOpenCreateLead);
        return () => window.removeEventListener("adminv2:open-create-lead", onOpenCreateLead);
    }, [departmentId]);

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
                    openCreateLead: () => setCreateLeadOpen(true),
                    openScheduleTourRecordPicker,
                    departmentId,
                    workUnitId: lifecycleRailWorkUnitId ?? primaryWorkUnit?.id ?? null,
                    needsAttentionHref,
                    context: {
                        surface: "right_rail",
                        department_id: departmentId,
                        work_unit_id: lifecycleRailWorkUnitId ?? primaryWorkUnit?.id ?? null,
                    },
                });
                return;
            }
            window.alert("Coming next: This action is not configured yet.");
        },
        [
            departmentId,
            enrollmentRightRailByKey,
            needsAttentionHref,
            openDrawer,
            openScheduleTourRecordPicker,
            lifecycleRailWorkUnitId,
            primaryWorkUnit?.id,
            router,
        ]
    );

    const showPipelineLanes = deptThroughputPresentation === "pipeline_lanes";
    const showWuThroughputRows = deptThroughputPresentation === "wu_summaries";

    const throughputLaneBody = (
        <ul className="adminv2-ws-queue-list" role="list">
                    {deptWorkUnitsError ? (
                        <li className="adminv2-ws-wu-queue-item-wrap" role="listitem">
                            <div className="rounded-lg border border-admin-border bg-white/50 px-3 py-2 text-xs text-alloy-ember">
                                Failed to load work units: {deptWorkUnitsError}
                            </div>
                        </li>
                    ) : null}
                    {deptQueueSummariesError ? (
                        <li className="adminv2-ws-wu-queue-item-wrap" role="listitem">
                            <div className="rounded-lg border border-admin-border bg-white/50 px-3 py-2 text-xs text-alloy-ember">
                                {deptQueueSummariesError}
                            </div>
                        </li>
                    ) : null}
                    {showPipelineLanes ? (
                        <>
                            {deptPipelineExecSurface!.lanes.map((lane) => {
                                const href = appendWorkspaceSiteToPath(
                                    workspaceDeptQueueNavHref(
                                        WORKSPACE_BASE,
                                        departmentId,
                                        deptPipelineExecSurface!.workUnitId,
                                        lane.key
                                    ),
                                    selectedSiteId
                                );
                                return (
                                    <li key={`pipe:${lane.key}`} className="adminv2-ws-wu-queue-item-wrap" role="listitem">
                                        <DeptOperConsoleQueueRow
                                            href={href}
                                            departmentId={departmentId}
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
                    ) : showWuThroughputRows ? (
                        <>
                            {deptThroughputWuRows.map((wu) => {
                                const s = deptWorkUnitSummaries[wu.id];
                                const total = s ? s.total : null;
                                const href = appendWorkspaceSiteToPath(
                                    workspaceDeptQueueNavHref(WORKSPACE_BASE, departmentId, wu.id, null),
                                    selectedSiteId
                                );
                                return (
                                    <li key={`wu:${wu.id}`} className="adminv2-ws-wu-queue-item-wrap" role="listitem">
                                        <DeptOperConsoleQueueRow
                                            href={href}
                                            departmentId={departmentId}
                                            title={`${resolveDeptWorkUnitDisplayLabel(wu)}. Total ${total ?? "—"}.`}
                                            label={resolveDeptWorkUnitDisplayLabel(wu)}
                                            iconKey={null}
                                            total={total}
                                            countsDeferred={false}
                                            variant="throughput"
                                        />
                                    </li>
                                );
                            })}
                        </>
                    ) : null}
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
                    {deptAttentionBuckets !== null &&
                    !deptAttentionBucketsError &&
                    sortedDeptAttentionBuckets.length === 0 ? (
                        <li className="adminv2-ws-wu-queue-item-wrap" role="listitem">
                            <div
                                className="rounded-lg border border-admin-border bg-white/50 px-3 py-3 text-xs text-alloy-midnight/60"
                                data-testid="dept-needs-attention-placeholder"
                            >
                                No needs attention rules configured
                            </div>
                        </li>
                    ) : null}
                    {sortedDeptAttentionBuckets.map((b) => {
                        const drillWuId =
                            needsAttentionSummary.needsAttentionWorkUnitId ?? needsAttentionSummary.targetWuId;
                        const drillBase =
                            drillWuId != null
                                ? appendWorkspaceSiteToPath(
                                      `${WORKSPACE_BASE}/dept/${encodeURIComponent(departmentId)}/work-unit/${encodeURIComponent(drillWuId)}`,
                                      selectedSiteId
                                  )
                                : needsAttentionHref;
                        const query =
                            drillWuId != null
                                ? `queue=needs_attention&attention_bucket=${encodeURIComponent(b.key)}`
                                : "";
                        const href =
                            query !== ""
                                ? `${drillBase}${drillBase.includes("?") ? "&" : "?"}${query}`
                                : drillBase;
                        return (
                            <li key={`attn:${b.key}`} className="adminv2-ws-wu-queue-item-wrap" role="listitem">
                                <DeptOperConsoleQueueRow
                                    href={href}
                                    departmentId={departmentId}
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
        <div data-adminv2-dept-oper-revealed="true">
            <WorkspacePairedOperPanelsGrid>
                <WorkspacePairedOperPanel
                    tone="throughput"
                    ariaLabel={deptOperPanelTitleLocked}
                    title={deptOperPanelTitleLocked}
                >
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

    const deptTitleForShell = dept?.name?.trim() || title;

    return (
        <WorkspaceChrome
            variant="bridge"
            breadcrumbs={[
                { href: appendWorkspaceSiteToPath(WORKSPACE_BASE, selectedSiteId), label: "Workspace" },
                {
                    href: appendWorkspaceSiteToPath(`${WORKSPACE_BASE}/dept/${departmentId}`, selectedSiteId),
                    label: title,
                },
            ]}
            title={title}
            subtitle=""
            data-route-shell-ready={deptAboveFoldPageReady ? "true" : "false"}
            {...(!deptAboveFoldPageReady
                ? { "data-dept-reveal-blocked": deptRevealGate.reason_if_blocked.join(",") }
                : {})}
        >
            {!dept && !departmentPageBlockingLoad ? (
                <div
                    className="rounded-xl border px-4 py-10 text-center text-sm text-alloy-ember/90"
                    style={{ borderColor: "var(--d-border, rgba(39,63,82,0.14))" }}
                >
                    {deptError ??
                        "This department could not be loaded. Use the workspace link above to pick another department."}
                </div>
            ) : dept && deptBuilderOwnedNoLifecycleWu ? (
                <div
                    className="rounded-xl border px-4 py-10 text-center text-sm text-alloy-midnight/55"
                    style={{ borderColor: "var(--d-border, rgba(39,63,82,0.14))" }}
                    data-testid="dept-builder-owned-lifecycle-empty"
                >
                    {(deptLifecycleWuDebug?.stage_work_unit_configs_count ?? 0) === 0 ? (
                        <>
                            <p>No Work Unit Queues have been configured yet.</p>
                            <p className="mt-3">
                                <a
                                    href={ADMIN_V2_SETTINGS_LIFECYCLE_PATH}
                                    className="font-medium text-alloy-pine hover:underline"
                                >
                                    Configure Lifecycle
                                </a>
                            </p>
                        </>
                    ) : (
                        <div className="mx-auto max-w-lg space-y-2 text-left">
                            <p className="text-center">
                                Lifecycle work unit queues are configured but could not be loaded for this
                                department.
                            </p>
                            {deptLifecycleWuDebug ? (
                                <ul
                                    className="mt-4 list-none space-y-1 rounded-lg bg-alloy-midnight/[0.04] px-4 py-3 font-mono text-xs text-alloy-midnight/70"
                                    data-testid="dept-lifecycle-wu-debug"
                                >
                                    <li>
                                        builder-owned department:{" "}
                                        {deptLifecycleWuDebug.builder_owned_department ? "yes" : "no"}
                                    </li>
                                    <li>stages found: {deptLifecycleWuDebug.active_stages_count}</li>
                                    <li>
                                        stage work unit configs found:{" "}
                                        {deptLifecycleWuDebug.stage_work_unit_configs_count}
                                    </li>
                                    <li>
                                        lifecycle_wu rows found: {deptLifecycleWuDebug.lifecycle_wu_rows_count}
                                    </li>
                                    <li>
                                        repair attempted:{" "}
                                        no (Settings repair only)
                                    </li>
                                    {deptLifecycleWuDebug.reason_no_work_units_rendered ? (
                                        <li>
                                            reason: {deptLifecycleWuDebug.reason_no_work_units_rendered}
                                        </li>
                                    ) : null}
                                </ul>
                            ) : null}
                            <p className="text-center">
                                <a
                                    href={ADMIN_V2_SETTINGS_LIFECYCLE_PATH}
                                    className="font-medium text-alloy-pine hover:underline"
                                >
                                    Configure Lifecycle
                                </a>
                            </p>
                        </div>
                    )}
                </div>
            ) : dept && deptConfirmedNoWorkUnits ? (
                <div
                    className="rounded-xl border px-4 py-10 text-center text-sm text-alloy-midnight/55"
                    style={{ borderColor: "var(--d-border, rgba(39,63,82,0.14))" }}
                >
                    No configured Work Unit UI was found for this department.
                </div>
            ) : !deptAboveFoldPageReady ? (
                <DeptPageLoadingGate departmentTitle={deptTitleForShell} />
            ) : (
                <DepartmentWorkspaceBridgeShell
                    briefTitle={deptTitleForShell}
                    departmentKey={deptKey}
                    briefSubtitle=""
                    signalsSlot={null}
                    kpiSlot={kpis.length ? <KPIBlock kpis={kpis} maxVisible={5} /> : null}
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
                                href="/admin/workflows"
                                onAskWorkflowAssist={askWorkflowAssist}
                            />
                        </div>
                    }
                    railSlot={
                        reserveDeptActionsRail && enrollmentDepartmentRailModel ? (
                            <WorkspaceCommandRailActionsSection
                                model={enrollmentDepartmentRailModel}
                                onAction={onEnrollmentDeptRailAction}
                                surface="department"
                                actionCount={enrollmentDepartmentActionCount}
                                title="Actions"
                                slotTestId="dept-above-fold-actions-rail"
                            />
                        ) : null
                    }
                />
            )}
            <CreateLeadCommandSurface
                open={createLeadOpen}
                departmentId={departmentId}
                workUnitId={primaryWorkUnit?.id ?? null}
                surface="right_rail"
                onClose={() => setCreateLeadOpen(false)}
                onRefresh={() => {
                    // Honor the success refresh contract: refresh this department's work-unit pill counts.
                    // The command surface already dispatches the canonical opportunity-queue event for any
                    // mounted work-unit view; router.refresh() catches this page's server-rendered counts.
                    router.refresh();
                }}
                onOpenCreatedRecord={(opportunityId) => {
                    // Canonical: open the new lead in the Work Unit Focus Panel — not the legacy drawer.
                    router.push(
                        resolveCreatedLeadFocusPanelHref({
                            recordId: opportunityId,
                            currentWorkUnitKey: primaryWorkUnit?.key ?? null,
                        }),
                    );
                }}
            />
            <WorkUnitScheduleTourRecordPickerModal
                open={scheduleTourPickerOpen}
                siteId={selectedSiteId}
                opportunityEntityLabel={getEntityLabel(entityLabels, "opportunities", "singular")}
                onDismiss={() => setScheduleTourPickerOpen(false)}
                onSelectOpportunityId={openScheduleTourForOpportunity}
            />
        </WorkspaceChrome>
    );
}
