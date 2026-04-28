"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { WorkspaceChrome } from "@/components/admin/workspace/WorkspaceChrome";
import WorkUnitWorkspace from "@/app/adminV2/components/workspace/shells/WorkUnitWorkspace";
import { AutomationWorkflowsBlock } from "@/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { WorkUnitRouteSkeletonBody, WsRouteLoadingRibbon } from "@/components/admin/workspace/workspaceRouteSkeletons";
import type { ResolvedActionForClient, ResolvedActionsBySlot } from "@/lib/admin/actions/types";
import { applyRegistryResolvedActionClient } from "@/lib/admin/actions/applyRegistryResolvedActionClient";
import { REGISTRY_RIGHT_RAIL_ACTION_ID_PREFIX } from "@/lib/workspace/viewModels/enrollmentRightRailMerge";
import { executeOpportunityRecordAction } from "@/lib/recordChrome/executeOpportunityRecordAction";
import type { WorkspaceAction } from "@/lib/ui-v2/workspace-actions";
import type { QueueItemQuickActionVm, WorkUnitWorkspaceModel } from "@/lib/ui-v2/workspace-types";
import type { WorkspaceOpportunityQueueRuntime } from "@/lib/workspace/types";
import { buildRealOpportunityWorkUnitWorkspaceModel } from "@/lib/ui-v2/adapters/realWorkUnitFromOpportunities";
import { buildEnrollmentWorkUnitActionsRail } from "@/lib/workspace/viewModels/enrollmentWorkUnitViewModel";
import { mergeEnrollmentRightRailActions } from "@/lib/workspace/viewModels/enrollmentRightRailMerge";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import { workspaceRouteParam } from "@/lib/workspace/workspaceRouteParam";
import { validateQueueDefinition, type QueueDefinitionV1 } from "@/lib/config/queueDefinitionSchema";
import { getQueueUiConfig, type QueueUiConfig, type QueueUiRowPreviewField } from "@/lib/ui-v2/queueUiConfig";

