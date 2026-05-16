"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { WorkspaceChrome } from "@/components/admin/workspace/WorkspaceChrome";
import WorkUnitWorkspace from "@/app/adminV2/components/workspace/shells/WorkUnitWorkspace";
import { AutomationWorkflowsBlock } from "@/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock";
import {
    filterWorkflowsForWorkspaceAutomationSurface,
    WORKSPACE_AUTOMATION_METADATA_GAP_NOTE,
} from "@/lib/workspace/workspaceAutomationWorkflowFilter";
import { useWorkspaceOrg } from "@/contexts/WorkspaceOrgContext";
import { useWorkspaceSiteFilter } from "@/contexts/WorkspaceSiteFilterContext";
import {
    appendWorkspaceSiteToUrl,
    workspaceViewCacheFingerprint,
} from "@/lib/adminV2/workspaceSiteFilterClient";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { useAdminViewerTimezone } from "@/contexts/AdminViewerTimezoneContext";
import { AdminV2RouteLoadingState } from "@/components/admin/workspace/AdminV2RouteLoadingState";
import type { ResolvedActionForClient, ResolvedActionsBySlot } from "@/lib/admin/actions/types";
import { applyRegistryResolvedActionClient } from "@/lib/admin/actions/applyRegistryResolvedActionClient";
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
import { buildRealOpportunityWorkUnitWorkspaceModel } from "@/lib/ui-v2/adapters/realWorkUnitFromOpportunities";
import { buildWorkUnitQueueCrmCompactRowSlice } from "@/lib/ui-v2/crmQueueRowPreviewPresentation";
import { mergeEnrollmentRightRailActions } from "@/lib/workspace/viewModels/enrollmentRightRailMerge";
import { fetchWorkspaceRightRailResolvedActions } from "@/lib/workspace/fetchWorkspaceRightRailResolvedActions";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import { resolveKpisForWorkUnit } from "@/lib/kpi/resolver";
import { buildDefaultWorkUnitKpis } from "@/lib/kpi/baseline";
import { workUnitContextFromParts } from "@/lib/kpi/surfaceContext";
import type { WorkspaceKpiPlacementRow } from "@/lib/kpi/types";
import { workspaceRouteParam } from "@/lib/workspace/workspaceRouteParam";
import { validateQueueDefinition, type QueueDefinitionV1 } from "@/lib/config/queueDefinitionSchema";
import {
    getQueueUiConfig,
    partitionQueueUiSections,
    type QueueUiConfig,
    type QueueUiRowPreviewAction,
    type QueueUiRowPreviewField,
} from "@/lib/ui-v2/queueUiConfig";
import { dedupeAdminFetchWithTtl } from "@/lib/workspace/workspaceAdminFetchDedupe";
import { alloyPerfSet } from "@/lib/perf/alloyPerfGlobal";
import { UpdateStatusAddNoteModal } from "@/components/admin/opportunity/actions/UpdateStatusAddNoteModal";
import { ContactAttemptedModal } from "@/components/admin/opportunity/actions/ContactAttemptedModal";
import { formatActivityRelativeShort } from "@/lib/admin/activitySignals";
import { formatPhoneUS } from "@/lib/adminFormatters";
import { formatOpportunityQueueNotesPreview, formatOpportunityQueueNotesPreviewParts } from "@/lib/admin/opportunityActivityTimelineFormat";
import { normalizePhone } from "@/lib/contactNormalize";
import { WorkUnitLifecycleCoveragePanel } from "@/components/admin/workspace/WorkUnitLifecycleCoveragePanel";
import {
    computeUnmappedOverflowCount,
    computeWorkUnitLifecycleCoverage,
    findAllRecordsQueueKey,
    isRowUnmappedForThroughput,
    queueHasStatusFilters,
    reorderSectionsWithAllRecordsFirst,
    shouldSuppressWorkUnitKpiStrip,
    statusKeysCoveredByThroughputQueues,
} from "@/lib/workspace/workUnitQueueDerived";
import { isEnrollmentLikeDepartmentKey } from "@/lib/workspace/enrollmentDepartmentKey";
import {
    deleteQueueRowCacheKeysForWorkUnit,
    logQueueRowClientCache,
    peekFreshQueueRowCache,
    putQueueRowCache,
    queueRowLogicalCacheKey,
    shouldStaleBackgroundRefresh,
    type QueueRowClientCacheBucket,
} from "@/lib/workspace/queueRowClientCache";
import {
    resolveNeedsAttentionBucketsWithPrecedence,
    type NeedsAttentionBucketConfig,
} from "@/lib/opportunities/needsAttentionBuckets";
import type { WorkUnitPlacementQueueDiagnostics } from "@/lib/orchestration/placement/applyPlacementToOpportunityQueueRows";
import {
    formatPlacementWaitlistSectionLabel,
    parseQueueRowPlacementPriorityVm,
} from "@/lib/ui-v2/queuePlacementPriorityPresentation";

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

function queueParamFromWindow(): string {
    if (typeof window === "undefined") return "";
    try {
        return new URL(window.location.href).searchParams.get("queue")?.trim() ?? "";
    } catch {
        return "";
    }
}

function readWorkUnitUrlSearchSnapshot(): URLSearchParams {
    if (typeof window === "undefined") return new URLSearchParams();
    try {
        return new URLSearchParams(window.location.search);
    } catch {
        return new URLSearchParams();
    }
}

/** Shallow lane query sync — preserves Next `history.state`; avoids App Router navigations that remount this page. */
function replaceWorkUnitBrowserSearch(next: URLSearchParams, onCommitted?: () => void): void {
    if (typeof window === "undefined") return;
    const path = window.location.pathname;
    const qs = next.toString();
    const url = qs ? `${path}?${qs}` : path;
    window.history.replaceState(window.history.state, "", url);
    onCommitted?.();
}

