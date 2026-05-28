"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { logAdminV2RouterNavigation, scheduleWorkUnitLaneUrlSync } from "@/lib/adminV2/workUnitLaneQueryUrl";
import { readWorkUnitInitialLocationParams } from "@/lib/adminV2/workUnitInitialLocation";
import {
    isExplicitWorkUnitQueueSelection,
    resolveAuthoritativeWorkUnitQueueKey,
    findQueueSummaryForSelection,
    resolveWorkUnitQueueCanonicalKey,
    workUnitActivePillKeyFromSelection,
    workUnitBootstrapOwnershipFromSelection,
    mergeWorkUnitQueueSummaryCounts,
    resolveWorkUnitFetchQueueKeyFromPill,
    resolveWorkUnitQueueKey,
    workUnitQueuePillKeysEquivalent,
    workUnitQueueSelectionFromLocation,
    workUnitQueueSelectionFromPillKey,
    workUnitQueueSelectionFetchQueueKey,
    type WorkUnitQueueSelection,
} from "@/lib/adminV2/workUnitQueueSelection";
import { logAdminV2NavDebug } from "@/lib/debug/adminV2NavDebug";
import { recordAdminV2RouteChurnAttempt } from "@/lib/debug/adminV2RouteChurnGuard";
import { logAdminV2QueueRowClick } from "@/lib/debug/adminV2QueueRowClickDebug";
import { WorkspaceChrome } from "@/components/admin/workspace/WorkspaceChrome";
import WorkUnitWorkspace from "@/app/adminV2/components/workspace/shells/WorkUnitWorkspace";
import { AutomationWorkflowsBlock } from "@/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock";
import {
    ADMIN_V2_WORKFLOW_AUTOMATION_REFRESH,
    workflowAutomationRefreshMatchesPage,
} from "@/lib/adminV2/aiCommandSurface/workflowAssistWorkspaceEvents";
import { fetchWorkflowAutomationWorkspacePanels } from "@/lib/workspace/fetchWorkflowAutomationWorkspacePanels";
import type { WorkflowScopePartitionV1 } from "@/lib/workflows/workflowScopeMetadata";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";
import { useWorkspaceOrg } from "@/contexts/WorkspaceOrgContext";
import {
    applyEntityLabelToOperatorCopy,
    resolveOperatorQueueSummaryLabels,
} from "@/lib/admin/resolveEntityDisplayLabel";
import { useWorkspaceSiteFilter } from "@/contexts/WorkspaceSiteFilterContext";
import {
    appendWorkspaceSiteToPath,
    appendWorkspaceSiteToUrl,
    workspaceViewCacheFingerprint,
} from "@/lib/adminV2/workspaceSiteFilterClient";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { useGlobalAssistantOptional } from "@/contexts/GlobalAssistantContext";
import { useAdminViewerTimezone } from "@/contexts/AdminViewerTimezoneContext";
import {
    buildWorkUnitAboveFoldPlaceholder,
    buildWorkUnitAboveFoldRenderModel,
    buildWorkUnitRoutePipelineState,
    buildWorkUnitRouteShellPlaceholder,
    incrementRoutePostShellFetch,
    markRouteBootstrapReturned,
    markRouteFetchTiming,
    markRouteFirstAboveFoldStable,
    markRouteHydrationComplete,
    markRouteShellVisible,
    registerRouteLoadingOwner,
    resetRouteShellTrace,
    unregisterRouteLoadingOwner,
} from "@/lib/adminV2/routeShellPipeline";
import { recordBootstrapPayloadBytes } from "@/lib/perf/adminV2SpeedSprintTrace";
import {
    markWorkUnitAboveFoldCoordinated,
    markWorkUnitLaneActionsRailPlaceholder,
    markWorkUnitLaneActionsRailReal,
    markWorkUnitLaneHeaderChipsPlaceholder,
    markWorkUnitLaneHeaderChipsReal,
    markWorkUnitLaneKpiPlaceholder,
    markWorkUnitLaneKpiReal,
    markWorkUnitLaneQueueRowsPlaceholder,
    markWorkUnitLaneQueueRowsReal,
    markWorkUnitLaneShellChromePlaceholder,
    markWorkUnitLaneShellChromeReal,
    resetWorkUnitCriticalPathTrace,
} from "@/lib/perf/workUnitCriticalPathTrace";
import type { ResolvedActionForClient, ResolvedActionsBySlot } from "@/lib/admin/actions/types";
import { applyRegistryResolvedActionClient } from "@/lib/admin/actions/applyRegistryResolvedActionClient";
import {
    formatLegacyRecordActionFailure,
    formatRegistryActionFailure,
} from "@/lib/admin/actions/actionSurfaceFeedback";
import { REGISTRY_RIGHT_RAIL_ACTION_ID_PREFIX } from "@/lib/workspace/viewModels/enrollmentRightRailMerge";
import { executeOpportunityRecordAction } from "@/lib/recordChrome/executeOpportunityRecordAction";
import type { WorkspaceAction } from "@/lib/ui-v2/workspace-actions";
import type {
    QueueItemQuickActionVm,
    QueuePreviewItemVm,
    WorkUnitWorkspaceModel,
} from "@/lib/ui-v2/workspace-types";
import type { WorkspaceOpportunityQueueRuntime } from "@/lib/workspace/types";
import { parseAttentionReasonCountsPayload } from "@/lib/workspace/attentionReasonCountsSummary";
import { buildQueueOperationalAttentionPresentation } from "@/lib/opportunities/operationalAttentionExplain";
import {
    buildOpportunityOperationalContext,
    orchestratorHandoffSeedCommand,
} from "@/lib/adminV2/bos/activeOperationalContext";
import {
    buildQueueRowInvocation,
    launchContextualAskBos,
    launchContextualQuickMessage,
    parseQueueRowActionPayload,
} from "@/lib/admin/actions/contextualActionInvocation";
import { queueBosHandoffPreviewFromOperationalRead } from "@/lib/adminV2/bos/bosDrawerAssistHandoff";
import { resolveQueueOperationalReadSlot } from "@/lib/adminV2/bos/recommendations/selectors/recommendationSurfaceViewModels";
import { resolveQueueRowPreviewActionsForWorkUnit } from "@/lib/ui-v2/enrollmentQueueRowPreviewPolicy";
import { mergeQueueRowQuickActions } from "@/lib/workspace/viewModels/mergeQueueRowQuickActions";
import { buildRealOpportunityWorkUnitWorkspaceModel } from "@/lib/ui-v2/adapters/realWorkUnitFromOpportunities";
import {
    buildWorkUnitQueueCrmCompactRowSlice,
    buildWorkUnitQueueCrmCompactRowSliceForPlacementCandidate,
} from "@/lib/ui-v2/crmQueueRowPreviewPresentation";
import { mergeEnrollmentRightRailActions } from "@/lib/workspace/viewModels/enrollmentRightRailMerge";
import { fetchWorkspaceRightRailResolvedActions } from "@/lib/workspace/fetchWorkspaceRightRailResolvedActions";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import { resolveKpisForWorkUnit } from "@/lib/kpi/resolver";
import { buildDefaultWorkUnitKpis } from "@/lib/kpi/baseline";
import { workUnitContextFromParts } from "@/lib/kpi/surfaceContext";
import { normalizeQueueDefinitionDocument, tryLoadWorkUnitQueueDefinitionBundle } from "@/lib/config/queueDefinitionV2Runtime";
import type { QueueGrain } from "@/lib/config/queueDefinitionV2Runtime";
import {
    buildQueueCountBadgePresentation,
    formatQueueCountLabel,
    resolveQueueGrainPresentation,
} from "@/lib/ui-v2/queueGrainPresentation";
import type { WorkspaceKpiPlacementRow } from "@/lib/kpi/types";
import { workspaceRouteParam } from "@/lib/workspace/workspaceRouteParam";
import {
    readWorkUnitPageCache,
    writeWorkUnitPageCache,
} from "@/lib/workspace/adminV2WorkspaceSessionCache";
import {
    readWorkUnitShellDisplayTitleFromSessionCache,
    resolveWorkUnitShellDisplayTitle,
    WORK_UNIT_SHELL_DISPLAY_FALLBACK,
} from "@/lib/workspace/workUnitShellDisplayTitle";
import type { QueueDefinitionV1 } from "@/lib/config/queueDefinitionSchema";
import {
    getQueueUiConfig,
    type QueueUiConfig,
    type QueueUiRowPreviewAction,
    type QueueUiRowPreviewField,
} from "@/lib/ui-v2/queueUiConfig";
import { readQueueUiPresentationFlags } from "@/lib/ui-v2/readQueueUiPresentationFlags";
import { applyWorkUnitQueueRecordFilters } from "@/lib/workspace/applyWorkUnitQueueRecordFilters";
import { buildWorkUnitQueueRecordFilterFacets } from "@/lib/workspace/workUnitQueueRecordFilterConfig";
import { extractWorkUnitQueueRecordFilterFacets } from "@/lib/workspace/extractWorkUnitQueueRecordFilterFacets";
import {
    EMPTY_WORK_UNIT_QUEUE_RECORD_FILTER,
    type WorkUnitQueueRecordFilterState,
} from "@/lib/workspace/workUnitQueueRecordFilterTypes";
import {
    readWorkUnitQueueRecordFiltersFromLocation,
    replaceWorkUnitQueueRecordFiltersInLocation,
} from "@/lib/workspace/workUnitQueueRecordFilterUrl";
import { WorkUnitQueueRecordFilterBar } from "@/components/admin/workspace/WorkUnitQueueRecordFilterBar";
import {
    findQueuePreviewItemById,
    opportunityDrawerSeedFromQueueItem,
} from "@/lib/admin/opportunityDrawerQueuePreviewSeed";
import {
    prefetchOpportunityDrawerOnRowIntent,
    prefetchVisibleWorkUnitDrawerPrimary,
} from "@/lib/admin/opportunityDrawerIntentPrefetch";
import { bumpOpportunityDrawerAdjacentPrefetchGeneration } from "@/lib/admin/opportunityDrawerAdjacentPrefetch";
import {
    buildOpportunityDrawerQueueNavigatorFromDisplayItems,
    opportunityDrawerNavigatorMatchesWorkUnitSelection,
} from "@/lib/admin/opportunityDrawerQueueNavigator";
import { logPrefetchAdminV2 } from "@/lib/adminV2/adminV2PrefetchInstrumentation";
import { markDrawerRowClickStart } from "@/lib/perf/adminV2DrawerPerf";
import { markWorkUnitNavigationStart } from "@/lib/perf/markWorkUnitNavigationStart";
import { setAdminV2PrimarySurfacePending } from "@/lib/perf/adminV2PrimarySurfaceGate";
import { dedupeAdminFetch, dedupeAdminFetchWithTtl } from "@/lib/workspace/workspaceAdminFetchDedupe";
import { scheduleAdminV2BackgroundWork } from "@/lib/workspace/adminV2DeferBackgroundWork";
import {
    flattenWorkUnitVisibleQueuePillKeys,
    WORK_UNIT_QUEUE_PILL_PREFETCH_CONCURRENCY,
    workUnitQueuePillPrefetchTargets,
} from "@/lib/adminV2/workUnitQueuePillPrefetch";
import { queueRowHasOperationalAttention } from "@/lib/adminV2/workUnitQueueRowAttention";
import {
    clearWorkUnitBootstrapSessionForEntity,
    fetchWorkUnitOperationalBootstrapSession,
} from "@/lib/adminV2/workUnitBootstrapClientSession";
import {
    computeWorkUnitRevealGate,
    markWorkUnitRevealGatePhases,
    markWorkUnitRevealGateStart,
    resetWorkUnitRevealGatePerf,
    workUnitRevealActionsReady,
    workUnitRevealRowsReady,
    workUnitRevealShellReady,
    workUnitRevealSummariesReady,
} from "@/lib/adminV2/workUnitRevealGate";
import { WorkUnitPageLoadingGate } from "@/app/adminV2/components/workspace/WorkUnitPageLoadingGate";
import { logAdminV2LegacyFanOut } from "@/lib/adminV2/runtime/adminV2LegacyFanOutDiagnostics";
import { alloyPerfGet, alloyPerfSet } from "@/lib/perf/alloyPerfGlobal";
import type { NeedsAttentionBucketWithCount } from "@/lib/opportunities/needsAttentionBuckets";
import { UpdateStatusAddNoteModal } from "@/components/admin/opportunity/actions/UpdateStatusAddNoteModal";
import { ContactAttemptedModal } from "@/components/admin/opportunity/actions/ContactAttemptedModal";
import { formatActivityRelativeShort } from "@/lib/admin/activitySignals";
import { formatPhoneUS } from "@/lib/adminFormatters";
import { formatOpportunityQueueNotesPreview, formatOpportunityQueueNotesPreviewParts } from "@/lib/admin/opportunityActivityTimelineFormat";
import { normalizePhone } from "@/lib/contactNormalize";
import { WorkUnitLifecycleCoveragePanel } from "@/components/admin/workspace/WorkUnitLifecycleCoveragePanel";
import {
    buildWorkUnitAboveFoldPillSections,
    buildWorkUnitAboveFoldPlaceholderSections,
    computeUnmappedOverflowCount,
    computeWorkUnitLifecycleCoverage,
    findAllRecordsQueueKey,
    isRowUnmappedForThroughput,
    queueHasStatusFilters,
    reorderSectionsWithAllRecordsFirst,
    resolveWorkUnitOtherPillSectionKey,
    shouldSuppressWorkUnitKpiStrip,
    statusKeysCoveredByThroughputQueues,
} from "@/lib/workspace/workUnitQueueDerived";
import { isEnrollmentLikeDepartmentKey } from "@/lib/workspace/enrollmentDepartmentKey";
import {
    deleteQueueRowCacheKeysForWorkUnit,
    logQueueRowClientCache,
    peekFreshQueueRowCache,
    touchQueueRowCacheOnHit,
    putQueueRowCache,
    queueRowLogicalCacheKey,
    shouldStaleBackgroundRefresh,
    type QueueRowClientCacheBucket,
} from "@/lib/workspace/queueRowClientCache";
import { seedWorkUnitLanePreviewBundleIntoCache } from "@/lib/workspace/seedWorkUnitLanePreviewCache";
import {
    WORK_UNIT_LANE_PREVIEW_MAX_ATTENTION_BUCKETS,
    type WorkUnitLanePreviewEntry,
} from "@/lib/workspace/workUnitLanePreviewBundle";
import {
    resolveNeedsAttentionBucketsWithPrecedence,
    type NeedsAttentionBucketConfig,
} from "@/lib/opportunities/needsAttentionBuckets";
import type { WorkUnitPlacementQueueDiagnostics } from "@/lib/orchestration/placement/applyPlacementToOpportunityQueueRows";
import {
    formatPlacementWaitlistSectionLabel,
    parseQueueRowPlacementPriorityVm,
} from "@/lib/ui-v2/queuePlacementPriorityPresentation";
import { parseQueueRowPlacementPriorityV2Vm } from "@/lib/ui-v2/queuePlacementPriorityV2Presentation";
import {
    buildPlacementWaitlistWorkUnitGroupHeaders,
    parsePlacementWaitlistCandidateRowVm,
} from "@/lib/ui-v2/queuePlacementWaitlistCandidatePresentation";
import { readOpportunityIdFromQueueRow } from "@/lib/orchestration/placement/placementWaitlistCandidateRowProjection";
import { parseQueueRowGrainContext } from "@/lib/queues/queueRowGrainContext";

const WORKSPACE_BASE = "/adminV2/workspace";

/** Synthetic queue keys in the pill strip — map to `queue=needs_attention` + `attention_bucket`. */
const ATTENTION_BUCKET_PILL_PREFIX = "__attention_bucket:";

function expandNeedsAttentionQueueSummariesForPills(
    queues: QueueSummary[],
    naSummary: QueueSummary | undefined,
    buckets: NeedsAttentionBucketConfig[]
): QueueSummary[] {
    const out: QueueSummary[] = [];
    for (const q of queues) {
        if (q.key.trim().toLowerCase() !== "needs_attention") {
            out.push(q);
            continue;
        }
        if (!naSummary || buckets.length === 0) {
            out.push(q);
            continue;
        }
        for (const b of buckets) {
            const desc = (b.description ?? "").trim();
            out.push({
                ...naSummary,
                key: `${ATTENTION_BUCKET_PILL_PREFIX}${b.key}`,
                label: b.label,
                ...(desc ? { description: desc } : {}),
            });
        }
        if (buckets.length > 1) {
            out.push({
                ...naSummary,
                key: `${ATTENTION_BUCKET_PILL_PREFIX}__all__`,
                label: "All needs attention",
            });
        }
    }
    return out;
}

/** Load v1 execution queue definition from stored JSON (v1 or v2 bundle). */
function loadWorkUnitQueueDefinition(raw: unknown): QueueDefinitionV1 | null {
    const bundle = tryLoadWorkUnitQueueDefinitionBundle(raw);
    return bundle?.def ?? null;
}

/** Lane selection from definition + URL only — before exact summaries (Phase 3.1). */
function resolveProvisionalQueueKey(wu: WorkUnitRow, qFromUrl: string): string | null {
    if (!wu.queue_definition) {
        const q = qFromUrl.trim();
        return q || null;
    }
    try {
        const def = loadWorkUnitQueueDefinition(wu.queue_definition);
        if (!def) {
            const q = qFromUrl.trim();
            return q || null;
        }
        const ui = getQueueUiConfig(def);
        const keys = new Set(def.queues.map((q) => q.key));
        const qTrim = qFromUrl.trim();
        if (qTrim) {
            const resolution = resolveWorkUnitQueueKey(wu, qTrim);
            if (resolution.queue) return resolution.resolvedKey;
            if (keys.has(qTrim)) return qTrim;
        }
        const allKey = findAllRecordsQueueKey(def, ui);
        if (allKey && keys.has(allKey)) return allKey;
        const uiOrder = ui.sections.flatMap((s) => s.queue_keys);
        return uiOrder.find((k) => keys.has(k)) ?? def.queues[0]?.key ?? null;
    } catch {
        const q = qFromUrl.trim();
        return q || null;
    }
}

/** Default lane for CRM pipeline-style opportunity work units when definition includes this key. */
const OPPORTUNITY_PIPELINE_TOTAL_FALLBACK_KEY = "pipeline_total";

/**
 * Queue key to start row fetch as soon as work-unit JSON is available (before summaries).
 * Priority: URL (must exist on work unit when definition exists), definition default, pipeline_total if present, else first queue.
 */
function resolveNavTimeRowQueueKey(wu: WorkUnitRow, qFromUrl: string): string | null {
    const qTrim = qFromUrl.trim();
    if (!wu.queue_definition) {
        return qTrim || null;
    }
    try {
        const def = loadWorkUnitQueueDefinition(wu.queue_definition);
        if (!def) {
            return qTrim || null;
        }
        const ui = getQueueUiConfig(def);
        const keys = new Set(def.queues.map((q) => q.key));
        if (qTrim) {
            const resolution = resolveWorkUnitQueueKey(wu, qTrim);
            if (resolution.queue) return resolution.resolvedKey;
            if (keys.has(qTrim)) return qTrim;
        }
        const fromDef = resolveProvisionalQueueKey(wu, "");
        if (fromDef && keys.has(fromDef)) return fromDef;
        if (keys.has(OPPORTUNITY_PIPELINE_TOTAL_FALLBACK_KEY)) return OPPORTUNITY_PIPELINE_TOTAL_FALLBACK_KEY;
        return def.queues[0]?.key ?? null;
    } catch {
        return qTrim || null;
    }
}

function buildWorkUnitQueuesListRoute(workUnitId: string, selectedSiteId: string | null | undefined): string {
    const queueQs = new URLSearchParams({
        include_previews: "false",
        count_mode: "exact",
        limit: "3",
        summary_mode: "all",
    });
    const base = `/api/admin/work-units/${encodeURIComponent(workUnitId)}/queues?${queueQs.toString()}`;
    return appendWorkspaceSiteToUrl(base, selectedSiteId);
}

/** Authoritative primary lane for bootstrap — explicit route queue wins over summary defaults. */
function resolveBootstrapPrimaryQueueKey(
    wu: WorkUnitRow,
    summaries: QueueSummary[] | null,
    qFromUrl: string
): string | null {
    if (summaries?.length) {
        return resolveAuthoritativeWorkUnitQueueKey(wu, summaries, qFromUrl);
    }
    return resolveNavTimeRowQueueKey(wu, qFromUrl);
}

type WorkUnitRow = {
    id: string;
    department_id: string;
    key: string | null;
    name: string | null;
    queue_definition?: unknown;
    metadata?: unknown;
};

type DeptRow = { id: string; name: string | null; key: string | null; metadata?: unknown };

type QueueSummary = {
    key: string;
    label: string;
    description?: string;
    entity_type: "job" | "schedule" | "opportunity";
    priority: "standard" | "attention" | "critical";
    display: "list" | "cards";
    count: number;
    preview: unknown[];
    counts_deferred?: boolean;
    grain?: QueueGrain;
    domain?: string;
    overlay?: boolean;
};

type QueueItemsResult = {
    queue: {
        key: string;
        label: string;
        description?: string;
        entity_type: "job" | "schedule" | "opportunity";
        priority: "standard" | "attention" | "critical";
        display: "list" | "cards";
    };
    items: unknown[];
    total: number;
    limit: number;
    offset: number;
    total_omitted?: boolean;
    placement_projection_diagnostics?: WorkUnitPlacementQueueDiagnostics;
};

function queueItemPayloadHasId(r: unknown): boolean {
    return (
        typeof r === "object" &&
        r != null &&
        typeof (r as { id?: unknown }).id === "string" &&
        String((r as { id: string }).id).trim() !== ""
    );
}

/** Queue definitions may carry admin-only notes tagged "(internal)" — hide from the work-unit header. */
function isOperatorFacingQueueSummaryDescription(description: string): boolean {
    return !/\(internal\)/i.test(description.trim());
}

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

function isRowPreviewFieldEnabled(fields: QueueUiRowPreviewField[], f: QueueUiRowPreviewField): boolean {
    return fields.includes(f);
}

