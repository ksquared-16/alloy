"use client";

import { CANONICAL_ADMIN_WORKSPACE } from "@/lib/admin/canonicalAdminRoutes";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { useWorkUnitSlugRouteOptional } from "@/contexts/WorkUnitSlugRouteContext";
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
import { getEntityLabel, useEntityLabels } from "@/contexts/EntityLabelsContext";
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
import {
    OPPORTUNITY_QUEUE_UPDATED_EVENT,
    logWorkUnitQueueRefreshDecision,
    parseOpportunityQueueUpdatedDetail,
    shouldPatchWorkUnitQueueRowsForEvent,
    shouldRefetchWorkUnitQueueRowsForEvent,
    shouldRefreshQueueSummariesForEvent,
} from "@/lib/admin/opportunityQueueRefreshEvent";
import {
    patchWorkUnitQueueItemsResult,
    patchWorkUnitQueuePreviewItems,
} from "@/lib/workspace/patchWorkUnitQueuePreviewRow";
import { logQueueSwitch } from "@/lib/perf/queueSwitchPerf";
import {
    queueRowsBufferMatchesActiveLane,
    shouldApplyWorkUnitQueueRowsResponse,
} from "@/lib/workspace/workUnitQueueRowFetchApply";
import {
    peekCachedQueueItemsForPill,
    resolveWorkUnitQueueRowsRefreshing,
    shouldSuppressQueueLoadingOnPillSwitch,
    touchCachedQueueItemsForPill,
} from "@/lib/workspace/workUnitQueueLaneDisplay";
import { markKpiPillCache, markKpiPillClick } from "@/lib/perf/workspaceContinuityPerf";
import {
    resolveWorkUnitQueueLaneRevealState,
    workUnitQueueLaneMayPaintRows,
    workUnitQueueLaneRevealSettled,
} from "@/lib/workspace/workUnitQueueLaneRevealState";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { buildPrepareParamsFromOpenDrawer, peekDrawerViewModelPreloadSync } from "@/lib/adminV2/viewModel/drawer/drawerShellPinnedModelSwap";
import { logDrawerVmRuntimeDiagnostic } from "@/lib/adminV2/viewModel/drawer/drawerVmRuntimeDiagnostics";
import { warmQueueRowOpportunityVm } from "@/lib/adminV2/viewModel/drawer/vmRuntime/queueRowDrawerVmWarm";
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
    logAdminV2DuplicateFetchSuppressed,
    logWorkUnitBootstrapBreakdown,
} from "@/lib/perf/adminV2BootstrapBreakdown";
import { perfWorkUnitLoad } from "@/lib/perf/adminV2PerfLog";
import { peelBootstrapServerPerf } from "@/lib/workspace/bootstrapServerPerfEnvelope";
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
import { extractQueueRowRelatedDrawerTargets } from "@/lib/workspace/viewModels/queueRowRelatedDrawerTargets";
import { prepareDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/drawerModelSwapNavigation";
import { PERSON_DRAWER_CHILD_OPEN_SOURCE } from "@/lib/admin/drawer/personDrawerOpenSeed";
import { buildRealOpportunityWorkUnitWorkspaceModel } from "@/lib/ui-v2/adapters/realWorkUnitFromOpportunities";
import {
    buildWorkUnitQueueCrmCompactRowSlice,
    buildWorkUnitQueueCrmCompactRowSliceForPlacementCandidate,
} from "@/lib/ui-v2/crmQueueRowPreviewPresentation";
import { buildQueueRowLayoutRuntimeEnrichment } from "@/lib/layout/runtime/queueRowLayoutRuntimeEnrichment";
import { mergeEnrollmentRightRailActions } from "@/lib/workspace/viewModels/enrollmentRightRailMerge";
import { fetchWorkspaceRightRailResolvedActions } from "@/lib/workspace/fetchWorkspaceRightRailResolvedActions";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import { resolveKpisForWorkUnit } from "@/lib/kpi/resolver";
import {
    applyLifecycleWorkUnitQueueUiOverlay,
    isLifecycleStageWorkUnitKey,
    stageKeyFromLifecycleWorkUnitMetadata,
} from "@/lib/lifecycle/lifecycleStageWorkUnit";
import { departmentReservesOperationalActionsRail } from "@/lib/lifecycle/builderOwnedLifecycleRuntime";
import {
    attachSiblingWorkUnitTotals,
    buildLifecycleBuilderOwnedAboveFoldHeaderSections,
    deptOrderedLifecycleSiblingSource,
    filterActiveLifecycleSiblingWorkUnits,
    isLifecycleWorkUnitNavChipKey,
    lifecycleBuilderOwnedUsesEnrollmentPillShell,
    LIFECYCLE_NEEDS_ATTENTION_PLACEHOLDER_CHIP_KEY,
    inferLifecycleQueueRowLoader,
    orderLifecycleSiblingNavRows,
    parseLifecycleWorkUnitNavChipKey,
    resolveLifecycleWorkUnitPrimaryQueueKey,
    traceLifecyclePillQueueResult,
    type LifecycleSiblingWorkUnitNavRow,
} from "@/lib/lifecycle/lifecycleWorkUnitShellPills";
import {
    buildLifecycleStageOrderIndex,
    sortByLifecycleStageOrder,
} from "@/lib/lifecycle/sortLifecycleDeptWorkUnits";
import {
    lifecycleSiblingHeaderPaintReady,
    lifecycleSiblingTotalsFromDeptSummaries,
    logLifecycleSiblingHydrationDev,
    mergeLifecycleSiblingHydrationBlock,
    toLifecycleSiblingListRows,
    workUnitSummariesFromDepartmentQueueSummariesResponse,
} from "@/lib/lifecycle/lifecycleWorkUnitSiblingHydration";
import {
    buildWorkUnitHref,
    consumeLifecycleInPageWorkUnitSwitchFlag,
    hasLifecycleInPageWorkUnitSwitchFlag,
    peekLifecycleWorkUnitSwitchPreserveSiblingsFlag,
    consumeLifecycleWorkUnitSwitchPreserveSiblingsFlag,
    logLifecycleWorkUnitPillClick,
    markLifecycleSiblingListStable,
    readLifecycleSiblingListStable,
    readLifecycleWorkUnitSwitchSnapshot,
    replaceWorkUnitLocationHref,
    setLifecycleInPageWorkUnitSwitchFlag,
    setLifecycleWorkUnitSwitchPreserveSiblingsFlag,
    writeLifecycleWorkUnitSwitchSnapshot,
} from "@/lib/lifecycle/lifecycleWorkUnitSwitchRuntime";
import {
    buildLifecycleWorkUnitPillSelection,
    guardLifecycleQueueFetchBeforeApi,
    lifecycleSelectionStateMatchesRef,
    type ActiveLifecycleWorkUnitSelection,
} from "@/lib/lifecycle/lifecycleActiveWorkUnitSelection";
import WorkUnitScheduleTourRecordPickerModal from "@/components/admin/workspace/WorkUnitScheduleTourRecordPickerModal";
import {
    isScheduleTourRegistryAction,
    resolveScheduleTourOpportunityIdFromQueueItem,
} from "@/lib/admin/actions/scheduleTourWorkUnitActions";
import { openTourScheduleModalForOpportunity } from "@/lib/tours/actions/tourBookingActionClient";
import {
    readDepartmentPageCache,
    writeDepartmentPageCache,
} from "@/lib/workspace/adminV2WorkspaceSessionCache";
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
import { scheduleWorkspaceRootRevalidation } from "@/lib/workspace/workspaceContinuityPrefetch";
import { markWorkUnitTransitionReady } from "@/lib/perf/workspaceContinuityPerf";
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
import {
    resolveWorkUnitQueueRowsFetchLimit,
    WORK_UNIT_QUEUE_REVEAL_FETCH_ROWS,
} from "@/lib/adminV2/workUnitQueueRowsFetchLimit";
import { applyWorkUnitQueueRecordFilters } from "@/lib/workspace/applyWorkUnitQueueRecordFilters";
import {
    clearLaneScopedWorkUnitRecordFilters,
    resolveWorkUnitLaneStatusFilterValues,
    sanitizeWorkUnitRecordFiltersForLane,
} from "@/lib/workspace/workUnitQueueRecordFilterLaneScope";
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
import { opportunityDrawerSubjectContextFromQueueItem } from "@/lib/admin/opportunityDrawerSubjectContextFromQueueItem";
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
import { tracePlatformPrefetch } from "@/lib/perf/platformSurfacePerfTrace";
import { markDrawerRowClickStart } from "@/lib/perf/adminV2DrawerPerf";
import { markWorkUnitNavigationStart } from "@/lib/perf/markWorkUnitNavigationStart";
import { setAdminV2PrimarySurfacePending } from "@/lib/perf/adminV2PrimarySurfaceGate";
import { dedupeAdminFetch, dedupeAdminFetchWithTtl } from "@/lib/workspace/workspaceAdminFetchDedupe";
import { scheduleAdminV2BackgroundWork } from "@/lib/workspace/adminV2DeferBackgroundWork";
import {
    allVisibleWorkUnitLanePrefetchTargets,
    flattenWorkUnitVisibleQueuePillKeys,
    WORK_UNIT_QUEUE_PILL_PREFETCH_CONCURRENCY,
    workUnitLanePrefetchTargets,
} from "@/lib/adminV2/workUnitQueuePillPrefetch";
import {
    putWorkUnitLaneCacheEntry,
} from "@/lib/adminV2/viewModel/workUnit/workUnitViewModelSessionCache";
import { restoreWarmWorkUnitLaneRows } from "@/lib/workspace/workUnitRetainedSurface";
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
    workUnitRevealKpiReady,
    workUnitRevealRowsReady,
    workUnitRevealShellReady,
    workUnitRevealSummariesReady,
} from "@/lib/adminV2/workUnitRevealGate";
import {
    workUnitKpiStripShowsPlaceholder,
    workUnitPageContentReady as resolveWorkUnitPageContentReady,
} from "@/lib/adminV2/workUnitPageRevealPolicy";
import { WorkUnitWorkspaceColdShell } from "@/components/admin/workspace/WorkUnitWorkspaceColdShell";
import { logAdminV2LegacyFanOut } from "@/lib/adminV2/runtime/adminV2LegacyFanOutDiagnostics";
import { alloyPerfGet, alloyPerfSet } from "@/lib/perf/alloyPerfGlobal";
import {
    markWorkUnitVmBootstrapApply,
    markWorkUnitVmActionsReady,
    markWorkUnitVmActionsFirstPaintReady,
    markWorkUnitVmFirstPaintReady,
    markWorkUnitVmKpiReady,
    markWorkUnitVmNavigationStart,
    markWorkUnitVmOpenCold,
    markWorkUnitVmOpenWarm,
    markWorkUnitVmPillSwitchApply,
    markWorkUnitVmPillSwitchActionsReady,
    markWorkUnitVmPillSwitchCacheHit,
    markWorkUnitVmPillSwitchCacheMissHoldCurrent,
    markWorkUnitVmPillSwitchCommitted,
    markWorkUnitVmPillPrefetchReady,
    markWorkUnitVmPillPrefetchStart,
    markWorkUnitVmPillSwitchStart,
    markWorkUnitVmQueueReady,
    markWorkUnitVmRightRailActionsReady,
    markWorkUnitVmRowActionsReady,
    markWorkUnitVmShellReady,
    markWorkUnitVmSummariesReady,
} from "@/lib/perf/workUnitVmRuntimeTrace";
import "@/lib/perf/workUnitVmRuntimeTrace";
import { scheduleWorkUnitViewModelShadow } from "@/lib/adminV2/viewModel/workUnit/shadow/runWorkUnitViewModelShadow";
import type { NeedsAttentionBucketWithCount } from "@/lib/opportunities/needsAttentionBuckets";
import { UpdateStatusAddNoteModal } from "@/components/admin/opportunity/actions/UpdateStatusAddNoteModal";
import { ContactAttemptedModal } from "@/components/admin/opportunity/actions/ContactAttemptedModal";
import { CreateLeadModal } from "@/components/admin/opportunity/actions/CreateLeadModal";
import { MarkLostModal } from "@/components/admin/opportunity/actions/MarkLostModal";
import { AddNoteModal } from "@/components/admin/opportunity/actions/AddNoteModal";
import {
    executeCreateLeadFromModal,
    executeMarkLostFromModal,
} from "@/lib/admin/actions/entryLifecycleActionClient";
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
    workUnitScopeTotalFromSummaries,
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
    parseQueueRowPlacementPriorityVm,
} from "@/lib/ui-v2/queuePlacementPriorityPresentation";
import { parseQueueRowPlacementPriorityV2Vm } from "@/lib/ui-v2/queuePlacementPriorityV2Presentation";
import {
    buildPlacementWaitlistWorkUnitGroupHeaders,
    parsePlacementWaitlistCandidateRowVm,
} from "@/lib/ui-v2/queuePlacementWaitlistCandidatePresentation";
import { waitlistQueueItemGrouping } from "@/lib/orchestration/placement/waitlistQueueSectionPresentation";
import { sortPlacementCandidateQueueRows } from "@/lib/orchestration/placement/sortPlacementCandidateQueueRows";
import { assignWaitlistCandidateRuntimePositions } from "@/lib/orchestration/placement/waitlistCandidateRuntimePosition";
import type { WaitlistProgramCategoryContext } from "@/lib/orchestration/placement/waitlistProgramCategoryResolution";
import { fetchLocationProgramCategories } from "@/lib/admin/location/fetchLocationProgramCategories";
import type { LocationProgramCategoryRow } from "@/lib/locations/locationProgramCategories";
import { readOpportunityIdFromQueueRow } from "@/lib/orchestration/placement/placementWaitlistCandidateRowProjection";
import { parseQueueRowGrainContext } from "@/lib/queues/queueRowGrainContext";