/** Lane selection from definition + URL only — before exact summaries (Phase 3.1). */
function resolveProvisionalQueueKey(wu: WorkUnitRow, qFromUrl: string): string | null {
    if (!wu.queue_definition) {
        const q = qFromUrl.trim();
        return q || null;
    }
    try {
        const def = validateQueueDefinition(wu.queue_definition);
        const ui = getQueueUiConfig(def);
        const keys = new Set(def.queues.map((q) => q.key));
        const qTrim = qFromUrl.trim();
        if (qTrim && keys.has(qTrim)) return qTrim;
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
        const def = validateQueueDefinition(wu.queue_definition);
        const ui = getQueueUiConfig(def);
        const keys = new Set(def.queues.map((q) => q.key));
        if (qTrim && keys.has(qTrim)) return qTrim;
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

/** Derives selected lane from summaries + work-unit definition + URL (same rules as post-summaries bootstrap). */
function deriveSelectedQueueKeyFromSummaries(wu: WorkUnitRow, qs: QueueSummary[], qFromUrl: string): string | null {
    if (!qs.length) return null;
    const qTrim = qFromUrl.trim();
    let allKeyFromDef: string | null = null;
    try {
        const defBoot = validateQueueDefinition(wu.queue_definition);
        const uiBoot = getQueueUiConfig(defBoot);
        allKeyFromDef = findAllRecordsQueueKey(defBoot, uiBoot);
    } catch {
        allKeyFromDef = null;
    }
    const uiOrder = (() => {
        try {
            const def = validateQueueDefinition(wu.queue_definition);
            const ui = getQueueUiConfig(def);
            return ui.sections.flatMap((s) => s.queue_keys);
        } catch {
            return qs.map((x) => x.key);
        }
    })();
    const firstByUi = uiOrder.find((k) => qs.some((x) => x.key === k)) ?? qs[0]?.key ?? null;
    if (qTrim && qs.some((x) => x.key === qTrim)) return qTrim;
    if (allKeyFromDef && qs.some((x) => x.key === allKeyFromDef)) return allKeyFromDef;
    return firstByUi;
}

function registryQuickActionsFromResolved(rowInline: { key: string; label: string; action_type: string }[]): QueueItemQuickActionVm[] {
    return rowInline.map((a) => ({
        id: a.key,
        label: a.label,
        payload: { source: "action_registry" as const, actionType: a.action_type },
    }));
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
    const searchParams = useSearchParams();
    const router = useRouter();
    const { accessScopeFingerprint } = useWorkspaceOrg();
    const siteFilter = useWorkspaceSiteFilter();
    const selectedSiteId = siteFilter?.selectedSiteId ?? null;
    const viewScopeFingerprint = workspaceViewCacheFingerprint(accessScopeFingerprint, selectedSiteId);
    const { openDrawer } = useAdminDrawer();
    const viewerTz = useAdminViewerTimezone();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [workUnit, setWorkUnit] = useState<WorkUnitRow | null>(null);
    const [dept, setDept] = useState<DeptRow | null>(null);
    const [oq, setOq] = useState<WorkspaceOpportunityQueueRuntime | null>(null);
    const [needsAttentionWorkUnitId, setNeedsAttentionWorkUnitId] = useState<string | null>(null);
    const [opportunityQueueRowActions, setOpportunityQueueRowActions] = useState<QueueItemQuickActionVm[] | null>(null);
    const [opportunityQueueRowResolved, setOpportunityQueueRowResolved] = useState<ResolvedActionForClient[] | null>(null);
    const [enrollmentRightRailResolved, setEnrollmentRightRailResolved] = useState<ResolvedActionForClient[] | null>(null);
    const [actionFeedback, setActionFeedback] = useState<string | null>(null);

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
    const firstUsefulPaintMarkedRef = useRef(false);
    /** Bumped on shallow `history.replaceState` / `popstate` so lane query mirrors `window.location` without Next navigation. */
    const [wuLaneSearchRev, setWuLaneSearchRev] = useState(0);
    /** Queue-tab interaction: emit `queue_tab_rows_ready` once when row fetch finishes. */
    const pendingQueueTabPerfRef = useRef(false);
    /** Last settled preview rows — keeps list visible while `queueItems` is briefly null during lane changes. */
    const queueRowsBufferRef = useRef<QueuePreviewItemVm[]>([]);
    const queueRowClientCacheRef = useRef(new Map<string, QueueRowClientCacheBucket<QueueItemsResult>>());
    const selectedQueueKeyRef = useRef<string | null>(null);
    const unmappedOnlyRef = useRef(false);
    /** Cancel token for idle prefetch of neighboring queue lanes. */
    const queueAdjacentPrefetchTokenRef = useRef(0);
    /** True after first foreground (non-prefetch) rows attempt settles for selection — gates idle prefetch. */
    const primaryLaneRowsSettledOnceRef = useRef(false);

    const [workflowKpis, setWorkflowKpis] = useState<WorkflowKpis>(DEFAULT_WF_KPIS);
    const [workflowKpisLoading, setWorkflowKpisLoading] = useState(true);
    const [workflowsSummary, setWorkflowsSummary] = useState<WorkflowSummaryRow[] | null>(null);

    const [statusOptions, setStatusOptions] = useState<Array<{ value: string; label: string }>>([]);
    const [updateStatusFormOpen, setUpdateStatusFormOpen] = useState(false);
    const [updateStatusTargetId, setUpdateStatusTargetId] = useState<string | null>(null);
    const [contactAttemptedOpen, setContactAttemptedOpen] = useState(false);
    const [contactAttemptedTargetId, setContactAttemptedTargetId] = useState<string | null>(null);

    const queueDef = useMemo<QueueDefinitionV1 | null>(() => {
        if (!workUnit?.queue_definition) return null;
        try {
            return validateQueueDefinition(workUnit.queue_definition);
        } catch {
            return null;
        }
    }, [workUnit?.queue_definition]);

    const queueUi = useMemo<QueueUiConfig | null>(() => {
        if (!queueDef) return null;
        return getQueueUiConfig(queueDef);
    }, [queueDef]);

    const sectionedQueueSummaries = useMemo(() => {
        if (!queueSummaries) return null;
        if (!queueUi) {
            // fallback to existing flat list; but still deterministic
            return [{ key: "all", label: "Queues", tone: "standard" as const, queues: queueSummaries }];
        }
        const byKey = new Map(queueSummaries.map((q) => [q.key, q]));
        const used = new Set<string>();
        const sections = queueUi.sections
            .map((s) => {
                const qs = s.queue_keys
                    .map((k) => byKey.get(k) ?? null)
                    .filter((x): x is QueueSummary => Boolean(x));
                for (const q of qs) used.add(q.key);
                return { key: s.key, label: s.label, tone: s.tone ?? "standard", queues: qs };
            })
            .filter((s) => s.queues.length > 0);
        if (sections.length > 0) return sections;
        // If config sections don't match summaries, fall back to all queues.
        return [{ key: "all", label: "Queues", tone: "standard" as const, queues: queueSummaries }];
    }, [queueSummaries, queueUi]);

    const allRecordsQueueKey = useMemo(() => {
        if (!queueDef) return null;
        return findAllRecordsQueueKey(queueDef, queueUi);
    }, [queueDef, queueUi]);

    const sectionedQueueSummariesOrdered = useMemo(() => {
        if (!sectionedQueueSummaries) return null;
        return reorderSectionsWithAllRecordsFirst(sectionedQueueSummaries, allRecordsQueueKey);
    }, [sectionedQueueSummaries, allRecordsQueueKey]);

    const enabledAttentionBuckets = useMemo(() => {
        if (!workUnit || !dept) return [];
        return resolveNeedsAttentionBucketsWithPrecedence(workUnit.metadata ?? null, dept.metadata ?? null).filter(
            (b) => b.enabled
        );
    }, [workUnit, dept]);

    const queuePillSections = useMemo(() => {
        if (!sectionedQueueSummariesOrdered?.length || !queueSummaries?.length) return null;
        const naSummary = queueSummaries.find((x) => x.key.trim().toLowerCase() === "needs_attention");
        return sectionedQueueSummariesOrdered.map((sec) => ({
            ...sec,
            queues: expandNeedsAttentionQueueSummariesForPills(sec.queues, naSummary, enabledAttentionBuckets),
        }));
    }, [sectionedQueueSummariesOrdered, queueSummaries, enabledAttentionBuckets]);

    /** Tab shells from definition only (no counts) while exact summaries are in flight. */
    const queueTabPlaceholders = useMemo(() => {
        if (!queueUi || !queueDef) return null;
        const keySet = new Set(queueDef.queues.map((q) => q.key));
        const sections = queueUi.sections
            .map((s) => ({
                key: s.key,
                label: s.label,
                tone: s.tone ?? ("standard" as const),
                queues: s.queue_keys
                    .filter((k) => keySet.has(k))
                    .map((k) => {
                        const qc = queueDef.queues.find((q) => q.key === k);
                        if (!qc) return null;
                        return {
                            key: qc.key,
                            label: qc.label,
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
        return reorderSectionsWithAllRecordsFirst(sections, allRecordsQueueKey);
    }, [queueUi, queueDef, allRecordsQueueKey]);

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

    const otherPillSectionKey = useMemo(() => {
        if (!queueUi) return null;
        const { throughput } = partitionQueueUiSections(queueUi);
        if (!throughput.length) return null;
        return throughput[throughput.length - 1]!.key;
    }, [queueUi]);

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

    const unmappedOnly = useMemo(() => {
        const sp =
            typeof window !== "undefined"
                ? readWorkUnitUrlSearchSnapshot()
                : new URLSearchParams(searchParams?.toString() ?? "");
        return sp.get("unmapped")?.trim() === "1";
    }, [wuLaneSearchRev, searchParams, departmentId, workUnitId]);

    const attentionBucketKeyLive = useMemo(() => {
        const sp =
            typeof window !== "undefined"
                ? readWorkUnitUrlSearchSnapshot()
                : new URLSearchParams(searchParams?.toString() ?? "");
        return (sp.get("attention_bucket") ?? "").trim();
    }, [wuLaneSearchRev, searchParams]);

    selectedQueueKeyRef.current = selectedQueueKey;
    unmappedOnlyRef.current = unmappedOnly;
    const attentionBucketKeyRef = useRef("");
    attentionBucketKeyRef.current = attentionBucketKeyLive;

    const commitLaneQueryUrl = useCallback(
        (opts: { queueKey: string; unmappedActive: boolean; attentionBucket?: string }) => {
            if (typeof window === "undefined") return;
            const sp = readWorkUnitUrlSearchSnapshot();
            sp.set("queue", opts.queueKey);
            if (opts.unmappedActive) sp.set("unmapped", "1");
            else sp.delete("unmapped");
            const na = opts.queueKey.trim().toLowerCase() === "needs_attention";
            if (!na) {
                sp.delete("attention_bucket");
            } else if (opts.attentionBucket !== undefined) {
                const v = opts.attentionBucket.trim();
                if (v) sp.set("attention_bucket", v);
                else sp.delete("attention_bucket");
            }
            replaceWorkUnitBrowserSearch(sp, () => setWuLaneSearchRev((x) => x + 1));
        },
        []
    );

    const handleQueueTabChange = useCallback((nextKey: string, opts?: { unmappedActive?: boolean }) => {
        const unmappedActive = opts?.unmappedActive ?? false;
        if (typeof window !== "undefined" && typeof performance !== "undefined") {
            pendingQueueTabPerfRef.current = true;
            alloyPerfSet("queue_tab_change_start", performance.now());
        }
        setSelectedQueueKey(nextKey);
        const na = nextKey.trim().toLowerCase() === "needs_attention";
        commitLaneQueryUrl({
            queueKey: nextKey,
            unmappedActive,
            ...(na ? { attentionBucket: "" } : {}),
        });
    }, [commitLaneQueryUrl]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const bump = () => setWuLaneSearchRev((x) => x + 1);
        window.addEventListener("popstate", bump);
        return () => window.removeEventListener("popstate", bump);
    }, []);

    useEffect(() => {
        if (!actionFeedback) return;
        const t = setTimeout(() => setActionFeedback(null), 10000);
        return () => clearTimeout(t);
    }, [actionFeedback]);

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

    useEffect(() => {
        queueRowsBufferRef.current = [];
        queueRowClientCacheRef.current.clear();
        primaryLaneRowsSettledOnceRef.current = false;
    }, [departmentId, workUnitId]);

    /** Browser back/forward: sync selected queue + `unmapped` from the real location (shallow tabs do not update Next `searchParams`). */
    useEffect(() => {
        if (!queueSummaries?.length) return;
        const sp =
            typeof window !== "undefined"
                ? readWorkUnitUrlSearchSnapshot()
                : new URLSearchParams(searchParams?.toString() ?? "");
        const qFromUrl = (sp.get("queue") ?? "").trim();
        if (!qFromUrl || !queueSummaries.some((x) => x.key === qFromUrl)) return;
        setSelectedQueueKey((prev) => (prev !== qFromUrl ? qFromUrl : prev));
    }, [queueSummaries, wuLaneSearchRev, searchParams]);

    const loadWorkUnitDeferredSupplement = useCallback(async () => {
        if (!workUnitId || !departmentId) return;
        const init = workspaceDataFetchInit();
        let parsedQueueRowQuick: QueueItemQuickActionVm[] | null = null;
        let parsedRightRail: ResolvedActionForClient[] = [];

        const actionsListRoute =
            `/api/admin/actions?` +
            new URLSearchParams({
                surface: "queue_row",
                entity_type: "opportunity",
                work_unit_id: workUnitId,
                department_id: departmentId,
            }).toString();
        const [actionsSettled, rightRailSettled] = await Promise.allSettled([
            dedupeAdminFetchWithTtl(actionsListRoute, init, 1500),
            fetchWorkspaceRightRailResolvedActions({
                departmentId,
                workUnitId,
                fetchInit: init,
            }),
        ]);

        if (actionsSettled.status === "fulfilled") {
            try {
                const ar = actionsSettled.value;
                const aj = (await ar.json().catch(() => ({}))) as { actions?: ResolvedActionsBySlot };
                if (ar.ok) {
                    const rowInline = aj.actions?.row_inline ?? [];
                    const overflow = aj.actions?.overflow ?? [];
                    const combined = [...rowInline, ...overflow];
                    setOpportunityQueueRowResolved(combined);
                    if (combined.length) parsedQueueRowQuick = registryQuickActionsFromResolved(combined);
                }
            } catch {
                /* non-fatal */
            }
        }

        if (rightRailSettled.status === "fulfilled" && Array.isArray(rightRailSettled.value)) {
            parsedRightRail = rightRailSettled.value;
        }

        setOpportunityQueueRowActions(parsedQueueRowQuick);
        setEnrollmentRightRailResolved(parsedRightRail);

        setWorkflowKpisLoading(true);
        try {
            const [kRes, sRes] = await Promise.all([
                fetch("/api/admin/workflow-runs?list=kpis", init),
                fetch("/api/admin/workflows/summary?variant=workspace", init),
            ]);
            const kBody = (await kRes.json().catch(() => ({}))) as { kpis?: Partial<WorkflowKpis> };
            const sJson = (await sRes.json().catch(() => ({}))) as { workflows?: WorkflowSummaryRow[] };
            if (kRes.ok && kBody.kpis) setWorkflowKpis({ ...DEFAULT_WF_KPIS, ...kBody.kpis });
            if (sRes.ok) {
                const all = Array.isArray(sJson.workflows) ? sJson.workflows : [];
                setWorkflowsSummary(
                    filterWorkflowsForWorkspaceAutomationSurface(all) as WorkflowSummaryRow[]
                );
            }
        } catch {
            // non-fatal
        } finally {
            setWorkflowKpisLoading(false);
        }

        try {
            const res = await fetch(`/api/admin/work-units?department_id=${encodeURIComponent(departmentId)}`, init);
            const j = (await res.json().catch(() => ({}))) as { items?: Array<{ id: string; key?: string | null }> };
            if (res.ok) {
                const naWu = (j.items ?? []).find((r) => String(r.key ?? "").trim().toLowerCase() === "needs_attention");
                setNeedsAttentionWorkUnitId(naWu?.id ?? null);
            }
        } catch {
            /* non-fatal */
        }

        const wuK = bootstrapWuRef.current;
        if (!wuK) return;
        let suppress = false;
        try {
            const def = wuK.queue_definition ? validateQueueDefinition(wuK.queue_definition) : null;
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
            const kpiBase = `/api/admin/workspace-kpi-placements?surface=work_unit&department_id=${encodeURIComponent(
                departmentId
            )}&work_unit_id=${encodeURIComponent(workUnitId)}`;
            const res = await fetch(appendWorkspaceSiteToUrl(kpiBase, selectedSiteId), { ...(init ?? {}), cache: "no-store" });
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
    }, [departmentId, workUnitId, selectedSiteId]);

    const requestWorkUnitDeferredSupplement = useCallback(() => {
        if (workUnitDeferredScheduledRef.current) return;
        if (!workUnitDetailReadyRef.current) {
            pendingDeferredAfterWudRef.current = true;
            return;
        }
        workUnitDeferredScheduledRef.current = true;
        pendingDeferredAfterWudRef.current = false;
        const run = () => {
            void loadWorkUnitDeferredSupplement();
        };
        if (typeof window !== "undefined" && typeof requestIdleCallback !== "undefined") {
            requestIdleCallback(run, { timeout: 2000 });
        } else {
            setTimeout(run, 0);
        }
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
            const logicalUm = options?.logicalUnmapped ?? unmappedOnly;
            const abSnap =
                queueKey.trim().toLowerCase() === "needs_attention"
                    ? (options?.attentionBucketOverride !== undefined
                          ? String(options.attentionBucketOverride ?? "").trim()
                          : attentionBucketKeyRef.current.trim())
                    : "";
            const fetchSig = `${workUnitId}|${queueKey}|omit|${abSnap}`;
            const logicalKey = queueRowLogicalCacheKey(viewScopeFingerprint, workUnitId, queueKey, logicalUm, abSnap);
            const qs = new URLSearchParams({
                limit: "20",
                offset: "0",
                count_mode: "exact",
                omit_total_count: "true",
            });
            if (abSnap) qs.set("attention_bucket", abSnap);
            const route = appendWorkspaceSiteToUrl(
                `/api/admin/queues/${encodeURIComponent(workUnitId)}/${encodeURIComponent(queueKey)}?${qs.toString()}`,
                selectedSiteId
            );
            const cache = queueRowClientCacheRef.current;

            if (options?.force) {
                cache.delete(queueRowLogicalCacheKey(viewScopeFingerprint, workUnitId, queueKey, false, abSnap));
                cache.delete(queueRowLogicalCacheKey(viewScopeFingerprint, workUnitId, queueKey, true, abSnap));
            }

            if (!options?.force && !options?.prefetchOnly && !options?.quietStaleRefresh) {
                const ent = peekFreshQueueRowCache(cache, logicalKey);
                if (ent) {
                    queueItemsLastFetchSigRef.current = fetchSig;
                    setQueueItemsError(null);
                    setQueueItemsRoute(route);
                    setQueueItems(ent.payload);
                    setQueueItemsLoading(false);
                    logQueueRowClientCache({
                        event: "hit",
                        work_unit_id: workUnitId,
                        queue_key: queueKey,
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
                            queue_key: queueKey,
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
                    queue_key: queueKey,
                    age_ms: null,
                });
            }

            const lease = queueRowLeaseSigsRef.current;

            const runNetwork = async (seq: number, touchUiPerf: boolean) => {
                const init = workspaceDataFetchInit();
                if (touchUiPerf && typeof window !== "undefined" && typeof performance !== "undefined") {
                    alloyPerfSet("queue_rows_request_start", performance.now());
                    alloyPerfSet("rows_req", performance.now());
                }
                const res = await fetch(route, init);
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
                const stillSelected =
                    selectedQueueKeyRef.current === queueKey &&
                    unmappedOnlyRef.current === logicalUm &&
                    attentionBucketMatches;
                if (options?.prefetchOnly) {
                    putQueueRowCache(cache, viewScopeFingerprint, workUnitId, queueKey, payload, abSnap);
                    return;
                }
                if (options?.quietStaleRefresh) {
                    if (seq === queueItemsRequestSeq.current && stillSelected) {
                        putQueueRowCache(cache, viewScopeFingerprint, workUnitId, queueKey, payload, abSnap);
                        setQueueItems(payload);
                    }
                    return;
                }
                if (seq === queueItemsRequestSeq.current) {
                    putQueueRowCache(cache, viewScopeFingerprint, workUnitId, queueKey, payload, abSnap);
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
                    queue_key: queueKey,
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
                if (pk != null && pk !== queueKey) return prev;
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
        [requestWorkUnitDeferredSupplement, markFirstUsefulPaintOnce, unmappedOnly, viewScopeFingerprint, selectedSiteId]
    );

    const handleAttentionBucketSelect = useCallback(
        (bucketKey: string | null) => {
            if (!workUnitId) return;
            const next = (bucketKey ?? "").trim();
            setSelectedQueueKey("needs_attention");
            commitLaneQueryUrl({
                queueKey: "needs_attention",
                unmappedActive: false,
                attentionBucket: bucketKey ?? "",
            });
            void fetchQueueItems(workUnitId, "needs_attention", null, {
                force: true,
                attentionBucketOverride: next,
            });
        },
        [commitLaneQueryUrl, fetchQueueItems, workUnitId]
    );

    const fetchQueueSummaries = useCallback(async (wuId: string) => {
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
        setQueueSummariesError(null);
        setQueueSummariesRoute(route);
        try {
            const init = workspaceDataFetchInit();
            if (typeof window !== "undefined" && typeof performance !== "undefined") {
                alloyPerfSet("work_unit_summaries_request_start", performance.now());
            }
            const res = await fetch(route, init);
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
    }, [selectedSiteId]);

    useEffect(() => {
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
            setOpportunityQueueRowActions(null);
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
            firstUsefulPaintMarkedRef.current = false;
            return;
        }

        let cancelled = false;
        void (async () => {
            const routeStart = typeof performance !== "undefined" ? performance.now() : 0;
            if (typeof performance !== "undefined" && typeof window !== "undefined") {
                alloyPerfSet("route_nav_start", routeStart);
                alloyPerfSet("work_unit_start", routeStart);
            }
            setLoading(true);
            setError(null);
            const init = workspaceDataFetchInit();
            workUnitDeferredScheduledRef.current = false;
            workUnitDetailReadyRef.current = false;
            pendingDeferredAfterWudRef.current = false;
            bootstrapWuRef.current = null;
            firstUsefulPaintMarkedRef.current = false;

            const qFromUrlEffective = (
                queueParamFromWindow() ||
                (typeof searchParams !== "undefined" ? (searchParams?.get("queue") ?? "") : "")
            ).trim();

            try {
                if (!cancelled) {
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
                    setOpportunityQueueRowActions(null);
                    setOpportunityQueueRowResolved(null);
                    setEnrollmentRightRailResolved(null);
                    queueItemsLastFetchSigRef.current = null;
                    queueRowLeaseSigsRef.current.clear();
                    queueRowClientCacheRef.current.clear();
                    setWuPlacementRows(undefined);
                    setWuScopeHasPlacements(false);
                    if (qFromUrlEffective) setSelectedQueueKey(qFromUrlEffective);
                }

                const wuUrl = `/api/admin/work-units/${encodeURIComponent(workUnitId)}`;
                const deptUrl = `/api/admin/departments/${encodeURIComponent(departmentId)}`;
                const queueListRoute = buildWorkUnitQueuesListRoute(workUnitId, selectedSiteId);

                if (!cancelled) setQueueSummariesRoute(queueListRoute);

                if (typeof window !== "undefined" && typeof performance !== "undefined") {
                    alloyPerfSet("summaries_req", performance.now());
                    alloyPerfSet("work_unit_summaries_request_start", performance.now());
                }

                const summariesP = fetch(queueListRoute, init).then(async (res) => {
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
                const wuP = fetch(wuUrl, init).then(async (res) => {
                    if (typeof window !== "undefined" && typeof performance !== "undefined") {
                        alloyPerfSet("work_unit_detail_resp", performance.now());
                    }
                    const j = (await res.json().catch(() => ({}))) as { error?: string } & Partial<WorkUnitRow>;
                    return { res, j };
                });

                if (typeof window !== "undefined" && typeof performance !== "undefined") {
                    alloyPerfSet("dept_req", performance.now());
                }
                const deptP = fetch(deptUrl, init).then(async (res) => {
                    if (typeof window !== "undefined" && typeof performance !== "undefined") {
                        alloyPerfSet("dept_resp", performance.now());
                    }
                    const j = (await res.json().catch(() => ({}))) as { error?: string } & Partial<DeptRow>;
                    return { res, j };
                });

                let rowKickInvoked = false;
                let rowKeyUsedForBootstrap: string | null = null;
                if (qFromUrlEffective) {
                    rowKickInvoked = true;
                    rowKeyUsedForBootstrap = qFromUrlEffective;
                    void fetchQueueItems(workUnitId, qFromUrlEffective, null);
                }

                const wuR = await wuP;

                if (!wuR.res.ok) throw new Error(wuR.j.error ?? "Failed to load work unit");

                const wu = wuR.j as WorkUnitRow;
                if (wu.department_id !== departmentId) {
                    throw new Error("Work unit does not belong to this department");
                }

                const navRowKey = resolveNavTimeRowQueueKey(wu, qFromUrlEffective);
                if (navRowKey) {
                    if (!rowKickInvoked) {
                        void fetchQueueItems(workUnitId, navRowKey, null);
                        rowKickInvoked = true;
                        rowKeyUsedForBootstrap = navRowKey;
                    } else if (rowKeyUsedForBootstrap !== navRowKey) {
                        void fetchQueueItems(workUnitId, navRowKey, null, { force: true });
                        rowKeyUsedForBootstrap = navRowKey;
                    }
                }

                const deptR = await deptP;

                if (!deptR.res.ok) throw new Error(deptR.j.error ?? "Failed to load department");

                if (!cancelled) {
                    setWorkUnit(wu);
                    setDept(deptR.j as DeptRow);
                }

                workUnitDetailReadyRef.current = true;
                bootstrapWuRef.current = wu;
                if (pendingDeferredAfterWudRef.current) {
                    pendingDeferredAfterWudRef.current = false;
                    requestWorkUnitDeferredSupplement();
                }

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
                        setQueueSummaries(null);
                        setQueueSummariesError("Queue request failed");
                        setQueueSummariesRoute(queueListRoute);
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
                            setQueueSummaries(qs);
                            setQueueSummariesError(null);
                            setQueueSummariesRoute(route);
                            if (typeof window !== "undefined") {
                                console.warn("[pipeline-count-unify]", {
                                    source: "work-unit",
                                    work_unit_id: workUnitId,
                                    queue_key: j.work_unit_scope_queue_key ?? null,
                                    count: typeof j.work_unit_scope_total === "number" ? j.work_unit_scope_total : null,
                                });
                            }
                            const initial = deriveSelectedQueueKeyFromSummaries(wu, qs, qFromUrlEffective);
                            if (initial) {
                                setSelectedQueueKey(initial);
                                if (rowKeyUsedForBootstrap === null) {
                                    void fetchQueueItems(workUnitId, initial, null);
                                    rowKickInvoked = true;
                                    rowKeyUsedForBootstrap = initial;
                                } else if (rowKeyUsedForBootstrap !== initial) {
                                    void fetchQueueItems(workUnitId, initial, null, { force: true });
                                    rowKeyUsedForBootstrap = initial;
                                }
                            }
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
                            setQueueSummaries(null);
                            setQueueSummariesError("Queue type not supported yet");
                            setQueueSummariesRoute(route);
                        }
                    } else if (queuesRes.status !== 0) {
                        shouldFallbackToLegacy = false;
                        if (!cancelled) {
                            setQueueSummaries(null);
                            setQueueSummariesError(j.error ?? "Failed to load queues");
                            setQueueSummariesRoute(route);
                        }
                    }
                } catch (e) {
                    shouldFallbackToLegacy = true;
                    if (!cancelled) {
                        setQueueSummaries(null);
                        setQueueSummariesError(e instanceof Error ? e.message : "Failed to load queues");
                        setQueueSummariesRoute(route);
                    }
                }

                if (!rowKickInvoked && !cancelled) {
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
                    setOpportunityQueueRowActions(null);
                    setOpportunityQueueRowResolved(null);
                    setEnrollmentRightRailResolved(null);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [departmentId, workUnitId, selectedSiteId, fetchQueueItems, requestWorkUnitDeferredSupplement, markFirstUsefulPaintOnce]);

    const invalidate = useCallback(
        (opts?: { entity_type?: string; entity_id?: string; action_key?: string }) => {
            void opts;
            if (!workUnitId || !selectedQueueKey) return;
            deleteQueueRowCacheKeysForWorkUnit(queueRowClientCacheRef.current, viewScopeFingerprint, workUnitId);
            void Promise.all([
                fetchQueueItems(workUnitId, selectedQueueKey, queueSummaries, { force: true }),
                fetchQueueSummaries(workUnitId),
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
                fetchQueueSummaries(workUnitId),
            ]);
        };
        /** Drawer saves dispatch `adminv2:opportunity-updated` — bust row cache + refetch summaries for this lane (not drawer-only). */
        window.addEventListener("adminv2:opportunity-updated", onUpdated as EventListener);
        return () => window.removeEventListener("adminv2:opportunity-updated", onUpdated as EventListener);
    }, [fetchQueueItems, fetchQueueSummaries, selectedQueueKey, viewScopeFingerprint, workUnitId]);

    /** Row fetch starts once the work-unit shell and selection exist; does not wait on summaries (counts come from summaries; rows always `omit_total_count`). */
    useEffect(() => {
        if (!workUnitId || !selectedQueueKey || loading || !workUnit) return;
        void fetchQueueItems(workUnitId, selectedQueueKey, null);
    }, [fetchQueueItems, selectedQueueKey, workUnitId, workUnit, loading, unmappedOnly, selectedSiteId]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        if (!workUnitId || !queueSummaries?.length || !selectedQueueKey || loading || !workUnit) return;
        if (!primaryLaneRowsSettledOnceRef.current) return;
        if (queueItemsLoading || !queueItems || queueItemsError) return;
        const token = ++queueAdjacentPrefetchTokenRef.current;
        const run = () => {
            if (queueAdjacentPrefetchTokenRef.current !== token) return;
            const keys = queueSummaries.map((q) => q.key);
            const ix = keys.indexOf(selectedQueueKey);
            const want = new Set<string>();
            if (ix >= 0) {
                if (ix > 0) want.add(keys[ix - 1]!);
                if (ix + 1 < keys.length) want.add(keys[ix + 1]!);
            }
            for (const hk of ["new_inquiry", "contact_attempted", "tour_scheduled"]) {
                if (keys.includes(hk) && hk !== selectedQueueKey) want.add(hk);
            }
            let n = 0;
            for (const k of want) {
                if (n >= 2) break;
                void fetchQueueItems(workUnitId, k, null, { prefetchOnly: true, logicalUnmapped: false });
                n++;
            }
        };
        const ric = typeof requestIdleCallback !== "undefined";
        if (ric) {
            const id = requestIdleCallback(run, { timeout: 2800 });
            return () => {
                cancelIdleCallback(id);
                queueAdjacentPrefetchTokenRef.current++;
            };
        }
        const tid = window.setTimeout(run, 400);
        return () => {
            clearTimeout(tid);
            queueAdjacentPrefetchTokenRef.current++;
        };
    }, [
        workUnitId,
        selectedQueueKey,
        queueSummaries,
        queueItems,
        queueItemsLoading,
        queueItemsError,
        loading,
        workUnit,
        fetchQueueItems,
    ]);

    const queuePicker = useMemo(() => {
        if (!workUnitId) return null;

        const summariesPending = queueSummaries === null && !queueSummariesError;
        const placeholdersForPicker = queueTabPlaceholdersExpanded ?? queueTabPlaceholders;
        if (summariesPending && placeholdersForPicker?.length) {
            const pillBase =
                "inline-flex shrink-0 items-start gap-1.5 rounded-full border px-2 py-0.5 text-left text-[11px] font-semibold leading-snug transition-colors";
            const countBadgePending = (
                <span
                    className="inline-flex h-3.5 w-3.5 shrink-0 rounded-full border-2 border-alloy-forge/20 border-t-alloy-blue/75 animate-spin"
                    aria-label="Loading queue count"
                />
            );
            const multiSectionPh = placeholdersForPicker.length > 1;
            return (
                <div className="flex flex-col gap-1.5 min-w-0">
                    <div className="flex flex-col gap-1">
                        {placeholdersForPicker.map((section) => (
                            <div key={section.key} className="flex min-w-0 flex-col gap-1">
                                {multiSectionPh ? (
                                    <span className="w-full text-[10px] font-semibold tracking-wide text-alloy-forge/50 sm:w-auto sm:mr-1">
                                        {section.label}
                                    </span>
                                ) : null}
                                <div className="adminv2-ws-queue-pill-scroll" role="group" aria-label={section.label}>
                                    {section.queues.map((q) => {
                                        const synth = q.key.startsWith(ATTENTION_BUCKET_PILL_PREFIX);
                                        const selected = synth
                                            ? selectedQueueKey === "needs_attention" &&
                                              (() => {
                                                  const raw = q.key.slice(ATTENTION_BUCKET_PILL_PREFIX.length);
                                                  if (raw === "__all__") return !attentionBucketKeyLive;
                                                  return attentionBucketKeyLive === raw;
                                              })()
                                            : q.key === selectedQueueKey &&
                                              (!unmappedOnly || allRecordsQueueKey == null || q.key !== allRecordsQueueKey);
                                        const tier =
                                            q.priority === "critical"
                                                ? "critical"
                                                : q.priority === "attention"
                                                  ? "attention"
                                                  : "standard";
                                        const ring =
                                            tier === "critical"
                                                ? selected
                                                    ? "border-alloy-ember bg-alloy-ember/12 text-alloy-forge"
                                                    : "border-alloy-ember/35 bg-white/60 text-alloy-forge/85"
                                                : tier === "attention"
                                                  ? selected
                                                      ? "border-alloy-honey bg-alloy-honey/12 text-alloy-forge"
                                                      : "border-alloy-honey/40 bg-white/60 text-alloy-forge/85"
                                                  : selected
                                                    ? "border-alloy-blue bg-alloy-blue/[0.07] text-alloy-forge shadow-[inset_0_0_0_1px_rgba(0,69,140,0.12)]"
                                                    : "border-admin-border bg-white/70 text-alloy-forge/80";
                                        return (
                                            <button
                                                key={q.key}
                                                type="button"
                                                onClick={() => {
                                                    if (synth) {
                                                        const raw = q.key.slice(ATTENTION_BUCKET_PILL_PREFIX.length);
                                                        handleAttentionBucketSelect(raw === "__all__" ? null : raw);
                                                        return;
                                                    }
                                                    handleQueueTabChange(q.key);
                                                }}
                                                className={`${pillBase} ${ring}`}
                                                aria-pressed={selected}
                                            >
                                                <span className="text-left">{q.label}</span>
                                                {countBadgePending}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            );
        }

        if (!queueSummaries) {
            if (!queueSummariesError) return null;
            return (
                <div className="rounded-md border border-admin-border bg-admin-surface-card px-3 py-2 text-sm text-alloy-ember">
                    {queueSummariesError}
                    {queueSummariesRoute ? (
                        <div className="mt-1 text-xs text-alloy-ember/80">Route: {queueSummariesRoute}</div>
                    ) : null}
                </div>
            );
        }
        if (queueSummaries.length === 0) {
            return (
                <div className="rounded-md border border-admin-border bg-admin-surface-card px-3 py-2 text-sm text-alloy-forge/70">
                    No queues configured for this work unit.
                    {queueSummariesRoute ? (
                        <div className="mt-1 text-xs text-alloy-forge/50">Route: {queueSummariesRoute}</div>
                    ) : null}
                </div>
            );
        }
        const activeSummary = selectedQueueKey
            ? queueSummaries.find((q) => q.key === selectedQueueKey) ?? queueSummaries[0]
            : queueSummaries[0];
        const tabNForSelected =
            activeSummary?.counts_deferred === true ? undefined : typeof activeSummary?.count === "number" ? activeSummary.count : undefined;
        const reconcilePickerCountZero =
            queueItems != null &&
            !queueItemsError &&
            !queueItemsLoading &&
            selectedQueueKey &&
            queueItems.queue.key === selectedQueueKey &&
            (queueItems.offset ?? 0) === 0 &&
            !(queueItems.items ?? []).some(queueItemPayloadHasId) &&
            queueItems.total_omitted === true &&
            typeof tabNForSelected === "number" &&
            tabNForSelected > 0;

        /** Drill-in totals / empty page — aligns selected-tab pill with list without inventing estimates. */
        let authoritativeBadgeForSelectedTab: number | undefined = undefined;
        if (
            selectedQueueKey &&
            queueItems != null &&
            !queueItemsError &&
            !queueItemsLoading &&
            queueItems.queue.key === selectedQueueKey
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

        const pillBase =
            "inline-flex shrink-0 items-start gap-1.5 rounded-full border px-2 py-0.5 text-left text-[11px] font-semibold leading-snug transition-colors";
        function queuePillBadgeCount(q: QueueSummary): number | "—" {
            const synth = q.key.startsWith(ATTENTION_BUCKET_PILL_PREFIX);
            const pillSelected = synth
                ? selectedQueueKey === "needs_attention" &&
                  (() => {
                      const raw = q.key.slice(ATTENTION_BUCKET_PILL_PREFIX.length);
                      if (raw === "__all__") return !attentionBucketKeyLive;
                      return attentionBucketKeyLive === raw;
                  })()
                : q.key === selectedQueueKey &&
                  (!unmappedOnly || allRecordsQueueKey == null || q.key !== allRecordsQueueKey);
            if (
                pillSelected &&
                typeof authoritativeBadgeForSelectedTab === "number" &&
                !(unmappedOnly && allRecordsQueueKey != null && selectedQueueKey === allRecordsQueueKey)
            ) {
                return authoritativeBadgeForSelectedTab;
            }
            if (pillSelected && reconcilePickerCountZero) return 0;
            const raw = q.count as unknown;
            const sc = typeof raw === "number" && Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : undefined;
            return sc === undefined ? "—" : sc;
        }
        const sections =
            queuePillSections ??
            sectionedQueueSummariesOrdered ?? [{ key: "all", label: "Queues", tone: "standard" as const, queues: queueSummaries }];
        const multiSection = sections.length > 1;
        const showOtherPill =
            typeof unmappedPillCount === "number" &&
            unmappedPillCount > 0 &&
            Boolean(allRecordsQueueKey) &&
            Boolean(otherPillSectionKey);
        return (
            <div className="flex flex-col gap-1.5 min-w-0">
                <div className="flex flex-col gap-1">
                    {sections.map((section) => (
                        <div key={section.key} className="flex min-w-0 flex-col gap-1">
                            {multiSection ? (
                                <span className="w-full text-[10px] font-semibold tracking-wide text-alloy-forge/50 sm:w-auto sm:mr-1">
                                    {section.label}
                                </span>
                            ) : null}
                            <div className="adminv2-ws-queue-pill-scroll" role="group" aria-label={section.label}>
                                {section.queues.map((q) => {
                                    const synth = q.key.startsWith(ATTENTION_BUCKET_PILL_PREFIX);
                                    const selected = synth
                                        ? selectedQueueKey === "needs_attention" &&
                                          (() => {
                                              const raw = q.key.slice(ATTENTION_BUCKET_PILL_PREFIX.length);
                                              if (raw === "__all__") return !attentionBucketKeyLive;
                                              return attentionBucketKeyLive === raw;
                                          })()
                                        : q.key === selectedQueueKey &&
                                          (!unmappedOnly || allRecordsQueueKey == null || q.key !== allRecordsQueueKey);
                                    const tier =
                                        q.priority === "critical"
                                            ? "critical"
                                            : q.priority === "attention"
                                              ? "attention"
                                              : "standard";
                                    const ring =
                                        tier === "critical"
                                            ? selected
                                                ? "border-alloy-ember bg-alloy-ember/12 text-alloy-forge"
                                                : "border-alloy-ember/35 bg-white/60 text-alloy-forge/85"
                                            : tier === "attention"
                                              ? selected
                                                  ? "border-alloy-honey bg-alloy-honey/12 text-alloy-forge"
                                                  : "border-alloy-honey/40 bg-white/60 text-alloy-forge/85"
                                              : selected
                                                ? "border-alloy-blue bg-alloy-blue/[0.07] text-alloy-forge shadow-[inset_0_0_0_1px_rgba(0,69,140,0.12)]"
                                                : "border-admin-border bg-white/70 text-alloy-forge/80";
                                    return (
                                        <button
                                            key={q.key}
                                            type="button"
                                            onClick={() => {
                                                if (synth) {
                                                    const raw = q.key.slice(ATTENTION_BUCKET_PILL_PREFIX.length);
                                                    handleAttentionBucketSelect(raw === "__all__" ? null : raw);
                                                    return;
                                                }
                                                handleQueueTabChange(q.key);
                                            }}
                                            className={`${pillBase} ${ring}`}
                                            aria-pressed={selected}
                                            title={q.description?.trim() || undefined}
                                        >
                                            <span className="text-left">{q.label}</span>
                                            <span
                                                className={`tabular-nums rounded-full px-1 py-px text-[10px] font-bold ${
                                                    selected
                                                        ? "bg-alloy-forge/10 text-alloy-forge"
                                                        : "bg-alloy-stone/15 text-alloy-forge/70"
                                                }`}
                                                aria-label={q.counts_deferred ? "Count unavailable" : undefined}
                                            >
                                                {q.counts_deferred ? "—" : queuePillBadgeCount(q)}
                                            </span>
                                        </button>
                                    );
                                })}
                                {showOtherPill && section.key === otherPillSectionKey && allRecordsQueueKey ? (
                                    <button
                                        type="button"
                                        key="__derived_other__"
                                        onClick={() => handleQueueTabChange(allRecordsQueueKey, { unmappedActive: true })}
                                        className={`${pillBase} ${
                                            unmappedOnly && selectedQueueKey === allRecordsQueueKey
                                                ? "border-alloy-blue bg-alloy-blue/[0.07] text-alloy-forge shadow-[inset_0_0_0_1px_rgba(0,69,140,0.12)]"
                                                : "border-admin-border bg-white/70 text-alloy-forge/80"
                                        }`}
                                        aria-pressed={unmappedOnly && selectedQueueKey === allRecordsQueueKey}
                                    >
                                        <span className="text-left">Other</span>
                                        <span
                                            className={`tabular-nums rounded-full px-1 py-px text-[10px] font-bold ${
                                                unmappedOnly && selectedQueueKey === allRecordsQueueKey
                                                    ? "bg-alloy-forge/10 text-alloy-forge"
                                                    : "bg-alloy-stone/15 text-alloy-forge/70"
                                            }`}
                                        >
                                            {unmappedPillCount ?? "—"}
                                        </span>
                                    </button>
                                ) : null}
                            </div>
                        </div>
                    ))}
                </div>
                {activeSummary?.description?.trim() && isOperatorFacingQueueSummaryDescription(activeSummary.description) ? (
                    <p className="m-0 text-[11px] leading-snug text-alloy-forge/60 line-clamp-2">{activeSummary.description.trim()}</p>
                ) : null}
            </div>
        );
    }, [
        handleQueueTabChange,
        handleAttentionBucketSelect,
        queueSummaries,
        queueSummariesError,
        queueSummariesRoute,
        sectionedQueueSummariesOrdered,
        queuePillSections,
        selectedQueueKey,
        attentionBucketKeyLive,
        queueItems,
        queueItemsError,
        queueItemsLoading,
        workUnitId,
        unmappedOnly,
        allRecordsQueueKey,
        unmappedPillCount,
        otherPillSectionKey,
        queueTabPlaceholders,
        queueTabPlaceholdersExpanded,
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
                laneInterpretation: {
                    laneStatusLine: "Loading queues…",
                    recommendedActionLine: "Records will appear here when the queue is ready.",
                },
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

        const activeQueue = selectedQueueKey
            ? queueSummaries.find((q) => q.key === selectedQueueKey) ?? queueSummaries[0]
            : queueSummaries[0];
        const activeQueueKey = String(activeQueue?.key ?? "");
        const workUnitKeyLower = (workUnit.key ?? "").trim().toLowerCase();
        const queueItemsKey =
            queueItems != null && typeof queueItems.queue === "object" && queueItems.queue != null
                ? String((queueItems.queue as { key?: string }).key ?? "")
                : "";

        const entity = queueItems?.queue.entity_type ?? activeQueue?.entity_type ?? "job";
        const rawList = (queueItems?.items ?? []) as unknown[];

        const unmappedClientFilter =
            unmappedOnly &&
            Boolean(allRecordsQueueKey) &&
            selectedQueueKey === allRecordsQueueKey &&
            entity === "opportunity";

        const sourceRows = rawList
            .filter((r) => typeof (r as { id?: unknown })?.id === "string" && String((r as { id: string }).id).trim())
            .filter((r) => (unmappedClientFilter ? isRowUnmappedForThroughput(r, coveredThroughputStatusKeys) : true));

        const previewCfg = queueUi?.row_preview ?? {
            variant: "basic" as const,
            fields: ["title", "status"] as QueueUiRowPreviewField[],
            actions: ["open"] satisfies QueueUiRowPreviewAction[],
        };
        const previewFields = previewCfg.fields ?? (["title", "status"] as QueueUiRowPreviewField[]);
        const previewActions: QueueUiRowPreviewAction[] = previewCfg.actions?.length
            ? [...previewCfg.actions]
            : ["open"];

        const liveVmItems = (
            sourceRows as Array<Record<string, unknown> & { id?: string }>
        ).map((r) => {
                const rid = r.id as string;
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
                const attentionReason =
                    attnPres.summaryLine ||
                    (typeof r?._attention_reason_label === "string" ? r._attention_reason_label.trim() : "");

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

                const quickActions: Array<{
                    id: string;
                    label: string;
                    actionId: string;
                    variant?: "primary" | "secondary" | "danger";
                    payload?: Record<string, unknown>;
                }> = [
                    ...(previewActions.includes("open")
                        ? [{ id: "open", label: "Open", actionId: "open_record", variant: "primary" as const }]
                        : []),
                ];
                if (previewActions.includes("call") && phone) {
                    const tel = normalizePhone(phone) ?? `+1${phone.replace(/\D/g, "").slice(-10)}`;
                    quickActions.push({
                        id: "call",
                        label: "Call",
                        actionId: "crm_tel",
                        variant: "secondary" as const,
                        payload: { href: `tel:${tel}` },
                    });
                }
                if (previewActions.includes("email") && email) {
                    quickActions.push({
                        id: "email",
                        label: "Email",
                        actionId: "crm_mailto",
                        variant: "secondary" as const,
                        payload: { href: `mailto:${email}` },
                    });
                }

                if (entity === "opportunity" && opportunityQueueRowActions?.length) {
                    for (const qa of opportunityQueueRowActions) {
                        quickActions.push({
                            id: qa.id,
                            label: qa.label,
                            actionId: qa.id,
                            variant: "secondary" as const,
                            payload: qa.payload,
                        });
                    }
                }

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

                const needsAttentionRow = Boolean((r as { _needs_attention?: boolean })._needs_attention);
                const placementPriority = parseQueueRowPlacementPriorityVm(
                    (r as { _placement_priority?: unknown })._placement_priority
                );
                return {
                    id: rid,
                    title: familyTitle,
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
                                  const slice = buildWorkUnitQueueCrmCompactRowSlice(
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
                                      primaryIdentity: familyTitle,
                                      childrenLines: childrenLinesForVm,
                                      childName: want("child_name")
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
                                      programContext: want("program")
                                          ? childrenLinesForVm?.length || multiChildren
                                              ? null
                                              : programDeduped
                                          : null,
                                      roomContext: null,
                                      locationContext: locationLabel || null,
                                      attentionReason: attentionReason || null,
                                      operationalNextHint: attnPres.nextHintLine,
                                      familyNote: note || null,
                                      familyNotePreview: notePreview,
                                      activityStale,
                                  };
                              })()
                            : undefined,
                    ...(placementPriority
                        ? {
                              placementPriority,
                              /** Program / room section headers (loaded page) — {@link QueueBlock} grouping. */
                              groupLabel: formatPlacementWaitlistSectionLabel(placementPriority.programGroupSectionTitle),
                          }
                        : {}),
                };
            });

        if (
            !queueItemsError &&
            !queueItemsLoading &&
            queueItems &&
            selectedQueueKey &&
            String(queueItems.queue.key ?? "") === String(selectedQueueKey)
        ) {
            queueRowsBufferRef.current = liveVmItems.slice();
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

        const awaitingFirstRows =
            !queueItemsError &&
            Boolean(selectedQueueKey) &&
            Boolean(workUnit) &&
            !loading &&
            queueItems === null &&
            queueRowsBufferRef.current.length === 0;
        const showEmptyPrimaryRowSlot =
            !queueItemsError && queueItemsLoading && displayItems.length === 0;
        /** Skeleton / defer “No records” only when nothing is shown yet — buffered preview stays mounted. */
        const rowsLoading = awaitingFirstRows || showEmptyPrimaryRowSlot;

        const placementDiagnostics: WorkUnitPlacementQueueDiagnostics | undefined =
            entity === "opportunity" &&
            queueItems &&
            !queueItemsError &&
            String(queueItems.queue.key ?? "") === activeQueueKey
                ? queueItems.placement_projection_diagnostics
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
                          laneStatusLine: queueItemsLoading
                              ? "Loading queue items…"
                              : `Queue: ${activeQueue?.key ?? "—"} · ${rowTotalDisplay} items`,
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
                items: displayItems,
                sortCaption: errorLine
                    ? errorLine
                    : unmappedListView
                      ? "Unmapped / other bucket: list is filtered on the client from the current server page of the all-records lane — use full lane or fix stage filters for complete paging."
                      : undefined,
                placementProjectionHint: undefined,
                placementDisplay: placementDiagnostics?.display,
                rollupSummary: undefined,
                rowsLoading,
                rowsRefreshing,
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
        opportunityQueueRowActions,
        unmappedOnly,
        allRecordsQueueKey,
        coveredThroughputStatusKeys,
        unmappedPillCount,
        viewerTz,
    ]);

    const showOtherBucketPill =
        typeof unmappedPillCount === "number" &&
        unmappedPillCount > 0 &&
        Boolean(allRecordsQueueKey) &&
        Boolean(otherPillSectionKey);

    const headerQueuePickerSlot = useMemo(() => {
        if (!queueModel) return null;
        return (
            <div className="min-w-0">
                {queuePicker}
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
            </div>
        );
    }, [
        queueModel,
        queuePicker,
        hasLifecycleThroughput,
        showOtherBucketPill,
        lifecycleCoverage,
        allRecordsQueueKey,
        selectedQueueKey,
        queueItems?.items,
        queueItemsLoading,
        coveredThroughputStatusKeys,
    ]);

    const model = useMemo(() => {
        if (!workUnit || !dept || !oq) return null;
        const rawItems = oq.items ?? [];
        const statusKeysRaw = (searchParams?.get("status_keys") ?? "").trim();
        const statusKeys = statusKeysRaw
            ? statusKeysRaw
                  .split(",")
                  .map((s) => s.trim().toLowerCase())
                  .filter(Boolean)
            : [];
        const attentionReason = (searchParams?.get("attention_reason") ?? "").trim();
        const attentionReasonCode = (searchParams?.get("attention_reason_code") ?? "").trim();
        const activitySignalKey = (searchParams?.get("activity_signal_key") ?? "").trim();

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
        return buildRealOpportunityWorkUnitWorkspaceModel({
            workUnitId: workUnit.id,
            workUnitKey: workUnit.key ?? "work_unit",
            workUnitName: workUnit.name ?? "Work unit",
            departmentId,
            deptName: dept.name ?? "Department",
            departmentKey: dept.key,
            oq: oqFiltered,
            queueRowQuickActions: opportunityQueueRowActions,
            rightRailResolved: enrollmentRightRailResolved ?? [],
            rowPreviewFieldLabels: queueUi?.row_preview.fieldLabels ?? null,
        });
    }, [departmentId, dept, enrollmentRightRailResolved, oq, opportunityQueueRowActions, queueUi, searchParams, workUnit]);

    const workUnitKpiContext = useMemo(() => {
        if (!workUnit?.id || !departmentId) return null;
        const summariesForKpi =
            queueSummaries?.map((q) => ({
                key: q.key,
                label: q.label,
                count: q.count,
                counts_deferred: q.counts_deferred,
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
        });
    }, [
        departmentId,
        workUnit?.id,
        queueSummaries,
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
        if (!departmentId) return `${WORKSPACE_BASE}`;
        if (!needsAttentionWorkUnitId) return `${WORKSPACE_BASE}/dept/${encodeURIComponent(departmentId)}`;
        return `${WORKSPACE_BASE}/dept/${encodeURIComponent(departmentId)}/work-unit/${encodeURIComponent(
            needsAttentionWorkUnitId
        )}?queue=needs_attention`;
    }, [departmentId, needsAttentionWorkUnitId]);

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

    const onAction = useCallback(
        async (action: WorkspaceAction) => {
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
            if (
                action.type === "queue.item.action" &&
                action.payload &&
                typeof action.payload === "object" &&
                (action.payload as { source?: string }).source === "action_registry" &&
                action.actionId &&
                action.itemId
            ) {
                const resolved = queueRowResolvedByKey.get(action.actionId);
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
                    return;
                }
                const er = json.execution_result;
                if (er?.kind === "start_workflow" && typeof er.workflow_run_id === "string" && er.workflow_run_id.trim()) {
                    setActionFeedback(`Workflow run ${er.workflow_run_id.trim().slice(0, 8)}… completed.`);
                }
                if (er?.kind === "open_drawer") {
                    if (er.drawer?.defaultSurface === "quote_intake") {
                        openDrawer({
                            type: "opportunities",
                            id: action.itemId,
                            defaultOpportunitySurface: "quote_intake",
                            ...oppDrawerExtra,
                        });
                    } else {
                        openDrawer({ type: "opportunities", id: action.itemId, ...oppDrawerExtra });
                    }
                    invalidate({ entity_type: "opportunity", entity_id: action.itemId, action_key: action.actionId });
                    return;
                }
                if (er?.kind === "navigate" && er.href) {
                    router.push(er.href);
                    return;
                }
                invalidate({ entity_type: "opportunity", entity_id: action.itemId, action_key: action.actionId });
                return;
            }
            if (action.type === "queue.item.action" && action.actionId === "open_record") {
                const payload =
                    action.payload && typeof action.payload === "object"
                        ? (action.payload as Record<string, unknown>)
                        : {};
                const fromPayload =
                    typeof payload.entityType === "string" ? payload.entityType.trim().toLowerCase() : "";
                const queueEt = queueItems?.queue.entity_type;
                const entityType =
                    fromPayload === "job" || fromPayload === "schedule" || fromPayload === "opportunity"
                        ? fromPayload
                        : queueEt ?? "opportunity";
                if (entityType === "job") {
                    openDrawer({ type: "jobs", id: action.itemId, jobRecordSurface: "drawer" });
                    return;
                }
                if (entityType === "schedule") {
                    openDrawer({ type: "schedules", id: action.itemId });
                    return;
                }
                openDrawer({ type: "opportunities", id: action.itemId, ...oppDrawerExtra });
                return;
            }
            if (action.type === "queue.item.action" && action.actionId && action.itemId) {
                if (action.actionId === "crm_mailto" || action.actionId === "crm_tel") {
                    const href = action.payload && typeof action.payload.href === "string" ? action.payload.href : "";
                    if (href) window.location.href = href;
                    return;
                }
                // Map queue quick actions → opportunity record actions (event keys).
                const eventKey = action.actionId;
                if (eventKey === "start_quote" || eventKey === "open_quote") {
                    openDrawer({
                        type: "opportunities",
                        id: action.itemId,
                        defaultOpportunitySurface: "quote_intake",
                        ...oppDrawerExtra,
                    });
                    return;
                }
                const r = await executeOpportunityRecordAction({ opportunityId: action.itemId, eventKey });
                if (r.ok) {
                    // Drawer close will cause refetch in other lanes; here we just rely on refresh-on-next navigation.
                    // Keep simple: do nothing.
                }
                return;
            }
            if (action.type === "actions.block") {
                if (action.actionId === "back_department" || action.actionId === "wu_back_department") {
                    window.location.href = `${WORKSPACE_BASE}/dept/${encodeURIComponent(departmentId)}`;
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
                        window.location.href = `${WORKSPACE_BASE}/dept/${encodeURIComponent(departmentId)}/work-unit/${encodeURIComponent(needsAttentionWorkUnitId)}`;
                    } else {
                        window.location.href = `${WORKSPACE_BASE}/dept/${encodeURIComponent(departmentId)}`;
                    }
                    return;
                }
                if (action.actionId === "wu_manage_work_units") {
                    window.location.href = "/adminV2/settings/work-units";
                    return;
                }
                if (action.actionId === "wu_workspace_root") {
                    window.location.href = WORKSPACE_BASE;
                }
            }
        },
        [
            departmentId,
            enrollmentRightRailByKey,
            needsAttentionHref,
            needsAttentionWorkUnitId,
            openDrawer,
            oppDrawerExtra,
            opportunityWorkspaceContext,
            queueItems?.queue.entity_type,
            router,
            workUnit?.id,
        ]
    );

    const deptName = dept?.name?.trim() || "Department";
    const wuName = workUnit?.name?.trim() || "Work unit";
    const mergedWorkspaceModel = useMemo(() => {
        const base = queueModel ?? model;
        if (!base || !workUnitKpiContext) return base;
        if (suppressWorkUnitKpiStrip) {
            return { ...base, kpis: [] };
        }
        if (wuPlacementRows === undefined) {
            return { ...base, kpis: [] };
        }
        const kpis = wuResolvedPlacementKpis ?? buildDefaultWorkUnitKpis(workUnitKpiContext);
        return { ...base, kpis };
    }, [
        queueModel,
        model,
        workUnitKpiContext,
        wuResolvedPlacementKpis,
        suppressWorkUnitKpiStrip,
        wuPlacementRows,
    ]);

    const effectiveModel = mergedWorkspaceModel;

    const workUnitKpiStripPlaceholder = !suppressWorkUnitKpiStrip && wuPlacementRows === undefined;

    /** Shell + header render after WU + dept; queue summaries and rows stay in-lane (Phase 3.1). */
    const workUnitPageCoherent = !loading && Boolean(workUnit) && Boolean(dept) && !error;

    return (
        <WorkspaceChrome
            variant="bridge"
            breadcrumbs={[
                { href: WORKSPACE_BASE, label: "Workspace" },
                { href: `${WORKSPACE_BASE}/dept/${departmentId}`, label: deptName },
                { label: wuName },
            ]}
            title={wuName}
            subtitle=""
        >
            {!workUnitPageCoherent ? (
                <AdminV2RouteLoadingState variant="work_unit" showRibbon={false} />
            ) : effectiveModel ? (
                <>
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
                        model={effectiveModel}
                        onAction={onAction}
                        headerQueuePicker={headerQueuePickerSlot}
                        kpiStripPlaceholder={workUnitKpiStripPlaceholder}
                        reserveActionsRail={isEnrollmentLikeDepartmentKey(dept?.key)}
                        primaryFooterSlot={
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
                                metadataAssociationNote={WORKSPACE_AUTOMATION_METADATA_GAP_NOTE}
                            />
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
            ) : (
                <p className="text-sm text-alloy-ember px-1 py-4">{error ?? "Unable to load this work unit."}</p>
            )}
        </WorkspaceChrome>
    );
}