export default function AdminV2OpportunityWorkUnitPage() {
    const params = useParams();
    const departmentId = workspaceRouteParam(params.departmentId);
    const workUnitId = workspaceRouteParam(params.workUnitId);
    const router = useRouter();
    /** Frozen on work-unit mount — do not subscribe to Next search params (triggers RSC churn on query changes). */
    const initialLocationRef = useRef(readWorkUnitInitialLocationParams());
    const routeQueueSelectionRef = useRef<WorkUnitQueueSelection | null>(null);
    const explicitRouteQueueLockedRef = useRef(false);
    const legacyFilterStatusKeys = initialLocationRef.current.statusKeys;
    const legacyFilterAttentionReason = initialLocationRef.current.attentionReason;
    const legacyFilterAttentionReasonCode = initialLocationRef.current.attentionReasonCode;
    const legacyFilterActivitySignalKey = initialLocationRef.current.activitySignalKey;
    const { orgId, principalUserId, accessScopeFingerprint } = useWorkspaceOrg();
    const { labels: entityLabels } = useEntityLabels();
    const siteFilter = useWorkspaceSiteFilter();
    const selectedSiteId = siteFilter?.selectedSiteId ?? null;
    const siteSelectionReady = siteFilter?.siteSelectionReady ?? true;
    const viewScopeFingerprint = workspaceViewCacheFingerprint(accessScopeFingerprint, selectedSiteId);
    const { openDrawer } = useAdminDrawer();
    const viewerTz = useAdminViewerTimezone();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [workUnit, setWorkUnit] = useState<WorkUnitRow | null>(null);
    const workUnitRef = useRef<WorkUnitRow | null>(null);
    workUnitRef.current = workUnit;
    const [dept, setDept] = useState<DeptRow | null>(null);
    const [oq, setOq] = useState<WorkspaceOpportunityQueueRuntime | null>(null);
    const [needsAttentionWorkUnitId, setNeedsAttentionWorkUnitId] = useState<string | null>(null);
    const [opportunityQueueRowResolved, setOpportunityQueueRowResolved] = useState<ResolvedActionForClient[] | null>(null);
    const [enrollmentRightRailResolved, setEnrollmentRightRailResolved] = useState<ResolvedActionForClient[] | null>(null);
    const [enrollmentActionsSettled, setEnrollmentActionsSettled] = useState(false);
    const [actionFeedback, setActionFeedback] = useState<string | null>(null);
    const [actionSurfaceError, setActionSurfaceError] = useState<string | null>(null);

    const [queueSummaries, setQueueSummaries] = useState<QueueSummary[] | null>(null);
    const [queueSummariesError, setQueueSummariesError] = useState<string | null>(null);
    const [queueSummariesRoute, setQueueSummariesRoute] = useState<string | null>(null);
    const [selectedQueueKey, setSelectedQueueKey] = useState<string | null>(null);

    const [queueItems, setQueueItems] = useState<QueueItemsResult | null>(null);
    const [queueItemsError, setQueueItemsError] = useState<string | null>(null);
    const [queueItemsRoute, setQueueItemsRoute] = useState<string | null>(null);
    const [queueItemsLoading, setQueueItemsLoading] = useState(false);
    const [wuPrimaryLaneTimedOut, setWuPrimaryLaneTimedOut] = useState(false);
    /** `undefined` = placement config not loaded → baseline strip; values are derived in `wuResolvedPlacementKpis`. */
    const [wuPlacementRows, setWuPlacementRows] = useState<WorkspaceKpiPlacementRow[] | undefined>(undefined);
    const [wuScopeHasPlacements, setWuScopeHasPlacements] = useState(false);
    const queueItemsRequestSeq = useRef(0);
    const queueSummariesRequestSeq = useRef(0);
    /**
     * Skips redundant queue-item GETs when work unit + selected tab unchanged — same URL as last fetch.
     * Cleared on work-unit navigation; bypass with fetchQueueItems(..., { force: true }) for invalidation.
     */
    const queueItemsLastFetchSigRef = useRef<string | null>(null);
    /** Dedupes same-tab duplicate starts (effects + prefetch) until the in-flight GET settles. */
    const queueRowLeaseSigsRef = useRef(new Set<string>());
    /** One-shot per work-unit navigation: workflow KPIs, row/right-rail actions after first row attempt settles. */
    const workUnitDeferredScheduledRef = useRef(false);
    /** Work-unit JSON validated in bootstrap; deferred supplement must wait (rows may finish first). */
    const workUnitDetailReadyRef = useRef(false);
    const pendingDeferredAfterWudRef = useRef(false);
    const bootstrapWuRef = useRef<WorkUnitRow | null>(null);
    /** Lane-independent attention metadata from operational-bootstrap (stable across tab switches). */
    const wuBootstrapAttentionRef = useRef<{
        execution_work_unit_id: string;
        needs_attention_buckets: NeedsAttentionBucketWithCount[];
    } | null>(null);
    const [wuBootstrapAttentionBuckets, setWuBootstrapAttentionBuckets] = useState<
        NeedsAttentionBucketWithCount[] | null
    >(null);
    const firstUsefulPaintMarkedRef = useRef(false);
    const seededWorkUnitShellRef = useRef(false);
    /** User changed lane via tabs/buckets — bootstrap must not overwrite selection when summaries arrive. */
    const userLaneTouchedRef = useRef(false);
    /** Lane filter UI — source of truth; URL is not synced after mount. */
    const [laneUnmappedOnly, setLaneUnmappedOnly] = useState(false);
    /** Card 14B — client-side record filters (URL via replaceState, no full page refresh). */
    const [recordFilters, setRecordFilters] = useState<WorkUnitQueueRecordFilterState>(() =>
        readWorkUnitQueueRecordFiltersFromLocation()
    );
    const handleRecordFiltersChange = useCallback((next: WorkUnitQueueRecordFilterState) => {
        setRecordFilters(next);
        replaceWorkUnitQueueRecordFiltersInLocation(next);
    }, []);
    const handleRecordFiltersClear = useCallback(() => {
        const next = { ...EMPTY_WORK_UNIT_QUEUE_RECORD_FILTER };
        setRecordFilters(next);
        replaceWorkUnitQueueRecordFiltersInLocation(next);
    }, []);
    const [attentionBucketKey, setAttentionBucketKey] = useState("");
    /** When true, next selectedQueueKey effect uses `{ force: true }` (tab/bucket handlers). */
    const skipNextQueueFetchEffectRef = useRef(false);
    /** After bootstrap primary row fetch, skip one effect pass to avoid duplicate visible load (PERF-C-02). */
    const suppressQueueFetchEffectOnceRef = useRef(false);
    const bootstrapPrimaryRowKeyRef = useRef<string | null>(null);
    const bootstrapPrimaryRowFetchScheduledRef = useRef(false);
    const parallelPrimaryRowStartedRef = useRef(false);
    /** False until bootstrap has scheduled the single primary row fetch for this navigation. */
    const [wuQueueLaneAuthorityReady, setWuQueueLaneAuthorityReady] = useState(false);
    /** Work unit id that owns `queueRowsBufferRef` — prevents stale buffer reveal (PERF-C-01). */
    const queueRowsBufferWorkUnitIdRef = useRef<string | null>(null);
    /** Queue-tab interaction: emit `queue_tab_rows_ready` once when row fetch finishes. */
    const pendingQueueTabPerfRef = useRef(false);
    /** Last settled preview rows — keeps list visible while `queueItems` is briefly null during lane changes. */
    const queueRowsBufferRef = useRef<QueuePreviewItemVm[]>([]);
    /** Latest rendered queue row VMs — used to seed opportunity drawer header on open. */
    const queueDisplayItemsRef = useRef<QueuePreviewItemVm[]>([]);
    const queueRowClientCacheRef = useRef(new Map<string, QueueRowClientCacheBucket<QueueItemsResult>>());
    const selectedQueueKeyRef = useRef<string | null>(null);
    const queueNavGenerationRef = useRef(0);
    const laneUnmappedOnlyRef = useRef(false);
    /** Deferred queue keys from bootstrap — background lane preview bundle targets these lanes. */
    const wuDeferredQueueKeysRef = useRef<string[]>([]);
    /** One-shot lane preview bundle per work-unit navigation. */
    const wuLanePreviewBundleDoneRef = useRef(false);
    /** One-shot deferred pipeline summary count hydration after above-fold reveal. */
    const wuDeferredSummaryHydrateDoneRef = useRef(false);
    /** True after first foreground (non-prefetch) rows attempt settles for selection — gates lane preview warm-up. */
    const primaryLaneRowsSettledOnceRef = useRef(false);

    const [workflowKpis, setWorkflowKpis] = useState<WorkflowKpis>(DEFAULT_WF_KPIS);
    const [workflowKpisLoading, setWorkflowKpisLoading] = useState(false);
    const [workflowPartitions, setWorkflowPartitions] = useState<WorkflowScopePartitionV1 | null>(null);
    const globalAssistant = useGlobalAssistantOptional();

    const [statusOptions, setStatusOptions] = useState<Array<{ value: string; label: string }>>([]);
    const [updateStatusFormOpen, setUpdateStatusFormOpen] = useState(false);
    const [updateStatusTargetId, setUpdateStatusTargetId] = useState<string | null>(null);
    const [contactAttemptedOpen, setContactAttemptedOpen] = useState(false);
    const [contactAttemptedTargetId, setContactAttemptedTargetId] = useState<string | null>(null);

    const queueDef = useMemo<QueueDefinitionV1 | null>(() => {
        if (!workUnit?.queue_definition) return null;
        return loadWorkUnitQueueDefinition(workUnit.queue_definition);
    }, [workUnit?.queue_definition]);

    const queueUi = useMemo<QueueUiConfig | null>(() => {
        if (!queueDef) return null;
        return getQueueUiConfig(queueDef);
    }, [queueDef]);

    const normalizedQueueDef = useMemo(
        () => (workUnit?.queue_definition ? normalizeQueueDefinitionDocument(workUnit.queue_definition) : null),
        [workUnit?.queue_definition]
    );

    const displayQueueSummaries = useMemo(
        () => (queueSummaries ? resolveOperatorQueueSummaryLabels(queueSummaries, entityLabels) : null),
        [queueSummaries, entityLabels]
    );

    const sectionedQueueSummaries = useMemo(() => {
        if (!displayQueueSummaries) return null;
        if (!queueUi) {
            // fallback to existing flat list; but still deterministic
            return [{ key: "all", label: "Queues", tone: "standard" as const, queues: displayQueueSummaries }];
        }
        const byKey = new Map(displayQueueSummaries.map((q) => [q.key, q]));
        const used = new Set<string>();
        const sections = queueUi.sections
            .map((s) => {
                const qs = s.queue_keys
                    .map((k) => byKey.get(k) ?? null)
                    .filter((x): x is QueueSummary => Boolean(x));
                for (const q of qs) used.add(q.key);
                return {
                    key: s.key,
                    label: applyEntityLabelToOperatorCopy(s.label, entityLabels),
                    tone: s.tone ?? "standard",
                    queues: qs,
                };
            })
            .filter((s) => s.queues.length > 0);
        if (sections.length > 0) return sections;
        // If config sections don't match summaries, fall back to all queues.
        return [{ key: "all", label: "Queues", tone: "standard" as const, queues: displayQueueSummaries }];
    }, [displayQueueSummaries, queueUi, entityLabels]);

    const allRecordsQueueKey = useMemo(() => {
        if (!queueDef) return null;
        return findAllRecordsQueueKey(queueDef, queueUi);
    }, [queueDef, queueUi]);

    const sectionedQueueSummariesOrdered = useMemo(() => {
        if (!sectionedQueueSummaries) return null;
        return reorderSectionsWithAllRecordsFirst(sectionedQueueSummaries, allRecordsQueueKey);
    }, [sectionedQueueSummaries, allRecordsQueueKey]);

    const enabledAttentionBuckets = useMemo(() => {
        if (wuBootstrapAttentionBuckets?.length) {
            return wuBootstrapAttentionBuckets.filter((b) => b.enabled);
        }
        if (!workUnit || !dept) return [];
        return resolveNeedsAttentionBucketsWithPrecedence(workUnit.metadata ?? null, dept.metadata ?? null).filter(
            (b) => b.enabled
        );
    }, [workUnit, dept, wuBootstrapAttentionBuckets]);

    const queuePillSections = useMemo(() => {
        if (!sectionedQueueSummariesOrdered?.length || !displayQueueSummaries?.length || !queueUi) return null;
        const naSummary = displayQueueSummaries.find((x) => x.key.trim().toLowerCase() === "needs_attention");
        const expanded = sectionedQueueSummariesOrdered.map((sec) => ({
            ...sec,
            queues: expandNeedsAttentionQueueSummariesForPills(sec.queues, naSummary, enabledAttentionBuckets),
        }));
        return buildWorkUnitAboveFoldPillSections({ ui: queueUi, sectionedSummaries: expanded });
    }, [sectionedQueueSummariesOrdered, displayQueueSummaries, enabledAttentionBuckets, queueUi]);

    /** Tab shells from definition only (no counts) while exact summaries are in flight. */
    const queueTabPlaceholders = useMemo(() => {
        if (!queueUi || !queueDef) return null;
        const keySet = new Set(queueDef.queues.map((q) => q.key));
        const sections = queueUi.sections
            .map((s) => ({
                key: s.key,
                label: applyEntityLabelToOperatorCopy(s.label, entityLabels),
                tone: s.tone ?? ("standard" as const),
                queues: s.queue_keys
                    .filter((k) => keySet.has(k))
                    .map((k) => {
                        const qc = queueDef.queues.find((q) => q.key === k);
                        if (!qc) return null;
                        return {
                            key: qc.key,
                            label: applyEntityLabelToOperatorCopy(qc.label, entityLabels),
                            priority: (qc.priority ?? "standard") as "standard" | "attention" | "critical",
                        };
                    })
                    .filter(
                        (q): q is { key: string; label: string; priority: "standard" | "attention" | "critical" } =>
                            q != null
                    ),
            }))
            .filter((s) => s.queues.length > 0);
        if (!sections.length) return null;
        const ordered = reorderSectionsWithAllRecordsFirst(sections, allRecordsQueueKey);
        if (!queueUi) return ordered;
        return buildWorkUnitAboveFoldPlaceholderSections({ ui: queueUi, sections: ordered });
    }, [queueUi, queueDef, allRecordsQueueKey, entityLabels]);

    const queueTabPlaceholdersExpanded = useMemo(() => {
        if (!queueTabPlaceholders?.length || !enabledAttentionBuckets.length) return queueTabPlaceholders;
        return queueTabPlaceholders.map((sec) => ({
            ...sec,
            queues: sec.queues.flatMap((q) => {
                if (q.key.trim().toLowerCase() !== "needs_attention") return [q];
                const synth = enabledAttentionBuckets.map((b) => ({
                    key: `${ATTENTION_BUCKET_PILL_PREFIX}${b.key}`,
                    label: b.label,
                    priority: "attention" as const,
                }));
                if (enabledAttentionBuckets.length > 1) {
                    synth.push({
                        key: `${ATTENTION_BUCKET_PILL_PREFIX}__all__`,
                        label: "All needs attention",
                        priority: "attention" as const,
                    });
                }
                return synth;
            }),
        }));
    }, [queueTabPlaceholders, enabledAttentionBuckets]);

    const coveredThroughputStatusKeys = useMemo(() => {
        if (!queueDef) return new Set<string>();
        return statusKeysCoveredByThroughputQueues(queueDef, allRecordsQueueKey);
    }, [queueDef, allRecordsQueueKey]);

    const unmappedPillCount = useMemo(() => {
        if (!queueDef || !queueSummaries) return null;
        return computeUnmappedOverflowCount({
            summaries: queueSummaries,
            def: queueDef,
            allRecordsQueueKey,
        });
    }, [queueDef, queueSummaries, allRecordsQueueKey]);

    const suppressWorkUnitKpiStrip = useMemo(
        () => shouldSuppressWorkUnitKpiStrip({ def: queueDef, ui: queueUi }),
        [queueDef, queueUi]
    );

    const otherPillSectionKey = useMemo(() => resolveWorkUnitOtherPillSectionKey(queueUi), [queueUi]);

    const hasLifecycleThroughput = useMemo(() => {
        if (!queueDef || !allRecordsQueueKey) return false;
        return queueDef.queues.some(
            (q) =>
                q.key !== allRecordsQueueKey &&
                q.key.trim().toLowerCase() !== "needs_attention" &&
                queueHasStatusFilters(q)
        );
    }, [queueDef, allRecordsQueueKey]);

    const lifecycleCoverage = useMemo(() => {
        if (!queueDef || !queueSummaries) return null;
        return computeWorkUnitLifecycleCoverage({
            summaries: queueSummaries,
            def: queueDef,
            allRecordsQueueKey,
        });
    }, [queueDef, queueSummaries, allRecordsQueueKey]);

    selectedQueueKeyRef.current = selectedQueueKey;
    laneUnmappedOnlyRef.current = laneUnmappedOnly;
    const attentionBucketKeyRef = useRef("");
    attentionBucketKeyRef.current = attentionBucketKey;

    const setSelectedQueueKeyTraced = useCallback((source: string, next: string | null) => {
        setSelectedQueueKey((prev) => {
            if (prev === next) return prev;
            logAdminV2NavDebug({
                event: "selectedQueueKey",
                source,
                selectedQueueKeyBefore: prev,
                selectedQueueKeyAfter: next,
                overwrite: true,
            });
            return next;
        });
    }, []);

    /**
     * Navigation reset + lane URL seed + optional shell cache (PERF-C-01).
     * Always clears queue lane state on work-unit / site change — even when session shell seeds metadata.
     */
    useLayoutEffect(() => {
        if (!departmentId || !workUnitId) return;

        resetWorkUnitCriticalPathTrace();
        resetWorkUnitRevealGatePerf();
        setEnrollmentActionsSettled(false);
        parallelPrimaryRowStartedRef.current = false;
        setWuQueueLaneAuthorityReady(false);
        bootstrapPrimaryRowKeyRef.current = null;
        bootstrapPrimaryRowFetchScheduledRef.current = false;
        suppressQueueFetchEffectOnceRef.current = false;
        queueItemsRequestSeq.current += 1;
        queueSummariesRequestSeq.current += 1;
        wuDeferredQueueKeysRef.current = [];
        wuLanePreviewBundleDoneRef.current = false;
        wuDeferredSummaryHydrateDoneRef.current = false;
        queueItemsLastFetchSigRef.current = null;
        queueRowLeaseSigsRef.current.clear();
        queueRowClientCacheRef.current.clear();
        queueRowsBufferRef.current = [];
        queueRowsBufferWorkUnitIdRef.current = null;
        wuBootstrapAttentionRef.current = null;
        setWuBootstrapAttentionBuckets(null);
        primaryLaneRowsSettledOnceRef.current = false;
        userLaneTouchedRef.current = false;
        skipNextQueueFetchEffectRef.current = false;

        setQueueSummaries(null);
        setQueueSummariesError(null);
        setQueueSummariesRoute(null);
        setQueueItems(null);
        setQueueItemsError(null);
        setQueueItemsRoute(null);
        setQueueItemsLoading(false);
        setWuPrimaryLaneTimedOut(false);

        initialLocationRef.current = readWorkUnitInitialLocationParams();
        setRecordFilters(readWorkUnitQueueRecordFiltersFromLocation());
        const init = initialLocationRef.current;
        const routeSelection = workUnitId
            ? workUnitQueueSelectionFromLocation(workUnitId, init)
            : null;
        routeQueueSelectionRef.current = routeSelection;
        explicitRouteQueueLockedRef.current = isExplicitWorkUnitQueueSelection(routeSelection);
        recordAdminV2RouteChurnAttempt("work-unit-lane-init");
        if (routeSelection) {
            setSelectedQueueKeyTraced(
                "laneInitFromUrl",
                workUnitActivePillKeyFromSelection(routeSelection)
            );
            setAttentionBucketKey(routeSelection.attentionBucketKey ?? "");
        } else {
            setSelectedQueueKey(null);
            setAttentionBucketKey("");
        }
        setLaneUnmappedOnly(init.unmapped);

        seededWorkUnitShellRef.current = false;
        clearWorkUnitBootstrapSessionForEntity(departmentId, workUnitId);
        if (!orgId) return;
        setWorkUnit((prev) => (prev?.id === workUnitId ? prev : null));
        const hit = readWorkUnitPageCache(orgId, departmentId, workUnitId, principalUserId, accessScopeFingerprint);
        if (!hit || hit.departmentId !== departmentId || hit.workUnit.id !== workUnitId) {
            seededWorkUnitShellRef.current = false;
            return;
        }
        seededWorkUnitShellRef.current = true;
        setDept(hit.dept);
        setWorkUnit(hit.workUnit as WorkUnitRow);
        setError(null);
        setLoading(false);
    }, [
        departmentId,
        workUnitId,
        orgId,
        principalUserId,
        accessScopeFingerprint,
        setSelectedQueueKeyTraced,
    ]);

    useEffect(() => {
        recordAdminV2RouteChurnAttempt("work-unit-mount");
        resetRouteShellTrace("work_unit");
        registerRouteLoadingOwner("work_unit", "page");
        markRouteShellVisible("work_unit", { departmentId, workUnitId });
        markWorkUnitLaneShellChromePlaceholder();
        return () => unregisterRouteLoadingOwner("work_unit", "page");
    }, [departmentId, workUnitId]);

    useEffect(() => {
        if (!actionFeedback) return;
        const t = setTimeout(() => setActionFeedback(null), 10000);
        return () => clearTimeout(t);
    }, [actionFeedback]);

    useEffect(() => {
        if (!actionSurfaceError) return;
        const t = setTimeout(() => setActionSurfaceError(null), 12000);
        return () => clearTimeout(t);
    }, [actionSurfaceError]);

    useEffect(() => {
        const gated =
            Boolean(workUnitId) &&
            Boolean(selectedQueueKey) &&
            Boolean(workUnit) &&
            !loading &&
            queueItemsLoading &&
            queueItems === null &&
            !queueItemsError &&
            queueRowsBufferRef.current.length === 0;
        if (!gated) {
            setWuPrimaryLaneTimedOut(false);
            return;
        }
        const t = window.setTimeout(() => setWuPrimaryLaneTimedOut(true), 12_000);
        return () => clearTimeout(t);
    }, [workUnitId, selectedQueueKey, workUnit, loading, queueItemsLoading, queueItems, queueItemsError]);

    const setWorkspaceScope = globalAssistant?.setWorkspaceScope;
    useEffect(() => {
        if (!setWorkspaceScope || !departmentId) return;
        setWorkspaceScope({
            department_id: departmentId,
            department_name: dept?.name ?? null,
            work_unit_id: workUnitId || null,
            work_unit_name: workUnit?.name ?? null,
        });
        return () => setWorkspaceScope(null);
    }, [setWorkspaceScope, departmentId, workUnitId, dept?.name, workUnit?.name]);

    const refreshWorkflowPanels = useCallback(async () => {
        if (!departmentId || !workUnitId) return;
        setWorkflowKpisLoading(true);
        try {
            const { kpis, partitions } = await fetchWorkflowAutomationWorkspacePanels({
                department_id: departmentId,
                work_unit_id: workUnitId,
                init: workspaceDataFetchInit(),
            });
            setWorkflowKpis({ ...DEFAULT_WF_KPIS, ...kpis });
            if (partitions) setWorkflowPartitions(partitions);
        } catch {
            // non-fatal
        } finally {
            setWorkflowKpisLoading(false);
        }
    }, [departmentId, workUnitId]);

    const askWorkflowAssist = useCallback(() => {
        const wuLabel = workUnit?.name?.trim() || "this work unit";
        const deptLabel = dept?.name?.trim() || "this department";
        globalAssistant?.focusCommandBar({
            seedCommand: `Create a workflow for ${wuLabel} in ${deptLabel}`,
            expandThread: true,
        });
    }, [globalAssistant, workUnit?.name, dept?.name]);

    useEffect(() => {
        if (!departmentId || !workUnitId) return;
        const onRefresh = (ev: Event) => {
            const detail = (ev as CustomEvent<{ department_id?: string | null; work_unit_id?: string | null }>).detail;
            if (
                !workflowAutomationRefreshMatchesPage(detail, {
                    department_id: departmentId,
                    work_unit_id: workUnitId,
                })
            ) {
                return;
            }
            void refreshWorkflowPanels();
        };
        window.addEventListener(ADMIN_V2_WORKFLOW_AUTOMATION_REFRESH, onRefresh);
        return () => window.removeEventListener(ADMIN_V2_WORKFLOW_AUTOMATION_REFRESH, onRefresh);
    }, [departmentId, workUnitId, refreshWorkflowPanels]);

    const loadWuKpiPlacements = useCallback(
        async (wuK: WorkUnitRow) => {
            if (!workUnitId || !departmentId) return;
            let suppress = false;
            try {
                const def = wuK.queue_definition ? loadWorkUnitQueueDefinition(wuK.queue_definition) : null;
                const ui = def ? getQueueUiConfig(def) : null;
                suppress = shouldSuppressWorkUnitKpiStrip({ def, ui });
            } catch {
                suppress = false;
            }
            if (suppress) {
                setWuPlacementRows([]);
                setWuScopeHasPlacements(true);
                return;
            }
            try {
                const init = workspaceDataFetchInit();
                const kpiBase = `/api/admin/workspace-kpi-placements?surface=work_unit&department_id=${encodeURIComponent(
                    departmentId
                )}&work_unit_id=${encodeURIComponent(workUnitId)}`;
                const res = await dedupeAdminFetchWithTtl(
                    appendWorkspaceSiteToUrl(kpiBase, selectedSiteId),
                    { ...(init ?? {}), cache: "no-store" },
                    8000
                );
                if (!res.ok) {
                    setWuPlacementRows([]);
                    setWuScopeHasPlacements(false);
                    return;
                }
                const j = (await res.json().catch(() => ({}))) as {
                    items?: WorkspaceKpiPlacementRow[];
                    scope_has_placements?: boolean;
                };
                setWuPlacementRows(j.items ?? []);
                setWuScopeHasPlacements(j.scope_has_placements === true);
            } catch {
                setWuPlacementRows([]);
                setWuScopeHasPlacements(false);
            }
        },
        [departmentId, workUnitId, selectedSiteId]
    );

    const loadWorkUnitDeferredSupplement = useCallback(async () => {
        if (!workUnitId || !departmentId) return;
        const init = workspaceDataFetchInit();

        try {
            const rightRailList = await fetchWorkspaceRightRailResolvedActions({
                departmentId,
                workUnitId,
                fetchInit: init,
            });
            if (Array.isArray(rightRailList) && rightRailList.length) {
                setEnrollmentRightRailResolved(rightRailList);
            }
        } catch {
            /* non-fatal */
        }

        const actionsListRoute =
            `/api/admin/actions?` +
            new URLSearchParams({
                surface: "queue_row",
                entity_type: "opportunity",
                work_unit_id: workUnitId,
                department_id: departmentId,
            }).toString();
        const [actionsSettled] = await Promise.allSettled([dedupeAdminFetchWithTtl(actionsListRoute, init, 1500)]);

        if (actionsSettled.status === "fulfilled") {
            try {
                const ar = actionsSettled.value;
                const aj = (await ar.json().catch(() => ({}))) as { actions?: ResolvedActionsBySlot };
                if (ar.ok) {
                    const rowInline = aj.actions?.row_inline ?? [];
                    const overflow = aj.actions?.overflow ?? [];
                    setOpportunityQueueRowResolved([...rowInline, ...overflow]);
                }
            } catch {
                /* non-fatal */
            }
        }

        setWorkflowKpisLoading(true);
        try {
            const { kpis, partitions } = await fetchWorkflowAutomationWorkspacePanels({
                department_id: departmentId,
                work_unit_id: workUnitId,
                init,
            });
            setWorkflowKpis({ ...DEFAULT_WF_KPIS, ...kpis });
            if (partitions) setWorkflowPartitions(partitions);
        } catch {
            // non-fatal
        } finally {
            setWorkflowKpisLoading(false);
        }

        const attn = wuBootstrapAttentionRef.current;
        if (attn?.execution_work_unit_id) {
            setNeedsAttentionWorkUnitId(attn.execution_work_unit_id);
        }
    }, [departmentId, workUnitId, selectedSiteId]);

    const requestWorkUnitDeferredSupplement = useCallback(() => {
        if (workUnitDeferredScheduledRef.current) return;
        if (!workUnitDetailReadyRef.current) {
            pendingDeferredAfterWudRef.current = true;
            return;
        }
        workUnitDeferredScheduledRef.current = true;
        pendingDeferredAfterWudRef.current = false;
        return scheduleAdminV2BackgroundWork(
            () => {
                void loadWorkUnitDeferredSupplement();
            },
            { idleTimeoutMs: 2000, fallbackMs: 120 }
        );
    }, [loadWorkUnitDeferredSupplement]);

    const markFirstUsefulPaintOnce = useCallback(() => {
        if (firstUsefulPaintMarkedRef.current || typeof window === "undefined" || typeof performance === "undefined") return;
        firstUsefulPaintMarkedRef.current = true;
        requestAnimationFrame(() => {
            requestAnimationFrame(() => alloyPerfSet("first_useful_paint", performance.now()));
        });
    }, []);

    const fetchQueueItems = useCallback(
        async (
            workUnitId: string,
            queueKey: string,
            _summaries: QueueSummary[] | null,
            options?: {
                force?: boolean;
                prefetchOnly?: boolean;
                quietStaleRefresh?: boolean;
                /** Prefetched rows use canonical `all` cache bucket even when Current tab shows `unmapped` filter UI. */
                logicalUnmapped?: boolean;
                /** When set on Needs attention fetches, avoids a one-frame stale read of `attention_bucket` from URL. */
                attentionBucketOverride?: string | null;
            }
        ) => {
            void _summaries;
            const resolvedFetch = resolveWorkUnitFetchQueueKeyFromPill(
                queueKey,
                options?.attentionBucketOverride !== undefined
                    ? String(options.attentionBucketOverride ?? "").trim()
                    : attentionBucketKeyRef.current,
                workUnitRef.current ? { queue_definition: workUnitRef.current.queue_definition } : undefined
            );
            const apiQueueKey = resolvedFetch.queueKey;
            const logicalUm = options?.logicalUnmapped ?? laneUnmappedOnly;
            const abSnap =
                apiQueueKey.trim().toLowerCase() === "needs_attention"
                    ? (options?.attentionBucketOverride !== undefined
                          ? String(options.attentionBucketOverride ?? "").trim()
                          : resolvedFetch.attentionBucketOverride !== undefined
                            ? String(resolvedFetch.attentionBucketOverride ?? "").trim()
                            : attentionBucketKeyRef.current.trim())
                    : "";
            const fetchSig = `${workUnitId}|${apiQueueKey}|omit|${abSnap}`;
            const logicalKey = queueRowLogicalCacheKey(
                viewScopeFingerprint,
                workUnitId,
                apiQueueKey,
                logicalUm,
                abSnap
            );
            const qs = new URLSearchParams({
                limit: "20",
                offset: "0",
                count_mode: "exact",
                omit_total_count: "true",
            });
            if (abSnap) qs.set("attention_bucket", abSnap);
            const route = appendWorkspaceSiteToUrl(
                `/api/admin/queues/${encodeURIComponent(workUnitId)}/${encodeURIComponent(apiQueueKey)}?${qs.toString()}`,
                selectedSiteId
            );
            const cache = queueRowClientCacheRef.current;

            if (options?.force) {
                cache.delete(queueRowLogicalCacheKey(viewScopeFingerprint, workUnitId, apiQueueKey, false, abSnap));
                cache.delete(queueRowLogicalCacheKey(viewScopeFingerprint, workUnitId, apiQueueKey, true, abSnap));
            }

            if (!options?.force && !options?.prefetchOnly && !options?.quietStaleRefresh) {
                const ent = touchQueueRowCacheOnHit(cache, logicalKey);
                if (ent) {
                    queueItemsLastFetchSigRef.current = fetchSig;
                    setQueueItemsError(null);
                    setQueueItemsRoute(route);
                    setQueueItems(ent.payload);
                    setQueueItemsLoading(false);
                    logQueueRowClientCache({
                        event: "hit",
                        work_unit_id: workUnitId,
                        queue_key: apiQueueKey,
                        pill_key: queueKey,
                        attention_bucket_key: abSnap || undefined,
                        age_ms: Date.now() - ent.fetchedAt,
                    });
                    if (pendingQueueTabPerfRef.current && typeof window !== "undefined" && typeof performance !== "undefined") {
                        pendingQueueTabPerfRef.current = false;
                        alloyPerfSet("queue_tab_rows_ready", performance.now());
                    }
                    markFirstUsefulPaintOnce();
                    primaryLaneRowsSettledOnceRef.current = true;
                    if (shouldStaleBackgroundRefresh(ent.fetchedAt)) {
                        logQueueRowClientCache({
                            event: "stale_refresh",
                            work_unit_id: workUnitId,
                            queue_key: apiQueueKey,
                            pill_key: queueKey,
                            attention_bucket_key: abSnap || undefined,
                            age_ms: Date.now() - ent.fetchedAt,
                        });
                        void fetchQueueItems(workUnitId, queueKey, null, {
                            quietStaleRefresh: true,
                            logicalUnmapped: logicalUm,
                        });
                    }
                    return;
                }
                logQueueRowClientCache({
                    event: "miss",
                    work_unit_id: workUnitId,
                    queue_key: apiQueueKey,
                    pill_key: queueKey,
                    attention_bucket_key: abSnap || undefined,
                    age_ms: null,
                });
            }

            const lease = queueRowLeaseSigsRef.current;

            const runNetwork = async (seq: number, touchUiPerf: boolean) => {
                const init = workspaceDataFetchInit();
                const rowFetchStart =
                    touchUiPerf && typeof performance !== "undefined" ? performance.now() : 0;
                if (touchUiPerf && typeof window !== "undefined" && typeof performance !== "undefined") {
                    alloyPerfSet("queue_rows_request_start", performance.now());
                    alloyPerfSet("rows_req", performance.now());
                    incrementRoutePostShellFetch("work_unit", "queue_items");
                }
                const res = await dedupeAdminFetch(route, init);
                if (touchUiPerf && rowFetchStart) {
                    markRouteFetchTiming("work_unit", "queue_items", rowFetchStart);
                }
                if (touchUiPerf && typeof window !== "undefined" && typeof performance !== "undefined") {
                    alloyPerfSet("queue_rows_response_headers", performance.now());
                    alloyPerfSet("rows_resp", performance.now());
                }
                const json = (await res.json().catch(() => ({}))) as { error?: string };
                if (touchUiPerf && typeof window !== "undefined" && typeof performance !== "undefined") {
                    alloyPerfSet("queue_rows_json_parse_done", performance.now());
                }
                if (!res.ok) {
                    if (res.status === 501) throw new Error("Queue type not supported yet");
                    throw new Error(json.error ?? "Failed to load queue items");
                }
                const payload = json as unknown as QueueItemsResult;
                const attentionBucketMatches =
                    queueKey.trim().toLowerCase() !== "needs_attention" ||
                    attentionBucketKeyRef.current.trim() === abSnap ||
                    options?.attentionBucketOverride !== undefined;
                const stillSelectedPill = selectedQueueKeyRef.current?.trim() ?? "";
                const stillSelectedFetch = resolveWorkUnitFetchQueueKeyFromPill(
                    stillSelectedPill,
                    attentionBucketKeyRef.current,
                    workUnitRef.current ? { queue_definition: workUnitRef.current.queue_definition } : undefined
                );
                const stillSelected =
                    stillSelectedFetch.queueKey === apiQueueKey &&
                    laneUnmappedOnlyRef.current === logicalUm &&
                    attentionBucketMatches;
                if (options?.prefetchOnly) {
                    putQueueRowCache(cache, viewScopeFingerprint, workUnitId, apiQueueKey, payload, abSnap);
                    return;
                }
                if (options?.quietStaleRefresh) {
                    if (seq === queueItemsRequestSeq.current && stillSelected) {
                        putQueueRowCache(cache, viewScopeFingerprint, workUnitId, apiQueueKey, payload, abSnap);
                        setQueueItems(payload);
                    }
                    return;
                }
                if (seq === queueItemsRequestSeq.current) {
                    putQueueRowCache(cache, viewScopeFingerprint, workUnitId, apiQueueKey, payload, abSnap);
                    setQueueItems(payload);
                    if (pendingQueueTabPerfRef.current && typeof window !== "undefined" && typeof performance !== "undefined") {
                        pendingQueueTabPerfRef.current = false;
                        requestAnimationFrame(() => {
                            requestAnimationFrame(() => alloyPerfSet("queue_tab_rows_ready", performance.now()));
                        });
                    }
                    if (typeof window !== "undefined") {
                        console.warn("[pipeline-count-unify]", {
                            source: "queue-rows",
                            work_unit_id: workUnitId,
                            queue_key: queueKey,
                            count: typeof payload.total === "number" ? payload.total : null,
                        });
                    }
                    if (typeof window !== "undefined" && typeof performance !== "undefined") {
                        requestAnimationFrame(() => {
                            requestAnimationFrame(() => {
                                const t = performance.now();
                                alloyPerfSet("queue_rows_state_applied", t);
                                alloyPerfSet("queue_rows_ready", t);
                            });
                        });
                    }
                    markFirstUsefulPaintOnce();
                }
            };

            if (options?.prefetchOnly) {
                if (peekFreshQueueRowCache(cache, logicalKey)) return;
                if (lease.has(fetchSig)) return;
                lease.add(fetchSig);
                const seq = ++queueItemsRequestSeq.current;
                logQueueRowClientCache({
                    event: "prefetch",
                    work_unit_id: workUnitId,
                    queue_key: apiQueueKey,
                    pill_key: queueKey,
                    attention_bucket_key: abSnap || undefined,
                    age_ms: null,
                });
                try {
                    await runNetwork(seq, false);
                } catch {
                    /* best-effort */
                } finally {
                    lease.delete(fetchSig);
                }
                return;
            }

            if (options?.quietStaleRefresh) {
                if (lease.has(fetchSig)) return;
                lease.add(fetchSig);
                const seq = ++queueItemsRequestSeq.current;
                try {
                    await runNetwork(seq, false);
                } catch {
                    /* stale refresh silent */
                } finally {
                    lease.delete(fetchSig);
                }
                return;
            }

            if (options?.force) {
                lease.delete(fetchSig);
            } else if (lease.has(fetchSig)) {
                return;
            } else {
                lease.add(fetchSig);
            }
            if (!options?.force && fetchSig === queueItemsLastFetchSigRef.current) {
                lease.delete(fetchSig);
                if (pendingQueueTabPerfRef.current && typeof window !== "undefined" && typeof performance !== "undefined") {
                    pendingQueueTabPerfRef.current = false;
                    alloyPerfSet("queue_tab_rows_ready", performance.now());
                }
                return;
            }
            queueItemsLastFetchSigRef.current = fetchSig;

            const seq = ++queueItemsRequestSeq.current;
            setQueueItemsLoading(true);
            setQueueItemsError(null);
            setQueueItemsRoute(route);
            setQueueItems((prev) => {
                const pk =
                    prev?.queue && typeof (prev.queue as { key?: string }).key === "string"
                        ? (prev.queue as { key: string }).key
                        : null;
                if (pk != null && pk !== apiQueueKey) return null;
                return prev;
            });
            try {
                await runNetwork(seq, true);
                primaryLaneRowsSettledOnceRef.current = true;
            } catch (e) {
                if (seq === queueItemsRequestSeq.current) {
                    pendingQueueTabPerfRef.current = false;
                    setQueueItems(null);
                    setQueueItemsError(e instanceof Error ? e.message : "Failed to load queue items");
                }
            } finally {
                queueRowLeaseSigsRef.current.delete(fetchSig);
                if (seq === queueItemsRequestSeq.current) {
                    setQueueItemsLoading(false);
                    requestWorkUnitDeferredSupplement();
                }
            }
        },
        [requestWorkUnitDeferredSupplement, markFirstUsefulPaintOnce, laneUnmappedOnly, viewScopeFingerprint, selectedSiteId]
    );

    const fetchQueueItemsRef = useRef(fetchQueueItems);
    fetchQueueItemsRef.current = fetchQueueItems;
    const requestWorkUnitDeferredSupplementRef = useRef(requestWorkUnitDeferredSupplement);
    requestWorkUnitDeferredSupplementRef.current = requestWorkUnitDeferredSupplement;
    const markFirstUsefulPaintOnceRef = useRef(markFirstUsefulPaintOnce);
    markFirstUsefulPaintOnceRef.current = markFirstUsefulPaintOnce;

    const warmWorkUnitLanePreviewCache = useCallback(async () => {
        if (!departmentId || !workUnitId || wuLanePreviewBundleDoneRef.current) return;
        const deferred = wuDeferredQueueKeysRef.current;
        const buckets = (wuBootstrapAttentionRef.current?.needs_attention_buckets ?? [])
            .slice(0, WORK_UNIT_LANE_PREVIEW_MAX_ATTENTION_BUCKETS)
            .map((b) => String(b.key ?? "").trim())
            .filter(Boolean);
        const primaryKey = bootstrapPrimaryRowKeyRef.current ?? selectedQueueKeyRef.current;
        if (deferred.length === 0 && buckets.length === 0) {
            wuLanePreviewBundleDoneRef.current = true;
            return;
        }
        wuLanePreviewBundleDoneRef.current = true;
        const qs = new URLSearchParams({
            department_id: departmentId,
            lane_row_limit: "20",
            omit_total_count: "true",
        });
        if (primaryKey) qs.set("primary_queue_key", primaryKey);
        for (const k of deferred) qs.append("queue_key", k);
        for (const b of buckets) qs.append("attention_bucket", b);
        if (buckets.length > 0) qs.append("attention_bucket", "");
        const route = appendWorkspaceSiteToUrl(
            `/api/admin/work-units/${encodeURIComponent(workUnitId)}/lane-previews?${qs.toString()}`,
            selectedSiteId
        );
        try {
            const init = workspaceDataFetchInit();
            const res = await dedupeAdminFetch(route, init);
            if (!res.ok) return;
            const json = (await res.json().catch(() => ({}))) as {
                previews?: WorkUnitLanePreviewEntry[];
            };
            const previews = json.previews ?? [];
            seedWorkUnitLanePreviewBundleIntoCache(
                queueRowClientCacheRef.current,
                viewScopeFingerprint,
                workUnitId,
                previews
            );
            if (typeof window !== "undefined") {
                console.warn("[wu-lane-preview-cache]", {
                    work_unit_id: workUnitId,
                    seeded: previews.length,
                    deferred: deferred.length,
                    buckets: buckets.length,
                });
            }
        } catch {
            /* best-effort warm-up */
        }
    }, [departmentId, workUnitId, selectedSiteId, viewScopeFingerprint]);

    const handleQueueTabChange = useCallback(
        (nextKey: string, opts?: { unmappedActive?: boolean }) => {
            const unmappedActive = opts?.unmappedActive ?? false;
            const prevKey = selectedQueueKeyRef.current;
            const prevUnmapped = laneUnmappedOnlyRef.current;
            const wu = workUnitRef.current;
            const sameQueue =
                prevKey === nextKey ||
                (wu?.queue_definition != null &&
                    workUnitQueuePillKeysEquivalent(
                        { queue_definition: wu.queue_definition },
                        prevKey,
                        nextKey
                    ));
            if (sameQueue && prevUnmapped === unmappedActive) {
                if (prevKey !== nextKey && workUnitId) {
                    setSelectedQueueKeyTraced("handleQueueTabChange", nextKey);
                    routeQueueSelectionRef.current = workUnitQueueSelectionFromPillKey(workUnitId, nextKey);
                    explicitRouteQueueLockedRef.current = false;
                    const resolvedAlias = resolveWorkUnitFetchQueueKeyFromPill(
                        nextKey,
                        attentionBucketKeyRef.current,
                        wu ? { queue_definition: wu.queue_definition } : undefined
                    );
                    const naAlias = resolvedAlias.queueKey.trim().toLowerCase() === "needs_attention";
                    scheduleWorkUnitLaneUrlSync({
                        queueKey: nextKey,
                        unmappedActive,
                        ...(naAlias ? { attentionBucket: attentionBucketKeyRef.current } : {}),
                        caller: "handleQueueTabChange",
                        workUnitId,
                    });
                }
                return;
            }
            userLaneTouchedRef.current = true;
            skipNextQueueFetchEffectRef.current = true;
            if (typeof window !== "undefined" && typeof performance !== "undefined") {
                pendingQueueTabPerfRef.current = true;
                alloyPerfSet("queue_tab_change_start", performance.now());
            }
            if (!sameQueue) {
                setSelectedQueueKeyTraced("handleQueueTabChange", nextKey);
            }
            if (prevUnmapped !== unmappedActive) {
                setLaneUnmappedOnly(unmappedActive);
            }
            const resolvedPill = resolveWorkUnitFetchQueueKeyFromPill(
                nextKey,
                attentionBucketKeyRef.current,
                wu ? { queue_definition: wu.queue_definition } : undefined
            );
            const na = resolvedPill.queueKey.trim().toLowerCase() === "needs_attention";
            const nextAttentionBucket =
                resolvedPill.attentionBucketOverride !== undefined
                    ? resolvedPill.attentionBucketOverride
                    : na && !nextKey.startsWith(ATTENTION_BUCKET_PILL_PREFIX)
                      ? ""
                      : attentionBucketKeyRef.current;
            if (resolvedPill.attentionBucketOverride !== undefined) {
                setAttentionBucketKey(resolvedPill.attentionBucketOverride);
            } else if (na && !nextKey.startsWith(ATTENTION_BUCKET_PILL_PREFIX)) {
                setAttentionBucketKey("");
            }
            if (workUnitId) {
                routeQueueSelectionRef.current = workUnitQueueSelectionFromPillKey(workUnitId, nextKey);
                explicitRouteQueueLockedRef.current = false;
                scheduleWorkUnitLaneUrlSync({
                    queueKey: nextKey,
                    unmappedActive,
                    ...(na ? { attentionBucket: nextAttentionBucket } : {}),
                    caller: "handleQueueTabChange",
                    workUnitId,
                });
            }
            if (workUnitId) {
                suppressQueueFetchEffectOnceRef.current = true;
                void fetchQueueItems(workUnitId, nextKey, null, {
                    logicalUnmapped: unmappedActive,
                    ...(resolvedPill.attentionBucketOverride !== undefined
                        ? { attentionBucketOverride: resolvedPill.attentionBucketOverride }
                        : na
                          ? { attentionBucketOverride: "" }
                          : {}),
                });
            }
        },
        [fetchQueueItems, setSelectedQueueKeyTraced, workUnitId]
    );

    const handleAttentionBucketSelect = useCallback(
        (bucketKey: string | null) => {
            if (!workUnitId) return;
            const next = (bucketKey ?? "").trim();
            userLaneTouchedRef.current = true;
            skipNextQueueFetchEffectRef.current = true;
            const pillKey = next
                ? `${ATTENTION_BUCKET_PILL_PREFIX}${next}`
                : "needs_attention";
            setSelectedQueueKeyTraced("handleAttentionBucketSelect", pillKey);
            setLaneUnmappedOnly(false);
            setAttentionBucketKey(next);
            routeQueueSelectionRef.current = workUnitQueueSelectionFromPillKey(workUnitId, pillKey);
            explicitRouteQueueLockedRef.current = false;
            scheduleWorkUnitLaneUrlSync({
                queueKey: pillKey,
                unmappedActive: false,
                attentionBucket: next,
                caller: "handleAttentionBucketSelect",
                workUnitId,
            });
            void fetchQueueItems(workUnitId, "needs_attention", null, {
                attentionBucketOverride: next,
            });
        },
        [fetchQueueItems, setSelectedQueueKeyTraced, workUnitId]
    );

    const fetchQueueSummaries = useCallback(
        async (wuId: string, options?: { force?: boolean }) => {
        const seq = ++queueSummariesRequestSeq.current;
        const qs = new URLSearchParams({
            include_previews: "false",
            count_mode: "exact",
            limit: "3",
            summary_mode: "all",
        });
        const route = appendWorkspaceSiteToUrl(
            `/api/admin/work-units/${encodeURIComponent(wuId)}/queues?${qs.toString()}`,
            selectedSiteId
        );
        if (
            !options?.force &&
            queueSummariesRef.current != null &&
            queueSummariesRoute === route
        ) {
            incrementRoutePostShellFetch("work_unit", "queue_summaries_skip");
            return;
        }
        setQueueSummariesError(null);
        setQueueSummariesRoute(route);
        const summariesFetchStart =
            typeof performance !== "undefined" ? performance.now() : 0;
        try {
            const init = workspaceDataFetchInit();
            if (typeof window !== "undefined" && typeof performance !== "undefined") {
                alloyPerfSet("work_unit_summaries_request_start", performance.now());
            }
            incrementRoutePostShellFetch("work_unit", "queue_summaries");
            const res = await dedupeAdminFetch(route, init);
            markRouteFetchTiming("work_unit", "queue_summaries", summariesFetchStart);
            if (typeof window !== "undefined" && typeof performance !== "undefined") {
                alloyPerfSet("work_unit_summaries_response_headers", performance.now());
            }
            const json = (await res.json().catch(() => ({}))) as {
                error?: string;
                queues?: QueueSummary[];
                work_unit_scope_total?: number | null;
                work_unit_scope_queue_key?: string | null;
            };
            if (typeof window !== "undefined" && typeof performance !== "undefined") {
                alloyPerfSet("work_unit_summaries_json_parse_done", performance.now());
            }
            if (!res.ok) {
                throw new Error(json.error ?? "Failed to load queues");
            }
            const qsOut = (json.queues ?? []) as QueueSummary[];
            if (seq === queueSummariesRequestSeq.current) {
                setQueueSummaries(qsOut);
                if (typeof window !== "undefined" && typeof performance !== "undefined") {
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => alloyPerfSet("work_unit_summaries_state_applied", performance.now()));
                    });
                }
                if (typeof window !== "undefined") {
                    console.warn("[pipeline-count-unify]", {
                        source: "work-unit-refresh",
                        work_unit_id: wuId,
                        queue_key: json.work_unit_scope_queue_key ?? null,
                        count: typeof json.work_unit_scope_total === "number" ? json.work_unit_scope_total : null,
                    });
                }
            }
        } catch (e) {
            if (seq === queueSummariesRequestSeq.current) {
                setQueueSummaries(null);
                setQueueSummariesError(e instanceof Error ? e.message : "Failed to load queues");
            }
        }
    },
        [selectedSiteId, queueSummariesRoute]
    );

    const hydrateDeferredQueueSummaryCounts = useCallback(async () => {
        const deferred = wuDeferredQueueKeysRef.current
            .map((k) => k.trim())
            .filter(Boolean);
        if (!workUnitId || deferred.length === 0) return;

        const qs = new URLSearchParams({
            include_previews: "false",
            count_mode: "exact",
            limit: "3",
            summary_mode: "partial",
            only_queue_keys: deferred.join(","),
        });
        const route = appendWorkspaceSiteToUrl(
            `/api/admin/work-units/${encodeURIComponent(workUnitId)}/queues?${qs.toString()}`,
            selectedSiteId
        );
        try {
            const res = await dedupeAdminFetch(route, workspaceDataFetchInit());
            const json = (await res.json().catch(() => ({}))) as { queues?: QueueSummary[] };
            if (!res.ok) return;
            const incoming = (json.queues ?? []) as QueueSummary[];
            if (!incoming.length) return;
            setQueueSummaries((prev) =>
                prev?.length ? mergeWorkUnitQueueSummaryCounts(prev, incoming) : incoming
            );
        } catch {
            /* counts are optional — pills keep skeleton until unavailable */
        }
    }, [selectedSiteId, workUnitId]);

    useEffect(() => {
        if (!siteSelectionReady) {
            return;
        }
        if (!departmentId || !workUnitId) {
            setLoading(false);
            setWorkUnit(null);
            setDept(null);
            setOq(null);
            setNeedsAttentionWorkUnitId(null);
            setQueueSummaries(null);
            setQueueSummariesError(null);
            setQueueSummariesRoute(null);
            setSelectedQueueKey(null);
            setQueueItems(null);
            setQueueItemsError(null);
            setQueueItemsRoute(null);
            setQueueItemsLoading(false);
            setOpportunityQueueRowResolved(null);
            setEnrollmentRightRailResolved(null);
            setWuPlacementRows(undefined);
            setWuScopeHasPlacements(false);
            setError("Missing department or work unit in the URL.");
            queueItemsLastFetchSigRef.current = null;
            queueRowLeaseSigsRef.current.clear();
            queueRowClientCacheRef.current.clear();
            workUnitDeferredScheduledRef.current = false;
            workUnitDetailReadyRef.current = false;
            pendingDeferredAfterWudRef.current = false;
            bootstrapWuRef.current = null;
            wuBootstrapAttentionRef.current = null;
            firstUsefulPaintMarkedRef.current = false;
            return;
        }

        let cancelled = false;
        void (async () => {
            markWorkUnitNavigationStart();
            setAdminV2PrimarySurfacePending(true, "work_unit_bootstrap_effect");
            const routeStart = typeof performance !== "undefined" ? performance.now() : 0;
            if (typeof performance !== "undefined" && typeof window !== "undefined") {
                alloyPerfSet("work_unit_start", routeStart);
                console.info("[wu-route-perf]", { event: "work_unit_route_mount", departmentId, workUnitId });
            }
            if (!seededWorkUnitShellRef.current) {
                setLoading(true);
            }
            setError(null);
            const init = workspaceDataFetchInit();
            workUnitDeferredScheduledRef.current = false;
            workUnitDetailReadyRef.current = false;
            pendingDeferredAfterWudRef.current = false;
            bootstrapWuRef.current = null;
            wuBootstrapAttentionRef.current = null;
            setWuQueueLaneAuthorityReady(false);
            bootstrapPrimaryRowKeyRef.current = null;
            bootstrapPrimaryRowFetchScheduledRef.current = false;
            suppressQueueFetchEffectOnceRef.current = false;
            if (!seededWorkUnitShellRef.current) {
                firstUsefulPaintMarkedRef.current = false;
                setWorkUnit(null);
                setDept(null);
            }
            setOq(null);
            setNeedsAttentionWorkUnitId(null);
            setOpportunityQueueRowResolved(null);
            setEnrollmentRightRailResolved(null);
            setEnrollmentActionsSettled(false);
            setWuPlacementRows(undefined);
            setWuScopeHasPlacements(false);
            setWuBootstrapAttentionBuckets(null);
            parallelPrimaryRowStartedRef.current = false;
            markWorkUnitRevealGateStart({ departmentId, workUnitId });

        const qFromUrlEffective =
            routeQueueSelectionRef.current?.queueKey.trim() ??
            initialLocationRef.current.queue.trim();

            const startParallelPrimaryRowFetchFromCache = () => {
                if (cancelled || parallelPrimaryRowStartedRef.current || userLaneTouchedRef.current) return;
                if (!orgId || !departmentId || !workUnitId) return;
                const hit = readWorkUnitPageCache(
                    orgId,
                    departmentId,
                    workUnitId,
                    principalUserId,
                    accessScopeFingerprint
                );
                const cachedWu = hit?.workUnit;
                if (!cachedWu || cachedWu.id !== workUnitId) return;
                const primaryKey = resolveBootstrapPrimaryQueueKey(
                    cachedWu as WorkUnitRow,
                    null,
                    qFromUrlEffective
                );
                if (!primaryKey) return;
                parallelPrimaryRowStartedRef.current = true;
                setQueueItemsLoading(true);
                const routeSel = routeQueueSelectionRef.current;
                const pillKey =
                    routeSel && routeSel.queueKey === primaryKey
                        ? workUnitActivePillKeyFromSelection({
                              ...routeSel,
                              queueKey: primaryKey,
                          })
                        : primaryKey;
                const abForFetch = initialLocationRef.current.attentionBucket.trim();
                void fetchQueueItemsRef.current(workUnitId, pillKey, null, {
                    ...(primaryKey.trim().toLowerCase() === "needs_attention" && abForFetch
                        ? { attentionBucketOverride: abForFetch }
                        : {}),
                });
            };
            startParallelPrimaryRowFetchFromCache();

            const runBootstrapPrimaryRowFetch = (wu: WorkUnitRow, summaries: QueueSummary[] | null) => {
                if (cancelled || bootstrapPrimaryRowFetchScheduledRef.current) return;
                bootstrapPrimaryRowFetchScheduledRef.current = true;
                if (userLaneTouchedRef.current) {
                    setWuQueueLaneAuthorityReady(true);
                    return;
                }
                const primaryKey = resolveBootstrapPrimaryQueueKey(wu, summaries, qFromUrlEffective);
                if (!primaryKey) {
                    setWuQueueLaneAuthorityReady(true);
                    return;
                }
                bootstrapPrimaryRowKeyRef.current = primaryKey;
                if (routeQueueSelectionRef.current) {
                    routeQueueSelectionRef.current = {
                        ...routeQueueSelectionRef.current,
                        queueKey: primaryKey,
                    };
                }
                const routeSel = routeQueueSelectionRef.current;
                const pillKey = routeSel
                    ? workUnitActivePillKeyFromSelection({
                          ...routeSel,
                          queueKey: primaryKey,
                      })
                    : primaryKey;
                setSelectedQueueKeyTraced("bootstrapPrimaryLane", pillKey);
                suppressQueueFetchEffectOnceRef.current = true;
                const abForFetch = initialLocationRef.current.attentionBucket.trim();
                void fetchQueueItemsRef.current(workUnitId, pillKey, null, {
                    ...(primaryKey.trim().toLowerCase() === "needs_attention" && abForFetch
                        ? { attentionBucketOverride: abForFetch }
                        : {}),
                });
                setWuQueueLaneAuthorityReady(true);
            };

            try {
                const abInit = initialLocationRef.current.attentionBucket.trim();
                try {
                    const bootstrapOwnership = workUnitBootstrapOwnershipFromSelection(
                        departmentId,
                        selectedSiteId,
                        routeQueueSelectionRef.current,
                        workUnitId
                    );
                    const { response: bootstrapRes, bootstrapOwner } =
                        await fetchWorkUnitOperationalBootstrapSession(bootstrapOwnership, "page");
                    if (bootstrapOwner !== "page") {
                        console.info("[wu-route-perf]", {
                            bootstrap_owner: bootstrapOwner,
                            departmentId,
                            workUnitId,
                        });
                        logPrefetchAdminV2("work_unit", bootstrapOwner === "reuse" ? "hit" : "inflight_join", {
                            department_id: departmentId,
                            work_unit_id: workUnitId,
                            bootstrap_owner: bootstrapOwner,
                        });
                    }
                    if (!bootstrapRes.ok && !cancelled) {
                        logAdminV2LegacyFanOut({
                            surface: "work_unit",
                            reason: "bootstrap_unavailable",
                            departmentId,
                            workUnitId,
                            status: bootstrapRes.status,
                        });
                    }
                    if (bootstrapRes.ok && !cancelled) {
                        const b = (await bootstrapRes.json().catch(() => ({}))) as {
                            error?: string;
                            department?: Partial<DeptRow> & { id?: string };
                            work_unit?: Partial<WorkUnitRow> & {
                                id?: string;
                                department_id?: string;
                            };
                            queue?: {
                                summaries?: QueueSummary[];
                                deferred_queue_keys?: string[];
                                work_unit_scope_total?: number | null;
                                work_unit_scope_queue_key?: string | null;
                                primary_lane?: {
                                    queue_key: string;
                                    route: string;
                                    items?: unknown[];
                                    total_omitted?: boolean;
                                    rows_deferred?: boolean;
                                };
                                attention?: {
                                    source?: string;
                                    execution_work_unit_id?: string;
                                    needs_attention_buckets?: NeedsAttentionBucketWithCount[];
                                };
                            };
                            kpi_placements?: {
                                items?: WorkspaceKpiPlacementRow[];
                                scope_has_placements?: boolean;
                            };
                            right_rail_actions?: ResolvedActionForClient[];
                        };

                        const wu = b.work_unit as WorkUnitRow | undefined;
                        const deptRow = b.department as DeptRow | undefined;
                        if (!wu?.id || wu.id !== workUnitId || wu.department_id !== departmentId) {
                            throw new Error("Bootstrap work unit invalid");
                        }
                        if (cancelled) return;
                        if (!deptRow?.id) {
                            throw new Error("Bootstrap department invalid");
                        }

                        try {
                            recordBootstrapPayloadBytes(
                                "work_unit",
                                new TextEncoder().encode(JSON.stringify(b)).length
                            );
                        } catch {
                            /* non-fatal */
                        }

                        setWorkUnit(wu);
                        setDept(deptRow);
                        if (orgId) {
                            writeWorkUnitPageCache(orgId, principalUserId, accessScopeFingerprint, {
                                departmentId,
                                dept: deptRow,
                                workUnit: wu,
                            });
                        }
                        workUnitDetailReadyRef.current = true;
                        bootstrapWuRef.current = wu;

                        const qs = (b.queue?.summaries ?? []) as QueueSummary[];
                        wuDeferredQueueKeysRef.current = Array.isArray(b.queue?.deferred_queue_keys)
                            ? b.queue.deferred_queue_keys
                            : [];
                        setQueueSummaries(qs);
                        setQueueSummariesError(null);
                        setQueueSummariesRoute(buildWorkUnitQueuesListRoute(workUnitId, selectedSiteId));
                        setWuQueueLaneAuthorityReady(true);

                        if (isEnrollmentLikeDepartmentKey(deptRow.key)) {
                            if (Array.isArray(b.right_rail_actions)) {
                                setEnrollmentRightRailResolved(b.right_rail_actions);
                            }
                            setEnrollmentActionsSettled(true);
                            if (!Array.isArray(b.right_rail_actions)) {
                                void fetchWorkspaceRightRailResolvedActions({
                                    departmentId,
                                    workUnitId,
                                    fetchInit: init,
                                })
                                    .then((list) => {
                                        if (!cancelled) {
                                            setEnrollmentRightRailResolved(
                                                Array.isArray(list) ? list : []
                                            );
                                        }
                                    })
                                    .catch(() => {
                                        /* rail optional — empty rail is a deliberate settled state */
                                    });
                            }
                        } else {
                            setEnrollmentActionsSettled(true);
                        }

                        if (b.queue?.attention?.execution_work_unit_id) {
                            const buckets = b.queue.attention.needs_attention_buckets ?? [];
                            wuBootstrapAttentionRef.current = {
                                execution_work_unit_id: b.queue.attention.execution_work_unit_id,
                                needs_attention_buckets: buckets,
                            };
                            setWuBootstrapAttentionBuckets(buckets);
                            setNeedsAttentionWorkUnitId(b.queue.attention.execution_work_unit_id);
                        } else if ((wu.key ?? "").trim().toLowerCase() === "needs_attention") {
                            setNeedsAttentionWorkUnitId(wu.id);
                        }

                        const pl = b.queue?.primary_lane;
                        const primaryRowsDeferred = pl?.rows_deferred === true;
                        let primaryLaneHydratedInline = false;
                        const authoritativePrimary = resolveBootstrapPrimaryQueueKey(
                            wu,
                            qs,
                            qFromUrlEffective
                        );

                        if (authoritativePrimary && !userLaneTouchedRef.current) {
                            bootstrapPrimaryRowKeyRef.current = authoritativePrimary;
                            if (routeQueueSelectionRef.current) {
                                routeQueueSelectionRef.current = {
                                    ...routeQueueSelectionRef.current,
                                    queueKey: authoritativePrimary,
                                };
                            }
                            const pillKey = routeQueueSelectionRef.current
                                ? workUnitActivePillKeyFromSelection({
                                      ...routeQueueSelectionRef.current,
                                      queueKey: authoritativePrimary,
                                  })
                                : authoritativePrimary;
                            setSelectedQueueKeyTraced("bootstrapPrimaryLane", pillKey);
                            const plMatchesAuthoritative = pl?.queue_key === authoritativePrimary;

                            if (
                                plMatchesAuthoritative &&
                                !primaryRowsDeferred &&
                                Array.isArray(pl.items)
                            ) {
                                bootstrapPrimaryRowFetchScheduledRef.current = true;
                                const summaryForLane =
                                    findQueueSummaryForSelection(qs, wu, authoritativePrimary) ??
                                    qs.find((x) => x.key === authoritativePrimary);
                                const queueMeta = summaryForLane ?? {
                                    key: authoritativePrimary,
                                    label: authoritativePrimary,
                                    entity_type: "opportunity" as const,
                                    priority: "standard" as const,
                                    display: "list" as const,
                                    count: pl.items.length,
                                    preview: [],
                                };
                                const primaryPayload: QueueItemsResult = {
                                    queue: {
                                        key: queueMeta.key,
                                        label: queueMeta.label,
                                        description: summaryForLane?.description,
                                        entity_type: queueMeta.entity_type,
                                        priority: queueMeta.priority,
                                        display: queueMeta.display,
                                    },
                                    items: pl.items,
                                    total: pl.items.length,
                                    limit: 20,
                                    offset: 0,
                                    ...(pl.total_omitted ? { total_omitted: true } : {}),
                                };
                                setQueueItems(primaryPayload);
                                setQueueItemsError(null);
                                setQueueItemsRoute(pl.route);
                                setQueueItemsLoading(false);
                                suppressQueueFetchEffectOnceRef.current = true;
                                const primaryAb =
                                    authoritativePrimary.trim().toLowerCase() === "needs_attention"
                                        ? abInit
                                        : "";
                                putQueueRowCache(
                                    queueRowClientCacheRef.current,
                                    viewScopeFingerprint,
                                    workUnitId,
                                    authoritativePrimary,
                                    primaryPayload,
                                    primaryAb
                                );
                                primaryLaneRowsSettledOnceRef.current = true;
                                primaryLaneHydratedInline = true;
                                if (typeof window !== "undefined" && typeof performance !== "undefined") {
                                    const laneAt = performance.now();
                                    alloyPerfSet("work_unit_primary_lane_ready", laneAt);
                                    console.info("[wu-route-perf]", {
                                        event: "work_unit_primary_lane_ready",
                                        departmentId,
                                        workUnitId,
                                        queue_key: authoritativePrimary,
                                    });
                                    requestAnimationFrame(() => {
                                        console.info("[wu-route-perf]", {
                                            event: "work_unit_first_list_paint",
                                            departmentId,
                                            workUnitId,
                                        });
                                    });
                                }
                            } else if (plMatchesAuthoritative && primaryRowsDeferred) {
                                setQueueItemsRoute(pl.route);
                                setQueueItemsLoading(true);
                                suppressQueueFetchEffectOnceRef.current = true;
                            } else if (!bootstrapPrimaryRowFetchScheduledRef.current) {
                                bootstrapPrimaryRowFetchScheduledRef.current = true;
                                setQueueItemsLoading(true);
                                suppressQueueFetchEffectOnceRef.current = true;
                                void fetchQueueItemsRef.current(workUnitId, authoritativePrimary, null, {
                                    ...(authoritativePrimary.trim().toLowerCase() === "needs_attention" &&
                                    abInit
                                        ? { attentionBucketOverride: abInit }
                                        : {}),
                                });
                            }
                        }

                        if (!cancelled) {
                            setLoading(false);
                            if (typeof window !== "undefined" && typeof performance !== "undefined") {
                                const shellAt = performance.now();
                                alloyPerfSet("shell_ready", shellAt);
                                alloyPerfSet("work_unit_shell_ready", shellAt);
                                alloyPerfSet("work_unit_bootstrap_ready", shellAt);
                                if (alloyPerfGet("work_unit_primary_lane_ready") == null) {
                                    alloyPerfSet("work_unit_primary_lane_ready", shellAt);
                                }
                            }
                            markFirstUsefulPaintOnceRef.current();
                        }

                        if (
                            !cancelled &&
                            primaryRowsDeferred &&
                            pl?.queue_key &&
                            pl.queue_key === authoritativePrimary &&
                            !primaryLaneHydratedInline &&
                            !userLaneTouchedRef.current
                        ) {
                            runBootstrapPrimaryRowFetch(wu, qs);
                        }

                        if (!cancelled) {
                            scheduleAdminV2BackgroundWork(() => {
                                if (b.kpi_placements) {
                                    setWuPlacementRows(b.kpi_placements.items ?? []);
                                    setWuScopeHasPlacements(b.kpi_placements.scope_has_placements === true);
                                } else {
                                    void loadWuKpiPlacements(wu);
                                }
                            }, { idleTimeoutMs: 1500, fallbackMs: 80 });
                            requestWorkUnitDeferredSupplementRef.current();
                        }
                        return;
                    }
                } catch {
                    if (!cancelled) {
                        logAdminV2LegacyFanOut({
                            surface: "work_unit",
                            reason: "bootstrap_error",
                            departmentId,
                            workUnitId,
                        });
                    }
                    /* fall through to legacy fan-out */
                }

                /** Legacy fan-out when operational-bootstrap unavailable — bootstrap path already exited on success. */
                const wuUrl = `/api/admin/work-units/${encodeURIComponent(workUnitId)}`;
                const deptUrl = `/api/admin/departments/${encodeURIComponent(departmentId)}`;
                const queueListRoute = buildWorkUnitQueuesListRoute(workUnitId, selectedSiteId);

                if (!cancelled) setQueueSummariesRoute(queueListRoute);

                if (typeof window !== "undefined" && typeof performance !== "undefined") {
                    alloyPerfSet("summaries_req", performance.now());
                    alloyPerfSet("work_unit_summaries_request_start", performance.now());
                }

                const rightRailP = fetchWorkspaceRightRailResolvedActions({
                    departmentId,
                    workUnitId,
                    fetchInit: init,
                }).catch(() => [] as ResolvedActionForClient[]);

                const summariesP = dedupeAdminFetch(queueListRoute, init).then(async (res) => {
                    const hdrT = performance.now();
                    if (typeof window !== "undefined" && typeof performance !== "undefined") {
                        alloyPerfSet("summaries_resp", hdrT);
                        alloyPerfSet("work_unit_summaries_response_headers", hdrT);
                    }
                    const j = (await res.json().catch(() => ({}))) as {
                        error?: string;
                        queues?: QueueSummary[];
                        deferred_queue_keys?: string[];
                        work_unit_scope_total?: number | null;
                        work_unit_scope_queue_key?: string | null;
                    };
                    if (typeof window !== "undefined" && typeof performance !== "undefined") {
                        alloyPerfSet("work_unit_summaries_json_parse_done", performance.now());
                    }
                    return { res, j, route: queueListRoute };
                });

                if (typeof window !== "undefined" && typeof performance !== "undefined") {
                    alloyPerfSet("work_unit_detail_req", performance.now());
                }
                const wuP = dedupeAdminFetch(wuUrl, init).then(async (res) => {
                    if (typeof window !== "undefined" && typeof performance !== "undefined") {
                        alloyPerfSet("work_unit_detail_resp", performance.now());
                    }
                    const j = (await res.json().catch(() => ({}))) as { error?: string } & Partial<WorkUnitRow>;
                    return { res, j };
                });

                if (typeof window !== "undefined" && typeof performance !== "undefined") {
                    alloyPerfSet("dept_req", performance.now());
                }
                const deptP = dedupeAdminFetch(deptUrl, init).then(async (res) => {
                    if (typeof window !== "undefined" && typeof performance !== "undefined") {
                        alloyPerfSet("dept_resp", performance.now());
                    }
                    const j = (await res.json().catch(() => ({}))) as { error?: string } & Partial<DeptRow>;
                    return { res, j };
                });

                const [wuR, deptR, rightRailList] = await Promise.all([wuP, deptP, rightRailP]);

                if (!wuR.res.ok) throw new Error(wuR.j.error ?? "Failed to load work unit");

                const wu = wuR.j as WorkUnitRow;
                if (wu.department_id !== departmentId) {
                    throw new Error("Work unit does not belong to this department");
                }

                if (!deptR.res.ok) throw new Error(deptR.j.error ?? "Failed to load department");

                if (!cancelled) {
                    const deptRow = deptR.j as DeptRow;
                    setWorkUnit(wu);
                    setDept(deptRow);
                    setEnrollmentRightRailResolved(Array.isArray(rightRailList) ? rightRailList : []);
                    setEnrollmentActionsSettled(true);
                    if (orgId) {
                        writeWorkUnitPageCache(orgId, principalUserId, accessScopeFingerprint, {
                            departmentId,
                            dept: deptRow,
                            workUnit: wu,
                        });
                    }
                }

                workUnitDetailReadyRef.current = true;
                bootstrapWuRef.current = wu;
                if ((wu.key ?? "").trim().toLowerCase() === "needs_attention") {
                    setNeedsAttentionWorkUnitId(wu.id);
                }
                void loadWuKpiPlacements(wu);
                if (pendingDeferredAfterWudRef.current) {
                    pendingDeferredAfterWudRef.current = false;
                }
                requestWorkUnitDeferredSupplement();

                if (!cancelled) {
                    setLoading(false);
                    if (typeof window !== "undefined" && typeof performance !== "undefined") {
                        const shellAt = performance.now();
                        alloyPerfSet("shell_ready", shellAt);
                        alloyPerfSet("work_unit_shell_ready", shellAt);
                    }
                }

                const isAttention = (wu.key ?? "").trim().toLowerCase() === "needs_attention";
                let usedNewQueueApi = false;
                let shouldFallbackToLegacy = false;

                let sumR: {
                    res: Response;
                    j: {
                        error?: string;
                        queues?: QueueSummary[];
                        deferred_queue_keys?: string[];
                        work_unit_scope_total?: number | null;
                        work_unit_scope_queue_key?: string | null;
                    };
                    route: string;
                };
                try {
                    sumR = await summariesP;
                } catch {
                    shouldFallbackToLegacy = true;
                    if (!cancelled) {
                        logAdminV2LegacyFanOut({
                            surface: "work_unit",
                            reason: "queue_summaries_failed",
                            departmentId,
                            workUnitId,
                        });
                        setQueueSummaries(null);
                        setQueueSummariesError("Queue request failed");
                        setQueueSummariesRoute(queueListRoute);
                        runBootstrapPrimaryRowFetch(wu, null);
                    }
                    sumR = {
                        res: new Response(null, { status: 0, statusText: "Network Error" }),
                        j: {},
                        route: queueListRoute,
                    };
                }

                const queuesRes = sumR.res;
                const j = sumR.j;
                const route = sumR.route;

                try {
                    if (queuesRes.ok) {
                        usedNewQueueApi = true;
                        if (!cancelled) {
                            const qs = (j.queues ?? []) as QueueSummary[];
                            wuDeferredQueueKeysRef.current = Array.isArray(j.deferred_queue_keys)
                                ? j.deferred_queue_keys
                                : [];
                            setQueueSummaries(qs);
                            setQueueSummariesError(null);
                            setQueueSummariesRoute(route);
                            setWuQueueLaneAuthorityReady(true);
                            if (typeof window !== "undefined") {
                                console.warn("[pipeline-count-unify]", {
                                    source: "work-unit",
                                    work_unit_id: workUnitId,
                                    queue_key: j.work_unit_scope_queue_key ?? null,
                                    count: typeof j.work_unit_scope_total === "number" ? j.work_unit_scope_total : null,
                                });
                            }
                            runBootstrapPrimaryRowFetch(wu, qs);
                            if (typeof window !== "undefined" && typeof performance !== "undefined") {
                                requestAnimationFrame(() => {
                                    requestAnimationFrame(() =>
                                        alloyPerfSet("work_unit_summaries_state_applied", performance.now())
                                    );
                                });
                            }
                            markFirstUsefulPaintOnce();
                        }
                    } else if (queuesRes.status === 501) {
                        shouldFallbackToLegacy = true;
                        if (!cancelled) {
                            logAdminV2LegacyFanOut({
                                surface: "work_unit",
                                reason: "queue_api_unsupported",
                                departmentId,
                                workUnitId,
                                status: 501,
                            });
                            setQueueSummaries(null);
                            setQueueSummariesError("Queue type not supported yet");
                            setQueueSummariesRoute(route);
                            runBootstrapPrimaryRowFetch(wu, null);
                        }
                    } else if (queuesRes.status !== 0) {
                        shouldFallbackToLegacy = false;
                        if (!cancelled) {
                            setQueueSummaries(null);
                            setQueueSummariesError(j.error ?? "Failed to load queues");
                            setQueueSummariesRoute(route);
                            runBootstrapPrimaryRowFetch(wu, null);
                        }
                    }
                } catch (e) {
                    shouldFallbackToLegacy = true;
                    if (!cancelled) {
                        logAdminV2LegacyFanOut({
                            surface: "work_unit",
                            reason: "queue_summaries_failed",
                            departmentId,
                            workUnitId,
                        });
                        setQueueSummaries(null);
                        setQueueSummariesError(e instanceof Error ? e.message : "Failed to load queues");
                        setQueueSummariesRoute(route);
                        runBootstrapPrimaryRowFetch(wu, null);
                    }
                }

                if (!bootstrapPrimaryRowFetchScheduledRef.current && !cancelled) {
                    runBootstrapPrimaryRowFetch(wu, null);
                }

                if (!cancelled) {
                    requestWorkUnitDeferredSupplement();
                }

                let oqRuntime: WorkspaceOpportunityQueueRuntime | null = null;
                if (!usedNewQueueApi && shouldFallbackToLegacy) {
                    try {
                        const oqBase = `/api/admin/work-units/${encodeURIComponent(workUnitId)}/${isAttention ? "opportunity-attention-queue" : "opportunity-queue"}`;
                        const oqRes = await fetch(appendWorkspaceSiteToUrl(oqBase, selectedSiteId), init);
                        const oqJson = (await oqRes.json().catch(() => ({}))) as {
                            error?: string;
                            total?: number;
                            items?: WorkspaceOpportunityQueueRuntime["items"];
                            attention_reason_counts?: unknown;
                        };
                        if (!oqRes.ok) {
                            oqRuntime = {
                                total: 0,
                                error: oqJson.error ?? "Failed to load queue",
                                items: [],
                            };
                        } else {
                            const arc = parseAttentionReasonCountsPayload(oqJson.attention_reason_counts);
                            oqRuntime = {
                                total: typeof oqJson.total === "number" ? oqJson.total : 0,
                                error: null,
                                items: oqJson.items ?? [],
                                ...(arc ? { attention_reason_counts: arc } : {}),
                            };
                        }
                    } catch (e) {
                        const msg = e instanceof Error ? e.message : "Queue request failed";
                        oqRuntime = { total: 0, error: msg, items: [] };
                    }
                }

                if (!cancelled) setOq(oqRuntime);
            } catch (e) {
                if (!cancelled) {
                    setError((e as Error).message);
                    setWorkUnit(null);
                    setDept(null);
                    setOq(null);
                    setNeedsAttentionWorkUnitId(null);
                    setQueueSummaries(null);
                    setQueueSummariesError(null);
                    setQueueSummariesRoute(null);
                    setSelectedQueueKey(null);
                    setQueueItems(null);
                    setQueueItemsError(null);
                    setQueueItemsRoute(null);
                    setQueueItemsLoading(false);
                    setOpportunityQueueRowResolved(null);
                    setEnrollmentRightRailResolved(null);
                    setWuQueueLaneAuthorityReady(true);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [departmentId, workUnitId, selectedSiteId, siteSelectionReady, orgId, principalUserId, accessScopeFingerprint, loadWuKpiPlacements]);

    const invalidate = useCallback(
        (opts?: { entity_type?: string; entity_id?: string; action_key?: string }) => {
            void opts;
            if (!workUnitId || !selectedQueueKey) return;
            deleteQueueRowCacheKeysForWorkUnit(queueRowClientCacheRef.current, viewScopeFingerprint, workUnitId);
            void Promise.all([
                fetchQueueItems(workUnitId, selectedQueueKey, queueSummaries, { force: true }),
                fetchQueueSummaries(workUnitId, { force: true }),
            ]);
        },
        [fetchQueueItems, fetchQueueSummaries, queueSummaries, selectedQueueKey, viewScopeFingerprint, workUnitId]
    );

    const queueSummariesRef = useRef(queueSummaries);
    queueSummariesRef.current = queueSummaries;

    useEffect(() => {
        if (!workUnitId || !selectedQueueKey) return;
        const onUpdated = (_ev: Event) => {
            const summaries = queueSummariesRef.current;
            deleteQueueRowCacheKeysForWorkUnit(queueRowClientCacheRef.current, viewScopeFingerprint, workUnitId);
            void Promise.all([
                fetchQueueItems(workUnitId, selectedQueueKey, summaries, { force: true }),
                fetchQueueSummaries(workUnitId, { force: true }),
            ]);
        };
        /** Drawer saves dispatch `adminv2:opportunity-updated` — bust row cache + refetch summaries for this lane (not drawer-only). */
        window.addEventListener("adminv2:opportunity-updated", onUpdated as EventListener);
        return () => window.removeEventListener("adminv2:opportunity-updated", onUpdated as EventListener);
    }, [fetchQueueItems, fetchQueueSummaries, selectedQueueKey, viewScopeFingerprint, workUnitId]);

    /** Row fetch after bootstrap authority — tab/bucket handlers may force; bootstrap owns first visible load (PERF-C-02). */
    useEffect(() => {
        if (!workUnitId || !selectedQueueKey || loading || !workUnit) return;
        if (!wuQueueLaneAuthorityReady) return;
        if (suppressQueueFetchEffectOnceRef.current) {
            suppressQueueFetchEffectOnceRef.current = false;
            return;
        }
        if (skipNextQueueFetchEffectRef.current) skipNextQueueFetchEffectRef.current = false;
        void fetchQueueItems(workUnitId, selectedQueueKey, null);
    }, [fetchQueueItems, selectedQueueKey, workUnitId, workUnit, loading, laneUnmappedOnly, selectedSiteId, wuQueueLaneAuthorityReady]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        if (!workUnitId || !departmentId || loading || !workUnit) return;
        if (!primaryLaneRowsSettledOnceRef.current) return;
        if (wuLanePreviewBundleDoneRef.current) return;
        return scheduleAdminV2BackgroundWork(
            () => {
                void warmWorkUnitLanePreviewCache();
            },
            { idleTimeoutMs: 1200, fallbackMs: 80 }
        );
    }, [
        workUnitId,
        departmentId,
        loading,
        workUnit,
        warmWorkUnitLanePreviewCache,
        wuQueueLaneAuthorityReady,
        queueSummaries,
    ]);

    /** Chip count context for atomic above-fold model (was inline queuePicker). */
    const workUnitChipBadgeContext = useMemo(() => {
        if (!queueSummaries?.length) {
            return { authoritative_badge_for_selected_tab: undefined as number | undefined, reconcile_picker_count_zero: false };
        }
        const selectedFetchKey = selectedQueueKey
            ? resolveWorkUnitFetchQueueKeyFromPill(
                  selectedQueueKey,
                  attentionBucketKey,
                  workUnit ? { queue_definition: workUnit.queue_definition } : undefined
              ).queueKey
            : null;
        const activeSummary = findQueueSummaryForSelection(queueSummaries, workUnit, selectedQueueKey) ?? queueSummaries[0];
        const tabNForSelected =
            activeSummary?.counts_deferred === true
                ? undefined
                : typeof activeSummary?.count === "number"
                  ? activeSummary.count
                  : undefined;
        const reconcilePickerCountZero =
            queueItems != null &&
            !queueItemsError &&
            !queueItemsLoading &&
            selectedFetchKey &&
            queueItems.queue.key === selectedFetchKey &&
            (queueItems.offset ?? 0) === 0 &&
            !(queueItems.items ?? []).some(queueItemPayloadHasId) &&
            queueItems.total_omitted === true &&
            typeof tabNForSelected === "number" &&
            tabNForSelected > 0;
        let authoritativeBadgeForSelectedTab: number | undefined;
        if (
            selectedFetchKey &&
            queueItems != null &&
            !queueItemsError &&
            !queueItemsLoading &&
            queueItems.queue.key === selectedFetchKey
        ) {
            if (queueItems.total_omitted !== true && typeof queueItems.total === "number" && Number.isFinite(queueItems.total)) {
                authoritativeBadgeForSelectedTab = Math.max(0, Math.floor(queueItems.total));
            } else if (
                queueItems.total_omitted === true &&
                (queueItems.offset ?? 0) === 0 &&
                !(queueItems.items ?? []).some(queueItemPayloadHasId)
            ) {
                authoritativeBadgeForSelectedTab = 0;
            }
        }
        return {
            authoritative_badge_for_selected_tab: authoritativeBadgeForSelectedTab,
            reconcile_picker_count_zero: reconcilePickerCountZero,
        };
    }, [
        queueSummaries,
        selectedQueueKey,
        attentionBucketKey,
        queueItems,
        queueItemsError,
        queueItemsLoading,
    ]);

    const queueModel = useMemo<WorkUnitWorkspaceModel | null>(() => {
        if (!workUnit || !dept) return null;

        const enrollmentActionsRail = (): WorkUnitWorkspaceModel["actionsRail"] => {
            const isEnrollmentDept = isEnrollmentLikeDepartmentKey(dept.key);
            const emptyBase = {
                primaries: [],
                systemActions: [],
                quickOperations: [],
                overflow: [],
            };
            return isEnrollmentDept
                ? mergeEnrollmentRightRailActions(enrollmentRightRailResolved ?? [], emptyBase)
                : emptyBase;
        };

        if (!queueSummaries && !queueSummariesError && !oq) {
            return {
                workspaceLevel: "work_unit",
                workUnitId: workUnit.id,
                departmentKey: dept.key ?? undefined,
                laneKey: "queue:loading",
                focusLabel: dept.name ?? "Department",
                aiSummary: {
                    headline: workUnit.name ?? "Queue",
                    subline: dept.name ?? "Department",
                    aiAwarenessLine: undefined,
                },
                laneInterpretation: null,
                signals: [],
                kpis: [],
                primaryQueue: {
                    id: `wu:${workUnit.id}:queue:loading`,
                    title: "",
                    laneQueueLabel: "Loading queues",
                    countBadge: undefined,
                    items: [],
                    rowsLoading: true,
                    sortCaption: undefined,
                    rollupSummary: undefined,
                },
                workSummary: null,
                actionsRail: enrollmentActionsRail(),
                contextRail: { title: "About", groups: [] },
            };
        }

        if (queueSummariesError && !queueSummaries && !oq) {
            return {
                workspaceLevel: "work_unit",
                workUnitId: workUnit.id,
                departmentKey: dept.key ?? undefined,
                laneKey: "queue:error",
                focusLabel: dept.name ?? "Department",
                aiSummary: {
                    headline: workUnit.name ?? "Queue",
                    subline: dept.name ?? "Department",
                    aiAwarenessLine: undefined,
                },
                laneInterpretation: {
                    laneStatusLine: "Queue summaries could not be loaded.",
                    recommendedActionLine: "Try reloading the page or pick another lane.",
                },
                signals: [],
                kpis: [],
                primaryQueue: {
                    id: `wu:${workUnit.id}:queue:error`,
                    title: "",
                    laneQueueLabel: "Error",
                    countBadge: undefined,
                    items: [],
                    rowsLoading: false,
                    sortCaption: queueSummariesError,
                    rollupSummary: undefined,
                },
                workSummary: null,
                actionsRail: enrollmentActionsRail(),
                contextRail: { title: "About", groups: [] },
            };
        }

        if (!queueSummaries) return null;

        const activeQueue = findQueueSummaryForSelection(queueSummaries, workUnit, selectedQueueKey) ?? queueSummaries[0];
        const activeQueueKey = String(activeQueue?.key ?? "");
        const workUnitKeyLower = (workUnit.key ?? "").trim().toLowerCase();
        const queueItemsKey =
            queueItems != null && typeof queueItems.queue === "object" && queueItems.queue != null
                ? String((queueItems.queue as { key?: string }).key ?? "")
                : "";

        const entity = queueItems?.queue.entity_type ?? activeQueue?.entity_type ?? "job";
        const rawList = (queueItems?.items ?? []) as unknown[];

        const unmappedClientFilter =
            laneUnmappedOnly &&
            Boolean(allRecordsQueueKey) &&
            selectedQueueKey === allRecordsQueueKey &&
            entity === "opportunity";

        const sourceRows = rawList
            .filter((r) => typeof (r as { id?: unknown })?.id === "string" && String((r as { id: string }).id).trim())
            .filter((r) => (unmappedClientFilter ? isRowUnmappedForThroughput(r, coveredThroughputStatusKeys) : true));

        const recordFilterResult = applyWorkUnitQueueRecordFilters(
            sourceRows as Record<string, unknown>[],
            recordFilters
        );
        const filteredSourceRows = recordFilterResult.items;

        const previewCfg = queueUi?.row_preview ?? {
            variant: "basic" as const,
            fields: ["title", "status"] as QueueUiRowPreviewField[],
            actions: ["open"] satisfies QueueUiRowPreviewAction[],
        };
        const previewFields = previewCfg.fields ?? (["title", "status"] as QueueUiRowPreviewField[]);
        const isEnrollmentDept = isEnrollmentLikeDepartmentKey(dept.key);
        const previewActions = resolveQueueRowPreviewActionsForWorkUnit({
            actions: previewCfg.actions,
            enrollmentLike: isEnrollmentDept,
        });
        const queueRowRegistry = opportunityQueueRowResolved ?? [];

        const liveVmItems = (
            filteredSourceRows as Array<Record<string, unknown> & { id?: string }>
        ).map((r) => {
                const listRowId = r.id as string;
                const opportunityId = readOpportunityIdFromQueueRow(r);
                const waitlistCandidate = parsePlacementWaitlistCandidateRowVm(
                    (r as { _placement_waitlist_row?: unknown })._placement_waitlist_row
                );
                const rid = opportunityId || listRowId;
                const title =
                    typeof r?.name === "string" && r.name.trim()
                        ? r.name.trim()
                        : typeof r?.title === "string" && r.title.trim()
                          ? r.title.trim()
                          : rid;
                const familyTitle =
                    typeof r?._customer_name === "string" && r._customer_name.trim()
                        ? r._customer_name.trim()
                        : title;
                const statusLabel =
                    typeof r?._status_display === "string" && r._status_display.trim()
                        ? r._status_display.trim()
                        : typeof r?.status_key === "string"
                          ? r.status_key
                          : "";
                const contactName =
                    typeof r?._primary_contact_line === "string" ? r._primary_contact_line.trim() : "";
                const phone = typeof r?._primary_phone === "string" ? r._primary_phone.trim() : "";
                const email = typeof r?._primary_email === "string" ? r._primary_email.trim() : "";
                const notePreview = formatOpportunityQueueNotesPreviewParts(
                    typeof r?._notes_preview === "string" ? r._notes_preview : null,
                    viewerTz
                );
                const note =
                    formatOpportunityQueueNotesPreview(
                        typeof r?._notes_preview === "string" ? r._notes_preview : null,
                        viewerTz
                    ) ?? "";
                const attnPres = buildQueueOperationalAttentionPresentation(r as Record<string, unknown>, {
                    queueScan: true,
                });
                const operationalReadResolved = resolveQueueOperationalReadSlot(r as Record<string, unknown>);
                const hasOperationalRead = Boolean(operationalReadResolved?.operationalRead);
                const attentionReason = hasOperationalRead
                    ? null
                    : attnPres.summaryLine ||
                      (typeof r?._attention_reason_label === "string" ? r._attention_reason_label.trim() : "");
                const operationalNextHint = hasOperationalRead ? null : attnPres.nextHintLine;

                const wfAt = typeof r?.last_activity_at === "string" && r.last_activity_at.trim() ? r.last_activity_at.trim() : null;
                const wfSummary =
                    typeof r?.last_activity_summary === "string" && r.last_activity_summary.trim()
                        ? r.last_activity_summary.trim()
                        : null;
                let activityLastLine: string | null = null;
                if (wfAt) {
                    const rel = formatActivityRelativeShort(wfAt, Date.now());
                    if (rel) activityLastLine = wfSummary ? `${rel} · ${wfSummary}` : rel;
                }
                const staleSig = r?.stale_signal as { label?: string; severity?: "low" | "medium" | "high" } | null | undefined;
                const activityStale =
                    staleSig && typeof staleSig.label === "string" && staleSig.label.trim()
                        ? { label: staleSig.label.trim(), severity: staleSig.severity ?? "low" }
                        : null;

                const personId =
                    typeof r?._primary_person_id === "string" ? r._primary_person_id.trim() : "";
                const quickActions: QueueItemQuickActionVm[] = mergeQueueRowQuickActions({
                    previewActions,
                    registryPlacements: queueRowRegistry,
                    enrollmentLike: isEnrollmentDept,
                    row: {
                        previewActions,
                        opportunityId: rid,
                        personId,
                        displayName: contactName || familyTitle,
                        email: email || null,
                        phone: phone || null,
                        rowRecord: r as Record<string, unknown>,
                    },
                });

                const want = (f: QueueUiRowPreviewField) => isRowPreviewFieldEnabled(previewFields, f);

                const locationLabel =
                    typeof r?._location_label === "string" && r._location_label.trim() ? r._location_label.trim() : "";
                const basicSubtitleParts: string[] = [];
                if (locationLabel) basicSubtitleParts.push(locationLabel);
                if (want("status") && statusLabel) basicSubtitleParts.push(`Status: ${statusLabel}`);
                if (want("primary_contact") && contactName) basicSubtitleParts.push(contactName);
                if ((want("phone") && phone) || (want("email") && email)) {
                    const bits = [want("phone") ? formatPhoneUS(phone) : "", want("email") ? email : ""].filter(
                        (s) => s && s !== "—"
                    );
                    if (bits.length) basicSubtitleParts.push(bits.join(" · "));
                }

                const needsAttentionRow = queueRowHasOperationalAttention(r as Record<string, unknown>);
                const placementPriorityV2Raw = (r as { _placement_priority_v2?: unknown })._placement_priority_v2;
                const placementPriorityV2 = parseQueueRowPlacementPriorityV2Vm(placementPriorityV2Raw);
                const placementPriorityV1 = parseQueueRowPlacementPriorityVm(
                    (r as { _placement_priority?: unknown })._placement_priority
                );
                const usePlacementV2 =
                    !waitlistCandidate &&
                    placementPriorityV2?.evaluated === true &&
                    placementPriorityV2.fallbackToV1 !== true;
                const placementPriority = usePlacementV2 || waitlistCandidate ? undefined : placementPriorityV1;

                const householdContextParts = [
                    waitlistCandidate?.familyDisplayName,
                    waitlistCandidate?.parentDisplayName,
                ].filter(Boolean);
                const waitlistHouseholdContext = waitlistCandidate
                    ? waitlistCandidate.parentDisplayName?.trim() || null
                    : householdContextParts.length
                      ? householdContextParts.join(" · ")
                      : null;

                const rowPrimaryIdentity = familyTitle;
                const rowTitle = familyTitle;
                const grainCtx = parseQueueRowGrainContext(r as Record<string, unknown>);

                return {
                    id: listRowId,
                    opportunityId: rid,
                    rowGrain: grainCtx.rowGrain,
                    placementCandidateId:
                        grainCtx.placementCandidateId ?? waitlistCandidate?.placementCandidateId,
                    opportunityCustomerMemberId: grainCtx.opportunityCustomerMemberId,
                    childLifecycleStatus: grainCtx.childLifecycleStatus,
                    title: rowTitle,
                    subtitle: previewCfg.variant === "basic" ? (basicSubtitleParts.filter(Boolean).join(" · ") || undefined) : undefined,
                    needsOperationalAttention: needsAttentionRow,
                    urgencyTier:
                        activeQueue?.priority === "critical"
                            ? ("critical" as const)
                            : needsAttentionRow
                              ? ("standard" as const)
                              : activeQueue?.priority === "attention"
                                ? ("warning" as const)
                                : workUnitKeyLower === "priced_followup"
                                  ? ("warning" as const)
                                  : ("standard" as const),
                    quickActions,
                    semanticCrmCompact:
                        previewCfg.variant === "crm_compact"
                            ? (() => {
                                  const slice = waitlistCandidate
                                      ? buildWorkUnitQueueCrmCompactRowSliceForPlacementCandidate(
                                            r as Record<string, unknown>,
                                            want,
                                            queueUi?.row_preview.fieldLabels,
                                            waitlistCandidate
                                        )
                                      : buildWorkUnitQueueCrmCompactRowSlice(
                                            r as Record<string, unknown>,
                                            want,
                                            queueUi?.row_preview.fieldLabels
                                        );
                                  const {
                                      crmPresentation,
                                      crmFactGroups,
                                      childrenLinesForVm,
                                      multiChildren,
                                      programDeduped,
                                      childDisplayLine,
                                  } = slice;
                                  return {
                                      primaryIdentity: rowPrimaryIdentity,
                                      waitlistHouseholdContext,
                                      childrenLines: waitlistCandidate ? null : childrenLinesForVm,
                                      childName: waitlistCandidate
                                          ? waitlistCandidate.childDisplayName
                                          : want("child_name")
                                            ? multiChildren
                                                ? null
                                                : childDisplayLine || childrenLinesForVm?.[0]?.primary || null
                                            : null,
                                      stageLabel: null,
                                      statusLabel: want("status") ? statusLabel || null : null,
                                      nextStep:
                                          typeof r?._next_step_preview === "string" && r._next_step_preview.trim()
                                              ? r._next_step_preview.trim()
                                              : null,
                                      lastActivity: activityLastLine,
                                      commercialValue: null,
                                      ...crmPresentation,
                                      crmFactGroups,
                                      programContext: waitlistCandidate
                                          ? waitlistCandidate.cohortLabel
                                          : want("program")
                                            ? childrenLinesForVm?.length || multiChildren
                                                ? null
                                                : programDeduped
                                            : null,
                                      roomContext: null,
                                      locationContext: locationLabel || null,
                                      attentionReason: attentionReason || null,
                                      operationalReadPreview: operationalReadResolved,
                                      operationalNextHint: operationalNextHint || null,
                                      childLifecycleSummary:
                                          !waitlistCandidate &&
                                          typeof (r as { _child_lifecycle_summary_display?: unknown })
                                              ._child_lifecycle_summary_display === "string"
                                              ? String(
                                                    (r as { _child_lifecycle_summary_display: string })
                                                        ._child_lifecycle_summary_display
                                                ).trim() || null
                                              : null,
                                      familyNote: note || null,
                                      familyNotePreview: notePreview,
                                      activityStale,
                                  };
                              })()
                            : undefined,
                    ...(placementPriority ? { placementPriority } : {}),
                    ...(waitlistCandidate ? { placementWaitlistCandidate: waitlistCandidate } : {}),
                    ...(placementPriorityV2 && usePlacementV2 ? { placementPriorityV2 } : {}),
                    ...(waitlistCandidate
                        ? {
                              groupKey: waitlistCandidate.cohortKey,
                              groupLabel: waitlistCandidate.cohortSectionTitle,
                          }
                        : usePlacementV2 && placementPriorityV2
                          ? {
                                groupLabel: placementPriorityV2.primaryCohortSectionTitle,
                            }
                          : placementPriority
                            ? {
                                  groupLabel: formatPlacementWaitlistSectionLabel(
                                      placementPriority.programGroupSectionTitle
                                  ),
                              }
                            : {}),
                };
            });

        if (
            !queueItemsError &&
            !queueItemsLoading &&
            queueItems &&
            activeQueueKey &&
            String(queueItems.queue.key ?? "") === activeQueueKey
        ) {
            queueRowsBufferRef.current = liveVmItems.slice();
            queueRowsBufferWorkUnitIdRef.current = workUnitId;
        }

        const hasBufferedRows = queueRowsBufferRef.current.length > 0;
        const tabSwitchInFlight =
            Boolean(
                queueItemsLoading &&
                    !loading &&
                    workUnit &&
                    selectedQueueKey &&
                    !queueItemsError &&
                    hasBufferedRows &&
                    (queueItems === null ||
                        (queueItemsKey !== "" && activeQueueKey !== "" && queueItemsKey !== activeQueueKey))
            );
        /** During lane transitions, always show buffered rows so we never flash another lane's hydrated list. */
        const rowsRefreshing = tabSwitchInFlight;
        const displayItems = rowsRefreshing ? queueRowsBufferRef.current : liveVmItems;
        queueDisplayItemsRef.current = displayItems;

        const laneTitle = workUnit.name ?? "Queue";
        const errorLine = queueItemsError
            ? `${queueItemsError}${queueItemsRoute ? ` · Route: ${queueItemsRoute}` : ""}`
            : undefined;

        const tabCount =
            activeQueue?.counts_deferred === true ? undefined : typeof activeQueue?.count === "number" ? activeQueue.count : undefined;
        const reconcileListEmptyVsTab =
            queueItems != null &&
            !queueItemsError &&
            !queueItemsLoading &&
            queueItems.queue.key === activeQueue?.key &&
            (queueItems.offset ?? 0) === 0 &&
            liveVmItems.length === 0 &&
            queueItems.total_omitted === true &&
            typeof tabCount === "number" &&
            tabCount > 0;
        const unmappedListView =
            unmappedClientFilter &&
            typeof unmappedPillCount === "number" &&
            unmappedPillCount >= 0;
        const effectiveRowTotal = unmappedListView
            ? unmappedPillCount
            : reconcileListEmptyVsTab
              ? 0
              : queueItems != null
                ? queueItems.total_omitted === true
                    ? tabCount
                    : queueItems.total
                : tabCount;
        const rowTotalDisplay = effectiveRowTotal == null ? "—" : String(effectiveRowTotal);
        const activeGrainPres = activeQueue
            ? resolveQueueGrainPresentation(activeQueue, normalizedQueueDef)
            : null;
        const laneCountCaption =
            effectiveRowTotal != null && activeGrainPres
                ? formatQueueCountLabel(effectiveRowTotal, activeGrainPres)
                : `${rowTotalDisplay} items`;
        const queueCountBadgePresentation =
            effectiveRowTotal != null && activeGrainPres
                ? buildQueueCountBadgePresentation(effectiveRowTotal, activeQueue?.label, activeGrainPres)
                : null;

        const placementDiagnostics: WorkUnitPlacementQueueDiagnostics | undefined =
            entity === "opportunity" &&
            queueItems &&
            !queueItemsError &&
            String(queueItems.queue.key ?? "") === activeQueueKey
                ? queueItems.placement_projection_diagnostics
                : undefined;

        const hasPlacementCandidateRows = liveVmItems.some((i) => i.placementWaitlistCandidate != null);
        const workUnitGroupHeaders = hasPlacementCandidateRows
            ? buildPlacementWaitlistWorkUnitGroupHeaders(
                  liveVmItems.map((item) => ({
                      groupKey: item.placementWaitlistCandidate?.cohortKey ?? undefined,
                      groupLabel: item.placementWaitlistCandidate?.cohortSectionTitle ?? undefined,
                  }))
              )
            : undefined;

        return {
            workspaceLevel: "work_unit",
            workUnitId: workUnit.id,
            departmentKey: dept.key ?? undefined,
            laneKey: `queue:${activeQueue?.key ?? "unknown"}`,
            focusLabel: dept.name ?? "Department",
            aiSummary: {
                headline: laneTitle,
                subline: activeQueue?.label ? `${dept.name ?? "Department"} · ${activeQueue.label}` : `${dept.name ?? "Department"}`,
                aiAwarenessLine: entity === "job" ? "Server-evaluated queues (previews only)." : undefined,
            },
            laneInterpretation:
                entity === "job"
                    ? {
                          laneStatusLine: rowsRefreshing
                              ? activeQueue?.label?.trim()
                                  ? `Refreshing ${activeQueue.label.trim()}…`
                                  : "Refreshing queue…"
                              : queueItemsLoading
                                ? "Loading queue items…"
                                : `Queue: ${activeQueue?.key ?? "—"} · ${laneCountCaption}`,
                          recommendedActionLine: "Open a row to view the record in the drawer.",
                      }
                    : null,
            signals: [],
            kpis: [],
            primaryQueue: {
                id: `wu:${workUnit.id}:queue:${activeQueue?.key ?? "unknown"}`,
                // Title lives in the shell headline + queue pills; body starts with rows only.
                title: "",
                laneQueueLabel: activeQueue?.label?.trim() || activeQueue?.key || undefined,
                countBadge: effectiveRowTotal,
                countBadgeUnit: queueCountBadgePresentation?.countUnit,
                countBadgeAriaLabel: queueCountBadgePresentation?.countAriaLabel,
                items: displayItems,
                sortCaption: errorLine
                    ? errorLine
                    : unmappedListView
                      ? "Unmapped / other bucket: list is filtered on the client from the current server page of the all-records lane — use full lane or fix stage filters for complete paging."
                      : recordFilterResult.filteredCount < recordFilterResult.totalLoaded
                        ? `Showing ${recordFilterResult.filteredCount} of ${recordFilterResult.totalLoaded} loaded records (filters apply to current page).`
                        : undefined,
                placementProjectionHint: undefined,
                placementDisplay: placementDiagnostics?.display,
                rollupSummary: undefined,
                queueEntityType: entity,
                rowsLoading: false,
                rowsRefreshing,
                ...(workUnitGroupHeaders ? { workUnitGroupHeaders } : {}),
            },
            workSummary: null,
            actionsRail: enrollmentActionsRail(),
            contextRail: { title: "About", groups: [] },
        };
    }, [
        dept,
        enrollmentRightRailResolved,
        oq,
        queueItems,
        queueItemsError,
        queueItemsLoading,
        queueItemsRoute,
        queueSummaries,
        queueSummariesError,
        selectedQueueKey,
        workUnit,
        loading,
        queueUi,
        laneUnmappedOnly,
        allRecordsQueueKey,
        coveredThroughputStatusKeys,
        unmappedPillCount,
        viewerTz,
        opportunityQueueRowResolved,
        normalizedQueueDef,
        recordFilters,
    ]);

    const queueUiPresentationFlags = useMemo(
        () => readQueueUiPresentationFlags(workUnit?.queue_definition),
        [workUnit?.queue_definition]
    );

    const showOtherBucketPill =
        !queueUiPresentationFlags.suppressOtherPill &&
        typeof unmappedPillCount === "number" &&
        unmappedPillCount > 0 &&
        Boolean(allRecordsQueueKey) &&
        Boolean(otherPillSectionKey);

    const workUnitLifecyclePanel = useMemo(() => {
        if (!queueModel || queueUiPresentationFlags.suppressLifecyclePanel) return null;
        return (
            <WorkUnitLifecycleCoveragePanel
                hasLifecycleThroughput={hasLifecycleThroughput}
                showOtherPill={showOtherBucketPill}
                coverage={lifecycleCoverage}
                allRecordsQueueKey={allRecordsQueueKey}
                selectedQueueKey={selectedQueueKey}
                queueItems={queueItems?.items}
                queueItemsLoading={queueItemsLoading}
                coveredStatusKeys={coveredThroughputStatusKeys}
            />
        );
    }, [
        queueModel,
        hasLifecycleThroughput,
        showOtherBucketPill,
        lifecycleCoverage,
        allRecordsQueueKey,
        selectedQueueKey,
        queueItems?.items,
        queueItemsLoading,
        coveredThroughputStatusKeys,
        queueUiPresentationFlags.suppressLifecyclePanel,
    ]);

    const recordFilterContext = useMemo(() => {
        if (!workUnit || !selectedQueueKey?.trim()) return null;
        const active = findQueueSummaryForSelection(queueSummaries, workUnit, selectedQueueKey);
        const queueKey = String(active?.key ?? selectedQueueKey).trim();
        const entityType = (active?.entity_type ??
            queueItems?.queue.entity_type ??
            "opportunity") as "job" | "schedule" | "opportunity";
        return {
            entityType,
            queueKey,
            grain: active?.grain,
            domain: active?.domain,
            isNeedsAttention: queueKey.toLowerCase() === "needs_attention",
        };
    }, [workUnit, selectedQueueKey, queueSummaries, queueItems?.queue.entity_type]);

    const recordFilterFacets = useMemo(() => {
        if (!recordFilterContext) return null;
        const rawRows = ((queueItems?.items ?? []) as unknown[])
            .filter((r) => typeof (r as { id?: unknown })?.id === "string")
            .map((r) => r as Record<string, unknown>);
        const extracted = extractWorkUnitQueueRecordFilterFacets(rawRows);
        const facets = buildWorkUnitQueueRecordFilterFacets(recordFilterContext, extracted);
        if (recordFilterContext.isNeedsAttention && wuBootstrapAttentionBuckets?.length) {
            const byKey = new Map(facets.attentionReasonOptions.map((o) => [o.value, o]));
            for (const b of wuBootstrapAttentionBuckets) {
                const key = String(b.key ?? "").trim();
                if (!key || byKey.has(key)) continue;
                byKey.set(key, { value: key, label: String(b.label ?? b.key ?? key).trim() || key });
            }
            facets.attentionReasonOptions = [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label));
        }
        return facets;
    }, [recordFilterContext, queueItems?.items, wuBootstrapAttentionBuckets]);

    const recordFilterApplySnapshot = useMemo(() => {
        if (!queueItems?.items?.length) {
            return { filteredCount: null as number | null, totalLoaded: null as number | null };
        }
        const rawRows = ((queueItems.items ?? []) as unknown[])
            .filter((r) => typeof (r as { id?: unknown })?.id === "string")
            .map((r) => r as Record<string, unknown>);
        const result = applyWorkUnitQueueRecordFilters(rawRows, recordFilters);
        return { filteredCount: result.filteredCount, totalLoaded: result.totalLoaded };
    }, [queueItems?.items, recordFilters]);

    const workUnitRecordFilterBar = useMemo(() => {
        if (!recordFilterContext || !recordFilterFacets || !queueModel) return null;
        return (
            <WorkUnitQueueRecordFilterBar
                context={recordFilterContext}
                facets={recordFilterFacets}
                filters={recordFilters}
                onChange={handleRecordFiltersChange}
                onClear={handleRecordFiltersClear}
                filteredCount={recordFilterApplySnapshot.filteredCount}
                totalLoaded={recordFilterApplySnapshot.totalLoaded}
                disabled={queueItemsLoading}
            />
        );
    }, [
        recordFilterContext,
        recordFilterFacets,
        queueModel,
        recordFilters,
        handleRecordFiltersChange,
        handleRecordFiltersClear,
        recordFilterApplySnapshot.filteredCount,
        recordFilterApplySnapshot.totalLoaded,
        queueItemsLoading,
    ]);

    const model = useMemo(() => {
        if (!workUnit || !dept || !oq) return null;
        const rawItems = oq.items ?? [];
        const statusKeysRaw = legacyFilterStatusKeys;
        const statusKeys = statusKeysRaw
            ? statusKeysRaw
                  .split(",")
                  .map((s) => s.trim().toLowerCase())
                  .filter(Boolean)
            : [];
        const attentionReason = legacyFilterAttentionReason;
        const attentionReasonCode = legacyFilterAttentionReasonCode;
        const activitySignalKey = legacyFilterActivitySignalKey;

        const filteredItems = rawItems.filter((it) => {
            if (statusKeys.length) {
                const sk = String(it.status_key ?? "").trim().toLowerCase();
                if (!statusKeys.includes(sk)) return false;
            }
            if (attentionReasonCode) {
                const rcPrimary = String((it as { _attention_reason?: string | null })._attention_reason ?? "").trim();
                const details = (it as { _attention_reasons_detail?: unknown })._attention_reasons_detail;
                let codeMatch = rcPrimary === attentionReasonCode;
                if (!codeMatch && Array.isArray(details)) {
                    codeMatch = details.some(
                        (x) =>
                            x != null &&
                            typeof x === "object" &&
                            String((x as { code?: unknown }).code ?? "").trim() === attentionReasonCode
                    );
                }
                if (!codeMatch) return false;
            } else if (attentionReason) {
                const rl = String((it as { _attention_reason_label?: string | null })._attention_reason_label ?? "").trim();
                if (rl !== attentionReason) return false;
            }
            if (activitySignalKey) {
                const k = String((it as { stale_signal?: { key?: string | null } | null }).stale_signal?.key ?? "").trim();
                if (k !== activitySignalKey) return false;
            }
            return true;
        });

        const oqFiltered: WorkspaceOpportunityQueueRuntime = {
            total: filteredItems.length,
            error: oq.error,
            items: filteredItems,
            attention_reason_counts: oq.attention_reason_counts,
        };
        const previewCfg = queueUi?.row_preview;
        const rowPreviewActions = resolveQueueRowPreviewActionsForWorkUnit({
            actions: previewCfg?.actions,
            enrollmentLike: isEnrollmentLikeDepartmentKey(dept.key),
        });
        return buildRealOpportunityWorkUnitWorkspaceModel({
            workUnitId: workUnit.id,
            workUnitKey: workUnit.key ?? "work_unit",
            workUnitName: workUnit.name ?? "Work unit",
            departmentId,
            deptName: dept.name ?? "Department",
            departmentKey: dept.key,
            oq: oqFiltered,
            rowPreviewActions,
            queueRowRegistryPlacements: opportunityQueueRowResolved ?? [],
            rightRailResolved: enrollmentRightRailResolved ?? [],
            rowPreviewFieldLabels: queueUi?.row_preview.fieldLabels ?? null,
        });
    }, [
        departmentId,
        dept,
        enrollmentRightRailResolved,
        opportunityQueueRowResolved,
        oq,
        queueUi,
        legacyFilterStatusKeys,
        legacyFilterAttentionReason,
        legacyFilterAttentionReasonCode,
        legacyFilterActivitySignalKey,
        workUnit,
    ]);

    const workUnitKpiContext = useMemo(() => {
        if (!workUnit?.id || !departmentId) return null;
        const summariesForKpi =
            displayQueueSummaries?.map((q) => ({
                key: q.key,
                label: q.label,
                count: q.count,
                counts_deferred: q.counts_deferred,
                grain: q.grain,
                domain: q.domain,
                overlay: q.overlay,
            })) ?? null;
        const qi = queueItems
            ? {
                  queue: { key: queueItems.queue.key },
                  total: queueItems.total,
                  total_omitted: queueItems.total_omitted,
                  offset: queueItems.offset,
                  items: queueItems.items ?? [],
              }
            : null;

        let legacyOpportunityListTotal: number | null = null;
        if (!queueSummaries && model) {
            const badge = model.primaryQueue?.countBadge;
            if (typeof badge === "number" && !Number.isNaN(badge)) {
                legacyOpportunityListTotal = badge;
            } else if (model.primaryQueue?.items) {
                legacyOpportunityListTotal = model.primaryQueue.items.length;
            }
        }

        return workUnitContextFromParts({
            workUnitId: workUnit.id,
            queueSummaries: summariesForKpi,
            queueSummariesLoading: queueSummaries === null && queueSummariesError === null,
            queueSummariesError,
            selectedQueueKey,
            queueItems: qi,
            queueItemsLoading,
            queueItemsError,
            legacyOpportunityListTotal,
            normalizedQueueDefinition: normalizedQueueDef,
        });
    }, [
        departmentId,
        workUnit?.id,
        displayQueueSummaries,
        normalizedQueueDef,
        queueSummariesError,
        selectedQueueKey,
        queueItems,
        queueItemsLoading,
        queueItemsError,
        model,
    ]);

    const wuResolvedPlacementKpis = useMemo(() => {
        if (suppressWorkUnitKpiStrip) return [];
        if (!workUnitKpiContext) return undefined;
        if (wuPlacementRows === undefined) return undefined;
        return resolveKpisForWorkUnit({
            placementRows: wuPlacementRows,
            scopeHasPlacementRows: wuScopeHasPlacements,
            context: workUnitKpiContext,
        }).items;
    }, [suppressWorkUnitKpiStrip, wuPlacementRows, wuScopeHasPlacements, workUnitKpiContext]);

    const enrollmentRightRailByKey = useMemo(() => {
        const m = new Map<string, ResolvedActionForClient>();
        for (const a of enrollmentRightRailResolved ?? []) m.set(a.key, a);
        return m;
    }, [enrollmentRightRailResolved]);

    const needsAttentionHref = useMemo(() => {
        if (!departmentId) return appendWorkspaceSiteToPath(WORKSPACE_BASE, selectedSiteId);
        if (!needsAttentionWorkUnitId) {
            return appendWorkspaceSiteToPath(`${WORKSPACE_BASE}/dept/${encodeURIComponent(departmentId)}`, selectedSiteId);
        }
        return appendWorkspaceSiteToPath(
            `${WORKSPACE_BASE}/dept/${encodeURIComponent(departmentId)}/work-unit/${encodeURIComponent(
                needsAttentionWorkUnitId
            )}?queue=needs_attention`,
            selectedSiteId
        );
    }, [departmentId, needsAttentionWorkUnitId, selectedSiteId]);

    const queueRowResolvedByKey = useMemo(() => {
        const m = new Map<string, ResolvedActionForClient>();
        for (const a of opportunityQueueRowResolved ?? []) m.set(a.key, a);
        return m;
    }, [opportunityQueueRowResolved]);

    useEffect(() => {
        if (!updateStatusFormOpen) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await dedupeAdminFetchWithTtl(
                    "/api/admin/status-options?entity_type=opportunities",
                    { ...workspaceDataFetchInit(), credentials: "include" },
                    60_000
                );
                const j = (await res.json().catch(() => ({}))) as { options?: Array<{ value: string; label: string }>; error?: string };
                if (!cancelled && res.ok) setStatusOptions(j.options ?? []);
            } catch {
                if (!cancelled) setStatusOptions([]);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [updateStatusFormOpen]);

    const opportunityWorkspaceContext = useMemo(
        () =>
            workUnit?.id && departmentId
                ? { work_unit_id: workUnit.id, department_id: departmentId }
                : null,
        [departmentId, workUnit?.id]
    );
    const oppDrawerExtra = opportunityWorkspaceContext ? { opportunityWorkspaceContext } : {};

    const buildWuOpportunityQueueNavigator = useCallback(() => {
        if (!workUnit?.id || !departmentId) return null;
        const selection = routeQueueSelectionRef.current;
        if (!selection || selection.workUnitId !== workUnit.id) return null;
        const entityType = (queueItems?.queue.entity_type ?? "opportunity").trim().toLowerCase();
        if (entityType !== "opportunity") return null;
        if (
            !opportunityDrawerNavigatorMatchesWorkUnitSelection({
                selection,
                selected_pill_key: selectedQueueKeyRef.current,
                loaded_queue_key: queueItems?.queue.key ?? null,
                attention_bucket_key: attentionBucketKeyRef.current,
                work_unit: workUnit ? { queue_definition: workUnit.queue_definition } : null,
            })
        ) {
            return null;
        }
        const fetchQueueKey = workUnitQueueSelectionFetchQueueKey(
            selection,
            workUnit ? { queue_definition: workUnit.queue_definition } : null
        );
        const summary =
            findQueueSummaryForSelection(queueSummaries, workUnit, selectedQueueKeyRef.current) ??
            queueSummaries?.find((q) => q.key === fetchQueueKey);
        return buildOpportunityDrawerQueueNavigatorFromDisplayItems({
            work_unit_id: workUnit.id,
            department_id: departmentId,
            queue_key: fetchQueueKey,
            selection,
            displayItems: queueDisplayItemsRef.current,
            total_count: summary?.count ?? queueDisplayItemsRef.current.length,
            generation: queueNavGenerationRef.current,
        });
    }, [departmentId, queueItems?.queue.entity_type, queueItems?.queue.key, queueSummaries, workUnit?.id]);

    const buildOpportunityDrawerOpenParams = useCallback(
        (opportunityId: string, extra?: { defaultOpportunitySurface?: "quote_intake" }) => {
            const id = opportunityId.trim();
            const previewRow =
                findQueuePreviewItemById(queueDisplayItemsRef.current, id) ??
                findQueuePreviewItemById(queueRowsBufferRef.current, id);
            return {
                type: "opportunities" as const,
                id,
                ...oppDrawerExtra,
                ...extra,
                opportunityQueuePreviewSeed: previewRow
                    ? opportunityDrawerSeedFromQueueItem(previewRow)
                    : undefined,
                opportunityQueueNavigator: buildWuOpportunityQueueNavigator() ?? undefined,
            };
        },
        [buildWuOpportunityQueueNavigator, oppDrawerExtra]
    );

    useEffect(() => {
        queueNavGenerationRef.current = bumpOpportunityDrawerAdjacentPrefetchGeneration();
    }, [
        selectedQueueKey,
        attentionBucketKey,
        workUnitId,
        queueItems?.items,
        queueItems?.queue.key,
    ]);

    const openWorkUnitQueueRecord = useCallback(
        (itemId: string, entityType: "opportunity" | "job" | "schedule", source: string) => {
            const id = itemId.trim();
            if (!id) {
                logAdminV2QueueRowClick({
                    phase: "open_drawer",
                    itemId,
                    actionId: "open_record",
                    handlerReached: source,
                    drawerCalled: false,
                    extra: { reason: "empty_item_id" },
                });
                return;
            }
            logAdminV2QueueRowClick({
                phase: "open_drawer",
                itemId: id,
                actionId: "open_record",
                queueKey: selectedQueueKeyRef.current,
                entityType,
                handlerReached: source,
                drawerCalled: true,
            });
            if (entityType === "job") {
                openDrawer({ type: "jobs", id, jobRecordSurface: "drawer" });
                return;
            }
            if (entityType === "schedule") {
                openDrawer({ type: "schedules", id });
                return;
            }
            const previewRow =
                findQueuePreviewItemById(queueDisplayItemsRef.current, id) ??
                findQueuePreviewItemById(queueRowsBufferRef.current, id);
            const opportunityQueuePreviewSeed = previewRow
                ? opportunityDrawerSeedFromQueueItem(previewRow)
                : undefined;
            markDrawerRowClickStart();
            prefetchOpportunityDrawerOnRowIntent(id, opportunityWorkspaceContext ?? undefined, opportunityQueuePreviewSeed);
            openDrawer(buildOpportunityDrawerOpenParams(id));
        },
        [buildOpportunityDrawerOpenParams, openDrawer, opportunityWorkspaceContext]
    );

    const onAction = useCallback(
        async (action: WorkspaceAction) => {
            if (action.type === "queue.item.action") {
                logAdminV2QueueRowClick({
                    phase: "onAction",
                    itemId: action.itemId,
                    actionId: action.actionId,
                    queueId: action.queueId,
                    queueKey: selectedQueueKeyRef.current,
                    handlerReached: "onAction_entry",
                    extra: {
                        payloadSource:
                            action.payload && typeof action.payload === "object"
                                ? (action.payload as { source?: string }).source ?? null
                                : null,
                    },
                });
            }
            if (
                action.type === "actions.block" &&
                action.actionId.startsWith(REGISTRY_RIGHT_RAIL_ACTION_ID_PREFIX)
            ) {
                const key = action.actionId.slice(REGISTRY_RIGHT_RAIL_ACTION_ID_PREFIX.length);
                const resolved = enrollmentRightRailByKey.get(key);
                if (!resolved) return;
                const out = await applyRegistryResolvedActionClient(resolved, {
                    router,
                    openDrawer,
                    openForm: () => {
                        // Action forms are currently owned by the opportunity drawer (v1 scope).
                        // Right-rail actions in the enrollment work unit do not use forms yet.
                    },
                    invalidate,
                    departmentId,
                    workUnitId: workUnit?.id ?? null,
                    needsAttentionHref,
                    context: {
                        surface: "right_rail",
                        department_id: departmentId,
                        work_unit_id: workUnit?.id ?? null,
                    },
                });
                const wf = out.ok ? out.execution_result?.workflow_run_id : undefined;
                if (typeof wf === "string" && wf.trim()) {
                    setActionFeedback(`Workflow run ${wf.trim().slice(0, 8)}… completed.`);
                }
                return;
            }
            if (action.type === "queue.item.action" && action.actionId === "open_record" && action.itemId) {
                const payload =
                    action.payload && typeof action.payload === "object"
                        ? (action.payload as Record<string, unknown>)
                        : {};
                const fromPayload =
                    typeof payload.entityType === "string" ? payload.entityType.trim().toLowerCase() : "";
                const queueEt = queueItems?.queue.entity_type;
                const entityType =
                    fromPayload === "job" || fromPayload === "schedule" || fromPayload === "opportunity"
                        ? (fromPayload as "opportunity" | "job" | "schedule")
                        : queueEt === "job" || queueEt === "schedule"
                          ? queueEt
                          : "opportunity";
                openWorkUnitQueueRecord(action.itemId, entityType, "open_record_branch");
                return;
            }
            if (
                action.type === "queue.item.action" &&
                action.payload &&
                typeof action.payload === "object" &&
                (action.payload as { source?: string }).source === "action_registry" &&
                action.actionId &&
                action.itemId
            ) {
                const rowPayload = parseQueueRowActionPayload(action.payload);
                const registryLookupKey = rowPayload.registryKey?.trim() || action.actionId;
                const resolved = queueRowResolvedByKey.get(registryLookupKey);
                const queueItem = findQueuePreviewItemById(queueDisplayItemsRef.current, action.itemId);
                const queuePreview = queueBosHandoffPreviewFromOperationalRead(
                    queueItem?.semanticCrmCompact?.operationalReadPreview ?? null
                );
                const rowInvocation = buildQueueRowInvocation({
                    itemId: action.itemId,
                    payload: action.payload,
                    departmentId,
                    workUnitId: workUnit?.id ?? null,
                    queueKey: selectedQueueKeyRef.current,
                    queuePreview,
                    displayNameFallback: queueItem?.title?.trim() ?? null,
                });
                if (
                    resolved?.key === "ask_bos" ||
                    action.actionId === "ask_bos" ||
                    (resolved?.action_type === "ui_intent" &&
                        String(resolved.payload?.intent ?? "").trim() === "ask_bos")
                ) {
                    await launchContextualAskBos(rowInvocation);
                    return;
                }
                if (
                    resolved?.key === "quick_message" ||
                    resolved?.key === "send_message_placeholder" ||
                    action.actionId === "quick_message" ||
                    (resolved?.action_type === "ui_intent" &&
                        String(resolved.payload?.intent ?? "").trim() === "quick_message")
                ) {
                    await launchContextualQuickMessage(rowInvocation);
                    return;
                }
                if (resolved?.action_type === "open_drawer") {
                    logAdminV2QueueRowClick({
                        phase: "registry_action",
                        itemId: action.itemId,
                        actionId: action.actionId,
                        queueKey: selectedQueueKeyRef.current,
                        handlerReached: "registry_open_drawer",
                        registryKey: resolved.key,
                        drawerCalled: true,
                    });
                    await applyRegistryResolvedActionClient(resolved, {
                        router,
                        openDrawer: (opts) => openDrawer(opts),
                        entityId: action.itemId,
                        departmentId,
                        workUnitId: workUnit?.id ?? null,
                        invalidate,
                        needsAttentionHref,
                        invocationContext: rowInvocation,
                        context: {
                            surface: "queue_row",
                            department_id: departmentId,
                            work_unit_id: workUnit?.id ?? null,
                        },
                    });
                    return;
                }
                if (resolved && resolved.action_type === "open_form") {
                    const formKey =
                        resolved.payload?.form_key != null ? String(resolved.payload.form_key).trim() : "";
                    if (formKey === "update_status_add_note") {
                        setUpdateStatusTargetId(action.itemId);
                        setUpdateStatusFormOpen(true);
                        return;
                    }
                    if (formKey === "contact_attempted") {
                        setContactAttemptedTargetId(action.itemId);
                        setContactAttemptedOpen(true);
                        return;
                    }
                }
                if (resolved) {
                    logAdminV2QueueRowClick({
                        phase: "registry_action",
                        itemId: action.itemId,
                        actionId: action.actionId,
                        queueKey: selectedQueueKeyRef.current,
                        handlerReached: "applyRegistryResolvedActionClient",
                        registryKey: resolved.key,
                    });
                    const out = await applyRegistryResolvedActionClient(resolved, {
                        router,
                        openDrawer: (opts) => openDrawer(opts),
                        entityId: action.itemId,
                        departmentId,
                        workUnitId: workUnit?.id ?? null,
                        invalidate,
                        needsAttentionHref,
                        invocationContext: rowInvocation,
                        context: {
                            surface: "queue_row",
                            department_id: departmentId,
                            work_unit_id: workUnit?.id ?? null,
                        },
                    });
                    if (!out.ok) {
                        setActionSurfaceError(formatRegistryActionFailure(out.error));
                        console.warn("[work-unit queue row]", out.error);
                    } else {
                        setActionSurfaceError(null);
                    }
                    return;
                }
                const res = await fetch("/api/admin/actions/execute", {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        action_key: action.actionId,
                        entity_type: "opportunity",
                        entity_id: action.itemId,
                        context: {
                            surface: "queue_row",
                            work_unit_id: workUnit?.id ?? null,
                            department_id: departmentId,
                        },
                    }),
                });
                const json = (await res.json().catch(() => ({}))) as {
                    ok?: boolean;
                    error?: string;
                    execution_result?: {
                        kind?: string;
                        href?: string;
                        drawer?: { defaultSurface?: string | null };
                        workflow_run_id?: string;
                    };
                };
                if (!res.ok || !json.ok) {
                    logAdminV2QueueRowClick({
                        phase: "registry_action",
                        itemId: action.itemId,
                        actionId: action.actionId,
                        queueKey: selectedQueueKeyRef.current,
                        handlerReached: "registry_execute_failed",
                        extra: { error: json.error ?? res.status },
                    });
                    return;
                }
                const er = json.execution_result;
                if (er?.kind === "start_workflow" && typeof er.workflow_run_id === "string" && er.workflow_run_id.trim()) {
                    setActionFeedback(`Workflow run ${er.workflow_run_id.trim().slice(0, 8)}… completed.`);
                }
                if (er?.kind === "open_drawer") {
                    if (er.drawer?.defaultSurface === "quote_intake") {
                        openDrawer(
                            buildOpportunityDrawerOpenParams(action.itemId, {
                                defaultOpportunitySurface: "quote_intake",
                            })
                        );
                    } else {
                        openDrawer(buildOpportunityDrawerOpenParams(action.itemId));
                    }
                    invalidate({ entity_type: "opportunity", entity_id: action.itemId, action_key: action.actionId });
                    return;
                }
                if (er?.kind === "navigate" && er.href) {
                    logAdminV2RouterNavigation("router.push", "workUnitQueueAction", er.href, workUnitId);
                    router.push(er.href);
                    return;
                }
                invalidate({ entity_type: "opportunity", entity_id: action.itemId, action_key: action.actionId });
                return;
            }
            if (action.type === "queue.item.action" && action.actionId && action.itemId) {
                if (action.actionId === "crm_message" || action.actionId === "quick_message") {
                    const queueItem = findQueuePreviewItemById(queueDisplayItemsRef.current, action.itemId);
                    const queuePreview = queueBosHandoffPreviewFromOperationalRead(
                        queueItem?.semanticCrmCompact?.operationalReadPreview ?? null
                    );
                    setActionSurfaceError(null);
                    await launchContextualQuickMessage(
                        buildQueueRowInvocation({
                            itemId: action.itemId,
                            payload: action.payload,
                            departmentId,
                            workUnitId: workUnit?.id ?? null,
                            queueKey: selectedQueueKeyRef.current,
                            queuePreview,
                            displayNameFallback: queueItem?.title?.trim() ?? null,
                        })
                    );
                    return;
                }
                if (action.actionId === "ask_bos" || action.actionId === "crm_open_orchestrator") {
                    const opportunityId =
                        parseQueueRowActionPayload(action.payload).opportunityId?.trim() ?? action.itemId;
                    if (!opportunityId) return;
                    const queueItem = findQueuePreviewItemById(queueDisplayItemsRef.current, opportunityId);
                    const queuePreview = queueBosHandoffPreviewFromOperationalRead(
                        queueItem?.semanticCrmCompact?.operationalReadPreview ?? null
                    );
                    await launchContextualAskBos(
                        buildQueueRowInvocation({
                            itemId: action.itemId,
                            payload: action.payload,
                            departmentId,
                            workUnitId: workUnit?.id ?? null,
                            queueKey: selectedQueueKeyRef.current,
                            queuePreview,
                            displayNameFallback: queueItem?.title?.trim() ?? null,
                        })
                    );
                    return;
                }
                if (action.actionId === "crm_mailto" || action.actionId === "crm_tel") {
                    const href = action.payload && typeof action.payload.href === "string" ? action.payload.href : "";
                    if (href) window.location.href = href;
                    return;
                }
                // Map queue quick actions → opportunity record actions (event keys).
                const eventKey = action.actionId;
                if (eventKey === "start_quote" || eventKey === "open_quote") {
                    openDrawer(
                        buildOpportunityDrawerOpenParams(action.itemId, {
                            defaultOpportunitySurface: "quote_intake",
                        })
                    );
                    return;
                }
                const r = await executeOpportunityRecordAction({ opportunityId: action.itemId, eventKey });
                if (!r.ok) {
                    setActionSurfaceError(formatLegacyRecordActionFailure(eventKey, r.error));
                    console.warn("[work-unit queue row legacy]", eventKey, r.error);
                } else {
                    setActionSurfaceError(null);
                }
                return;
            }
            if (action.type === "actions.block") {
                if (action.actionId === "back_department" || action.actionId === "wu_back_department") {
                    window.location.href = appendWorkspaceSiteToPath(
                        `${WORKSPACE_BASE}/dept/${encodeURIComponent(departmentId)}`,
                        selectedSiteId
                    );
                    return;
                }
                if (action.actionId === "open_admin_opportunities" || action.actionId === "wu_open_all_inquiries") {
                    window.alert("Coming next: Inquiry browser in AdminV2.");
                    return;
                }
                if (action.actionId === "wu_new_inquiry") {
                    window.alert("Coming next: Create inquiry in AdminV2.");
                    return;
                }
                if (action.actionId === "wu_open_needs_attention") {
                    if (needsAttentionWorkUnitId) {
                        window.location.href = appendWorkspaceSiteToPath(
                            `${WORKSPACE_BASE}/dept/${encodeURIComponent(departmentId)}/work-unit/${encodeURIComponent(needsAttentionWorkUnitId)}`,
                            selectedSiteId
                        );
                    } else {
                        window.location.href = appendWorkspaceSiteToPath(
                            `${WORKSPACE_BASE}/dept/${encodeURIComponent(departmentId)}`,
                            selectedSiteId
                        );
                    }
                    return;
                }
                if (action.actionId === "wu_manage_work_units") {
                    window.location.href = "/adminV2/settings/work-units";
                    return;
                }
                if (action.actionId === "wu_workspace_root") {
                    window.location.href = appendWorkspaceSiteToPath(WORKSPACE_BASE, selectedSiteId);
                }
            }
        },
        [
            departmentId,
            enrollmentRightRailByKey,
            needsAttentionHref,
            needsAttentionWorkUnitId,
            openDrawer,
            openWorkUnitQueueRecord,
            buildOpportunityDrawerOpenParams,
            oppDrawerExtra,
            opportunityWorkspaceContext,
            queueItems?.queue.entity_type,
            queueRowResolvedByKey,
            router,
            selectedSiteId,
            workUnit?.id,
            invalidate,
        ]
    );

    const deptName = dept?.name?.trim() || "Department";

    /** Hydration-safe: never read sessionStorage during render (SSR/client first paint must match). */
    const [routeWorkUnitDisplayName, setRouteWorkUnitDisplayName] = useState(WORK_UNIT_SHELL_DISPLAY_FALLBACK);

    useLayoutEffect(() => {
        const fromWorkUnit = resolveWorkUnitShellDisplayTitle({
            workUnitId,
            workUnitName: workUnit?.id === workUnitId ? workUnit.name : null,
        });
        if (fromWorkUnit !== WORK_UNIT_SHELL_DISPLAY_FALLBACK) {
            setRouteWorkUnitDisplayName(fromWorkUnit);
            return;
        }
        if (!orgId || !departmentId || !workUnitId) {
            setRouteWorkUnitDisplayName(WORK_UNIT_SHELL_DISPLAY_FALLBACK);
            return;
        }
        const cached = readWorkUnitShellDisplayTitleFromSessionCache({
            orgId,
            departmentId,
            workUnitId,
            principalUserId,
            accessScopeFingerprint,
        });
        setRouteWorkUnitDisplayName(cached ?? WORK_UNIT_SHELL_DISPLAY_FALLBACK);
    }, [
        workUnit,
        workUnitId,
        orgId,
        departmentId,
        principalUserId,
        accessScopeFingerprint,
    ]);

    const wuName = routeWorkUnitDisplayName;
    const mergedWorkspaceModel = useMemo(() => {
        const base = queueModel ?? model;
        if (!base || !workUnitKpiContext) return base;
        if (suppressWorkUnitKpiStrip) {
            return { ...base, kpis: [] };
        }
        if (wuPlacementRows === undefined) {
            return { ...base, kpis: [] };
        }
        const rawKpis = wuResolvedPlacementKpis ?? buildDefaultWorkUnitKpis(workUnitKpiContext);
        const kpis = rawKpis.map((k) => ({
            ...k,
            label: applyEntityLabelToOperatorCopy(k.label, entityLabels),
        }));
        return { ...base, kpis };
    }, [
        queueModel,
        model,
        workUnitKpiContext,
        wuResolvedPlacementKpis,
        suppressWorkUnitKpiStrip,
        wuPlacementRows,
        entityLabels,
    ]);

    const effectiveModel = mergedWorkspaceModel;

    const workUnitKpiMetricsPending =
        !suppressWorkUnitKpiStrip &&
        (wuPlacementRows === undefined ||
            (wuPlacementRows !== undefined && queueSummaries === null && !queueSummariesError));
    /** Shell + header render after WU + dept; queue summaries and rows stay in-lane (Phase 3.1). */
    const workUnitShellReady = Boolean(workUnit) && Boolean(dept) && !error;
    /** UI: only block full-page shell — above-fold slots mount from atomic model. */
    const workUnitOperLaneLoading = !workUnitShellReady;
    const reserveWorkUnitActionsRail = isEnrollmentLikeDepartmentKey(dept?.key);

    const workUnitAboveFold = useMemo(() => {
        const queueLaneItemsReady =
            Boolean(oq?.items?.length) ||
            (queueItems !== null && !queueItemsLoading) ||
            Boolean(queueItemsError);

        if (!workUnitShellReady) {
            return buildWorkUnitAboveFoldPlaceholder({ reserve_actions_rail: reserveWorkUnitActionsRail });
        }

        const pillSectionsForModel =
            queuePillSections?.map((sec) => ({
                key: sec.key,
                label: sec.label,
                queues: sec.queues.map((q) => {
                    const summary = q as QueueSummary;
                    const grainPres = resolveQueueGrainPresentation(summary, normalizedQueueDef);
                    return {
                        key: summary.key,
                        label: summary.label,
                        description: summary.description,
                        priority: summary.priority,
                        count: typeof summary.count === "number" ? summary.count : 0,
                        counts_deferred: summary.counts_deferred,
                        grain: grainPres.grain,
                        domain: grainPres.domain,
                        overlay: grainPres.overlay,
                    };
                }),
            })) ?? null;

        const queueSummariesForAboveFold =
            queueSummaries?.map((q) => {
                const grainPres = resolveQueueGrainPresentation(q, normalizedQueueDef);
                return {
                    key: q.key,
                    label: q.label,
                    description: q.description,
                    priority: q.priority,
                    count: q.count,
                    counts_deferred: q.counts_deferred,
                    grain: grainPres.grain,
                    domain: grainPres.domain,
                    overlay: grainPres.overlay,
                };
            }) ?? null;

        return buildWorkUnitAboveFoldRenderModel({
            work_unit_shell_ready: true,
            department_key: dept?.key,
            reserve_actions_rail: reserveWorkUnitActionsRail,
            queue_summaries: queueSummariesForAboveFold,
            queue_summaries_error: queueSummariesError,
            queue_pill_sections: pillSectionsForModel,
            queue_tab_placeholders: queueTabPlaceholdersExpanded ?? queueTabPlaceholders,
            selected_queue_key: selectedQueueKey,
            attention_bucket_key: attentionBucketKey,
            lane_unmapped_only: laneUnmappedOnly,
            all_records_queue_key: allRecordsQueueKey,
            other_pill_section_key: otherPillSectionKey,
            unmapped_pill_count: unmappedPillCount,
            enrollment_right_rail_resolved: enrollmentRightRailResolved,
            queue_items_loading: queueItemsLoading,
            queue_items_ready: queueLaneItemsReady,
            queue_items_error: queueItemsError,
            authoritative_badge_for_selected_tab: workUnitChipBadgeContext.authoritative_badge_for_selected_tab,
            reconcile_picker_count_zero: workUnitChipBadgeContext.reconcile_picker_count_zero === true,
            normalized_queue_definition: normalizedQueueDef,
            queue_definition: workUnit?.queue_definition,
            suppress_other_pill: queueUiPresentationFlags.suppressOtherPill,
            suppress_active_queue_description: queueUiPresentationFlags.suppressActiveQueueDescription,
        });
    }, [
        workUnitShellReady,
        dept?.key,
        reserveWorkUnitActionsRail,
        queueSummaries,
        normalizedQueueDef,
        queueSummariesError,
        queuePillSections,
        queueTabPlaceholders,
        queueTabPlaceholdersExpanded,
        selectedQueueKey,
        attentionBucketKey,
        laneUnmappedOnly,
        allRecordsQueueKey,
        otherPillSectionKey,
        unmappedPillCount,
        enrollmentRightRailResolved,
        queueItemsLoading,
        queueItems,
        queueItemsError,
        oq,
        workUnitChipBadgeContext,
        queueUiPresentationFlags.suppressOtherPill,
        queueUiPresentationFlags.suppressActiveQueueDescription,
    ]);

    const workUnitRouteShellPlaceholder = useMemo(
        () =>
            buildWorkUnitRouteShellPlaceholder({
                workUnitId: workUnitId ?? undefined,
                workUnitTitle: wuName,
                departmentTitle: dept?.name?.trim() || deptName,
                departmentKey: dept?.key ?? undefined,
                reserveActionsRail: isEnrollmentLikeDepartmentKey(dept?.key),
            }),
        [workUnitId, dept?.key, dept?.name, wuName, deptName]
    );

    const workUnitRevealGate = useMemo(() => {
        const shell_ready = workUnitRevealShellReady({
            work_unit_loaded: Boolean(workUnit),
            department_loaded: Boolean(dept),
            bootstrap_loading: loading,
            error,
        });
        const summaries_ready = workUnitRevealSummariesReady({
            queue_summaries: queueSummaries,
            queue_summaries_error: queueSummariesError,
        });
        const actions_ready = workUnitRevealActionsReady({
            reserve_actions_rail: reserveWorkUnitActionsRail,
            enrollment_actions_settled: enrollmentActionsSettled,
        });
        const queue_rows_buffer_valid =
            queueRowsBufferWorkUnitIdRef.current === workUnitId && queueRowsBufferRef.current.length > 0;
        const rows_ready = workUnitRevealRowsReady({
            lane_authority_ready: wuQueueLaneAuthorityReady,
            queue_summaries: queueSummaries,
            queue_summaries_error: queueSummariesError,
            queue_items: queueItems,
            queue_items_loading: queueItemsLoading,
            queue_items_error: queueItemsError,
            queue_rows_buffer_valid,
        });
        return computeWorkUnitRevealGate({
            shell_ready,
            summaries_ready,
            actions_ready,
            rows_ready,
        });
    }, [
        workUnit,
        dept,
        loading,
        error,
        queueSummaries,
        queueSummariesError,
        reserveWorkUnitActionsRail,
        enrollmentActionsSettled,
        wuQueueLaneAuthorityReady,
        queueItems,
        queueItemsLoading,
        queueItemsError,
        workUnitId,
    ]);

    const workUnitAboveFoldPageReady = workUnitRevealGate.above_fold_ready;

    /** Queue-first reveal — KPI strip and automation footer defer until the lane is useful. */
    const workUnitQueueRevealReady = useMemo(() => {
        if (!workUnitShellReady) return false;
        if (!wuQueueLaneAuthorityReady) return false;
        if (queueSummaries === null && !queueSummariesError) return false;
        if (queueSummariesError && !queueSummaries) return true;
        if (!queueSummaries) return false;
        const bufferValid =
            queueRowsBufferWorkUnitIdRef.current === workUnitId && queueRowsBufferRef.current.length > 0;
        if (bufferValid) return true;
        if (queueItems !== null && !queueItemsLoading) return true;
        if (queueItemsError) return true;
        return queueSummaries.length === 0;
    }, [
        workUnitShellReady,
        workUnitId,
        wuQueueLaneAuthorityReady,
        queueSummaries,
        queueSummariesError,
        queueItems,
        queueItemsLoading,
        queueItemsError,
    ]);

    const workUnitKpiStripPlaceholder = workUnitAboveFoldPageReady && workUnitKpiMetricsPending;

    const workUnitRoutePipeline = useMemo(
        () =>
            buildWorkUnitRoutePipelineState({
                department_id: departmentId,
                work_unit_id: workUnitId,
                department_title: deptName,
                work_unit_title: wuName,
                department_key: dept?.key ?? undefined,
                shell_identity_ready: workUnitShellReady,
                oper_lane_loading: workUnitOperLaneLoading,
                kpi_placeholder: workUnitKpiMetricsPending,
                primary_loaded: workUnitShellReady,
                full_complete: workUnitAboveFoldPageReady,
                work_unit_above_fold: workUnitAboveFold,
            }),
        [
            departmentId,
            workUnitId,
            deptName,
            wuName,
            dept?.key,
            workUnitShellReady,
            workUnitOperLaneLoading,
            workUnitKpiMetricsPending,
            workUnitAboveFoldPageReady,
            workUnitAboveFold,
        ]
    );

    useEffect(() => {
        markWorkUnitRevealGatePhases(workUnitRevealGate, { departmentId, workUnitId });
    }, [workUnitRevealGate, departmentId, workUnitId]);

    useEffect(() => {
        if (!workUnitShellReady) return;
        markWorkUnitLaneShellChromeReal({ departmentId, workUnitId });
        markRouteBootstrapReturned("work_unit", { departmentId, workUnitId });
    }, [workUnitShellReady, departmentId, workUnitId]);

    useEffect(() => {
        if (!workUnitAboveFoldPageReady) return;
        markWorkUnitLaneHeaderChipsReal({ departmentId, workUnitId });
        markWorkUnitAboveFoldCoordinated({ departmentId, workUnitId });
        markRouteFirstAboveFoldStable("work_unit", { departmentId, workUnitId });
    }, [workUnitAboveFoldPageReady, departmentId, workUnitId]);

    useEffect(() => {
        if (!workUnitAboveFoldPageReady || !workUnitId) return;
        if (wuDeferredSummaryHydrateDoneRef.current) return;
        const deferred = wuDeferredQueueKeysRef.current;
        if (!deferred.length) {
            wuDeferredSummaryHydrateDoneRef.current = true;
            return;
        }
        return scheduleAdminV2BackgroundWork(
            () => {
                wuDeferredSummaryHydrateDoneRef.current = true;
                void hydrateDeferredQueueSummaryCounts();
            },
            { idleTimeoutMs: 500, fallbackMs: 150 }
        );
    }, [workUnitAboveFoldPageReady, workUnitId, hydrateDeferredQueueSummaryCounts]);

    useEffect(() => {
        if (!workUnitAboveFoldPageReady || !departmentId || !workUnitId) return;
        const cancel = scheduleAdminV2BackgroundWork(
            () => {
                const raw = (queueItems?.items ?? []) as Array<{ id?: string; opportunity_id?: string }>;
                const ids: string[] = [];
                for (const row of raw) {
                    const id = String(row.opportunity_id ?? row.id ?? "").trim();
                    if (!id) continue;
                    ids.push(id);
                    if (ids.length >= 3) break;
                }
                prefetchVisibleWorkUnitDrawerPrimary(ids, {
                    work_unit_id: workUnitId,
                    department_id: departmentId,
                });
            },
            { idleTimeoutMs: 2500, fallbackMs: 500 }
        );
        return cancel;
    }, [workUnitAboveFoldPageReady, departmentId, workUnitId, queueItems]);

    const visibleQueuePillKeys = useMemo(
        () => flattenWorkUnitVisibleQueuePillKeys(queuePillSections),
        [queuePillSections]
    );

    const queuePillPrefetchSigRef = useRef("");
    useEffect(() => {
        if (!workUnitAboveFoldPageReady || !workUnitId || !visibleQueuePillKeys.length) return;
        const pillKeys = workUnitQueuePillPrefetchTargets(visibleQueuePillKeys, selectedQueueKey, 6);
        if (!pillKeys.length) return;
        const sig = `${workUnitId}|${viewScopeFingerprint}|${selectedQueueKey ?? ""}|${pillKeys.join(",")}`;
        if (queuePillPrefetchSigRef.current === sig) return;
        queuePillPrefetchSigRef.current = sig;

        const cancel = scheduleAdminV2BackgroundWork(
            () => {
                let cursor = 0;
                const workers = Array.from(
                    { length: Math.min(WORK_UNIT_QUEUE_PILL_PREFETCH_CONCURRENCY, pillKeys.length) },
                    async () => {
                        while (cursor < pillKeys.length) {
                            const pillKey = pillKeys[cursor++]!;
                            const resolved = resolveWorkUnitFetchQueueKeyFromPill(pillKey, "");
                            await fetchQueueItemsRef.current(workUnitId, pillKey, null, {
                                prefetchOnly: true,
                                ...(resolved.attentionBucketOverride !== undefined
                                    ? { attentionBucketOverride: resolved.attentionBucketOverride }
                                    : {}),
                            });
                        }
                    }
                );
                void Promise.all(workers);
            },
            { idleTimeoutMs: 1800, fallbackMs: 450 }
        );
        return cancel;
    }, [
        workUnitAboveFoldPageReady,
        workUnitId,
        visibleQueuePillKeys,
        selectedQueueKey,
        viewScopeFingerprint,
    ]);

    useEffect(() => {
        if (!workUnitQueueRevealReady) return;
        markWorkUnitLaneQueueRowsReal({ departmentId, workUnitId });
        markRouteHydrationComplete("work_unit", { departmentId, workUnitId });
    }, [workUnitQueueRevealReady, departmentId, workUnitId]);

    useEffect(() => {
        if (!workUnitShellReady) return;
        if (isEnrollmentLikeDepartmentKey(dept?.key)) {
            if ((enrollmentRightRailResolved?.length ?? 0) > 0) {
                markWorkUnitLaneActionsRailReal({ departmentId, workUnitId });
            } else {
                markWorkUnitLaneActionsRailPlaceholder();
            }
        }
    }, [workUnitShellReady, dept?.key, enrollmentRightRailResolved, departmentId, workUnitId]);

    useEffect(() => {
        if (wuPlacementRows === undefined && workUnitKpiMetricsPending) {
            markWorkUnitLaneKpiPlaceholder();
        } else if (wuPlacementRows !== undefined) {
            markWorkUnitLaneKpiReal({ departmentId, workUnitId });
        }
    }, [wuPlacementRows, workUnitKpiMetricsPending, departmentId, workUnitId]);

    useEffect(() => {
        if (workUnitAboveFold.queue_lane.state === "skeleton") {
            markWorkUnitLaneQueueRowsPlaceholder();
        }
    }, [workUnitAboveFold.queue_lane.state]);

    useEffect(() => {
        if (queueSummaries === null && !queueSummariesError && queueTabPlaceholders?.length) {
            markWorkUnitLaneHeaderChipsPlaceholder();
        }
    }, [queueSummaries, queueSummariesError, queueTabPlaceholders]);

    const workUnitRenderableModel =
        workUnitShellReady && (effectiveModel ?? queueModel)
            ? (effectiveModel ?? queueModel)!
            : workUnitRouteShellPlaceholder;

    const workUnitAboveFoldRenderable = workUnitAboveFold;

    const workUnitAboveFoldHandlers = useMemo(
        () => ({
            onQueueTabChange: handleQueueTabChange,
            onAttentionBucketSelect: handleAttentionBucketSelect,
        }),
        [handleQueueTabChange, handleAttentionBucketSelect]
    );

    return (
        <WorkspaceChrome
            variant="bridge"
            breadcrumbs={workUnitRoutePipeline.shell.breadcrumbs.map((b) => ({
                ...b,
                href: b.href ? appendWorkspaceSiteToPath(b.href, selectedSiteId) : undefined,
            }))}
            title={workUnitRoutePipeline.shell.title}
            subtitle={workUnitRoutePipeline.shell.subtitle ?? ""}
            data-route-shell-ready={workUnitAboveFoldPageReady ? "true" : "false"}
            {...(!workUnitAboveFoldPageReady
                ? { "data-wu-reveal-blocked": workUnitRevealGate.reason_if_blocked.join(",") }
                : {})}
        >
            {error && !workUnitShellReady ? (
                <p className="text-sm text-alloy-ember px-1 py-4">{error}</p>
            ) : !workUnitAboveFoldPageReady ? (
                <WorkUnitPageLoadingGate workUnitTitle={wuName} departmentTitle={deptName} />
            ) : (
                <>
                    {actionSurfaceError ? (
                        <div
                            className="mb-2 rounded-md border border-alloy-ember/30 bg-alloy-ember/5 px-3 py-2 text-sm text-alloy-ember"
                            role="alert"
                            data-work-unit-action-error
                        >
                            {actionSurfaceError}
                        </div>
                    ) : null}
                    {actionFeedback ? (
                        <div
                            className="mb-2 rounded-md border border-alloy-pine/30 bg-emerald-50/90 px-3 py-2 text-sm text-alloy-midnight"
                            role="status"
                        >
                            {actionFeedback}{" "}
                            <a href="/adminV2/workflows" className="font-semibold text-alloy-blue hover:underline">
                                View workflows
                            </a>
                        </div>
                    ) : null}
                    <WorkUnitWorkspace
                        model={workUnitRenderableModel}
                        aboveFold={workUnitAboveFoldRenderable}
                        aboveFoldHandlers={workUnitAboveFoldHandlers}
                        onAction={onAction}
                        opportunityDrawerWorkspaceContext={opportunityWorkspaceContext ?? null}
                        lifecyclePanel={workUnitLifecyclePanel}
                        recordFilterBar={workUnitRecordFilterBar}
                        otherPillSectionKey={otherPillSectionKey}
                        kpiStripPlaceholder={workUnitKpiStripPlaceholder}
                        kpiStripSkeletonCellCount={
                            wuPlacementRows && wuPlacementRows.length > 0 ? wuPlacementRows.length : undefined
                        }
                        primaryFooterSlot={
                            workUnitQueueRevealReady ? (
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
                            ) : null
                        }
                    />
                    <UpdateStatusAddNoteModal
                        open={updateStatusFormOpen}
                        title="Update status"
                        statusOptions={statusOptions}
                        transitionContext={{
                            entityType: "opportunities",
                            departmentId: departmentId,
                            workUnitId: workUnit?.id ?? null,
                            actionKey: "update_status_add_note",
                        }}
                        onClose={() => {
                            setUpdateStatusFormOpen(false);
                            setUpdateStatusTargetId(null);
                        }}
                        onSubmit={async (payload) => {
                            if (!updateStatusTargetId) return;
                            const res = await fetch("/api/admin/actions/execute", {
                                method: "POST",
                                credentials: "include",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                    action_key: "update_status_add_note",
                                    entity_type: "opportunity",
                                    entity_id: updateStatusTargetId,
                                    context: {
                                        surface: "queue_row",
                                        work_unit_id: workUnit?.id ?? null,
                                        department_id: departmentId,
                                    },
                                    payload,
                                }),
                            });
                            const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
                            if (!res.ok || !json.ok) throw new Error(json.error ?? "Update failed");
                            invalidate({ entity_type: "opportunity", entity_id: updateStatusTargetId, action_key: "update_status_add_note" });
                        }}
                    />
                    <ContactAttemptedModal
                        open={contactAttemptedOpen}
                        title="Log contact attempt"
                        onClose={() => {
                            setContactAttemptedOpen(false);
                            setContactAttemptedTargetId(null);
                        }}
                        onSubmit={async (payload) => {
                            if (!contactAttemptedTargetId) return;
                            const res = await fetch("/api/admin/actions/execute", {
                                method: "POST",
                                credentials: "include",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                    action_key: "contact_attempted",
                                    entity_type: "opportunity",
                                    entity_id: contactAttemptedTargetId,
                                    context: {
                                        surface: "queue_row",
                                        work_unit_id: workUnit?.id ?? null,
                                        department_id: departmentId,
                                    },
                                    payload,
                                }),
                            });
                            const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
                            if (!res.ok || !json.ok) throw new Error(json.error ?? "Update failed");
                            invalidate({
                                entity_type: "opportunity",
                                entity_id: contactAttemptedTargetId,
                                action_key: "contact_attempted",
                            });
                        }}
                    />
                </>
            )}
        </WorkspaceChrome>
    );
}