const WORKSPACE_BASE = CANONICAL_ADMIN_WORKSPACE;

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
        summary_mode: "initial",
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
    const slugRoute = useWorkUnitSlugRouteOptional();
    const params = useParams();
    const departmentId = slugRoute?.departmentId ?? workspaceRouteParam(params.departmentId);
    const routeWorkUnitId = slugRoute?.workUnitId ?? workspaceRouteParam(params.workUnitId);
    const [activeWorkUnitId, setActiveWorkUnitId] = useState(routeWorkUnitId);
    const activeLifecycleSelectionRef = useRef<ActiveLifecycleWorkUnitSelection>({
        workUnitId: routeWorkUnitId,
        queueKey: "",
        stageKey: null,
    });
    useEffect(() => {
        setActiveWorkUnitId(routeWorkUnitId);
        activeLifecycleSelectionRef.current = {
            ...activeLifecycleSelectionRef.current,
            workUnitId: routeWorkUnitId,
        };
    }, [routeWorkUnitId]);
    const workUnitId = activeWorkUnitId;
    const router = useRouter();
    /** Frozen on work-unit mount — do not subscribe to Next search params (triggers RSC churn on query changes). */
    const initialLocationRef = useRef<ReturnType<typeof readWorkUnitInitialLocationParams> | null>(null);
    if (initialLocationRef.current === null) {
        const loc = readWorkUnitInitialLocationParams();
        const laneFromSlug = slugRoute?.initialQueueKey?.trim() ?? "";
        initialLocationRef.current =
            laneFromSlug && !loc.queue.trim()
                ? { ...loc, queue: laneFromSlug }
                : loc;
    }
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
    const [locationProgramCategories, setLocationProgramCategories] = useState<LocationProgramCategoryRow[]>([]);
    const waitlistProgramCategoryContext = useMemo<WaitlistProgramCategoryContext>(
        () => ({
            categories: locationProgramCategories,
            activeSiteId: selectedSiteId,
        }),
        [locationProgramCategories, selectedSiteId]
    );
    const viewScopeFingerprint = workspaceViewCacheFingerprint(accessScopeFingerprint, selectedSiteId);
    const { openDrawer, drawer } = useAdminDrawer();
    const [queueRowOpenPendingOpportunityId, setQueueRowOpenPendingOpportunityId] = useState<string | null>(
        null
    );
    /** Pill key showing inline pending while a cold lane payload loads (rows/actions stay on prior lane). */
    const [queuePillPendingKey, setQueuePillPendingKey] = useState<string | null>(null);
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
    const enrollmentActionsSettledRef = useRef(false);
    const [actionFeedback, setActionFeedback] = useState<string | null>(null);
    const [actionSurfaceError, setActionSurfaceError] = useState<string | null>(null);

    const [queueSummaries, setQueueSummaries] = useState<QueueSummary[] | null>(null);
    const queueSummariesRef = useRef<QueueSummary[] | null>(null);
    queueSummariesRef.current = queueSummaries;
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
    /** Set when session cache restores queue rows — skip loading gate churn. */
    const warmLaneRevealReadyRef = useRef(false);
    /** Reactive mirror of session shell seed — drives cold vs warm page reveal gate. */
    const [workUnitPageSeededFromCache, setWorkUnitPageSeededFromCache] = useState(false);
    /** User changed lane via tabs/buckets — bootstrap must not overwrite selection when summaries arrive. */
    const userLaneTouchedRef = useRef(false);
    /** Lane filter UI — source of truth; URL is not synced after mount. */
    const [laneUnmappedOnly, setLaneUnmappedOnly] = useState(false);
    /** Card 14B — client-side record filters (URL via replaceState, no full page refresh). */
    const [recordFilters, setRecordFilters] = useState<WorkUnitQueueRecordFilterState>(() =>
        readWorkUnitQueueRecordFiltersFromLocation()
    );
    const recordFiltersRef = useRef(recordFilters);
    recordFiltersRef.current = recordFilters;
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
    const workUnitVmShadowSigRef = useRef<string | null>(null);
    /** Last settled preview rows — keeps list visible while `queueItems` is briefly null during lane changes. */
    const queueRowsBufferRef = useRef<QueuePreviewItemVm[]>([]);
    /** Queue key that owns `queueRowsBufferRef` — never show buffer for a different lane. */
    const queueRowsBufferQueueKeyRef = useRef<string | null>(null);
    /** Latest rendered queue row VMs — used to seed opportunity drawer header on open. */
    const queueDisplayItemsRef = useRef<QueuePreviewItemVm[]>([]);
    /** Last opportunity row opened from queue — work-unit rail actions (e.g. Schedule Tour). */
    const lastQueueOpportunityIdRef = useRef<string | null>(null);
    /** Keep prior lane rows visible while lifecycle sibling fetch is in flight (no empty flash). */
    const lifecyclePillSwitchRetainRowsRef = useRef(false);
    const [lifecyclePillRetainRows, setLifecyclePillRetainRows] = useState(false);
    const queueRowActionsHydratedRef = useRef(false);

    const openScheduleTourRecordPicker = useCallback(() => {
        setScheduleTourPickerOpen(true);
        setActionSurfaceError(null);
    }, []);

    const openScheduleTourForOpportunity = useCallback(
        (opportunityId: string) => {
            const id = opportunityId.trim();
            if (!id) return;
            lastQueueOpportunityIdRef.current = id;
            openTourScheduleModalForOpportunity(id, (opts) => openDrawer({ type: "opportunities", id: opts.id }));
            setActionSurfaceError(null);
            setScheduleTourPickerOpen(false);
        },
        [openDrawer]
    );
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
    const [createLeadOpen, setCreateLeadOpen] = useState(false);
    const [scheduleTourPickerOpen, setScheduleTourPickerOpen] = useState(false);
    const [queueRowActionsReady, setQueueRowActionsReady] = useState(false);
    const [markLostOpen, setMarkLostOpen] = useState(false);
    const [markLostTargetId, setMarkLostTargetId] = useState<string | null>(null);
    const [addNoteOpen, setAddNoteOpen] = useState(false);
    const [addNoteTargetId, setAddNoteTargetId] = useState<string | null>(null);

    const queueDef = useMemo<QueueDefinitionV1 | null>(() => {
        if (!workUnit?.queue_definition) return null;
        return loadWorkUnitQueueDefinition(workUnit.queue_definition);
    }, [workUnit?.queue_definition]);

    const queueUi = useMemo<QueueUiConfig | null>(() => {
        if (!queueDef) return null;
        let ui = getQueueUiConfig(queueDef);
        if (isLifecycleStageWorkUnitKey(workUnit?.key ?? null)) {
            const lifecycleStageKey = stageKeyFromLifecycleWorkUnitMetadata(workUnit?.metadata);
            ui = applyLifecycleWorkUnitQueueUiOverlay(ui, lifecycleStageKey);
        }
        return ui;
    }, [queueDef, workUnit?.key, workUnit?.metadata]);

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

    const builderOwnedLifecycleShell = useMemo(
        () => lifecycleBuilderOwnedUsesEnrollmentPillShell(dept?.metadata, workUnit?.key),
        [dept?.metadata, workUnit?.key]
    );

    const [lifecycleSiblingWorkUnits, setLifecycleSiblingWorkUnits] = useState<
        LifecycleSiblingWorkUnitNavRow[] | null
    >(null);
    const [lifecycleSiblingsHydrationComplete, setLifecycleSiblingsHydrationComplete] = useState(false);
    const [lifecycleSiblingTotalsById, setLifecycleSiblingTotalsById] = useState<Record<string, number>>({});
    const lifecycleSiblingWorkUnitsRef = useRef<LifecycleSiblingWorkUnitNavRow[] | null>(null);
    lifecycleSiblingWorkUnitsRef.current = lifecycleSiblingWorkUnits;

    useEffect(() => {
        if (!orgId) {
            setLocationProgramCategories([]);
            return;
        }
        let cancelled = false;
        void fetchLocationProgramCategories(undefined, { includeInactive: true }).then((rows) => {
            if (!cancelled) setLocationProgramCategories(rows);
        });
        return () => {
            cancelled = true;
        };
    }, [orgId]);

    useEffect(() => {
        if (consumeLifecycleWorkUnitSwitchPreserveSiblingsFlag() && orgId && departmentId) {
            const stable = readLifecycleSiblingListStable({
                orgId,
                departmentId,
                accessScopeFingerprint: viewScopeFingerprint,
            });
            if (stable) {
                setLifecycleSiblingWorkUnits(stable.siblings);
                setLifecycleSiblingTotalsById(stable.totalsByWorkUnitId);
                setLifecycleSiblingsHydrationComplete(true);
                return;
            }
        }
        setLifecycleSiblingWorkUnits(null);
        setLifecycleSiblingsHydrationComplete(false);
        setLifecycleSiblingTotalsById({});
    }, [departmentId, workUnitId, orgId, viewScopeFingerprint]);

    useEffect(() => {
        if (!builderOwnedLifecycleShell || !departmentId) {
            setLifecycleSiblingWorkUnits(null);
            setLifecycleSiblingsHydrationComplete(false);
            setLifecycleSiblingTotalsById({});
            return;
        }
        if (lifecycleSiblingsHydrationComplete) return;

        let cancelled = false;
        const init = workspaceDataFetchInit();
        logLifecycleSiblingHydrationDev("client_fetch_start", {
            source: "client_fetch",
            department_id: departmentId,
            work_unit_id: workUnitId,
        });
        void dedupeAdminFetch(
            `/api/admin/work-units?${new URLSearchParams({ department_id: departmentId }).toString()}`,
            init ?? {}
        )
            .then(async (res) => {
                if (!res.ok || cancelled) return;
                const j = (await res.json().catch(() => ({}))) as {
                    items?: Array<{
                        id: string;
                        name?: string | null;
                        key?: string | null;
                        is_active?: boolean;
                        metadata?: unknown;
                        sort_order?: number | null;
                    }>;
                };
                const siblings = filterActiveLifecycleSiblingWorkUnits(
                    toLifecycleSiblingListRows(j.items ?? [])
                );
                if (!cancelled && siblings.length) {
                    setLifecycleSiblingWorkUnits(siblings);
                    setLifecycleSiblingsHydrationComplete(true);
                    logLifecycleSiblingHydrationDev("client_fetch_end", {
                        source: "client_fetch",
                        department_id: departmentId,
                        work_unit_ids: siblings.map((s) => s.id),
                        labels: siblings.map((s) => s.name),
                    });
                }
            })
            .catch(() => {
                /* non-fatal */
            });
        return () => {
            cancelled = true;
        };
    }, [
        builderOwnedLifecycleShell,
        departmentId,
        orgId,
        workUnitId,
        lifecycleSiblingsHydrationComplete,
    ]);

    useEffect(() => {
        if (!builderOwnedLifecycleShell || !departmentId || !orgId || !siteSelectionReady) {
            return;
        }
        let cancelled = false;
        setLifecycleSiblingTotalsById({});

        const init = workspaceDataFetchInit();
        const summariesRoute = appendWorkspaceSiteToUrl(
            `/api/admin/departments/${encodeURIComponent(departmentId)}/work-unit-queue-summaries?include_previews=false&count_mode=exact&summary_mode=priority&priority_budget=5`,
            selectedSiteId
        );
        logLifecycleSiblingHydrationDev("summaries_fetch_start", {
            source: "client_fetch",
            department_id: departmentId,
            selected_site_id: selectedSiteId,
            view_scope_fingerprint: viewScopeFingerprint,
        });

        void dedupeAdminFetch(summariesRoute, init ?? {})
            .then(async (res) => {
                if (cancelled) return;
                if (!res.ok) {
                    logLifecycleSiblingHydrationDev("summaries_fetch_error", {
                        department_id: departmentId,
                        status: res.status,
                    });
                    return;
                }
                const j = (await res.json().catch(() => ({}))) as {
                    work_units?: Array<{
                        id?: string;
                        error?: string;
                        work_unit_scope_total?: number | null;
                        queues?: Array<{ key?: string; count?: number; counts_deferred?: boolean }>;
                    }>;
                };
                const summaries = workUnitSummariesFromDepartmentQueueSummariesResponse(j.work_units ?? []);
                const totals = lifecycleSiblingTotalsFromDeptSummaries(summaries);
                if (cancelled) return;
                setLifecycleSiblingTotalsById(totals);

                const cache = readDepartmentPageCache(
                    orgId,
                    departmentId,
                    principalUserId,
                    viewScopeFingerprint
                );
                if (cache?.dept?.id === departmentId) {
                    writeDepartmentPageCache(orgId, principalUserId, viewScopeFingerprint, {
                        dept: cache.dept,
                        workUnits: cache.workUnits,
                        workUnitSummaries: summaries,
                        summariesComplete: true,
                        attentionBuckets: cache.attentionBuckets ?? null,
                        attentionPreviewTotal: cache.attentionPreviewTotal ?? null,
                        kpiPlacementRows: cache.kpiPlacementRows ?? null,
                        kpiScopeHasPlacements: cache.kpiScopeHasPlacements ?? false,
                    });
                }

                logLifecycleSiblingHydrationDev("summaries_fetch_end", {
                    source: "client_fetch",
                    department_id: departmentId,
                    work_unit_ids: Object.keys(totals),
                    totals,
                });
            })
            .catch(() => {
                /* non-fatal */
            });

        return () => {
            cancelled = true;
        };
    }, [
        builderOwnedLifecycleShell,
        departmentId,
        orgId,
        principalUserId,
        viewScopeFingerprint,
        selectedSiteId,
        siteSelectionReady,
    ]);

    const lifecycleSiblingWorkUnitsForHeader = useMemo(() => {
        if (!lifecycleSiblingWorkUnits?.length) return null;
        const totals: Record<string, number | null | undefined> = { ...lifecycleSiblingTotalsById };
        const cache = readDepartmentPageCache(orgId, departmentId, principalUserId, viewScopeFingerprint);
        const deptOrder = cache?.workUnits?.length
            ? deptOrderedLifecycleSiblingSource(
                  cache.workUnits as Array<{
                      id: string;
                      name?: string | null;
                      key?: string | null;
                      sort_order?: number | null;
                      metadata?: unknown;
                  }>
              )
            : [];
        const deptNameById: Record<string, string | null> = {};
        for (const w of cache?.workUnits ?? []) {
            deptNameById[w.id] = w.name ?? null;
        }
        const orderedSiblings = orderLifecycleSiblingNavRows(
            lifecycleSiblingWorkUnits,
            deptOrder,
            deptNameById
        );
        let currentTotal: number | null = null;
        if (queueSummaries?.length && queueDef) {
            const activeSummary =
                findQueueSummaryForSelection(queueSummaries, workUnit, selectedQueueKey) ?? queueSummaries[0];
            if (
                queueItems != null &&
                !queueItemsLoading &&
                !queueItemsError &&
                activeSummary &&
                queueItems.queue.key === activeSummary.key &&
                (queueItems.offset ?? 0) === 0
            ) {
                const rowCount = (queueItems.items ?? []).filter((r) => {
                    if (r == null || typeof r !== "object") return false;
                    const id = (r as { id?: unknown }).id;
                    return typeof id === "string" && id.trim().length > 0;
                }).length;
                if (rowCount === 0) {
                    currentTotal =
                        queueItems.total_omitted !== true && typeof queueItems.total === "number"
                            ? Math.max(0, Math.floor(queueItems.total))
                            : 0;
                } else if (queueItems.total_omitted !== true && typeof queueItems.total === "number") {
                    currentTotal = Math.max(0, Math.floor(queueItems.total));
                } else if (
                    activeSummary.counts_deferred !== true &&
                    typeof activeSummary.count === "number"
                ) {
                    currentTotal = Math.max(0, Math.floor(activeSummary.count));
                }
            } else if (
                activeSummary &&
                activeSummary.counts_deferred !== true &&
                typeof activeSummary.count === "number"
            ) {
                currentTotal = Math.max(0, Math.floor(activeSummary.count));
            } else {
                const scopeMeta = workUnitScopeTotalFromSummaries(queueDef, queueSummaries);
                currentTotal = scopeMeta.total;
            }
        }
        // P1 — re-sort the lifecycle pills by canonical /settings/lifecycle stage order
        // (sync-independent of work_units.sort_order), so /work-units matches /dept and settings.
        const stageOrderedSiblings = sortByLifecycleStageOrder(
            orderedSiblings,
            buildLifecycleStageOrderIndex(dept?.metadata)
        );
        return attachSiblingWorkUnitTotals(stageOrderedSiblings, totals, workUnitId, currentTotal);
    }, [
        lifecycleSiblingWorkUnits,
        lifecycleSiblingTotalsById,
        orgId,
        departmentId,
        principalUserId,
        viewScopeFingerprint,
        workUnitId,
        queueSummaries,
        queueDef,
        workUnit,
        selectedQueueKey,
        queueItems,
        queueItemsLoading,
        queueItemsError,
        dept?.metadata,
    ]);

    const lifecycleSiblingHeaderReady = lifecycleSiblingHeaderPaintReady({
        hydrationComplete: lifecycleSiblingsHydrationComplete,
        siblings: lifecycleSiblingWorkUnitsForHeader,
    });

    useEffect(() => {
        if (!builderOwnedLifecycleShell || !lifecycleSiblingHeaderReady || !orgId || !departmentId) return;
        const siblings = lifecycleSiblingWorkUnitsForHeader ?? lifecycleSiblingWorkUnits ?? [];
        if (!siblings.length) return;
        markLifecycleSiblingListStable({
            orgId,
            departmentId,
            accessScopeFingerprint: viewScopeFingerprint,
            siblings,
            totalsByWorkUnitId: lifecycleSiblingTotalsById,
        });
    }, [
        builderOwnedLifecycleShell,
        lifecycleSiblingHeaderReady,
        lifecycleSiblingWorkUnitsForHeader,
        lifecycleSiblingWorkUnits,
        lifecycleSiblingTotalsById,
        orgId,
        departmentId,
        viewScopeFingerprint,
    ]);

    const lifecycleHeaderSections = useMemo(() => {
        if (!builderOwnedLifecycleShell || !workUnitId || !lifecycleSiblingHeaderReady) return null;
        const siblings = lifecycleSiblingWorkUnitsForHeader ?? [];
        const naSummary = displayQueueSummaries?.find(
            (x) => x.key.trim().toLowerCase() === "needs_attention"
        );
        const attentionQueues = naSummary
            ? expandNeedsAttentionQueueSummariesForPills(
                  [naSummary],
                  naSummary,
                  enabledAttentionBuckets
              ).map((q) => ({
                  key: q.key,
                  label: q.label,
                  count: typeof q.count === "number" ? q.count : 0,
                  priority: "critical" as const,
              }))
            : [];
        return buildLifecycleBuilderOwnedAboveFoldHeaderSections({
            siblings,
            currentWorkUnitId: workUnitId,
            selectedQueueKey,
            attentionQueues,
        });
    }, [
        builderOwnedLifecycleShell,
        workUnitId,
        lifecycleSiblingHeaderReady,
        lifecycleSiblingWorkUnitsForHeader,
        displayQueueSummaries,
        enabledAttentionBuckets,
        selectedQueueKey,
    ]);

    const suppressWorkUnitKpiStrip = useMemo(() => {
        if (builderOwnedLifecycleShell) return true;
        return shouldSuppressWorkUnitKpiStrip({ def: queueDef, ui: queueUi });
    }, [builderOwnedLifecycleShell, queueDef, queueUi]);

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
        if (next?.trim()) {
            selectedQueueKeyRef.current = next;
            activeLifecycleSelectionRef.current = {
                ...activeLifecycleSelectionRef.current,
                queueKey: next,
            };
        }
    }, []);

    /** Atomic lifecycle sibling pill transition — work unit id + primary queue key stay paired. */
    const applyActiveLifecycleWorkUnitSelection = useCallback(
        (selection: ActiveLifecycleWorkUnitSelection, source: string) => {
            activeLifecycleSelectionRef.current = selection;
            selectedQueueKeyRef.current = selection.queueKey;
            skipNextQueueFetchEffectRef.current = true;
            suppressQueueFetchEffectOnceRef.current = true;
            setActiveWorkUnitId(selection.workUnitId);
            setSelectedQueueKeyTraced(source, selection.queueKey);
            routeQueueSelectionRef.current = workUnitQueueSelectionFromPillKey(
                selection.workUnitId,
                selection.queueKey
            );
            explicitRouteQueueLockedRef.current = false;
            userLaneTouchedRef.current = false;
        },
        [setSelectedQueueKeyTraced]
    );

    /**
     * Navigation reset + lane URL seed + optional shell cache (PERF-C-01).
     * Always clears queue lane state on work-unit / site change — even when session shell seeds metadata.
     */
    useLayoutEffect(() => {
        if (!departmentId || !workUnitId) return;

        markWorkUnitVmNavigationStart({ department_id: departmentId, work_unit_id: workUnitId });

        if (hasLifecycleInPageWorkUnitSwitchFlag()) {
            skipNextQueueFetchEffectRef.current = true;
            userLaneTouchedRef.current = false;
            setWuQueueLaneAuthorityReady(true);
            warmLaneRevealReadyRef.current = true;
            queueRowActionsHydratedRef.current = false;
            setQueueRowActionsReady(false);
            return;
        }

        initialLocationRef.current = readWorkUnitInitialLocationParams();
        setRecordFilters(readWorkUnitQueueRecordFiltersFromLocation());
        const init = initialLocationRef.current;
        const routeSelection = workUnitId
            ? workUnitQueueSelectionFromLocation(workUnitId, init)
            : null;
        routeQueueSelectionRef.current = routeSelection;
        explicitRouteQueueLockedRef.current = isExplicitWorkUnitQueueSelection(routeSelection);

        const pageCacheHitEarly =
            orgId ?
                readWorkUnitPageCache(orgId, departmentId, workUnitId, principalUserId, accessScopeFingerprint)
            :   null;
        const warmLaneRetain = Boolean(
            pageCacheHitEarly &&
            pageCacheHitEarly.departmentId === departmentId &&
            pageCacheHitEarly.workUnit.id === workUnitId
        );

        if (!warmLaneRetain) {
            queueRowActionsHydratedRef.current = false;
            setQueueRowActionsReady(false);
        }

        resetWorkUnitCriticalPathTrace();
        resetWorkUnitRevealGatePerf();
        setEnrollmentActionsSettled(false);
        parallelPrimaryRowStartedRef.current = false;
        if (warmLaneRetain) {
            setWuQueueLaneAuthorityReady(true);
            warmLaneRevealReadyRef.current = true;
        } else {
            setWuQueueLaneAuthorityReady(false);
        }
        bootstrapPrimaryRowKeyRef.current = null;
        bootstrapPrimaryRowFetchScheduledRef.current = false;
        suppressQueueFetchEffectOnceRef.current = false;
        wuDeferredQueueKeysRef.current = [];
        wuLanePreviewBundleDoneRef.current = false;
        wuDeferredSummaryHydrateDoneRef.current = false;
        wuBootstrapAttentionRef.current = null;
        setWuBootstrapAttentionBuckets(null);
        userLaneTouchedRef.current = false;
        skipNextQueueFetchEffectRef.current = false;

        setWuPrimaryLaneTimedOut(false);

        if (!warmLaneRetain) {
            queueItemsRequestSeq.current += 1;
            queueSummariesRequestSeq.current += 1;
            queueItemsLastFetchSigRef.current = null;
            primaryLaneRowsSettledOnceRef.current = false;
            queueRowLeaseSigsRef.current.clear();
            queueRowClientCacheRef.current.clear();
            queueRowsBufferRef.current = [];
            queueRowsBufferQueueKeyRef.current = null;
            queueRowsBufferWorkUnitIdRef.current = null;
            setQueueSummaries(null);
            setQueueSummariesError(null);
            setQueueSummariesRoute(null);
            setQueueItems(null);
            setQueueItemsError(null);
            setQueueItemsRoute(null);
            setQueueItemsLoading(false);
        }

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

        if (!warmLaneRetain) {
            seededWorkUnitShellRef.current = false;
            setWorkUnitPageSeededFromCache(false);
            clearWorkUnitBootstrapSessionForEntity(departmentId, workUnitId);
        }
        if (!orgId) return;
        setWorkUnit((prev) => (prev?.id === workUnitId ? prev : null));
        if (!pageCacheHitEarly || pageCacheHitEarly.departmentId !== departmentId || pageCacheHitEarly.workUnit.id !== workUnitId) {
            seededWorkUnitShellRef.current = false;
            setWorkUnitPageSeededFromCache(false);
            markWorkUnitVmOpenCold({ department_id: departmentId, work_unit_id: workUnitId });
            return;
        }
        seededWorkUnitShellRef.current = true;
        setWorkUnitPageSeededFromCache(true);
        markWorkUnitVmOpenWarm({ department_id: departmentId, work_unit_id: workUnitId });
        setDept(pageCacheHitEarly.dept);
        setWorkUnit(pageCacheHitEarly.workUnit as WorkUnitRow);
        setError(null);
        setLoading(false);
        perfWorkUnitLoad({
            phase: "shell_seed",
            ms: 0,
            source: "cache",
            department_id: departmentId,
            work_unit_id: workUnitId,
            client_cache_hit: true,
        });

        if (warmLaneRetain && routeSelection) {
            const pillKey = workUnitActivePillKeyFromSelection(routeSelection);
            const abSnap = String(routeSelection.attentionBucketKey ?? "").trim();
            const resolvedFetch = resolveWorkUnitFetchQueueKeyFromPill(
                pillKey,
                abSnap,
                { queue_definition: pageCacheHitEarly.workUnit.queue_definition }
            );
            const apiQueueKey = resolvedFetch.queueKey;
            const cachedPayload = restoreWarmWorkUnitLaneRows({
                cache: queueRowClientCacheRef.current,
                viewScopeFingerprint,
                workUnitId,
                pillKey,
                attentionBucketKey: abSnap,
                unmappedOnly: init.unmapped,
                queueDefinition: pageCacheHitEarly.workUnit.queue_definition,
                laneContext: {
                    orgId,
                    departmentId,
                    workUnitId,
                    userId: principalUserId,
                    scopeFingerprint: viewScopeFingerprint,
                },
            });
            if (cachedPayload) {
                setQueueItems(cachedPayload as QueueItemsResult);
                setQueueItemsError(null);
                setQueueItemsLoading(false);
                primaryLaneRowsSettledOnceRef.current = true;
                warmLaneRevealReadyRef.current = true;
                logQueueRowClientCache({
                    event: "hit",
                    work_unit_id: workUnitId,
                    queue_key: apiQueueKey,
                    pill_key: pillKey,
                    attention_bucket_key: abSnap || undefined,
                    age_ms: null,
                });
                perfWorkUnitLoad({
                    phase: "shell_seed_rows",
                    ms: 0,
                    source: "cache",
                    department_id: departmentId,
                    work_unit_id: workUnitId,
                    queue_key: pillKey,
                    client_cache_hit: true,
                });
            } else {
                setQueueItems((prev) => {
                    if (!prev?.queue || typeof prev.queue !== "object") return null;
                    const pk = String((prev.queue as { key?: string }).key ?? "").trim();
                    if (!pk || !apiQueueKey) return null;
                    return workUnitQueuePillKeysEquivalent(
                        { queue_definition: pageCacheHitEarly.workUnit.queue_definition },
                        pk,
                        apiQueueKey
                    )
                        ? prev
                        : null;
                });
            }
        }
    }, [
        departmentId,
        workUnitId,
        orgId,
        principalUserId,
        accessScopeFingerprint,
        viewScopeFingerprint,
        setSelectedQueueKeyTraced,
    ]);

    useEffect(() => {
        recordAdminV2RouteChurnAttempt("work-unit-mount");
        const preserveShell = peekLifecycleWorkUnitSwitchPreserveSiblingsFlag();
        if (!preserveShell) {
            resetRouteShellTrace("work_unit");
            registerRouteLoadingOwner("work_unit", "page");
            markWorkUnitLaneShellChromePlaceholder();
        }
        markRouteShellVisible("work_unit", { departmentId, workUnitId });
        return () => {
            if (!preserveShell) unregisterRouteLoadingOwner("work_unit", "page");
        };
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

    const openWorkflowDiagnostics = useCallback(() => {
        const wuLabel = workUnit?.name?.trim() || "this work unit";
        const deptLabel = dept?.name?.trim() || "this department";
        globalAssistant?.focusCommandBar({
            seedCommand: `Review workflow health, recent failures, and recent runs for ${wuLabel} in ${deptLabel}.`,
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

    const hydrateWorkUnitQueueRowActions = useCallback(async (): Promise<boolean> => {
        if (!workUnitId || !departmentId) return queueRowActionsHydratedRef.current;
        if (queueRowActionsHydratedRef.current) return true;
        const init = workspaceDataFetchInit();
        const actionsListRoute =
            `/api/admin/actions?` +
            new URLSearchParams({
                surface: "queue_row",
                entity_type: "opportunity",
                work_unit_id: workUnitId,
                department_id: departmentId,
            }).toString();
        try {
            const ar = await dedupeAdminFetchWithTtl(actionsListRoute, init, 1500);
            const aj = (await ar.json().catch(() => ({}))) as { actions?: ResolvedActionsBySlot };
            if (ar.ok) {
                const rowInline = aj.actions?.row_inline ?? [];
                const overflow = aj.actions?.overflow ?? [];
                setOpportunityQueueRowResolved([...rowInline, ...overflow]);
            } else {
                setOpportunityQueueRowResolved([]);
            }
            queueRowActionsHydratedRef.current = true;
            setQueueRowActionsReady(true);
            logDrawerVmRuntimeDiagnostic("row_actions_ready", {
                work_unit_id: workUnitId,
                department_id: departmentId,
                source: "hydrate",
            });
            return true;
        } catch {
            setOpportunityQueueRowResolved([]);
            queueRowActionsHydratedRef.current = true;
            setQueueRowActionsReady(true);
            logDrawerVmRuntimeDiagnostic("row_actions_ready", {
                work_unit_id: workUnitId,
                department_id: departmentId,
                source: "hydrate_fallback",
            });
            return true;
        }
    }, [departmentId, workUnitId]);

    const commitQueueRowActionsWithLane = useCallback(
        (detail: {
            work_unit_id: string;
            department_id: string;
            source: string;
            pill_key?: string;
        }) => {
            if (queueRowActionsHydratedRef.current) {
                setQueueRowActionsReady(true);
            }
            logDrawerVmRuntimeDiagnostic("row_actions_ready", detail);
            markWorkUnitVmPillSwitchActionsReady({
                department_id: detail.department_id,
                work_unit_id: detail.work_unit_id,
                source: detail.source,
                pill_key: detail.pill_key,
            });
        },
        []
    );

    const loadWorkUnitDeferredSupplement = useCallback(async () => {
        if (!workUnitId || !departmentId) return;
        const init = workspaceDataFetchInit();

        if (!enrollmentActionsSettledRef.current) {
            try {
                const rightRailList = await fetchWorkspaceRightRailResolvedActions({
                    departmentId,
                    workUnitId,
                    fetchInit: init,
                    placementSurfaces: ["work_unit"],
                });
                if (Array.isArray(rightRailList) && rightRailList.length) {
                    setEnrollmentRightRailResolved(rightRailList);
                }
            } catch {
                /* non-fatal */
            }
        } else {
            logAdminV2DuplicateFetchSuppressed({
                surface: "work_unit",
                fetch: "right_rail_actions",
                reason: "bootstrap_hydrated_enrollment_rail",
                departmentId,
                workUnitId,
            });
        }

        if (!queueRowActionsHydratedRef.current) {
            await hydrateWorkUnitQueueRowActions();
        }

        const attn = wuBootstrapAttentionRef.current;
        if (attn?.execution_work_unit_id) {
            setNeedsAttentionWorkUnitId(attn.execution_work_unit_id);
        }
    }, [departmentId, workUnitId, selectedSiteId]);

    useEffect(() => {
        if (!workUnitId || !departmentId || !workUnit || loading) return;
        void hydrateWorkUnitQueueRowActions();
    }, [departmentId, workUnitId, workUnit?.id, loading, hydrateWorkUnitQueueRowActions]);

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
                /** User pill click — bypass in-flight lease and always fetch/apply for target lane. */
                userInitiated?: boolean;
                /** Full list enrichment after reveal-first pill switch (background, no loading shell). */
                backgroundListRefresh?: boolean;
                /** Initial active lane — reveal-first paint, full list upgrades in background. */
                initialLaneReveal?: boolean;
                fromQueueKey?: string | null;
                /** Prefetch/sibling fetch — use this work unit row for queue_definition guard. */
                workUnitRowOverride?: {
                    queue_definition?: unknown;
                    metadata?: unknown;
                } | null;
            }
        ) => {
            const workUnitRowForGuard =
                options?.workUnitRowOverride ??
                (workUnitRef.current ?
                    {
                        queue_definition: workUnitRef.current.queue_definition,
                        metadata: workUnitRef.current.metadata,
                    }
                :   null);
            const guarded = guardLifecycleQueueFetchBeforeApi({
                workUnitId,
                attemptedQueueKey: queueKey,
                workUnit:
                    workUnitRowForGuard ?
                        {
                            id: workUnitId,
                            queue_definition: workUnitRowForGuard.queue_definition,
                            metadata: workUnitRowForGuard.metadata,
                        }
                    :   null,
                attentionBucketKey:
                    options?.attentionBucketOverride !== undefined
                        ? String(options.attentionBucketOverride ?? "").trim()
                        : attentionBucketKeyRef.current,
                previousWorkUnitId: activeLifecycleSelectionRef.current.workUnitId,
                previousQueueKey: activeLifecycleSelectionRef.current.queueKey,
            });
            if (guarded.blocked) {
                setQueueItemsLoading(false);
                return;
            }
            const skipActionsHydrateBeforeCache =
                options?.userInitiated || options?.prefetchOnly || options?.quietStaleRefresh;
            if (!skipActionsHydrateBeforeCache && !queueRowActionsHydratedRef.current) {
                await hydrateWorkUnitQueueRowActions();
            }
            const queueKeyForLane = guarded.pillKey;
            const apiQueueKey = guarded.apiQueueKey;
            if (!apiQueueKey.trim()) {
                setQueueItemsLoading(false);
                return;
            }
            const summariesForLimit = _summaries ?? queueSummariesRef.current;
            const summaryForLane =
                summariesForLimit && workUnitRef.current
                    ? findQueueSummaryForSelection(summariesForLimit, workUnitRef.current, queueKeyForLane)
                    : null;
            const searchActive = recordFiltersRef.current.search.trim().length > 0;
            const revealFirstFetch =
                !options?.backgroundListRefresh &&
                (options?.quietStaleRefresh ||
                    options?.userInitiated ||
                    options?.prefetchOnly ||
                    options?.initialLaneReveal);
            const fetchLimit =
                revealFirstFetch ?
                    WORK_UNIT_QUEUE_REVEAL_FETCH_ROWS
                :   resolveWorkUnitQueueRowsFetchLimit(summaryForLane?.count, { searchActive });
            const resolvedFetch = resolveWorkUnitFetchQueueKeyFromPill(
                queueKeyForLane,
                options?.attentionBucketOverride !== undefined
                    ? String(options.attentionBucketOverride ?? "").trim()
                    : attentionBucketKeyRef.current,
                workUnitRef.current ? { queue_definition: workUnitRef.current.queue_definition } : undefined
            );
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
                limit: String(fetchLimit),
                offset: "0",
                count_mode: "exact",
                omit_total_count: "true",
            });
            if (abSnap) qs.set("attention_bucket", abSnap);
            if (options?.backgroundListRefresh) {
                /* full queue_list enrichment — no row_mode */
            } else if (
                options?.quietStaleRefresh ||
                options?.userInitiated ||
                options?.prefetchOnly ||
                options?.initialLaneReveal
            ) {
                qs.set("row_mode", "reveal");
            }
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
                    setQueuePillPendingKey(null);
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
                    commitQueueRowActionsWithLane({
                        work_unit_id: workUnitId,
                        department_id: departmentId,
                        pill_key: queueKey,
                        source: "lease_cache",
                    });
                    if (options?.userInitiated) {
                        markWorkUnitVmPillSwitchCommitted({
                            department_id: departmentId,
                            work_unit_id: workUnitId,
                            queue_key: apiQueueKey,
                            pill_key: queueKeyForLane,
                            source: "lane_cache",
                        });
                    }
                    if (pendingQueueTabPerfRef.current && typeof window !== "undefined" && typeof performance !== "undefined") {
                        pendingQueueTabPerfRef.current = false;
                        alloyPerfSet("queue_tab_rows_ready", performance.now());
                        markWorkUnitVmPillSwitchApply({
                            department_id: departmentId,
                            work_unit_id: workUnitId,
                            queue_key: apiQueueKey,
                            source: "lease_cache",
                        });
                        markWorkUnitVmPillSwitchCommitted({
                            department_id: departmentId,
                            work_unit_id: workUnitId,
                            queue_key: apiQueueKey,
                            source: "lease_cache",
                        });
                    }
                    markWorkUnitVmQueueReady({
                        department_id: departmentId,
                        work_unit_id: workUnitId,
                        queue_key: apiQueueKey,
                        source: "lease_cache",
                    });
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
                    putWorkUnitLaneCacheEntry(
                        {
                            queuePayload: payload,
                            generation: `${workUnitId}:${apiQueueKey}`,
                            lane: {
                                selectedQueueKey: queueKeyForLane,
                                attentionBucketKey: abSnap || null,
                                laneUnmappedOnly: logicalUm,
                                recordFilterFingerprint: "_",
                            },
                        },
                        {
                            orgId,
                            departmentId,
                            workUnitId,
                            scopeFingerprint: viewScopeFingerprint,
                        }
                    );
                    return;
                }
                if (options?.quietStaleRefresh) {
                    const decision = shouldApplyWorkUnitQueueRowsResponse({
                        requestSeq: seq,
                        latestRequestSeq: queueItemsRequestSeq.current,
                        stillSelected,
                    });
                    if (decision.apply) {
                        putQueueRowCache(cache, viewScopeFingerprint, workUnitId, apiQueueKey, payload, abSnap);
                        setQueueItems(payload);
                        lifecyclePillSwitchRetainRowsRef.current = false;
                        setLifecyclePillRetainRows(false);
                        activeLifecycleSelectionRef.current = {
                            workUnitId,
                            queueKey: queueKeyForLane,
                            stageKey: stageKeyFromLifecycleWorkUnitMetadata(workUnitRef.current?.metadata),
                        };
                        if (options?.userInitiated) {
                            const items = Array.isArray(payload.items) ? payload.items : [];
                            traceLifecyclePillQueueResult({
                                phase: items.length > 0 ? "rows_applied" : "rows_empty",
                                selected_work_unit_id: workUnitId,
                                queue_key: queueKeyForLane,
                                loader: inferLifecycleQueueRowLoader({
                                    work_unit_id: workUnitId,
                                    queue_key: apiQueueKey,
                                    work_unit_metadata: workUnitRef.current?.metadata,
                                    items,
                                }),
                                record_count: items.length,
                                total: typeof payload.total === "number" ? payload.total : null,
                                api_path: route,
                            });
                        }
                    }
                    if (options?.userInitiated) {
                        logQueueSwitch({
                            from_queue: options.fromQueueKey ?? null,
                            to_queue: queueKey,
                            request_id: seq,
                            applied: decision.apply,
                            skipped_reason: decision.skippedReason,
                            selected_queue_after: selectedQueueKeyRef.current,
                        });
                    }
                    return;
                }
                const decision = shouldApplyWorkUnitQueueRowsResponse({
                    requestSeq: seq,
                    latestRequestSeq: queueItemsRequestSeq.current,
                    stillSelected,
                });
                if (process.env.NODE_ENV === "development") {
                    console.log(`[queue-request:${decision.apply ? "apply" : "ignore"}]`, {
                        seq,
                        latestSeq: queueItemsRequestSeq.current,
                        reason: decision.skippedReason ?? "ok",
                        itemsCount: Array.isArray((payload as unknown as { rows?: unknown[] }).rows) ? (payload as unknown as { rows: unknown[] }).rows.length : null,
                        selectedQueueKey: queueKey,
                        currentSelectedQueueKey: selectedQueueKeyRef.current,
                        stillSelected,
                    });
                }
                if (decision.apply) {
                    if (
                        !options?.prefetchOnly &&
                        !options?.quietStaleRefresh &&
                        !options?.userInitiated
                    ) {
                        await hydrateWorkUnitQueueRowActions();
                    }
                    putQueueRowCache(cache, viewScopeFingerprint, workUnitId, apiQueueKey, payload, abSnap);
                    putWorkUnitLaneCacheEntry(
                        {
                            queuePayload: payload,
                            generation: `${workUnitId}:${apiQueueKey}`,
                            lane: {
                                selectedQueueKey: queueKeyForLane,
                                attentionBucketKey: abSnap || null,
                                laneUnmappedOnly: logicalUm,
                                recordFilterFingerprint: "_",
                            },
                        },
                        {
                            orgId,
                            departmentId,
                            workUnitId,
                            scopeFingerprint: viewScopeFingerprint,
                        }
                    );
                    setQueuePillPendingKey(null);
                    setQueueItems(payload);
                    lifecyclePillSwitchRetainRowsRef.current = false;
                    setLifecyclePillRetainRows(false);
                    activeLifecycleSelectionRef.current = {
                        workUnitId,
                        queueKey: queueKeyForLane,
                        stageKey: stageKeyFromLifecycleWorkUnitMetadata(workUnitRef.current?.metadata),
                    };
                    if (options?.userInitiated) {
                        const items = Array.isArray(payload.items) ? payload.items : [];
                        traceLifecyclePillQueueResult({
                            phase: items.length > 0 ? "rows_applied" : "rows_empty",
                            selected_work_unit_id: workUnitId,
                            queue_key: queueKeyForLane,
                            loader: inferLifecycleQueueRowLoader({
                                work_unit_id: workUnitId,
                                queue_key: apiQueueKey,
                                work_unit_metadata: workUnitRef.current?.metadata,
                                items,
                            }),
                            record_count: items.length,
                            total: typeof payload.total === "number" ? payload.total : null,
                            api_path: route,
                        });
                        commitQueueRowActionsWithLane({
                            work_unit_id: workUnitId,
                            department_id: departmentId,
                            pill_key: queueKey,
                            source: "network",
                        });
                        markWorkUnitVmPillSwitchCommitted({
                            department_id: departmentId,
                            work_unit_id: workUnitId,
                            queue_key: apiQueueKey,
                            pill_key: queueKeyForLane,
                            source: "network",
                        });
                    }
                    if (pendingQueueTabPerfRef.current && typeof window !== "undefined" && typeof performance !== "undefined") {
                        pendingQueueTabPerfRef.current = false;
                        requestAnimationFrame(() => {
                            requestAnimationFrame(() => {
                                alloyPerfSet("queue_tab_rows_ready", performance.now());
                                markWorkUnitVmPillSwitchApply({
                                    department_id: departmentId,
                                    work_unit_id: workUnitId,
                                    queue_key: apiQueueKey,
                                    source: "network",
                                });
                            });
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
                if (options?.userInitiated) {
                    logQueueSwitch({
                        from_queue: options.fromQueueKey ?? null,
                        to_queue: queueKey,
                        request_id: seq,
                        applied: decision.apply,
                        skipped_reason: decision.skippedReason,
                        buffered_rows_used: false,
                        selected_queue_after: selectedQueueKeyRef.current,
                    });
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

            if (options?.quietStaleRefresh || options?.backgroundListRefresh) {
                if (lease.has(fetchSig)) return;
                lease.add(fetchSig);
                const seq = ++queueItemsRequestSeq.current;
                try {
                    await runNetwork(seq, false);
                } catch {
                    /* stale/background refresh silent */
                } finally {
                    lease.delete(fetchSig);
                }
                return;
            }

            if (options?.userInitiated) {
                lease.delete(fetchSig);
            } else if (options?.force) {
                lease.delete(fetchSig);
            } else if (lease.has(fetchSig)) {
                return;
            } else {
                lease.add(fetchSig);
            }
            if (!options?.force && fetchSig === queueItemsLastFetchSigRef.current) {
                const ent = touchQueueRowCacheOnHit(cache, logicalKey);
                if (ent) {
                    // Cache hit for the same sig: apply immediately without a network round-trip.
                    lease.delete(fetchSig);
                    setQueuePillPendingKey(null);
                    setQueueItems(ent.payload);
                    setQueueItemsError(null);
                    setQueueItemsLoading(false);
                    commitQueueRowActionsWithLane({
                        work_unit_id: workUnitId,
                        department_id: departmentId,
                        pill_key: queueKey,
                        source: "row_cache",
                    });
                    if (pendingQueueTabPerfRef.current && typeof window !== "undefined" && typeof performance !== "undefined") {
                        pendingQueueTabPerfRef.current = false;
                        alloyPerfSet("queue_tab_rows_ready", performance.now());
                        markWorkUnitVmPillSwitchApply({
                            department_id: departmentId,
                            work_unit_id: workUnitId,
                            source: "row_cache",
                        });
                        markWorkUnitVmPillSwitchCommitted({
                            department_id: departmentId,
                            work_unit_id: workUnitId,
                            source: "row_cache",
                        });
                    }
                    markWorkUnitVmQueueReady({
                        department_id: departmentId,
                        work_unit_id: workUnitId,
                        source: "row_cache",
                    });
                    return;
                }
                // No cache entry (expired or evicted) even though sig matches.
                // Fall through to a fresh network fetch — this recovers from error states
                // where queueItems was cleared to null and the sig was never re-incremented.
                lease.delete(fetchSig);
            }
            queueItemsLastFetchSigRef.current = fetchSig;

            const seq = ++queueItemsRequestSeq.current;
            if (process.env.NODE_ENV === "development") {
                console.log("[queue-request:start]", {
                    seq,
                    workUnitId,
                    selectedQueueKey: queueKey,
                    apiQueueKey,
                    viewScopeFingerprint,
                    userInitiated: options?.userInitiated ?? false,
                });
            }
            const suppressLoadingShell = shouldSuppressQueueLoadingOnPillSwitch({
                user_initiated: options?.userInitiated === true,
                retain_prior_rows: lifecyclePillSwitchRetainRowsRef.current,
            });
            if (!suppressLoadingShell) {
                setQueueItemsLoading(true);
            }
            setQueueItemsError(null);
            setQueueItemsRoute(route);
            setQueueItems((prev) => {
                if (lifecyclePillSwitchRetainRowsRef.current) return prev;
                if (options?.userInitiated) return prev;
                const pk =
                    prev?.queue && typeof (prev.queue as { key?: string }).key === "string"
                        ? (prev.queue as { key: string }).key
                        : null;
                if (pk != null && pk !== apiQueueKey) return null;
                return prev;
            });
            try {
                if (!queueRowActionsHydratedRef.current) {
                    if (options?.userInitiated) {
                        void hydrateWorkUnitQueueRowActions();
                    } else {
                        await hydrateWorkUnitQueueRowActions();
                    }
                }
                await runNetwork(seq, true);
                primaryLaneRowsSettledOnceRef.current = true;
                if (
                    (options?.userInitiated || options?.initialLaneReveal) &&
                    !options?.backgroundListRefresh &&
                    seq === queueItemsRequestSeq.current
                ) {
                    void fetchQueueItems(workUnitId, queueKey, null, {
                        backgroundListRefresh: true,
                        logicalUnmapped: logicalUm,
                        ...(resolvedFetch.attentionBucketOverride !== undefined
                            ? { attentionBucketOverride: resolvedFetch.attentionBucketOverride }
                            : abSnap
                              ? { attentionBucketOverride: abSnap }
                              : {}),
                    });
                }
            } catch (e) {
                if (seq === queueItemsRequestSeq.current) {
                    pendingQueueTabPerfRef.current = false;
                    const hadRetain = lifecyclePillSwitchRetainRowsRef.current;
                    lifecyclePillSwitchRetainRowsRef.current = false;
                    setLifecyclePillRetainRows(false);
                    if (!hadRetain) {
                        setQueueItems(null);
                    }
                    setQueueItemsError(e instanceof Error ? e.message : "Failed to load queue items");
                    if (options?.userInitiated) {
                        traceLifecyclePillQueueResult({
                            phase: "rows_error",
                            selected_work_unit_id: workUnitId,
                            queue_key: queueKey,
                            loader: inferLifecycleQueueRowLoader({
                                work_unit_id: workUnitId,
                                queue_key: apiQueueKey,
                                work_unit_metadata: workUnitRef.current?.metadata,
                            }),
                            record_count: null,
                            error: e instanceof Error ? e.message : "Failed to load queue items",
                            api_path: route,
                        });
                    }
                }
            } finally {
                queueRowLeaseSigsRef.current.delete(fetchSig);
                if (
                    seq === queueItemsRequestSeq.current ||
                    queueRowLeaseSigsRef.current.size === 0
                ) {
                    setQueueItemsLoading(false);
                }
                if (seq === queueItemsRequestSeq.current) {
                    requestWorkUnitDeferredSupplement();
                }
            }
        },
        [
            commitQueueRowActionsWithLane,
            hydrateWorkUnitQueueRowActions,
            requestWorkUnitDeferredSupplement,
            markFirstUsefulPaintOnce,
            laneUnmappedOnly,
            viewScopeFingerprint,
            selectedSiteId,
        ]
    );

    const fetchQueueItemsRef = useRef(fetchQueueItems);
    fetchQueueItemsRef.current = fetchQueueItems;

    useEffect(() => {
        const q = recordFilters.search.trim();
        if (!workUnitId || !selectedQueueKey || q.length < 2) return;
        const timer = window.setTimeout(() => {
            void fetchQueueItemsRef.current(workUnitId, selectedQueueKey, queueSummariesRef.current, {
                force: true,
            });
        }, 320);
        return () => window.clearTimeout(timer);
    }, [recordFilters.search, selectedQueueKey, workUnitId]);

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
            if (nextKey === LIFECYCLE_NEEDS_ATTENTION_PLACEHOLDER_CHIP_KEY) return;
            const lifecycleNavWuId = parseLifecycleWorkUnitNavChipKey(nextKey);
            if (lifecycleNavWuId) {
                if (lifecycleNavWuId === workUnitId) return;
                const href = buildWorkUnitHref({
                    workspaceBase: WORKSPACE_BASE,
                    departmentId,
                    workUnitId: lifecycleNavWuId,
                    selectedSiteId,
                });
                logLifecycleWorkUnitPillClick({
                    phase: "click",
                    from_work_unit_id: workUnitId,
                    selected_work_unit_id: lifecycleNavWuId,
                    shell_reload: false,
                    sibling_list_refetch: false,
                    navigation: "in_page",
                });
                setLifecycleInPageWorkUnitSwitchFlag();
                setLifecycleWorkUnitSwitchPreserveSiblingsFlag(true);
                const targetSnap =
                    orgId && departmentId
                        ? readLifecycleWorkUnitSwitchSnapshot({
                              orgId,
                              departmentId,
                              accessScopeFingerprint,
                              workUnitId: lifecycleNavWuId,
                          })
                        : null;
                const targetWuRow =
                    targetSnap?.work_unit?.id === lifecycleNavWuId
                        ? (targetSnap.work_unit as WorkUnitRow)
                        : null;
                const targetSelection = targetWuRow
                    ? buildLifecycleWorkUnitPillSelection({
                          id: lifecycleNavWuId,
                          queue_definition: targetWuRow.queue_definition,
                          metadata: targetWuRow.metadata,
                      })
                    : null;
                const targetQueueKey = targetSelection?.queueKey ?? null;
                const targetLoaderHint = targetSelection
                    ? inferLifecycleQueueRowLoader({
                          work_unit_id: targetSelection.workUnitId,
                          queue_key: targetSelection.queueKey,
                          work_unit_metadata: targetWuRow?.metadata,
                      })
                    : "pending_bootstrap";
                if (targetWuRow) {
                    setWorkUnit(targetWuRow);
                    setDept(targetSnap!.department as DeptRow);
                    setQueueSummaries((targetSnap!.queue_summaries ?? []) as QueueSummary[]);
                    wuDeferredQueueKeysRef.current = targetSnap!.deferred_queue_keys ?? [];
                    bootstrapWuRef.current = targetWuRow;
                    workUnitDetailReadyRef.current = true;
                    seededWorkUnitShellRef.current = true;
                    setLoading(false);
                }
                if (orgId && workUnit && dept && departmentId) {
                    const primaryKey = resolveBootstrapPrimaryQueueKey(
                        workUnit,
                        queueSummaries,
                        selectedQueueKey ?? ""
                    );
                    writeLifecycleWorkUnitSwitchSnapshot({
                        orgId,
                        departmentId,
                        accessScopeFingerprint,
                        workUnitId,
                        snapshot: {
                            savedAtMs: Date.now(),
                            work_unit: {
                                id: workUnit.id,
                                name: workUnit.name,
                                key: workUnit.key,
                                department_id: workUnit.department_id,
                                queue_definition: workUnit.queue_definition,
                                metadata: workUnit.metadata,
                            },
                            department: {
                                id: dept.id,
                                name: dept.name,
                                key: dept.key,
                                metadata: dept.metadata,
                            },
                            queue_summaries: queueSummaries ?? [],
                            deferred_queue_keys: wuDeferredQueueKeysRef.current,
                            primary_queue_key: primaryKey,
                        },
                    });
                    if (lifecycleSiblingWorkUnits?.length) {
                        markLifecycleSiblingListStable({
                            orgId,
                            departmentId,
                            accessScopeFingerprint: viewScopeFingerprint,
                            siblings: lifecycleSiblingWorkUnits,
                            totalsByWorkUnitId: lifecycleSiblingTotalsById,
                        });
                    }
                }
                const fromQueueKeyBeforeSwitch = selectedQueueKeyRef.current;
                if (targetSelection?.queueKey) {
                    applyActiveLifecycleWorkUnitSelection(targetSelection, "lifecycleWuNav");
                    void hydrateWorkUnitQueueRowActions();
                } else {
                    skipNextQueueFetchEffectRef.current = true;
                    suppressQueueFetchEffectOnceRef.current = true;
                    setActiveWorkUnitId(lifecycleNavWuId);
                }
                setWuQueueLaneAuthorityReady(true);
                lifecyclePillSwitchRetainRowsRef.current = true;
                setLifecyclePillRetainRows(true);
                if (targetSelection?.queueKey) {
                    const cachedLane = touchCachedQueueItemsForPill({
                        cache: queueRowClientCacheRef.current,
                        viewScopeFingerprint,
                        workUnitId: targetSelection.workUnitId,
                        pillKey: targetSelection.queueKey,
                        attentionBucketKey: "",
                        unmappedOnly: false,
                        queueDefinition: targetWuRow?.queue_definition,
                    });
                    traceLifecyclePillQueueResult({
                        phase: "click",
                        from_work_unit_id: workUnitId,
                        selected_work_unit_id: targetSelection.workUnitId,
                        queue_key: targetSelection.queueKey,
                        loader: targetLoaderHint,
                        record_count: cachedLane
                            ? Array.isArray(cachedLane.items)
                                ? cachedLane.items.length
                                : null
                            : null,
                        api_path: `/api/admin/queues/${targetSelection.workUnitId}/${targetSelection.queueKey}`,
                    });
                    if (cachedLane) {
                        setQueueItems(cachedLane);
                        setQueueItemsError(null);
                        setQueueItemsLoading(false);
                        lifecyclePillSwitchRetainRowsRef.current = false;
                        setLifecyclePillRetainRows(false);
                        void fetchQueueItems(
                            targetSelection.workUnitId,
                            targetSelection.queueKey,
                            (targetSnap?.queue_summaries ?? null) as QueueSummary[] | null,
                            { quietStaleRefresh: true, userInitiated: true }
                        );
                    } else {
                        setQueueItemsLoading(true);
                        void fetchQueueItems(
                            targetSelection.workUnitId,
                            targetSelection.queueKey,
                            (targetSnap?.queue_summaries ?? null) as QueueSummary[] | null,
                            {
                                force: true,
                                userInitiated: true,
                                fromQueueKey: fromQueueKeyBeforeSwitch,
                            }
                        );
                    }
                } else {
                    traceLifecyclePillQueueResult({
                        phase: "click",
                        from_work_unit_id: workUnitId,
                        selected_work_unit_id: lifecycleNavWuId,
                        queue_key: "",
                        loader: targetLoaderHint,
                        record_count: null,
                        error: "no_primary_queue_key",
                    });
                    setQueueItemsLoading(true);
                }
                replaceWorkUnitLocationHref(href);
                return;
            }
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
                markWorkUnitVmPillSwitchStart({
                    department_id: departmentId,
                    work_unit_id: workUnitId,
                    from_pill: prevKey,
                    to_pill: nextKey,
                });
            }
            markKpiPillClick({
                department_id: departmentId,
                work_unit_id: workUnitId,
                from_pill: prevKey,
                to_pill: nextKey,
            });
            if (!sameQueue) {
                const clearedFilters = clearLaneScopedWorkUnitRecordFilters(recordFiltersRef.current);
                setRecordFilters(clearedFilters);
                replaceWorkUnitQueueRecordFiltersInLocation(clearedFilters);
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
            const abForLane =
                resolvedPill.attentionBucketOverride !== undefined
                    ? String(resolvedPill.attentionBucketOverride ?? "").trim()
                    : na
                      ? ""
                      : attentionBucketKeyRef.current.trim();
            const cachedLane =
                workUnitId ?
                    touchCachedQueueItemsForPill({
                        cache: queueRowClientCacheRef.current,
                        viewScopeFingerprint,
                        workUnitId,
                        pillKey: nextKey,
                        attentionBucketKey: abForLane,
                        unmappedOnly: unmappedActive,
                        queueDefinition: wu?.queue_definition,
                    })
                :   null;
            if (cachedLane) {
                markKpiPillCache("hit", {
                    department_id: departmentId,
                    work_unit_id: workUnitId,
                    pill_key: nextKey,
                });
                logDrawerVmRuntimeDiagnostic("lane_payload_cache_hit", {
                    work_unit_id: workUnitId,
                    pill_key: nextKey,
                    department_id: departmentId,
                });
                markWorkUnitVmPillSwitchCacheHit({
                    department_id: departmentId,
                    work_unit_id: workUnitId,
                    pill_key: nextKey,
                });
                setQueueItems(cachedLane);
                setQueueItemsError(null);
                setQueueItemsLoading(false);
                setQueuePillPendingKey(null);
                lifecyclePillSwitchRetainRowsRef.current = false;
                setLifecyclePillRetainRows(false);
            } else {
                markKpiPillCache("miss", {
                    department_id: departmentId,
                    work_unit_id: workUnitId,
                    pill_key: nextKey,
                    from_pill: prevKey,
                });
                logDrawerVmRuntimeDiagnostic("lane_payload_cache_miss", {
                    work_unit_id: workUnitId,
                    pill_key: nextKey,
                    from_pill: prevKey,
                    department_id: departmentId,
                });
                setQueuePillPendingKey(nextKey);
                lifecyclePillSwitchRetainRowsRef.current = true;
                setLifecyclePillRetainRows(true);
                markWorkUnitVmPillSwitchCacheMissHoldCurrent({
                    department_id: departmentId,
                    work_unit_id: workUnitId,
                    from_pill: prevKey,
                    to_pill: nextKey,
                });
            }
            if (prevKey !== nextKey) {
                setSelectedQueueKeyTraced("handleQueueTabChange", nextKey);
            }
            if (prevUnmapped !== unmappedActive) {
                setLaneUnmappedOnly(unmappedActive);
            }
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
                suppressQueueFetchEffectOnceRef.current = true;
                void fetchQueueItems(workUnitId, nextKey, null, {
                    force: false,
                    userInitiated: true,
                    fromQueueKey: prevKey,
                    logicalUnmapped: unmappedActive,
                    ...(cachedLane ? { quietStaleRefresh: true } : {}),
                    ...(resolvedPill.attentionBucketOverride !== undefined
                        ? { attentionBucketOverride: resolvedPill.attentionBucketOverride }
                        : na
                          ? { attentionBucketOverride: "" }
                          : {}),
                });
            }
        },
        [
            applyActiveLifecycleWorkUnitSelection,
            departmentId,
            dept,
            fetchQueueItems,
            hydrateWorkUnitQueueRowActions,
            lifecycleSiblingWorkUnits,
            lifecycleSiblingTotalsById,
            orgId,
            accessScopeFingerprint,
            queueSummaries,
            selectedQueueKey,
            selectedSiteId,
            setSelectedQueueKeyTraced,
            workUnit,
            workUnitId,
        ]
    );

    const handleQueuePillIntent = useCallback(
        (pillKey: string, opts?: { unmappedActive?: boolean }) => {
            if (!workUnitId) return;
            if (pillKey === LIFECYCLE_NEEDS_ATTENTION_PLACEHOLDER_CHIP_KEY) return;
            const lifecycleNavWuId = parseLifecycleWorkUnitNavChipKey(pillKey);
            if (lifecycleNavWuId) return;
            const wu = workUnitRef.current;
            const resolved = resolveWorkUnitFetchQueueKeyFromPill(
                pillKey,
                attentionBucketKeyRef.current,
                wu ? { queue_definition: wu.queue_definition } : undefined
            );
            void fetchQueueItems(workUnitId, pillKey, null, {
                prefetchOnly: true,
                logicalUnmapped: opts?.unmappedActive ?? false,
                ...(resolved.attentionBucketOverride !== undefined
                    ? { attentionBucketOverride: resolved.attentionBucketOverride }
                    : {}),
            });
        },
        [fetchQueueItems, workUnitId]
    );

    const handleAttentionBucketSelect = useCallback(
        (bucketKey: string | null) => {
            if (!workUnitId) return;
            const next = (bucketKey ?? "").trim();
            const prevKey = selectedQueueKeyRef.current;
            userLaneTouchedRef.current = true;
            skipNextQueueFetchEffectRef.current = true;
            queueRowsBufferRef.current = [];
            queueRowsBufferQueueKeyRef.current = null;
            const pillKey = next
                ? `${ATTENTION_BUCKET_PILL_PREFIX}${next}`
                : "needs_attention";
            setQueuePillPendingKey(pillKey);
            lifecyclePillSwitchRetainRowsRef.current = true;
            setLifecyclePillRetainRows(true);
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
                userInitiated: true,
                fromQueueKey: prevKey,
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
            summary_mode: "initial",
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
            logAdminV2DuplicateFetchSuppressed({
                surface: "work_unit",
                fetch: "queue_summaries",
                reason: "bootstrap_or_prior_fetch_hydrated",
                workUnitId: wuId,
            });
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
            const warmSwitch =
                orgId && departmentId
                    ? readLifecycleWorkUnitSwitchSnapshot({
                          orgId,
                          departmentId,
                          accessScopeFingerprint,
                          workUnitId,
                      })
                    : null;
            const shellPrefilled =
                seededWorkUnitShellRef.current || warmSwitch?.work_unit?.id === workUnitId;
            if (!shellPrefilled) {
                markWorkUnitNavigationStart();
                setAdminV2PrimarySurfacePending(true, "work_unit_bootstrap_effect");
            }
            const routeStart = typeof performance !== "undefined" ? performance.now() : 0;
            if (typeof performance !== "undefined" && typeof window !== "undefined") {
                alloyPerfSet("work_unit_start", routeStart);
                console.info("[wu-route-perf]", { event: "work_unit_route_mount", departmentId, workUnitId });
            }
            if (warmSwitch?.work_unit?.id === workUnitId) {
                setWorkUnit(warmSwitch.work_unit as WorkUnitRow);
                setDept(warmSwitch.department as DeptRow);
                setQueueSummaries((warmSwitch.queue_summaries ?? []) as QueueSummary[]);
                wuDeferredQueueKeysRef.current = warmSwitch.deferred_queue_keys ?? [];
                workUnitDetailReadyRef.current = true;
                bootstrapWuRef.current = warmSwitch.work_unit as WorkUnitRow;
                seededWorkUnitShellRef.current = true;
                setLoading(false);
                logLifecycleWorkUnitPillClick({
                    event: "warm_snapshot_apply",
                    work_unit_id: workUnitId,
                    record_area_prefetch: true,
                    shell_reload: false,
                });
            } else if (!seededWorkUnitShellRef.current) {
                setLoading(true);
            }
            setError(null);
            const init = workspaceDataFetchInit();
            workUnitDeferredScheduledRef.current = false;
            workUnitDetailReadyRef.current = false;
            pendingDeferredAfterWudRef.current = false;
            bootstrapWuRef.current = null;
            wuBootstrapAttentionRef.current = null;
            bootstrapPrimaryRowKeyRef.current = null;
            bootstrapPrimaryRowFetchScheduledRef.current = false;
            suppressQueueFetchEffectOnceRef.current = false;
            if (!seededWorkUnitShellRef.current) {
                firstUsefulPaintMarkedRef.current = false;
                setWorkUnit((prev) => (prev?.id === workUnitId ? prev : null));
                setDept((prev) =>
                    prev && String(prev.id ?? "") === String(departmentId) ? prev : null
                );
            }
            const inPageLifecycleSwitch = consumeLifecycleInPageWorkUnitSwitchFlag();
            if (!inPageLifecycleSwitch) {
                setWuQueueLaneAuthorityReady(false);
            }
            setOq(null);
            setNeedsAttentionWorkUnitId(null);
            setOpportunityQueueRowResolved(null);
            setQueueRowActionsReady(false);
            if (!inPageLifecycleSwitch) {
                setEnrollmentRightRailResolved(null);
                setEnrollmentActionsSettled(false);
                enrollmentActionsSettledRef.current = false;
            } else {
                const initRail = workspaceDataFetchInit();
                void fetchWorkspaceRightRailResolvedActions({
                    departmentId,
                    workUnitId,
                    fetchInit: initRail,
                    placementSurfaces: ["work_unit"],
                })
                    .then((list) => {
                        if (!cancelled) {
                            setEnrollmentRightRailResolved(Array.isArray(list) ? list : []);
                            setEnrollmentActionsSettled(true);
                            enrollmentActionsSettledRef.current = true;
                        }
                    })
                    .catch(() => {
                        /* keep prior rail */
                    });
            }
            setWuPlacementRows(undefined);
            setWuScopeHasPlacements(false);
            setWuBootstrapAttentionBuckets(null);
            parallelPrimaryRowStartedRef.current = false;
            markWorkUnitRevealGateStart({ departmentId, workUnitId });
            if (inPageLifecycleSwitch) {
                setWuQueueLaneAuthorityReady(true);
            }
            if (inPageLifecycleSwitch && warmSwitch?.work_unit?.id === workUnitId) {
                const bootSel = buildLifecycleWorkUnitPillSelection(warmSwitch.work_unit as WorkUnitRow);
                if (bootSel.queueKey) {
                    activeLifecycleSelectionRef.current = bootSel;
                    selectedQueueKeyRef.current = bootSel.queueKey;
                    setSelectedQueueKeyTraced("lifecycleInPageBootstrap", bootSel.queueKey);
                    bootstrapPrimaryRowKeyRef.current = bootSel.queueKey;
                    routeQueueSelectionRef.current = workUnitQueueSelectionFromPillKey(
                        bootSel.workUnitId,
                        bootSel.queueKey
                    );
                }
            }

            const initialLocation =
                initialLocationRef.current ?? readWorkUnitInitialLocationParams();
            initialLocationRef.current = initialLocation;

        const qFromUrlEffective =
            routeQueueSelectionRef.current?.queueKey.trim() ??
            initialLocation.queue.trim();

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
                const routeSel = routeQueueSelectionRef.current;
                const pillKey =
                    routeSel && routeSel.queueKey === primaryKey
                        ? workUnitActivePillKeyFromSelection({
                              ...routeSel,
                              queueKey: primaryKey,
                          })
                        : primaryKey;
                const abForFetch = initialLocation.attentionBucket.trim();
                const resolvedFetch = resolveWorkUnitFetchQueueKeyFromPill(
                    pillKey,
                    abForFetch,
                    { queue_definition: cachedWu.queue_definition }
                );
                const apiQueueKey = resolvedFetch.queueKey;
                const cachedPrimary = touchCachedQueueItemsForPill({
                    cache: queueRowClientCacheRef.current,
                    viewScopeFingerprint,
                    workUnitId,
                    pillKey,
                    attentionBucketKey: abForFetch,
                    unmappedOnly: initialLocation.unmapped,
                    queueDefinition: cachedWu.queue_definition,
                });
                if (cachedPrimary) {
                    bootstrapPrimaryRowFetchScheduledRef.current = true;
                    bootstrapPrimaryRowKeyRef.current = primaryKey;
                    suppressQueueFetchEffectOnceRef.current = true;
                    primaryLaneRowsSettledOnceRef.current = true;
                    void hydrateWorkUnitQueueRowActions().then(() => {
                        if (cancelled) return;
                        setQueueItems(cachedPrimary);
                        setQueueItemsLoading(false);
                    });
                    void fetchQueueItemsRef.current(workUnitId, pillKey, null, {
                        ...(primaryKey.trim().toLowerCase() === "needs_attention" && abForFetch
                            ? { attentionBucketOverride: abForFetch }
                            : {}),
                        quietStaleRefresh: true,
                    });
                    return;
                }
                bootstrapPrimaryRowFetchScheduledRef.current = true;
                bootstrapPrimaryRowKeyRef.current = primaryKey;
                suppressQueueFetchEffectOnceRef.current = true;
                if (!seededWorkUnitShellRef.current) {
                    setQueueItemsLoading(true);
                }
                void fetchQueueItemsRef.current(workUnitId, pillKey, null, {
                    initialLaneReveal: true,
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
                const abForFetch = initialLocation.attentionBucket.trim();
                void fetchQueueItemsRef.current(workUnitId, pillKey, null, {
                    initialLaneReveal: true,
                    ...(primaryKey.trim().toLowerCase() === "needs_attention" && abForFetch
                        ? { attentionBucketOverride: abForFetch }
                        : {}),
                });
                setWuQueueLaneAuthorityReady(true);
            };

            try {
                const abInit = initialLocation.attentionBucket.trim();
                try {
                    const bootstrapClientT0 =
                        typeof performance !== "undefined" ? performance.now() : 0;
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
                        const parseT0 = typeof performance !== "undefined" ? performance.now() : 0;
                        const rawBootstrap = (await bootstrapRes.json().catch(() => ({}))) as Record<string, unknown>;
                        const parseT1 = typeof performance !== "undefined" ? performance.now() : 0;
                        const { payload: peeled, serverPerf } = peelBootstrapServerPerf(rawBootstrap);
                        const applyT0 = typeof performance !== "undefined" ? performance.now() : 0;
                        const b = peeled as {
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
                            lifecycle_siblings?: {
                                work_units: Array<{
                                    id: string;
                                    name: string | null;
                                    key?: string | null;
                                    sort_order?: number | null;
                                }>;
                                totals_by_work_unit_id: Record<string, number>;
                            };
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
                        markWorkUnitVmBootstrapApply({ department_id: departmentId, work_unit_id: workUnitId });
                        markWorkUnitVmShellReady({ department_id: departmentId, work_unit_id: workUnitId });
                        markWorkUnitVmSummariesReady({
                            department_id: departmentId,
                            work_unit_id: workUnitId,
                            pill_count: qs.length,
                        });
                        setWuQueueLaneAuthorityReady(true);

                        const lifecycleSiblingsMerged = mergeLifecycleSiblingHydrationBlock(
                            b.lifecycle_siblings
                        );
                        if (lifecycleSiblingsMerged) {
                            setLifecycleSiblingWorkUnits(lifecycleSiblingsMerged.siblings);
                            setLifecycleSiblingTotalsById(lifecycleSiblingsMerged.totalsByWorkUnitId);
                            setLifecycleSiblingsHydrationComplete(true);
                            logLifecycleSiblingHydrationDev("bootstrap_apply", {
                                source: "bootstrap",
                                department_id: departmentId,
                                work_unit_id: workUnitId,
                                work_unit_ids: lifecycleSiblingsMerged.siblings.map((s) => s.id),
                                labels: lifecycleSiblingsMerged.siblings.map((s) => s.name),
                            });
                        }

                        if (orgId) {
                            const primaryKey = resolveBootstrapPrimaryQueueKey(wu, qs, qFromUrlEffective);
                            writeLifecycleWorkUnitSwitchSnapshot({
                                orgId,
                                departmentId,
                                accessScopeFingerprint,
                                workUnitId,
                                snapshot: {
                                    savedAtMs: Date.now(),
                                    work_unit: {
                                        id: wu.id,
                                        name: wu.name,
                                        key: wu.key,
                                        department_id: wu.department_id,
                                        queue_definition: wu.queue_definition,
                                        metadata: wu.metadata,
                                    },
                                    department: {
                                        id: deptRow.id,
                                        name: deptRow.name,
                                        key: deptRow.key,
                                        metadata: deptRow.metadata,
                                    },
                                    queue_summaries: qs,
                                    work_unit_scope_total:
                                        typeof b.queue?.work_unit_scope_total === "number"
                                            ? b.queue.work_unit_scope_total
                                            : null,
                                    work_unit_scope_queue_key:
                                        typeof b.queue?.work_unit_scope_queue_key === "string"
                                            ? b.queue.work_unit_scope_queue_key
                                            : null,
                                    deferred_queue_keys: wuDeferredQueueKeysRef.current,
                                    primary_queue_key: primaryKey,
                                },
                            });
                        }

                        const reservesRail = departmentReservesOperationalActionsRail({
                            departmentKey: deptRow.key,
                            departmentMetadata: deptRow.metadata,
                            workUnits: wu ? [{ key: wu.key, metadata: wu.metadata }] : [],
                        });
                        if (reservesRail) {
                            if (Array.isArray(b.right_rail_actions)) {
                                setEnrollmentRightRailResolved(b.right_rail_actions);
                            }
                            setEnrollmentActionsSettled(true);
                            enrollmentActionsSettledRef.current = true;
                            if (!Array.isArray(b.right_rail_actions)) {
                                void fetchWorkspaceRightRailResolvedActions({
                                    departmentId,
                                    workUnitId,
                                    fetchInit: init,
                                    placementSurfaces: ["work_unit"],
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
                            enrollmentActionsSettledRef.current = true;
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
                                await hydrateWorkUnitQueueRowActions();
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
                                const pillCount =
                                    typeof summaryForLane?.count === "number" && summaryForLane.count > 0
                                        ? summaryForLane.count
                                        : pl.items.length;
                                const inlineIncomplete = pillCount > pl.items.length;
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
                                    total: inlineIncomplete ? pillCount : pl.items.length,
                                    limit: pillCount,
                                    offset: 0,
                                    ...(pl.total_omitted ? { total_omitted: true } : {}),
                                };
                                setQueueItems(primaryPayload);
                                setQueueItemsError(null);
                                setQueueItemsRoute(pl.route);
                                setQueueItemsLoading(inlineIncomplete);
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
                                if (inlineIncomplete) {
                                    void fetchQueueItemsRef.current(workUnitId, pillKey, qs, {
                                        initialLaneReveal: true,
                                        ...(primaryAb ? { attentionBucketOverride: primaryAb } : {}),
                                    });
                                } else {
                                    // Bootstrap inlined queue_reveal rows are complete — defer queue_list
                                    // enrichment until idle so the active lane is not competing with a duplicate fetch.
                                    scheduleAdminV2BackgroundWork(
                                        () => {
                                            void fetchQueueItemsRef.current(workUnitId, pillKey, qs, {
                                                quietStaleRefresh: true,
                                                ...(primaryAb ? { attentionBucketOverride: primaryAb } : {}),
                                            });
                                        },
                                        { idleTimeoutMs: 1500, fallbackMs: 250 }
                                    );
                                }
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
                                void fetchQueueItemsRef.current(workUnitId, pillKey, null, {
                                    initialLaneReveal: true,
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
                            if (b.kpi_placements) {
                                setWuPlacementRows(b.kpi_placements.items ?? []);
                                setWuScopeHasPlacements(b.kpi_placements.scope_has_placements === true);
                            } else {
                                void loadWuKpiPlacements(wu);
                            }
                            requestWorkUnitDeferredSupplementRef.current();
                        }
                        const applyT1 = typeof performance !== "undefined" ? performance.now() : 0;
                        const payloadBytes = new TextEncoder().encode(JSON.stringify(peeled)).length;
                        logWorkUnitBootstrapBreakdown({
                            departmentId,
                            workUnitId,
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
                                bootstrap_owner: bootstrapOwner,
                                payload_bytes: payloadBytes,
                            },
                        });
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
                    placementSurfaces: ["work_unit"],
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
                    enrollmentActionsSettledRef.current = true;
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
        [
            departmentId,
            fetchQueueItems,
            fetchQueueSummaries,
            queueSummaries,
            router,
            selectedQueueKey,
            selectedSiteId,
            viewScopeFingerprint,
            workUnitId,
        ]
    );

    useEffect(() => {
        if (!workUnitId || !selectedQueueKey) return;
        const onUpdated = (ev: Event) => {
            const detail = parseOpportunityQueueUpdatedDetail(ev);
            const visibleIds = queueDisplayItemsRef.current
                .map((row) => String(row.opportunityId ?? row.id ?? "").trim())
                .filter(Boolean);
            const oppId = (detail?.id ?? "").trim();
            const patchRows = shouldPatchWorkUnitQueueRowsForEvent({
                detail,
                visibleOpportunityIds: visibleIds,
            });
            if (patchRows && oppId && detail?.queue_row_patch) {
                setQueueItems((prev) => {
                    const patched = patchWorkUnitQueueItemsResult(prev, oppId, detail.queue_row_patch!);
                    return patched ?? prev;
                });
                const displayPatched = patchWorkUnitQueuePreviewItems(
                    queueDisplayItemsRef.current,
                    oppId,
                    detail.queue_row_patch
                );
                if (displayPatched) {
                    queueDisplayItemsRef.current = displayPatched;
                    if (
                        queueRowsBufferWorkUnitIdRef.current === workUnitId &&
                        queueRowsBufferRef.current.length > 0
                    ) {
                        queueRowsBufferRef.current = displayPatched;
                    }
                }
                const refreshSummaries = shouldRefreshQueueSummariesForEvent({
                    detail,
                    visibleOpportunityIds: visibleIds,
                });
                logWorkUnitQueueRefreshDecision({
                    opportunityId: oppId,
                    actionKey: detail?.action_key,
                    refreshRows: false,
                    refreshSummaries,
                    patchedRows: true,
                    visibleRowCount: visibleIds.length,
                });
                if (refreshSummaries) {
                    void fetchQueueSummaries(workUnitId, { force: true });
                }
                return;
            }

            const refreshRows = shouldRefetchWorkUnitQueueRowsForEvent({
                detail,
                visibleOpportunityIds: visibleIds,
            });
            const refreshSummaries = shouldRefreshQueueSummariesForEvent({
                detail,
                visibleOpportunityIds: visibleIds,
            });
            if (refreshRows) {
                deleteQueueRowCacheKeysForWorkUnit(
                    queueRowClientCacheRef.current,
                    viewScopeFingerprint,
                    workUnitId
                );
            }
            const summaries = queueSummariesRef.current;
            const tasks: Promise<unknown>[] = [];
            if (refreshSummaries) {
                tasks.push(fetchQueueSummaries(workUnitId, { force: true }));
            }
            if (refreshRows) {
                tasks.push(fetchQueueItems(workUnitId, selectedQueueKey, summaries, { force: true }));
            }
            logWorkUnitQueueRefreshDecision({
                opportunityId: detail?.id,
                actionKey: detail?.action_key,
                refreshRows,
                refreshSummaries,
                patchedRows: false,
                visibleRowCount: visibleIds.length,
            });
            if (tasks.length) void Promise.all(tasks);
        };
        /** Drawer saves dispatch `adminv2:opportunity-updated` — scoped row refresh + summaries (not on drawer close). */
        window.addEventListener(OPPORTUNITY_QUEUE_UPDATED_EVENT, onUpdated as EventListener);
        return () => window.removeEventListener(OPPORTUNITY_QUEUE_UPDATED_EVENT, onUpdated as EventListener);
    }, [fetchQueueItems, fetchQueueSummaries, selectedQueueKey, viewScopeFingerprint, workUnitId]);

    /** Row fetch after bootstrap authority — tab/bucket handlers may force; bootstrap owns first visible load (PERF-C-02). */
    useEffect(() => {
        if (!workUnitId || !selectedQueueKey || loading || !workUnit) return;
        if (!wuQueueLaneAuthorityReady) return;
        if (!primaryLaneRowsSettledOnceRef.current) return;
        if (suppressQueueFetchEffectOnceRef.current) {
            suppressQueueFetchEffectOnceRef.current = false;
            return;
        }
        if (skipNextQueueFetchEffectRef.current) {
            skipNextQueueFetchEffectRef.current = false;
            return;
        }
        const sel = activeLifecycleSelectionRef.current;
        if (
            !lifecycleSelectionStateMatchesRef({
                stateWorkUnitId: workUnitId,
                stateQueueKey: selectedQueueKey,
                selection: sel,
            })
        ) {
            if (process.env.NODE_ENV === "development") {
                console.warn("[lifecycle-wu-fetch-skipped]", {
                    reason: "state_ref_mismatch",
                    stateWorkUnitId: workUnitId,
                    stateQueueKey: selectedQueueKey,
                    selection: sel,
                });
            }
            return;
        }
        void fetchQueueItems(sel.workUnitId, sel.queueKey, null);
    }, [fetchQueueItems, selectedQueueKey, workUnitId, workUnit, loading, laneUnmappedOnly, selectedSiteId, wuQueueLaneAuthorityReady]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        if (!workUnitId || !departmentId || loading || !workUnit) return;
        if (!primaryLaneRowsSettledOnceRef.current) return;
        if (wuLanePreviewBundleDoneRef.current) return;
        if (queueItemsLoading) return;
        return scheduleAdminV2BackgroundWork(
            () => {
                void warmWorkUnitLanePreviewCache();
            },
            { idleTimeoutMs: 1800, fallbackMs: 120 }
        );
    }, [
        workUnitId,
        departmentId,
        loading,
        workUnit,
        warmWorkUnitLanePreviewCache,
        wuQueueLaneAuthorityReady,
        queueSummaries,
        queueItemsLoading,
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

    const workUnitLaneReveal = useMemo(() => {
        const activeQueue =
            queueSummaries && workUnit
                ? findQueueSummaryForSelection(queueSummaries, workUnit, selectedQueueKey) ?? queueSummaries[0]
                : null;
        const activeQueueKey = String(activeQueue?.key ?? "");
        const state = resolveWorkUnitQueueLaneRevealState({
            lane_authority_ready: wuQueueLaneAuthorityReady,
            work_unit_id: workUnitId ?? null,
            selected_queue_key: selectedQueueKey,
            active_queue_key: activeQueueKey,
            attention_bucket_key: attentionBucketKey.trim(),
            lane_unmapped_only: laneUnmappedOnly,
            view_scope_fingerprint: viewScopeFingerprint,
            queue_definition: workUnit?.queue_definition,
            cache: queueRowClientCacheRef.current,
            queue_items: queueItems,
            queue_items_loading: queueItemsLoading,
            queue_items_error: queueItemsError,
        });
        return {
            state,
            activeQueueKey,
            settled: workUnitQueueLaneRevealSettled(state),
            mayPaintRows: workUnitQueueLaneMayPaintRows(state),
        };
    }, [
        queueSummaries,
        workUnit,
        selectedQueueKey,
        attentionBucketKey,
        laneUnmappedOnly,
        viewScopeFingerprint,
        workUnitId,
        wuQueueLaneAuthorityReady,
        queueItems,
        queueItemsLoading,
        queueItemsError,
    ]);

    const [wuInitialLaneRevealDone, setWuInitialLaneRevealDone] = useState(false);
    const [wuCoordinatedRevealDone, setWuCoordinatedRevealDone] = useState(false);

    useEffect(() => {
        if (seededWorkUnitShellRef.current) {
            setWuInitialLaneRevealDone(true);
            setWuCoordinatedRevealDone(true);
            return;
        }
        setWuInitialLaneRevealDone(false);
        setWuCoordinatedRevealDone(false);
    }, [departmentId, workUnitId]);

    useEffect(() => {
        if (warmLaneRevealReadyRef.current) {
            warmLaneRevealReadyRef.current = false;
            setWuInitialLaneRevealDone(true);
            primaryLaneRowsSettledOnceRef.current = true;
            return;
        }
        if (workUnitLaneReveal.settled && !wuInitialLaneRevealDone) {
            setWuInitialLaneRevealDone(true);
            primaryLaneRowsSettledOnceRef.current = true;
        }
    }, [workUnitLaneReveal.settled, wuInitialLaneRevealDone, departmentId, workUnitId]);

    const queueModel = useMemo<WorkUnitWorkspaceModel | null>(() => {
        if (!workUnit || !dept) return null;

        const enrollmentActionsRail = (): WorkUnitWorkspaceModel["actionsRail"] => {
            const emptyBase = {
                primaries: [],
                systemActions: [],
                quickOperations: [],
                overflow: [],
            };
            return departmentReservesOperationalActionsRail({
                departmentKey: dept.key,
                departmentMetadata: dept.metadata,
                workUnits: workUnit ? [{ key: workUnit.key, metadata: workUnit.metadata }] : [],
            })
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

        let queueItemsForDisplay = queueItems;
        if (!queueItemsForDisplay && activeQueueKey && workUnitId) {
            const resolvedFetch = resolveWorkUnitFetchQueueKeyFromPill(
                selectedQueueKey ?? activeQueueKey,
                attentionBucketKey,
                workUnit ? { queue_definition: workUnit.queue_definition } : undefined
            );
            const apiQueueKey = resolvedFetch.queueKey;
            if (apiQueueKey) {
                const logicalKey = queueRowLogicalCacheKey(
                    viewScopeFingerprint,
                    workUnitId,
                    apiQueueKey,
                    laneUnmappedOnly,
                    attentionBucketKey.trim()
                );
                const ent = peekFreshQueueRowCache(queueRowClientCacheRef.current, logicalKey);
                if (ent?.payload) {
                    queueItemsForDisplay = ent.payload;
                }
            }
        }

        const entity = queueItemsForDisplay?.queue.entity_type ?? activeQueue?.entity_type ?? "job";
        const rawList = (queueItemsForDisplay?.items ?? []) as unknown[];

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
            sanitizeWorkUnitRecordFiltersForLane(
                recordFilters,
                resolveWorkUnitLaneStatusFilterValues(workUnit, activeQueueKey || selectedQueueKey)
            )
        );
        const filteredSourceRows = recordFilterResult.items;
        const waitlistCandidateSourceRows = filteredSourceRows.some(
            (r) =>
                r != null &&
                typeof r === "object" &&
                (r as { _placement_waitlist_row?: unknown })._placement_waitlist_row != null
        );
        const waitlistShadowMode =
            queueItems?.placement_projection_diagnostics?.shadow_mode !== false;
        const rowsForQueueVm = waitlistCandidateSourceRows
            ? (() => {
                  const sorted = sortPlacementCandidateQueueRows(
                      filteredSourceRows as Array<Record<string, unknown>>,
                      waitlistShadowMode,
                      waitlistProgramCategoryContext
                  );
                  assignWaitlistCandidateRuntimePositions(
                      sorted,
                      waitlistShadowMode,
                      waitlistProgramCategoryContext
                  );
                  return sorted;
              })()
            : filteredSourceRows;

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
            rowsForQueueVm as Array<Record<string, unknown> & { id?: string }>
        ).map((r) => {
                const listRowId = r.id as string;
                const opportunityId = readOpportunityIdFromQueueRow(r);
                const waitlistCandidate = parsePlacementWaitlistCandidateRowVm(
                    (r as { _placement_waitlist_row?: unknown })._placement_waitlist_row,
                    waitlistProgramCategoryContext
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
                    ? null
                    : householdContextParts.length
                      ? householdContextParts.join(" · ")
                      : null;

                const rowPrimaryIdentity = familyTitle;
                const rowTitle = familyTitle;
                const grainCtx = parseQueueRowGrainContext(r as Record<string, unknown>);
                const relatedDrawerTargets = extractQueueRowRelatedDrawerTargets(
                    r as Record<string, unknown>,
                    rid,
                    process.env.NODE_ENV === "development"
                        ? { log: true, queueKey: selectedQueueKeyRef.current ?? null }
                        : undefined
                );

                return {
                    id: listRowId,
                    opportunityId: rid,
                    relatedPersonId: relatedDrawerTargets.personId,
                    relatedChildPersonId: relatedDrawerTargets.childPersonId,
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
                                      childrenLines:
                                          waitlistCandidate && relatedDrawerTargets.childPersonId
                                              ? [
                                                    {
                                                        primary: waitlistCandidate.childDisplayName,
                                                        personId: relatedDrawerTargets.childPersonId,
                                                        programInline: waitlistCandidate.cohortLabel,
                                                    },
                                                ]
                                              : waitlistCandidate
                                                ? null
                                                : childrenLinesForVm,
                                      contactPersonId:
                                          crmPresentation.contactPersonId ?? relatedDrawerTargets.personId,
                                      childPersonId: waitlistCandidate
                                          ? relatedDrawerTargets.childPersonId ?? null
                                          : multiChildren
                                            ? null
                                            : childrenLinesForVm?.length === 1
                                              ? childrenLinesForVm[0]?.personId ??
                                                relatedDrawerTargets.childPersonId
                                              : childDisplayLine
                                                ? relatedDrawerTargets.childPersonId
                                                : null,
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
                        ? waitlistQueueItemGrouping(
                              { placementWaitlistCandidate: waitlistCandidate },
                              waitlistProgramCategoryContext
                          )
                        : usePlacementV2 && placementPriorityV2
                          ? waitlistQueueItemGrouping(
                                { placementPriorityV2 },
                                waitlistProgramCategoryContext
                            )
                          : placementPriority
                            ? waitlistQueueItemGrouping(
                                  { placementPriority },
                                  waitlistProgramCategoryContext
                              )
                            : {}),
                    layoutRuntimeEnrichment: buildQueueRowLayoutRuntimeEnrichment(r as Record<string, unknown>),
                    ...(r._queue_row_context != null &&
                    typeof r._queue_row_context === "object" &&
                    !Array.isArray(r._queue_row_context)
                        ? {
                              _queue_row_context: r._queue_row_context as import("@/lib/workUnits/lifecycleSubjectContracts").QueueRowContext,
                          }
                        : {}),
                };
            });

        if (
            !queueItemsError &&
            !queueItemsLoading &&
            queueItems &&
            activeQueueKey &&
            workUnitQueuePillKeysEquivalent(
                workUnit ? { queue_definition: workUnit.queue_definition } : null,
                String(queueItems.queue.key ?? ""),
                activeQueueKey
            )
        ) {
            queueRowsBufferRef.current = liveVmItems.slice();
            queueRowsBufferWorkUnitIdRef.current = workUnitId;
            queueRowsBufferQueueKeyRef.current = activeQueueKey;
        }

        const bufferMatchesLane =
            queueRowsBufferWorkUnitIdRef.current === workUnitId &&
            queueRowsBufferMatchesActiveLane(
                queueRowsBufferQueueKeyRef.current,
                activeQueueKey,
                (a, b) =>
                    workUnitQueuePillKeysEquivalent(
                        workUnit ? { queue_definition: workUnit.queue_definition } : null,
                        a,
                        b
                    )
            );
        const laneMayPaint = workUnitLaneReveal.mayPaintRows;
        const lifecycleRetainPaint =
            lifecyclePillRetainRows && queueItemsLoading && liveVmItems.length > 0;
        const pillSwitchRetainPaint =
            (lifecyclePillRetainRows || queuePillPendingKey != null) &&
            queueItemsLoading &&
            (liveVmItems.length > 0 || queueRowsBufferRef.current.length > 0);
        const rowsRefreshing = resolveWorkUnitQueueRowsRefreshing({
            lane_reveal_settled: laneMayPaint,
            queue_items_loading: queueItemsLoading,
            bootstrap_loading: loading,
            pill_switch_retain_rows: lifecycleRetainPaint || pillSwitchRetainPaint,
        });
        const displayItems = laneMayPaint
            ? liveVmItems
            : lifecycleRetainPaint
              ? liveVmItems
              : bufferMatchesLane && queueRowsBufferRef.current.length > 0
                ? queueRowsBufferRef.current
                : [];
        queueDisplayItemsRef.current = displayItems;

        const laneTitle = workUnit.name ?? "Queue";
        const errorLine = queueItemsError
            ? `${queueItemsError}${queueItemsRoute ? ` · Route: ${queueItemsRoute}` : ""}`
            : undefined;

        const tabCount =
            activeQueue?.counts_deferred === true ? undefined : typeof activeQueue?.count === "number" ? activeQueue.count : undefined;
        const siteScopedLoadedTotal =
            queueItems != null &&
            !queueItemsError &&
            !queueItemsLoading &&
            queueItems.total_omitted !== true &&
            typeof queueItems.total === "number"
                ? queueItems.total
                : undefined;
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
              : siteScopedLoadedTotal != null
                ? siteScopedLoadedTotal
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
            (String(queueItems.queue.key ?? "") === activeQueueKey ||
                workUnitQueuePillKeysEquivalent(
                    workUnit ? { queue_definition: workUnit.queue_definition } : null,
                    String(queueItems.queue.key ?? ""),
                    activeQueueKey
                ))
                ? queueItems.placement_projection_diagnostics
                : undefined;

        const hasPlacementCandidateRows = liveVmItems.some((i) => i.placementWaitlistCandidate != null);
        const workUnitGroupHeaders = hasPlacementCandidateRows
            ? buildPlacementWaitlistWorkUnitGroupHeaders(
                  liveVmItems.map((item) => {
                      const g = waitlistQueueItemGrouping(item, waitlistProgramCategoryContext);
                      return {
                          groupKey: "groupKey" in g ? g.groupKey : undefined,
                          groupLabel: "groupLabel" in g ? g.groupLabel : undefined,
                      };
                  }),
                  waitlistProgramCategoryContext
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
                          laneStatusLine: !laneMayPaint
                              ? ""
                              : rowsRefreshing
                                ? activeQueue?.label?.trim()
                                    ? `Refreshing ${activeQueue.label.trim()}…`
                                    : "Refreshing queue…"
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
                // rowsLoading suppresses "No records" empty-state copy while a fetch is in flight.
                // Belt-and-suspenders with rowsHeld (which QueueBlock also checks for empty state).
                rowsLoading: queueItemsLoading && !pillSwitchRetainPaint && !lifecycleRetainPaint,
                rowsHeld: !laneMayPaint && !lifecycleRetainPaint && !pillSwitchRetainPaint,
                rowsRefreshing,
                rowActionsPending:
                    displayItems.length > 0 &&
                    !queueRowActionsReady &&
                    !queueRowActionsHydratedRef.current &&
                    !lifecycleRetainPaint,
                ...(workUnitGroupHeaders ? { workUnitGroupHeaders } : {}),
                waitlistProgramCategoryContext,
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
        selectedSiteId,
        waitlistProgramCategoryContext,
        workUnitLaneReveal.mayPaintRows,
        workUnitLaneReveal.settled,
        lifecyclePillRetainRows,
        queuePillPendingKey,
        queueRowActionsReady,
    ]);

    const queueUiPresentationFlags = useMemo(() => {
        const flags = readQueueUiPresentationFlags(workUnit?.queue_definition);
        if (isLifecycleStageWorkUnitKey(workUnit?.key ?? null)) {
            return { ...flags, suppressLifecyclePanel: true };
        }
        return flags;
    }, [workUnit?.queue_definition, workUnit?.key]);

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
        const result = applyWorkUnitQueueRecordFilters(
            rawRows,
            sanitizeWorkUnitRecordFiltersForLane(
                recordFilters,
                resolveWorkUnitLaneStatusFilterValues(
                    workUnit,
                    recordFilterContext?.queueKey ?? selectedQueueKey
                )
            )
        );
        return { filteredCount: result.filteredCount, totalLoaded: result.totalLoaded };
    }, [queueItems?.items, recordFilters, recordFilterContext?.queueKey, selectedQueueKey, workUnit]);

    useEffect(() => {
        if (!workUnit || !selectedQueueKey?.trim()) return;
        const allowed = resolveWorkUnitLaneStatusFilterValues(workUnit, selectedQueueKey);
        setRecordFilters((prev) => {
            const next = sanitizeWorkUnitRecordFiltersForLane(prev, allowed);
            if (next === prev) return prev;
            replaceWorkUnitQueueRecordFiltersInLocation(next);
            return next;
        });
    }, [workUnit, selectedQueueKey]);

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
                drawerSubjectContext: previewRow
                    ? opportunityDrawerSubjectContextFromQueueItem(previewRow)
                    : undefined,
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
            lastQueueOpportunityIdRef.current = id;
            markDrawerRowClickStart();
            warmQueueRowOpportunityVm(id, opportunityWorkspaceContext ?? null, "queue_row_click");
            prefetchOpportunityDrawerOnRowIntent(id, opportunityWorkspaceContext ?? undefined, opportunityQueuePreviewSeed);
            const openParams = buildOpportunityDrawerOpenParams(id);
            const vmPeek = peekDrawerViewModelPreloadSync(
                buildPrepareParamsFromOpenDrawer({
                    ...openParams,
                    source: "queue_row_open",
                })
            );
            logDrawerVmRuntimeDiagnostic(
                vmPeek ? "queue_row_open_cache_hit" : "queue_row_open_cache_miss",
                {
                    opportunity_id: id,
                    work_unit_id: opportunityWorkspaceContext?.work_unit_id ?? null,
                    department_id: opportunityWorkspaceContext?.department_id ?? null,
                }
            );
            if (!vmPeek) {
                setQueueRowOpenPendingOpportunityId(id);
            }
            openDrawer(openParams);
        },
        [buildOpportunityDrawerOpenParams, openDrawer, opportunityWorkspaceContext]
    );

    useEffect(() => {
        if (
            drawer.type === "opportunities" &&
            drawer.id &&
            queueRowOpenPendingOpportunityId &&
            String(drawer.id) === String(queueRowOpenPendingOpportunityId)
        ) {
            setQueueRowOpenPendingOpportunityId(null);
        }
    }, [drawer.id, drawer.type, queueRowOpenPendingOpportunityId]);

    const openWorkUnitQueuePersonDrawer = useCallback(
        (personId: string, opportunityId: string) => {
            const pid = personId.trim();
            if (!pid) return;
            void prepareDrawerViewModel({
                entityType: "persons",
                entityId: pid,
                openSource: "queue_row_person",
                context: {
                    departmentId,
                    workUnitId: workUnit?.id ?? null,
                },
            });
            openDrawer({
                type: "persons",
                id: pid,
                source: "queue_row_person",
                personDrawerOpenSeed: { personId: pid, opportunity_id: opportunityId.trim() || undefined },
            });
        },
        [departmentId, openDrawer, workUnit?.id]
    );

    const openWorkUnitQueueChildDrawer = useCallback(
        (childPersonId: string, opportunityId: string) => {
            const cid = childPersonId.trim();
            if (!cid) return;
            void prepareDrawerViewModel({
                entityType: "persons",
                entityId: cid,
                openSource: PERSON_DRAWER_CHILD_OPEN_SOURCE,
                presentationEmphasis: "child_lifecycle",
                context: {
                    departmentId,
                    workUnitId: workUnit?.id ?? null,
                },
            });
            openDrawer({
                type: "persons",
                id: cid,
                source: PERSON_DRAWER_CHILD_OPEN_SOURCE,
                personDrawerOpenSeed: {
                    personId: cid,
                    presentation_emphasis: "child_lifecycle",
                    opportunity_id: opportunityId.trim() || undefined,
                },
            });
        },
        [departmentId, openDrawer, workUnit?.id]
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
                const railOpportunityId = lastQueueOpportunityIdRef.current?.trim() || null;
                if (isScheduleTourRegistryAction(resolved) && !railOpportunityId) {
                    openScheduleTourRecordPicker();
                    return;
                }
                if (isScheduleTourRegistryAction(resolved) && railOpportunityId) {
                    openScheduleTourForOpportunity(railOpportunityId);
                    return;
                }
                const out = await applyRegistryResolvedActionClient(resolved, {
                    router,
                    openDrawer,
                    openCreateLead: () => setCreateLeadOpen(true),
                    openScheduleTourRecordPicker: openScheduleTourRecordPicker,
                    openForm: ({ form_key }) => {
                        const formKey = form_key.trim();
                        if (formKey === "schedule_tour" || formKey === "reschedule_tour") {
                            if (!railOpportunityId) {
                                openScheduleTourRecordPicker();
                                return;
                            }
                            openScheduleTourForOpportunity(railOpportunityId);
                        }
                    },
                    invalidate,
                    departmentId,
                    workUnitId: workUnit?.id ?? null,
                    entityId: railOpportunityId,
                    needsAttentionHref,
                    context: {
                        surface: "right_rail",
                        department_id: departmentId,
                        work_unit_id: workUnit?.id ?? null,
                    },
                });
                if (!out.ok && out.error) {
                    setActionSurfaceError(out.error);
                }
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
            if (action.type === "queue.item.action" && action.actionId === "open_person_drawer" && action.itemId) {
                const payload =
                    action.payload && typeof action.payload === "object"
                        ? (action.payload as Record<string, unknown>)
                        : {};
                const personId = typeof payload.person_id === "string" ? payload.person_id.trim() : "";
                if (personId) {
                    openWorkUnitQueuePersonDrawer(personId, action.itemId);
                }
                return;
            }
            if (action.type === "queue.item.action" && action.actionId === "open_child_drawer" && action.itemId) {
                const payload =
                    action.payload && typeof action.payload === "object"
                        ? (action.payload as Record<string, unknown>)
                        : {};
                const childPersonId =
                    typeof payload.child_person_id === "string" ? payload.child_person_id.trim() : "";
                if (childPersonId) {
                    openWorkUnitQueueChildDrawer(childPersonId, action.itemId);
                }
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
                    if (formKey === "mark_lost") {
                        setMarkLostTargetId(action.itemId);
                        setMarkLostOpen(true);
                        return;
                    }
                    if (formKey === "add_note") {
                        setAddNoteTargetId(action.itemId);
                        setAddNoteOpen(true);
                        return;
                    }
                }
                if (resolved && isScheduleTourRegistryAction(resolved)) {
                    const oppId = queueItem
                        ? resolveScheduleTourOpportunityIdFromQueueItem(queueItem)
                        : action.itemId;
                    openScheduleTourForOpportunity(oppId);
                    return;
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
                    window.location.href = "/admin/settings/work-units";
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
            openScheduleTourForOpportunity,
            openScheduleTourRecordPicker,
            openWorkUnitQueueRecord,
            openWorkUnitQueuePersonDrawer,
            openWorkUnitQueueChildDrawer,
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
    const reserveWorkUnitActionsRail = departmentReservesOperationalActionsRail({
        departmentKey: dept?.key,
        departmentMetadata: dept?.metadata,
        workUnits: workUnit ? [{ key: workUnit.key, metadata: workUnit.metadata }] : [],
    });

    const workUnitAboveFold = useMemo(() => {
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
            queue_pill_sections: builderOwnedLifecycleShell ? null : pillSectionsForModel,
            queue_tab_placeholders: builderOwnedLifecycleShell
                ? null
                : queueTabPlaceholdersExpanded ?? queueTabPlaceholders,
            lifecycle_builder_owned_header_sections: lifecycleHeaderSections,
            lifecycle_builder_owned_header_pending:
                builderOwnedLifecycleShell && !lifecycleSiblingHeaderReady,
            selected_queue_key: selectedQueueKey,
            attention_bucket_key: attentionBucketKey,
            lane_unmapped_only: laneUnmappedOnly,
            all_records_queue_key: allRecordsQueueKey,
            other_pill_section_key: otherPillSectionKey,
            unmapped_pill_count: unmappedPillCount,
            enrollment_right_rail_resolved: enrollmentRightRailResolved,
            queue_items_loading: queueItemsLoading,
            queue_lane_reveal_state: workUnitLaneReveal.state,
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
        workUnitId,
        viewScopeFingerprint,
        workUnit?.queue_definition,
        workUnitLaneReveal.state,
        builderOwnedLifecycleShell,
        lifecycleHeaderSections,
        lifecycleSiblingHeaderReady,
    ]);

    const workUnitRouteShellPlaceholder = useMemo(
        () =>
            buildWorkUnitRouteShellPlaceholder({
                workUnitId: workUnitId ?? undefined,
                workUnitTitle: wuName,
                departmentTitle: dept?.name?.trim() || deptName,
                departmentKey: dept?.key ?? undefined,
                reserveActionsRail: reserveWorkUnitActionsRail,
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
            queue_rows_need_actions:
                workUnitLaneReveal.mayPaintRows &&
                (queueItems?.items?.length ?? 0) > 0,
            queue_row_actions_ready: queueRowActionsReady,
        });
        const rows_ready = workUnitRevealRowsReady({
            lane_authority_ready: wuQueueLaneAuthorityReady,
            queue_summaries: queueSummaries,
            queue_summaries_error: queueSummariesError,
            lane_reveal_settled: workUnitLaneReveal.settled,
        });
        return computeWorkUnitRevealGate({
            shell_ready,
            summaries_ready,
            actions_ready,
            rows_ready,
            kpi_ready: workUnitRevealKpiReady({
                suppress_kpi_strip: suppressWorkUnitKpiStrip,
                kpi_metrics_pending: workUnitKpiMetricsPending,
            }),
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
        workUnitLaneReveal.settled,
        workUnitLaneReveal.mayPaintRows,
        queueItems?.items?.length,
        queueRowActionsReady,
        suppressWorkUnitKpiStrip,
        workUnitKpiMetricsPending,
    ]);

    const workUnitAboveFoldPageReady = workUnitRevealGate.above_fold_ready;

    const workUnitQueueRevealReady = workUnitLaneReveal.settled;

    const workUnitPageContentReady = resolveWorkUnitPageContentReady({
        shell_ready: workUnitShellReady,
        critical_bundle_ready: workUnitAboveFoldPageReady,
        coordinated_reveal_completed: wuCoordinatedRevealDone,
    });

    useEffect(() => {
        if (!workUnitAboveFoldPageReady || wuCoordinatedRevealDone) return;
        setWuCoordinatedRevealDone(true);
    }, [workUnitAboveFoldPageReady, wuCoordinatedRevealDone]);

    const workUnitKpiStripPlaceholder = workUnitKpiStripShowsPlaceholder({
        kpi_metrics_pending: workUnitKpiMetricsPending,
        lane_reveal_settled: workUnitLaneReveal.settled,
    });

    const workUnitRoutePipeline = useMemo(
        () =>
            buildWorkUnitRoutePipelineState({
                department_id: departmentId,
                work_unit_id: workUnitId,
                department_title: deptName,
                work_unit_title: wuName,
                department_key: dept?.key ?? undefined,
                operator_slug_route: Boolean(slugRoute),
                shell_identity_ready: workUnitShellReady,
                oper_lane_loading: workUnitOperLaneLoading,
                kpi_placeholder: workUnitKpiStripPlaceholder,
                primary_loaded: workUnitPageContentReady,
                full_complete: workUnitAboveFoldPageReady,
                work_unit_above_fold: workUnitAboveFold,
            }),
        [
            departmentId,
            workUnitId,
            deptName,
            wuName,
            dept?.key,
            slugRoute,
            workUnitShellReady,
            workUnitOperLaneLoading,
            workUnitKpiStripPlaceholder,
            workUnitPageContentReady,
            workUnitAboveFoldPageReady,
            workUnitAboveFold,
        ]
    );

    useEffect(() => {
        if (!workUnitPageContentReady) return;
        markWorkUnitTransitionReady({ department_id: departmentId, work_unit_id: workUnitId });
        markWorkUnitLaneShellChromeReal({ departmentId, workUnitId });
        markRouteBootstrapReturned("work_unit", { departmentId, workUnitId });
        if (typeof performance !== "undefined" && typeof window !== "undefined") {
            const navStart = alloyPerfGet("work_unit_navigation_start") ?? alloyPerfGet("work_unit_start");
            perfWorkUnitLoad({
                phase: "shell_rows_ready",
                ms: navStart != null ? Math.round(performance.now() - Number(navStart)) : 0,
                source: "network",
                department_id: departmentId,
                work_unit_id: workUnitId,
                queue_key: selectedQueueKey,
            });
        }
    }, [workUnitPageContentReady, departmentId, workUnitId, selectedQueueKey]);

    useEffect(() => {
        if (!workUnitAboveFoldPageReady || !departmentId || !workUnitId) return;
        return scheduleAdminV2BackgroundWork(
            () => {
                void refreshWorkflowPanels();
            },
            { idleTimeoutMs: 1200, fallbackMs: 500 },
        );
    }, [workUnitAboveFoldPageReady, departmentId, workUnitId, refreshWorkflowPanels]);

    useEffect(() => {
        markWorkUnitRevealGatePhases(workUnitRevealGate, { departmentId, workUnitId });
    }, [workUnitRevealGate, departmentId, workUnitId]);

    useEffect(() => {
        if (!workUnitAboveFoldPageReady) return;
        markWorkUnitLaneHeaderChipsReal({ departmentId, workUnitId });
        markWorkUnitAboveFoldCoordinated({ departmentId, workUnitId });
        markRouteFirstAboveFoldStable("work_unit", { departmentId, workUnitId });
        markWorkUnitVmFirstPaintReady({
            department_id: departmentId,
            work_unit_id: workUnitId,
            queue_key: selectedQueueKey,
        });
        markWorkUnitVmActionsFirstPaintReady({
            department_id: departmentId,
            work_unit_id: workUnitId,
            queue_key: selectedQueueKey,
        });
        if (typeof performance !== "undefined" && typeof window !== "undefined") {
            const navStart = alloyPerfGet("work_unit_navigation_start") ?? alloyPerfGet("work_unit_start");
            perfWorkUnitLoad({
                phase: "above_fold_ready",
                ms: navStart != null ? Math.round(performance.now() - Number(navStart)) : 0,
                source: "network",
                department_id: departmentId,
                work_unit_id: workUnitId,
                queue_key: selectedQueueKey,
            });
        }
    }, [workUnitAboveFoldPageReady, departmentId, workUnitId, selectedQueueKey]);

    const workUnitQueueRecordIds = useMemo(() => {
        const items = queueModel?.primaryQueue?.items ?? queueItems?.items ?? [];
        const ids: string[] = [];
        for (const row of items as Array<{ id?: string; opportunity_id?: string }>) {
            const id = String(row.opportunity_id ?? row.id ?? "").trim();
            if (id) ids.push(id);
        }
        return ids;
    }, [queueModel?.primaryQueue?.items, queueItems?.items]);

    useEffect(() => {
        if (!workUnitId || !queueRowActionsReady) return;
        markWorkUnitVmRowActionsReady({ department_id: departmentId, work_unit_id: workUnitId });
    }, [queueRowActionsReady, departmentId, workUnitId]);

    useEffect(() => {
        if (!workUnitId || !enrollmentActionsSettled) return;
        markWorkUnitVmRightRailActionsReady({ department_id: departmentId, work_unit_id: workUnitId });
    }, [enrollmentActionsSettled, departmentId, workUnitId]);

    useEffect(() => {
        if (!workUnitId) return;
        const rowsNeedActions = workUnitQueueRecordIds.length > 0;
        const rowOk = !rowsNeedActions || queueRowActionsReady;
        if (rowOk && enrollmentActionsSettled) {
            markWorkUnitVmActionsReady({ department_id: departmentId, work_unit_id: workUnitId });
        }
    }, [
        workUnitQueueRecordIds.length,
        queueRowActionsReady,
        enrollmentActionsSettled,
        departmentId,
        workUnitId,
    ]);

    useEffect(() => {
        if (!workUnitAboveFoldPageReady || !workUnit || !dept) return;
        const sig = `${workUnitId}:${selectedQueueKey ?? ""}:${queueRowActionsReady}:${enrollmentActionsSettled}:${workUnitQueueRecordIds.length}`;
        if (workUnitVmShadowSigRef.current === sig) return;
        workUnitVmShadowSigRef.current = sig;
        scheduleWorkUnitViewModelShadow({
            departmentId,
            workUnitId,
            workUnitKey: workUnit.key ?? "",
            selectedQueueKey,
            queueSummaries:
                queueSummaries?.map((q) => ({ key: q.key, count: q.count })) ?? null,
            queueSummariesError,
            queueItems: queueItems as { items?: unknown[] } | null,
            queueItemsLoading,
            queueLaneRevealState: workUnitLaneReveal.state,
            workUnitAboveFold,
            queueModel,
            kpiMetrics: mergedWorkspaceModel?.kpis ?? [],
            kpiMetricsPending: workUnitKpiMetricsPending,
            kpiStripVisible: !suppressWorkUnitKpiStrip,
            shellReady: workUnitShellReady,
            enrollmentActionsSettled: enrollmentActionsSettled,
            opportunityQueueRowResolved,
            enrollmentRightRailResolved,
            queueRowActionsReady,
            queueRecordIds: workUnitQueueRecordIds,
            firstPaintSettled: workUnitAboveFoldPageReady,
        });
    }, [
        workUnitAboveFoldPageReady,
        departmentId,
        workUnitId,
        workUnit,
        dept,
        selectedQueueKey,
        queueSummaries,
        queueSummariesError,
        queueItems,
        queueItemsLoading,
        workUnitLaneReveal.state,
        workUnitAboveFold,
        queueModel,
        mergedWorkspaceModel?.kpis,
        workUnitKpiMetricsPending,
        suppressWorkUnitKpiStrip,
        workUnitShellReady,
        enrollmentActionsSettled,
        opportunityQueueRowResolved,
        enrollmentRightRailResolved,
        queueRowActionsReady,
        workUnitQueueRecordIds,
    ]);

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
    }, [workUnitAboveFoldPageReady, departmentId, workUnitId, hydrateDeferredQueueSummaryCounts]);

    const visibleDrawerPrefetchSigRef = useRef("");
    useEffect(() => {
        if (!workUnitAboveFoldPageReady || !departmentId || !workUnitId) return;
        const raw = (queueItems?.items ?? []) as Array<{ id?: string; opportunity_id?: string }>;
        const ids: string[] = [];
        for (const row of raw) {
            const id = String(row.opportunity_id ?? row.id ?? "").trim();
            if (!id) continue;
            ids.push(id);
            if (ids.length >= 5) break;
        }
        if (ids.length === 0) return;
        const sig = `${workUnitId}|${departmentId}|${ids.join(",")}`;
        if (visibleDrawerPrefetchSigRef.current === sig) return;
        visibleDrawerPrefetchSigRef.current = sig;
        tracePlatformPrefetch("wu_visible_drawer_prefetch", {
            work_unit_id: workUnitId,
            record_count: ids.length,
        });
        prefetchVisibleWorkUnitDrawerPrimary(ids, {
            work_unit_id: workUnitId,
            department_id: departmentId,
        });
    }, [workUnitAboveFoldPageReady, departmentId, workUnitId, queueItems]);

    const visibleQueuePillKeys = useMemo(
        () => flattenWorkUnitVisibleQueuePillKeys(queuePillSections),
        [queuePillSections]
    );

    const queuePillPrefetchSigRef = useRef("");
    useEffect(() => {
        if (
            !workUnitAboveFoldPageReady ||
            !workUnitId ||
            !workUnit ||
            workUnit.queue_definition == null ||
            !visibleQueuePillKeys.length
        ) {
            return;
        }
        const targets = allVisibleWorkUnitLanePrefetchTargets({
            visiblePillKeys: visibleQueuePillKeys,
            selectedPillKey: selectedQueueKey,
            workUnit: {
                id: workUnit.id,
                queue_definition: workUnit.queue_definition,
                metadata: workUnit.metadata,
            },
        });
        if (!targets.length) return;
        const sig = `${workUnitId}|${viewScopeFingerprint}|${selectedQueueKey ?? ""}|${targets.map((t) => `${t.workUnitId}:${t.pillKey}`).join(",")}`;
        if (queuePillPrefetchSigRef.current === sig) return;
        queuePillPrefetchSigRef.current = sig;

        const cancel = scheduleAdminV2BackgroundWork(
            () => {
                markWorkUnitVmPillPrefetchStart({
                    department_id: departmentId,
                    work_unit_id: workUnitId,
                    lane_count: targets.length,
                });
                let cursor = 0;
                let readyCount = 0;
                const workers = Array.from(
                    { length: Math.min(WORK_UNIT_QUEUE_PILL_PREFETCH_CONCURRENCY, targets.length) },
                    async () => {
                        while (cursor < targets.length) {
                            const target = targets[cursor++]!;
                            const rowOverride =
                                target.workUnitId === workUnitId ?
                                    {
                                        queue_definition: workUnit.queue_definition,
                                        metadata: workUnit.metadata,
                                    }
                                :   lifecycleSiblingWorkUnitsRef.current?.find((s) => s.id === target.workUnitId);
                            const resolved = resolveWorkUnitFetchQueueKeyFromPill(
                                target.pillKey,
                                "",
                                rowOverride?.queue_definition != null ?
                                    { queue_definition: rowOverride.queue_definition }
                                :   undefined
                            );
                            await fetchQueueItemsRef.current(target.workUnitId, target.pillKey, null, {
                                prefetchOnly: true,
                                workUnitRowOverride: rowOverride ?? null,
                                ...(resolved.attentionBucketOverride !== undefined
                                    ? { attentionBucketOverride: resolved.attentionBucketOverride }
                                    : {}),
                            });
                            readyCount += 1;
                        }
                    }
                );
                void Promise.all(workers).then(() => {
                    markWorkUnitVmPillPrefetchReady({
                        department_id: departmentId,
                        work_unit_id: workUnitId,
                        lanes_ready: readyCount,
                    });
                });
            },
            { idleTimeoutMs: 400, fallbackMs: 120 }
        );
        return cancel;
    }, [
        workUnitAboveFoldPageReady,
        workUnitId,
        workUnit,
        departmentId,
        visibleQueuePillKeys,
        selectedQueueKey,
        viewScopeFingerprint,
        lifecycleSiblingWorkUnits,
    ]);

    useEffect(() => {
        if (!workUnitQueueRevealReady) return;
        markWorkUnitLaneQueueRowsReal({ departmentId, workUnitId });
        markRouteHydrationComplete("work_unit", { departmentId, workUnitId });
    }, [workUnitQueueRevealReady, departmentId, workUnitId]);

    useEffect(() => {
        if (!workUnitShellReady || !orgId) return;
        return scheduleWorkspaceRootRevalidation(
            { orgId, principalUserId, accessScopeFingerprint },
            "work_unit_shell_ready",
        );
    }, [workUnitShellReady, orgId, principalUserId, accessScopeFingerprint]);

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
            markWorkUnitVmKpiReady({
                department_id: departmentId,
                work_unit_id: workUnitId,
                placement_count: wuPlacementRows.length,
            });
        }
    }, [wuPlacementRows, workUnitKpiMetricsPending, departmentId, workUnitId]);

    useEffect(() => {
        if (workUnitAboveFold.queue_lane.state === "held") {
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
            onQueuePillIntent: handleQueuePillIntent,
        }),
        [handleQueueTabChange, handleAttentionBucketSelect, handleQueuePillIntent]
    );

    return (
        <WorkspaceChrome
            variant="bridge"
            breadcrumbs={[]}
            title={workUnitRoutePipeline.shell.title}
            subtitle={workUnitRoutePipeline.shell.subtitle ?? ""}
            data-route-shell-ready={workUnitAboveFoldPageReady ? "true" : "false"}
            data-work-unit-page-seeded={workUnitPageSeededFromCache ? "true" : "false"}
            data-work-unit-page-content-ready={workUnitPageContentReady ? "true" : "false"}
            {...(!workUnitAboveFoldPageReady
                ? { "data-wu-reveal-blocked": workUnitRevealGate.reason_if_blocked.join(",") }
                : {})}
        >
            {error && !workUnitShellReady ? (
                <p className="text-sm text-alloy-ember px-1 py-4">{error}</p>
            ) : !workUnitPageContentReady ? (
                <WorkUnitWorkspaceColdShell
                    workUnitTitle={slugRoute?.workUnitName ?? wuName}
                    departmentTitle={deptName}
                    departmentId={departmentId}
                    reserveActionsRail
                />
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
                            <a href="/admin/workflows" className="font-semibold text-alloy-blue hover:underline">
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
                        queueRowOpenPendingOpportunityId={queueRowOpenPendingOpportunityId}
                        queuePillPendingKey={queuePillPendingKey}
                        lifecyclePanel={workUnitLifecyclePanel}
                        recordFilterBar={workUnitRecordFilterBar}
                        otherPillSectionKey={otherPillSectionKey}
                        kpiStripPlaceholder={workUnitKpiStripPlaceholder}
                        kpiStripSkeletonCellCount={
                            wuPlacementRows && wuPlacementRows.length > 0 ? wuPlacementRows.length : undefined
                        }
                        commandRailTelemetrySlot={
                            workUnitQueueRevealReady ? (
                                <AutomationWorkflowsBlock
                                    presentation="work_unit_rail"
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
                                    onWorkflowDiagnostics={openWorkflowDiagnostics}
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
                    <WorkUnitScheduleTourRecordPickerModal
                        open={scheduleTourPickerOpen}
                        siteId={selectedSiteId}
                        opportunityEntityLabel={getEntityLabel(entityLabels, "opportunities", "singular")}
                        onDismiss={() => setScheduleTourPickerOpen(false)}
                        onSelectOpportunityId={openScheduleTourForOpportunity}
                    />
                    <CreateLeadModal
                        open={createLeadOpen}
                        departmentId={departmentId}
                        onClose={() => setCreateLeadOpen(false)}
                        onSubmit={async (payload) => {
                            const opportunityId = await executeCreateLeadFromModal({
                                payload,
                                departmentId,
                                workUnitId: workUnit?.id ?? null,
                                surface: "right_rail",
                            });
                            invalidate({ entity_type: "opportunity", entity_id: opportunityId, action_key: "create_lead" });
                            return { opportunity_id: opportunityId };
                        }}
                        onCreated={(opportunityId) => {
                            openDrawer(buildOpportunityDrawerOpenParams(opportunityId));
                        }}
                    />
                    <MarkLostModal
                        open={markLostOpen}
                        onClose={() => {
                            setMarkLostOpen(false);
                            setMarkLostTargetId(null);
                        }}
                        onSubmit={async (payload) => {
                            if (!markLostTargetId) return;
                            await executeMarkLostFromModal({
                                opportunityId: markLostTargetId,
                                lost_reason: payload.lost_reason,
                                note: payload.note,
                                departmentId,
                                workUnitId: workUnit?.id ?? null,
                                surface: "queue_row",
                            });
                            invalidate({
                                entity_type: "opportunity",
                                entity_id: markLostTargetId,
                                action_key: "mark_lost",
                            });
                        }}
                    />
                    <AddNoteModal
                        open={addNoteOpen}
                        onClose={() => {
                            setAddNoteOpen(false);
                            setAddNoteTargetId(null);
                        }}
                        onSubmit={async (payload) => {
                            if (!addNoteTargetId) return;
                            const res = await fetch("/api/admin/actions/execute", {
                                method: "POST",
                                credentials: "include",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                    action_key: "add_note",
                                    entity_type: "opportunity",
                                    entity_id: addNoteTargetId,
                                    context: {
                                        surface: "queue_row",
                                        work_unit_id: workUnit?.id ?? null,
                                        department_id: departmentId,
                                    },
                                    payload: { note: payload.note },
                                }),
                            });
                            const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
                            if (!res.ok || !json.ok) throw new Error(json.error ?? "Add note failed");
                            invalidate({
                                entity_type: "opportunity",
                                entity_id: addNoteTargetId,
                                action_key: "add_note",
                            });
                        }}
                    />
                </>
            )}
        </WorkspaceChrome>
    );
}

