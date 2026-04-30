"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { WorkspaceChrome } from "@/components/admin/workspace/WorkspaceChrome";
import WorkUnitWorkspace from "@/app/adminV2/components/workspace/shells/WorkUnitWorkspace";
import { AutomationWorkflowsBlock } from "@/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { AdminV2RouteLoadingState } from "@/components/admin/workspace/AdminV2RouteLoadingState";
import type { ResolvedActionForClient, ResolvedActionsBySlot } from "@/lib/admin/actions/types";
import { applyRegistryResolvedActionClient } from "@/lib/admin/actions/applyRegistryResolvedActionClient";
import { REGISTRY_RIGHT_RAIL_ACTION_ID_PREFIX } from "@/lib/workspace/viewModels/enrollmentRightRailMerge";
import { executeOpportunityRecordAction } from "@/lib/recordChrome/executeOpportunityRecordAction";
import type { WorkspaceAction } from "@/lib/ui-v2/workspace-actions";
import type {
    CrmCompactChildLineVm,
    QueueItemQuickActionVm,
    WorkUnitWorkspaceModel,
} from "@/lib/ui-v2/workspace-types";
import type { WorkspaceOpportunityQueueRuntime } from "@/lib/workspace/types";
import { buildRealOpportunityWorkUnitWorkspaceModel } from "@/lib/ui-v2/adapters/realWorkUnitFromOpportunities";
import { mergeEnrollmentRightRailActions } from "@/lib/workspace/viewModels/enrollmentRightRailMerge";
import { rightRailResolvedFromActionsPayload } from "@/lib/workspace/rightRailResolvedFromActionsPayload";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import { workspaceRouteParam } from "@/lib/workspace/workspaceRouteParam";
import { validateQueueDefinition, type QueueDefinitionV1 } from "@/lib/config/queueDefinitionSchema";
import { getQueueUiConfig, type QueueUiConfig, type QueueUiRowPreviewField } from "@/lib/ui-v2/queueUiConfig";
import { dedupeAdminFetchWithTtl } from "@/lib/workspace/workspaceAdminFetchDedupe";
import { UpdateStatusAddNoteModal } from "@/components/admin/opportunity/actions/UpdateStatusAddNoteModal";
import { ContactAttemptedModal } from "@/components/admin/opportunity/actions/ContactAttemptedModal";
import { formatActivityRelativeShort } from "@/lib/admin/activitySignals";
import { formatOpportunityQueueNotesPreview } from "@/lib/admin/opportunityActivityTimelineFormat";

const WORKSPACE_BASE = "/adminV2/workspace";

function queueParamFromWindow(): string {
    if (typeof window === "undefined") return "";
    try {
        return new URL(window.location.href).searchParams.get("queue")?.trim() ?? "";
    } catch {
        return "";
    }
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
};

type DeptRow = { id: string; name: string | null; key: string | null };

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
};

function queueItemPayloadHasId(r: unknown): boolean {
    return (
        typeof r === "object" &&
        r != null &&
        typeof (r as { id?: unknown }).id === "string" &&
        String((r as { id: string }).id).trim() !== ""
    );
}