const WORKSPACE_BASE = "/adminV2/workspace";

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
};

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
    const { openDrawer, drawer } = useAdminDrawer();
    const debugEnabled =
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).has("debug");

    const [ctxDebug, setCtxDebug] = useState<{
        orgId: string;
        orgName: string | null;
        orgSlug: string | null;
    } | null>(null);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [workUnit, setWorkUnit] = useState<WorkUnitRow | null>(null);
    const [dept, setDept] = useState<DeptRow | null>(null);
    const [oq, setOq] = useState<WorkspaceOpportunityQueueRuntime | null>(null);
    const [needsAttentionWorkUnitId, setNeedsAttentionWorkUnitId] = useState<string | null>(null);
    const [opportunityQueueRowActions, setOpportunityQueueRowActions] = useState<QueueItemQuickActionVm[] | null>(null);
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

    const [workflowKpis, setWorkflowKpis] = useState<WorkflowKpis>(DEFAULT_WF_KPIS);
    const [workflowsSummary, setWorkflowsSummary] = useState<WorkflowSummaryRow[] | null>(null);

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
                    workUnitId,
                    error: j.error ?? null,
                });
            } catch (e) {
                console.warn("[adminV2][debug] ctx failed", { departmentId, workUnitId, error: e });
                if (!cancelled) setCtxDebug(null);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [debugEnabled, departmentId, workUnitId]);

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
                const queueListRoute = `/api/admin/work-units/${encodeURIComponent(workUnitId)}/queues?limit=3`;
                const actionsListRoute =
                    `/api/admin/actions?` +
                    new URLSearchParams({
                        surface: "queue_row",
                        entity_type: "opportunity",
                        work_unit_id: wu.id,
                        department_id: departmentId,
                    }).toString();
                const rightRailActionsRoute =
                    `/api/admin/actions?` +
                    new URLSearchParams({
                        surface: "right_rail",
                        entity_type: "opportunity",
                        work_unit_id: wu.id,
                        department_id: departmentId,
                    }).toString();

                let parsedQueueRowQuick: QueueItemQuickActionVm[] | null = null;
                let parsedRightRail: ResolvedActionForClient[] = [];
                const [queuesSettled, actionsSettled, rightRailSettled] = await Promise.allSettled([
                    fetch(queueListRoute, init),
                    fetch(actionsListRoute, init),
                    fetch(rightRailActionsRoute, init),
                ]);

                if (actionsSettled.status === "fulfilled") {
                    try {
                        const ar = actionsSettled.value;
                        const aj = (await ar.json().catch(() => ({}))) as { actions?: ResolvedActionsBySlot };
                        if (ar.ok) {
                            const row = aj.actions?.row_inline ?? [];
                            if (row.length) parsedQueueRowQuick = registryQuickActionsFromResolved(row);
                        }
                    } catch {
                        /* non-fatal */
                    }
                }

                if (rightRailSettled.status === "fulfilled") {
                    try {
                        const ar = rightRailSettled.value;
                        const aj = (await ar.json().catch(() => ({}))) as { actions?: ResolvedActionsBySlot };
                        if (ar.ok) {
                            parsedRightRail = aj.actions?.right_rail ?? [];
                        }
                    } catch {
                        /* non-fatal */
                    }
                }

                if (queuesSettled.status === "fulfilled") {
                    try {
                        const res = queuesSettled.value;
                        const j = (await res.json().catch(() => ({}))) as { error?: string; queues?: QueueSummary[] };
                        const route = queueListRoute;
                        console.info("[adminV2][work-unit] queue summaries", {
                            route,
                            status: res.status,
                            ok: res.ok,
                            keys: Array.isArray(j.queues) ? (j.queues ?? []).map((q) => q.key) : [],
                            error: j.error ?? null,
                        });
                        if (res.ok) {
                            usedNewQueueApi = true;
                            if (!cancelled) {
                                const qs = (j.queues ?? []) as QueueSummary[];
                                setQueueSummaries(qs);
                                setQueueSummariesError(null);
                                setQueueSummariesRoute(route);
                                const qFromUrl = (searchParams?.get("queue") ?? "").trim();
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
                        console.warn("[adminV2][work-unit] queue summaries failed", { route: queueListRoute, error: e });
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
                    console.warn("[adminV2][work-unit] queue summaries rejected", { route: queueListRoute, error: reason });
                    if (!cancelled) {
                        setQueueSummaries(null);
                        setQueueSummariesError(reason);
                        setQueueSummariesRoute(queueListRoute);
                    }
                }

                let oqRuntime: WorkspaceOpportunityQueueRuntime | null = null;
                if (!usedNewQueueApi && shouldFallbackToLegacy) {
                    console.info("[adminV2][work-unit] falling back to legacy opportunity runtime", {
                        reason: fallbackReason,
                        workUnitId,
                    });
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
                    console.info("[adminV2][work-unit] legacy fallback not used", {
                        reason: fallbackReason,
                        workUnitId,
                    });
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
                    setEnrollmentRightRailResolved(null);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [departmentId, searchParams, workUnitId]);

    const fetchQueueItems = useCallback(
        async (workUnitId: string, queueKey: string) => {
            const route = `/api/admin/queues/${encodeURIComponent(workUnitId)}/${encodeURIComponent(queueKey)}?limit=20&offset=0`;
            setQueueItemsLoading(true);
            setQueueItemsError(null);
            setQueueItemsRoute(route);
            try {
                const init = workspaceDataFetchInit();
                const res = await fetch(route, init);
                const json = (await res.json().catch(() => ({}))) as { error?: string };
                if (!res.ok) {
                    if (res.status === 501) throw new Error("Queue type not supported yet");
                    throw new Error(json.error ?? "Failed to load queue items");
                }
                setQueueItems(json as unknown as QueueItemsResult);
            } catch (e) {
                setQueueItems(null);
                setQueueItemsError(e instanceof Error ? e.message : "Failed to load queue items");
            } finally {
                setQueueItemsLoading(false);
            }
        },
        []
    );

    const invalidate = useCallback(
        (opts?: { entity_type?: string; entity_id?: string; action_key?: string }) => {
            void opts;
            if (!workUnitId || !selectedQueueKey) return;
            void fetchQueueItems(workUnitId, selectedQueueKey);
        },
        [fetchQueueItems, selectedQueueKey, workUnitId]
    );

    useEffect(() => {
        if (!workUnitId || !selectedQueueKey) return;
        const onUpdated = (ev: Event) => {
            const ce = ev as CustomEvent<{ id?: string }>;
            console.info("[adminV2] opportunity updated", { id: ce.detail?.id ?? null, selectedQueueKey });
            void fetchQueueItems(workUnitId, selectedQueueKey);
        };
        window.addEventListener("adminv2:opportunity-updated", onUpdated as EventListener);
        return () => window.removeEventListener("adminv2:opportunity-updated", onUpdated as EventListener);
    }, [fetchQueueItems, selectedQueueKey, workUnitId]);

    useEffect(() => {
        if (!workUnitId || !selectedQueueKey) return;
        if (!queueSummaries || queueSummaries.length === 0) return;
        void fetchQueueItems(workUnitId, selectedQueueKey);
    }, [fetchQueueItems, queueSummaries, selectedQueueKey, workUnitId]);

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
        const pillBase =
            "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 text-left text-[11px] font-semibold leading-tight transition-colors";
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
                                            ? "border-alloy-pine bg-alloy-stone/15 text-alloy-forge"
                                            : "border-admin-border bg-white/70 text-alloy-forge/80";
                                return (
                                    <button
                                        key={q.key}
                                        type="button"
                                        onClick={() => {
                                            setSelectedQueueKey(q.key);
                                            if (typeof window !== "undefined") {
                                                const url = new URL(window.location.href);
                                                url.searchParams.set("queue", q.key);
                                                router.replace(url.pathname + "?" + url.searchParams.toString());
                                            }
                                            void fetchQueueItems(workUnitId, q.key);
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
                                            {q.count}
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
        workUnitId,
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
                const note = typeof r?._notes_preview === "string" ? r._notes_preview.trim() : "";
                const attentionReason =
                    typeof r?._attention_reason_label === "string" ? r._attention_reason_label.trim() : "";

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

                const want = (f: QueueUiRowPreviewField) => isRowPreviewFieldEnabled(previewFields, f);

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
                    quickActions,
                    semanticCrmCompact:
                        previewCfg.variant === "crm_compact"
                            ? {
                                  primaryIdentity: familyTitle,
                                  childName: want("child_name") ? childName || null : null,
                                  stageLabel: null,
                                  statusLabel: want("status") ? statusLabel || null : null,
                                  nextStep:
                                      typeof r?._next_step_preview === "string" && r._next_step_preview.trim()
                                          ? r._next_step_preview.trim()
                                          : null,
                                  lastActivity: null,
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
                              }
                            : undefined,
                };
            });

        const laneTitle = activeQueue?.label ?? workUnit.name ?? "Queue";
        const errorLine = queueItemsError
            ? `${queueItemsError}${queueItemsRoute ? ` · Route: ${queueItemsRoute}` : ""}`
            : undefined;

        return {
            workspaceLevel: "work_unit",
            workUnitId: workUnit.id,
            departmentKey: dept.key ?? undefined,
            laneKey: `queue:${activeQueue?.key ?? "unknown"}`,
            focusLabel: dept.name ?? "Department",
            aiSummary: {
                headline: laneTitle,
                subline: `${dept.name ?? "Department"} · ${workUnit.name ?? "Work unit"}`,
                aiAwarenessLine: entity === "job" ? "Server-evaluated queues (previews only)." : undefined,
            },
            laneInterpretation:
                entity === "job"
                    ? {
                          laneStatusLine: queueItemsLoading
                              ? "Loading queue items…"
                              : `Queue: ${activeQueue?.key ?? "—"} · ${queueItems?.total ?? activeQueue?.count ?? 0} items`,
                          recommendedActionLine: "Open a row to view the record in the drawer.",
                      }
                    : null,
            signals: [],
            kpis: [],
            primaryQueue: {
                id: `wu:${workUnit.id}:queue:${activeQueue?.key ?? "unknown"}`,
                // Title lives in the shell headline + queue pills; body starts with rows only.
                title: "",
                countBadge: queueItems?.total ?? activeQueue?.count ?? 0,
                items: vmItems,
                sortCaption: errorLine ? errorLine : undefined,
                rollupSummary: undefined,
            },
            workSummary: null,
            actionsRail: (() => {
                const isEnrollmentDept = (dept.key ?? "").trim().toLowerCase() === "enrollment";
                const base = isEnrollmentDept
                    ? buildEnrollmentWorkUnitActionsRail()
                    : {
                          primaries: [],
                          systemActions: [
                              { id: "wu_back_department", label: "← Department overview", variant: "primary" as const },
                          ],
                          quickOperations: [{ id: "wu_manage_work_units", label: "Configure work units" }],
                      };
                return isEnrollmentDept
                    ? mergeEnrollmentRightRailActions(enrollmentRightRailResolved ?? [], base)
                    : base;
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

        const filteredItems = rawItems.filter((it) => {
            if (statusKeys.length) {
                const sk = String(it.status_key ?? "").trim().toLowerCase();
                if (!statusKeys.includes(sk)) return false;
            }
            if (attentionReason) {
                const rl = String((it as { _attention_reason_label?: string | null })._attention_reason_label ?? "").trim();
                if (rl !== attentionReason) return false;
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
                    console.warn("[work-unit] action execute failed", json.error);
                    return;
                }
                const er = json.execution_result;
                if (er?.kind === "start_workflow" && typeof er.workflow_run_id === "string" && er.workflow_run_id.trim()) {
                    setActionFeedback(`Workflow run ${er.workflow_run_id.trim().slice(0, 8)}… completed.`);
                }
                if (er?.kind === "open_drawer") {
                    if (er.drawer?.defaultSurface === "quote_intake") {
                        openDrawer({ type: "opportunities", id: action.itemId, defaultOpportunitySurface: "quote_intake" });
                    } else {
                        openDrawer({ type: "opportunities", id: action.itemId });
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
                    openDrawer({ type: "opportunities", id: action.itemId });
                    return;
                }
            }
            if (action.type === "queue.item.action" && action.actionId === "open_record") {
                openDrawer({ type: "opportunities", id: action.itemId });
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
                    openDrawer({ type: "opportunities", id: action.itemId, defaultOpportunitySurface: "quote_intake" });
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
                    window.location.href = "/admin/opportunities";
                    return;
                }
                if (action.actionId === "wu_new_inquiry") {
                    window.location.href = "/admin/opportunities";
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
                    window.location.href = "/admin/system/work-units";
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
            needsAttentionWorkUnitId,
            openDrawer,
            queueItems?.queue.entity_type,
            router,
            workUnit?.id,
        ]
    );

    const deptName = dept?.name?.trim() || "Department";
    const wuName = workUnit?.name?.trim() || "Work unit";
    const effectiveModel = queueModel ?? model;

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
                        <span>route dept:</span> <span className="font-mono">{departmentId}</span>{" "}
                        <span className="ml-2">work unit:</span> <span className="font-mono">{workUnitId}</span>
                    </div>
                </div>
            ) : null}
            {loading ? (
                <>
                    <WsRouteLoadingRibbon label="Loading work unit" />
                    <WorkUnitRouteSkeletonBody />
                </>
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
                        queueRowsLoading={queueItemsLoading && !queueItems}
                        primaryFooterSlot={
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
                    />
                </>
            ) : (
                <p className="text-sm text-alloy-ember px-1 py-4">{error ?? "Unable to load this work unit."}</p>
            )}
        </WorkspaceChrome>
    );
}