function mergeQueueSummariesByKey(prev: QueueSummary[], incoming: QueueSummary[]): QueueSummary[] {
    if (!incoming.length) return prev;
    const byKey = new Map(incoming.map((q) => [q.key, q]));
    return prev.map((q) => byKey.get(q.key) ?? q);
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

function parseQueueRowCrmChildren(raw: unknown): CrmCompactChildLineVm[] {
    if (!Array.isArray(raw)) return [];
    const out: CrmCompactChildLineVm[] = [];
    for (const x of raw) {
        if (x === null || typeof x !== "object") continue;
        const o = x as Record<string, unknown>;
        const primary =
            typeof o.primary === "string"
                ? o.primary.trim()
                : typeof o.line === "string"
                  ? o.line.trim()
                  : "";
        if (!primary) continue;
        const secondary =
            typeof o.secondary === "string"
                ? o.secondary.trim()
                : typeof o.detail === "string"
                  ? o.detail.trim()
                  : null;
        out.push({ primary, secondary: secondary || null });
    }
    return out;
}

export default function AdminV2OpportunityWorkUnitPage() {
    const params = useParams();
    const departmentId = workspaceRouteParam(params.departmentId);
    const workUnitId = workspaceRouteParam(params.workUnitId);
    const searchParams = useSearchParams();
    const router = useRouter();
    const { openDrawer, drawer } = useAdminDrawer();

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
    /** First primary-queue items response for this work unit (not reset on tab change — tab uses in-lane loading). */
    const [wuBootPrimarySettled, setWuBootPrimarySettled] = useState(false);
    const queueItemsRequestSeq = useRef(0);
    const queueSummariesRequestSeq = useRef(0);
    /**
     * Skips redundant queue-item GETs when only `queueSummaries` reference changes (e.g. idle partial
     * count merge) while work unit, selected tab, and omit-total semantics are unchanged — same URL as last fetch.
     * Cleared on work-unit navigation; bypass with fetchQueueItems(..., { force: true }) for invalidation.
     */
    const queueItemsLastFetchSigRef = useRef<string | null>(null);

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

    useEffect(() => {
        if (!actionFeedback) return;
        const t = setTimeout(() => setActionFeedback(null), 10000);
        return () => clearTimeout(t);
    }, [actionFeedback]);

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
            setEnrollmentRightRailResolved(null);
            setError("Missing department or work unit in the URL.");
            queueItemsLastFetchSigRef.current = null;
            return;
        }

        let cancelled = false;
        (async () => {
            setLoading(true);
            setError(null);
            const init = workspaceDataFetchInit();
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
                    setEnrollmentRightRailResolved(null);
                    queueItemsLastFetchSigRef.current = null;
                }

                const [wuRes, deptRes, deptWusRes] = await Promise.all([
                    fetch(`/api/admin/work-units/${encodeURIComponent(workUnitId)}`, init),
                    fetch(`/api/admin/departments/${encodeURIComponent(departmentId)}`, init),
                    fetch(`/api/admin/work-units?department_id=${encodeURIComponent(departmentId)}`, init),
                ]);

                const wuJson = (await wuRes.json().catch(() => ({}))) as { error?: string } & Partial<WorkUnitRow>;
                const deptJson = (await deptRes.json().catch(() => ({}))) as { error?: string } & Partial<DeptRow>;
                const deptWusJson = (await deptWusRes.json().catch(() => ({}))) as {
                    error?: string;
                    items?: Array<{ id: string; key?: string | null }>;
                };

                if (!wuRes.ok) throw new Error(wuJson.error ?? "Failed to load work unit");
                if (!deptRes.ok) throw new Error(deptJson.error ?? "Failed to load department");

                const wu = wuJson as WorkUnitRow;
                if (wu.department_id !== departmentId) {
                    throw new Error("Work unit does not belong to this department");
                }

                const isAttention = (wu.key ?? "").trim().toLowerCase() === "needs_attention";
                // Prefer the new QueueService-backed queues. Only fall back to legacy opportunity runtime on 501 or
                // network/runtime failures that indicate the new queue API isn't usable.
                let usedNewQueueApi = false;
                let shouldFallbackToLegacy = false;
                let fallbackReason: string | null = null;
                const qFromUrlEarly = queueParamFromWindow().trim();

                const queueListRoute = `/api/admin/work-units/${encodeURIComponent(workUnitId)}/queues?include_previews=false&count_mode=exact&limit=3&summary_mode=initial&focus_queue=${encodeURIComponent(qFromUrlEarly)}`;

                const actionsListRoute =
                    `/api/admin/actions?` +
                    new URLSearchParams({
                        surface: "queue_row",
                        entity_type: "opportunity",
                        work_unit_id: workUnitId,
                        department_id: departmentId,
                    }).toString();
                const rightRailActionsRoute =
                    `/api/admin/actions?` +
                    new URLSearchParams({
                        surface: "right_rail",
                        entity_type: "opportunity",
                        work_unit_id: workUnitId,
                        department_id: departmentId,
                    }).toString();

                let parsedQueueRowQuick: QueueItemQuickActionVm[] | null = null;
                let parsedRightRail: ResolvedActionForClient[] = [];
                const [queuesSettled, actionsSettled, rightRailSettled] = await Promise.allSettled([
                    fetch(queueListRoute, init),
                    dedupeAdminFetchWithTtl(actionsListRoute, init, 1500),
                    dedupeAdminFetchWithTtl(rightRailActionsRoute, init, 1500),
                ]);

                if (actionsSettled.status === "fulfilled") {
                    try {
                        const ar = actionsSettled.value;
                        const aj = (await ar.json().catch(() => ({}))) as { actions?: ResolvedActionsBySlot };
                        if (ar.ok) {
                            const rowInline = aj.actions?.row_inline ?? [];
                            const overflow = aj.actions?.overflow ?? [];
                            const combined = [...rowInline, ...overflow];
                            if (!cancelled) setOpportunityQueueRowResolved(combined);
                            if (combined.length) parsedQueueRowQuick = registryQuickActionsFromResolved(combined);
                        }
                    } catch {
                        /* non-fatal */
                    }
                }

                if (rightRailSettled.status === "fulfilled") {
                    try {
                        const ar = rightRailSettled.value;
                        const aj = (await ar.json().catch(() => ({}))) as { actions?: ResolvedActionsBySlot; error?: string };
                        if (ar.ok) {
                            parsedRightRail = rightRailResolvedFromActionsPayload(aj.actions);
                        }
                    } catch {
                        /* non-fatal */
                    }
                }

                if (queuesSettled.status === "fulfilled") {
                    try {
                        const res = queuesSettled.value;
                        const j = (await res.json().catch(() => ({}))) as {
                            error?: string;
                            queues?: QueueSummary[];
                            deferred_queue_keys?: string[];
                        };
                        const route = queueListRoute;
                        if (res.ok) {
                            usedNewQueueApi = true;
                            if (!cancelled) {
                                const qs = (j.queues ?? []) as QueueSummary[];
                                setQueueSummaries(qs);
                                setQueueSummariesError(null);
                                setQueueSummariesRoute(route);
                                const dk = j.deferred_queue_keys;
                                if (dk && dk.length) {
                                    const fill = () => {
                                        const fillRoute = `/api/admin/work-units/${encodeURIComponent(workUnitId)}/queues?include_previews=false&count_mode=exact&limit=3&summary_mode=partial&only_queue_keys=${encodeURIComponent(dk.join(","))}`;
                                        fetch(fillRoute, init)
                                            .then((r) => (r.ok ? r.json() : null))
                                            .then((fj: { queues?: QueueSummary[] } | null) => {
                                                if (cancelled || !fj?.queues?.length) return;
                                                setQueueSummaries((prev) =>
                                                    prev && prev.length
                                                        ? mergeQueueSummariesByKey(prev, fj.queues as QueueSummary[])
                                                        : prev
                                                );
                                            })
                                            .catch(() => {});
                                    };
                                    if (typeof requestIdleCallback !== "undefined") {
                                        requestIdleCallback(fill, { timeout: 1500 });
                                    } else {
                                        window.setTimeout(fill, 120);
                                    }
                                }
                                const qFromUrl = queueParamFromWindow().trim();
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
                                const initial =
                                    qFromUrl && qs.some((x) => x.key === qFromUrl)
                                        ? qFromUrl
                                        : selectedQueueKey && qs.some((x) => x.key === selectedQueueKey)
                                          ? selectedQueueKey
                                          : firstByUi;
                                setSelectedQueueKey(initial);
                            }
                        } else if (res.status === 501) {
                            shouldFallbackToLegacy = true;
                            fallbackReason = "queue_api_501_not_supported";
                            if (!cancelled) {
                                setQueueSummaries(null);
                                setQueueSummariesError("Queue type not supported yet");
                                setQueueSummariesRoute(route);
                            }
                        } else {
                            shouldFallbackToLegacy = false;
                            fallbackReason = `queue_api_${res.status}`;
                            if (!cancelled) {
                                setQueueSummaries(null);
                                setQueueSummariesError(j.error ?? "Failed to load queues");
                                setQueueSummariesRoute(route);
                            }
                        }
                    } catch (e) {
                        shouldFallbackToLegacy = true;
                        fallbackReason = "queue_api_exception";
                        if (!cancelled) {
                            setQueueSummaries(null);
                            setQueueSummariesError(e instanceof Error ? e.message : "Failed to load queues");
                            setQueueSummariesRoute(queueListRoute);
                        }
                    }
                } else {
                    shouldFallbackToLegacy = true;
                    fallbackReason = "queue_api_exception";
                    const reason =
                        queuesSettled.status === "rejected"
                            ? queuesSettled.reason instanceof Error
                                ? queuesSettled.reason.message
                                : "Queue request failed"
                            : "Queue request failed";
                    if (!cancelled) {
                        setQueueSummaries(null);
                        setQueueSummariesError(reason);
                        setQueueSummariesRoute(queueListRoute);
                    }
                }

                let oqRuntime: WorkspaceOpportunityQueueRuntime | null = null;
                if (!usedNewQueueApi && shouldFallbackToLegacy) {
                    try {
                        const oqRes = await fetch(
                            `/api/admin/work-units/${encodeURIComponent(workUnitId)}/${isAttention ? "opportunity-attention-queue" : "opportunity-queue"}`,
                            init
                        );
                        const oqJson = (await oqRes.json().catch(() => ({}))) as {
                            error?: string;
                            total?: number;
                            items?: WorkspaceOpportunityQueueRuntime["items"];
                        };
                        if (!oqRes.ok) {
                            oqRuntime = {
                                total: 0,
                                error: oqJson.error ?? "Failed to load queue",
                                items: [],
                            };
                        } else {
                            oqRuntime = {
                                total: typeof oqJson.total === "number" ? oqJson.total : 0,
                                error: null,
                                items: oqJson.items ?? [],
                            };
                        }
                    } catch (e) {
                        const msg = e instanceof Error ? e.message : "Queue request failed";
                        oqRuntime = { total: 0, error: msg, items: [] };
                    }
                } else if (!usedNewQueueApi) {
                    // No-op: legacy fallback not used.
                }

                const naList = deptWusRes.ok ? (deptWusJson.items ?? []) : [];
                const naWu = naList.find((r) => String(r.key ?? "").trim().toLowerCase() === "needs_attention");

                if (!cancelled) {
                    setWorkUnit(wu);
                    setDept(deptJson as DeptRow);
                    setOq(oqRuntime);
                    setNeedsAttentionWorkUnitId(naWu?.id ?? null);
                    setOpportunityQueueRowActions(parsedQueueRowQuick);
                    setEnrollmentRightRailResolved(parsedRightRail);
                }
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
    }, [departmentId, workUnitId]);

    useEffect(() => {
        const gated =
            Boolean(workUnitId) &&
            Boolean(selectedQueueKey) &&
            Boolean(queueSummaries?.length) &&
            queueItemsLoading &&
            queueItems === null &&
            !queueItemsError;
        if (!gated) {
            setWuPrimaryLaneTimedOut(false);
            return;
        }
        const t = window.setTimeout(() => setWuPrimaryLaneTimedOut(true), 12_000);
        return () => clearTimeout(t);
    }, [workUnitId, selectedQueueKey, queueSummaries, queueItemsLoading, queueItems, queueItemsError]);

    useEffect(() => {
        setWuBootPrimarySettled(false);
    }, [workUnitId]);

    useEffect(() => {
        if (!workUnitId) return;
        if (loading) return;
        const multi = Boolean(queueSummaries && queueSummaries.length > 0);
        if (!multi) {
            setWuBootPrimarySettled(true);
            return;
        }
        if (queueSummariesError) {
            setWuBootPrimarySettled(true);
            return;
        }
        const key = selectedQueueKey ?? queueSummaries?.[0]?.key ?? null;
        if (!key) return;
        if (queueItemsError || wuPrimaryLaneTimedOut) {
            setWuBootPrimarySettled(true);
            return;
        }
        if (queueItems != null && String((queueItems.queue as { key?: string })?.key ?? "") === key) {
            setWuBootPrimarySettled(true);
        }
    }, [
        workUnitId,
        loading,
        queueSummaries,
        queueSummariesError,
        selectedQueueKey,
        queueItems,
        queueItemsError,
        wuPrimaryLaneTimedOut,
    ]);

    /** Browser back/forward: sync selected queue with `?queue=` without re-running bootstrap. */
    useEffect(() => {
        if (!queueSummaries?.length) return;
        const qFromUrl = (searchParams?.get("queue") ?? "").trim();
        if (!qFromUrl || !queueSummaries.some((x) => x.key === qFromUrl)) return;
        setSelectedQueueKey((prev) => (prev !== qFromUrl ? qFromUrl : prev));
    }, [queueSummaries, searchParams]);

    const fetchQueueItems = useCallback(
        async (
            workUnitId: string,
            queueKey: string,
            summaries: QueueSummary[] | null,
            options?: { force?: boolean }
        ) => {
            const tab = summaries?.find((q) => q.key === queueKey);
            const canOmitTotal = tab != null && tab.counts_deferred !== true;
            const fetchSig = `${workUnitId}|${queueKey}|${canOmitTotal ? "omit" : "fullcount"}`;
            if (!options?.force && fetchSig === queueItemsLastFetchSigRef.current) {
                return;
            }
            queueItemsLastFetchSigRef.current = fetchSig;

            const seq = ++queueItemsRequestSeq.current;
            const qs = new URLSearchParams({ limit: "20", offset: "0", count_mode: "exact" });
            if (canOmitTotal) qs.set("omit_total_count", "true");
            const route = `/api/admin/queues/${encodeURIComponent(workUnitId)}/${encodeURIComponent(queueKey)}?${qs.toString()}`;
            setQueueItemsLoading(true);
            setQueueItemsError(null);
            setQueueItemsRoute(route);
            setQueueItems((prev) => {
                const pk =
                    prev?.queue && typeof (prev.queue as { key?: string }).key === "string"
                        ? (prev.queue as { key: string }).key
                        : null;
                if (pk != null && pk !== queueKey) return null;
                return prev;
            });
            try {
                const init = workspaceDataFetchInit();
                const res = await fetch(route, init);
                const json = (await res.json().catch(() => ({}))) as { error?: string };
                if (!res.ok) {
                    if (res.status === 501) throw new Error("Queue type not supported yet");
                    throw new Error(json.error ?? "Failed to load queue items");
                }
                if (seq === queueItemsRequestSeq.current) setQueueItems(json as unknown as QueueItemsResult);
            } catch (e) {
                if (seq === queueItemsRequestSeq.current) {
                    setQueueItems(null);
                    setQueueItemsError(e instanceof Error ? e.message : "Failed to load queue items");
                }
            } finally {
                if (seq === queueItemsRequestSeq.current) setQueueItemsLoading(false);
            }
        },
        []
    );

    const fetchQueueSummaries = useCallback(async (workUnitId: string) => {
        const seq = ++queueSummariesRequestSeq.current;
        const route = `/api/admin/work-units/${encodeURIComponent(workUnitId)}/queues?include_previews=false&count_mode=exact&limit=3`;
        setQueueSummariesError(null);
        setQueueSummariesRoute(route);
        try {
            const init = workspaceDataFetchInit();
            const res = await fetch(route, init);
            const json = (await res.json().catch(() => ({}))) as { error?: string; queues?: QueueSummary[] };
            if (!res.ok) {
                throw new Error(json.error ?? "Failed to load queues");
            }
            const qs = (json.queues ?? []) as QueueSummary[];
            if (seq === queueSummariesRequestSeq.current) setQueueSummaries(qs);
        } catch (e) {
            if (seq === queueSummariesRequestSeq.current) {
                setQueueSummaries(null);
                setQueueSummariesError(e instanceof Error ? e.message : "Failed to load queues");
            }
        }
    }, []);

    const invalidate = useCallback(
        (opts?: { entity_type?: string; entity_id?: string; action_key?: string }) => {
            void opts;
            if (!workUnitId || !selectedQueueKey) return;
            void Promise.all([
                fetchQueueItems(workUnitId, selectedQueueKey, queueSummaries, { force: true }),
                fetchQueueSummaries(workUnitId),
            ]);
        },
        [fetchQueueItems, fetchQueueSummaries, queueSummaries, selectedQueueKey, workUnitId]
    );

    const queueSummariesRef = useRef(queueSummaries);
    queueSummariesRef.current = queueSummaries;

    useEffect(() => {
        if (!workUnitId || !selectedQueueKey) return;
        const onUpdated = (_ev: Event) => {
            const summaries = queueSummariesRef.current;
            void Promise.all([
                fetchQueueItems(workUnitId, selectedQueueKey, summaries, { force: true }),
                fetchQueueSummaries(workUnitId),
            ]);
        };
        window.addEventListener("adminv2:opportunity-updated", onUpdated as EventListener);
        return () => window.removeEventListener("adminv2:opportunity-updated", onUpdated as EventListener);
    }, [fetchQueueItems, fetchQueueSummaries, selectedQueueKey, workUnitId]);

    useEffect(() => {
        if (!workUnitId || !selectedQueueKey) return;
        if (!queueSummaries || queueSummaries.length === 0) return;
        void fetchQueueItems(workUnitId, selectedQueueKey, queueSummaries);
    }, [fetchQueueItems, queueSummaries, selectedQueueKey, workUnitId]);

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

    const queuePicker = useMemo(() => {
        if (!workUnitId) return null;
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
            "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 text-left text-[11px] font-semibold leading-tight transition-colors";
        function queuePillBadgeCount(q: QueueSummary): number | "…" | "—" {
            if (q.counts_deferred) return "…";
            if (q.key === selectedQueueKey && typeof authoritativeBadgeForSelectedTab === "number") {
                return authoritativeBadgeForSelectedTab;
            }
            if (q.key === selectedQueueKey && reconcilePickerCountZero) return 0;
            const raw = q.count as unknown;
            const sc = typeof raw === "number" && Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : undefined;
            return sc === undefined ? "—" : sc;
        }
        const sections = sectionedQueueSummaries ?? [
            { key: "all", label: "Queues", tone: "standard" as const, queues: queueSummaries },
        ];
        const multiSection = sections.length > 1;
        return (
            <div className="flex flex-col gap-1.5 min-w-0">
                <div className="flex flex-col gap-1">
                    {sections.map((section) => (
                        <div key={section.key} className="flex flex-wrap items-center gap-1" role="group" aria-label={section.label}>
                            {multiSection ? (
                                <span className="w-full text-[10px] font-semibold uppercase tracking-wide text-alloy-forge/50 sm:w-auto sm:mr-1">
                                    {section.label}
                                </span>
                            ) : null}
                            {section.queues.map((q) => {
                                const selected = q.key === selectedQueueKey;
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
                                            setSelectedQueueKey(q.key);
                                            void fetchQueueItems(workUnitId, q.key, queueSummaries, { force: true });
                                            if (typeof window !== "undefined") {
                                                const url = new URL(window.location.href);
                                                url.searchParams.set("queue", q.key);
                                                router.replace(`${url.pathname}${url.search}`, { scroll: false });
                                            }
                                        }}
                                        className={`${pillBase} ${ring}`}
                                        aria-pressed={selected}
                                    >
                                        <span className="truncate">{q.label}</span>
                                        <span
                                            className={`tabular-nums rounded-full px-1 py-px text-[10px] font-bold ${
                                                selected ? "bg-alloy-forge/10 text-alloy-forge" : "bg-alloy-stone/15 text-alloy-forge/70"
                                            }`}
                                        >
                                            {queuePillBadgeCount(q)}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                </div>
                {activeSummary?.description?.trim() ? (
                    <p className="m-0 text-[11px] leading-snug text-alloy-forge/60 line-clamp-2">{activeSummary.description.trim()}</p>
                ) : null}
            </div>
        );
    }, [
        fetchQueueItems,
        queueSummaries,
        queueSummariesError,
        queueSummariesRoute,
        sectionedQueueSummaries,
        selectedQueueKey,
        queueItems,
        queueItemsError,
        queueItemsLoading,
        workUnitId,
        router,
    ]);

    const queueModel = useMemo<WorkUnitWorkspaceModel | null>(() => {
        if (!workUnit || !dept) return null;
        if (!queueSummaries) return null;

        const activeQueue = selectedQueueKey
            ? queueSummaries.find((q) => q.key === selectedQueueKey) ?? queueSummaries[0]
            : queueSummaries[0];

        const entity = queueItems?.queue.entity_type ?? activeQueue?.entity_type ?? "job";
        const items = (queueItems?.items ?? []) as any[];

        const previewCfg = queueUi?.row_preview ?? { variant: "basic" as const, fields: ["title", "status"] as QueueUiRowPreviewField[], actions: ["open"] as const };
        const previewFields = previewCfg.fields ?? (["title", "status"] as QueueUiRowPreviewField[]);
        const previewActions = previewCfg.actions ?? (["open"] as const);

        const vmItems = items
            .filter((r) => typeof r?.id === "string" && r.id.trim())
            .map((r) => {
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
                const childName = typeof r?._child_display_name === "string" ? r._child_display_name.trim() : "";
                const program = typeof r?._requested_program === "string" ? r._requested_program.trim() : "";
                const desiredStart =
                    typeof r?._desired_start_date === "string" ? r._desired_start_date.trim() : "";
                const tourCtx = typeof r?._tour_context === "string" ? r._tour_context.trim() : "";
                const note =
                    formatOpportunityQueueNotesPreview(
                        typeof r?._notes_preview === "string" ? r._notes_preview : null
                    ) ?? "";
                const attentionReason =
                    typeof r?._attention_reason_label === "string" ? r._attention_reason_label.trim() : "";

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
                    quickActions.push({
                        id: "call",
                        label: "Call",
                        actionId: "crm_tel",
                        variant: "secondary" as const,
                        payload: { href: `tel:${phone}` },
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

                const crmChildrenParsed = parseQueueRowCrmChildren(r?._crm_compact_children);
                const multiChildren = Boolean(want("child_name") && crmChildrenParsed.length >= 2);

                const basicSubtitleParts: string[] = [];
                if (want("status") && statusLabel) basicSubtitleParts.push(`Status: ${statusLabel}`);
                if (want("primary_contact") && contactName) basicSubtitleParts.push(contactName);
                if ((want("phone") && phone) || (want("email") && email)) {
                    const bits = [want("phone") ? phone : "", want("email") ? email : ""].filter(Boolean);
                    if (bits.length) basicSubtitleParts.push(bits.join(" · "));
                }

                return {
                    id: rid,
                    title: familyTitle,
                    subtitle: previewCfg.variant === "basic" ? (basicSubtitleParts.filter(Boolean).join(" · ") || undefined) : undefined,
                    urgencyTier:
                        activeQueue?.priority === "critical"
                            ? ("critical" as const)
                            : activeQueue?.priority === "attention"
                              ? ("warning" as const)
                              : ("standard" as const),
                    quickActions,
                    semanticCrmCompact:
                        previewCfg.variant === "crm_compact"
                            ? {
                                  primaryIdentity: familyTitle,
                                  childrenLines: want("child_name") && multiChildren ? crmChildrenParsed : null,
                                  childName: want("child_name") ? (multiChildren ? null : childName || null) : null,
                                  stageLabel: null,
                                  statusLabel: want("status") ? statusLabel || null : null,
                                  nextStep:
                                      typeof r?._next_step_preview === "string" && r._next_step_preview.trim()
                                          ? r._next_step_preview.trim()
                                          : null,
                                  lastActivity: activityLastLine,
                                  commercialValue: null,
                                  contactSnippet:
                                      [want("primary_contact") ? contactName : "", want("phone") ? phone : "", want("email") ? email : ""]
                                          .filter(Boolean)
                                          .join(" · ") || null,
                                  programContext: want("program") ? program || null : null,
                                  roomContext: null,
                                  ageContext: want("desired_start_date") ? (desiredStart || null) : null,
                                  tourContext: want("tour_date") ? tourCtx || null : null,
                                  attentionReason: attentionReason || null,
                                  familyNote: note || null,
                                  activityStale,
                              }
                            : undefined,
                };
            });

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
            vmItems.length === 0 &&
            queueItems.total_omitted === true &&
            typeof tabCount === "number" &&
            tabCount > 0;
        const effectiveRowTotal = reconcileListEmptyVsTab
            ? 0
            : queueItems != null
              ? queueItems.total_omitted === true
                  ? tabCount
                  : queueItems.total
              : tabCount;
        const rowTotalDisplay = effectiveRowTotal == null ? "—" : String(effectiveRowTotal);

        const activeQueueKey = String(activeQueue?.key ?? "");
        const queueItemsKey =
            queueItems != null && typeof queueItems.queue === "object" && queueItems.queue != null
                ? String((queueItems.queue as { key?: string }).key ?? "")
                : "";
        /** Empty list + in-flight fetch, or tab mismatch — show compact in-lane loading (no tall duplicate skeleton). */
        const rowsLoading =
            Boolean(queueItemsLoading) &&
            (queueItems === null ||
                vmItems.length === 0 ||
                (activeQueueKey !== "" && queueItemsKey !== "" && queueItemsKey !== activeQueueKey));

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
                items: vmItems,
                sortCaption: errorLine ? errorLine : undefined,
                rollupSummary: undefined,
                rowsLoading,
            },
            workSummary: null,
            actionsRail: (() => {
                const isEnrollmentDept = (dept.key ?? "").trim().toLowerCase() === "enrollment";
                const emptyBase = {
                    primaries: [],
                    systemActions: [],
                    quickOperations: [],
                    overflow: [],
                };
                return isEnrollmentDept
                    ? mergeEnrollmentRightRailActions(enrollmentRightRailResolved ?? [], emptyBase)
                    : emptyBase;
            })(),
            contextRail: { title: "About", groups: [] },
        };
    }, [
        dept,
        enrollmentRightRailResolved,
        queueItems,
        queueItemsError,
        queueItemsLoading,
        queueItemsRoute,
        queueSummaries,
        selectedQueueKey,
        workUnit,
        queueUi,
        opportunityQueueRowActions,
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
        const activitySignalKey = (searchParams?.get("activity_signal_key") ?? "").trim();

        const filteredItems = rawItems.filter((it) => {
            if (statusKeys.length) {
                const sk = String(it.status_key ?? "").trim().toLowerCase();
                if (!statusKeys.includes(sk)) return false;
            }
            if (attentionReason) {
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
        });
    }, [departmentId, dept, enrollmentRightRailResolved, oq, opportunityQueueRowActions, searchParams, workUnit]);

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
                const entityType = queueItems?.queue.entity_type;
                if (entityType === "job") {
                    openDrawer({ type: "jobs", id: action.itemId, jobRecordSurface: "drawer" });
                    return;
                }
                if (entityType === "schedule") {
                    openDrawer({ type: "schedules", id: action.itemId });
                    return;
                }
                if (entityType === "opportunity") {
                    openDrawer({ type: "opportunities", id: action.itemId, ...oppDrawerExtra });
                    return;
                }
            }
            if (action.type === "queue.item.action" && action.actionId === "open_record") {
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
    const effectiveModel = queueModel ?? model;

    const usingMultiQueue = Boolean(queueSummaries && queueSummaries.length > 0);
    const wuShowPrimaryTransition =
        !loading &&
        !error &&
        usingMultiQueue &&
        !queueSummariesError &&
        Boolean(selectedQueueKey ?? queueSummaries?.[0]?.key) &&
        !wuBootPrimarySettled;

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
            {loading ? (
                <AdminV2RouteLoadingState variant="work_unit" />
            ) : wuShowPrimaryTransition ? (
                <AdminV2RouteLoadingState variant="queue">
                    {queuePicker ? <div className="min-w-0">{queuePicker}</div> : null}
                </AdminV2RouteLoadingState>
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
                        headerQueuePicker={queueModel ? queuePicker : null}
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

