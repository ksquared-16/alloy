"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { WorkspaceChrome } from "@/components/admin/workspace/WorkspaceChrome";
import WorkUnitWorkspace from "@/app/adminV2/components/workspace/shells/WorkUnitWorkspace";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { WorkUnitRouteSkeletonBody, WsRouteLoadingRibbon } from "@/components/admin/workspace/workspaceRouteSkeletons";
import { executeOpportunityRecordAction } from "@/lib/recordChrome/executeOpportunityRecordAction";
import type { WorkspaceAction } from "@/lib/ui-v2/workspace-actions";
import type { WorkUnitWorkspaceModel } from "@/lib/ui-v2/workspace-types";
import type { WorkspaceOpportunityQueueRuntime } from "@/lib/workspace/types";
import { buildRealOpportunityWorkUnitWorkspaceModel } from "@/lib/ui-v2/adapters/realWorkUnitFromOpportunities";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import { workspaceRouteParam } from "@/lib/workspace/workspaceRouteParam";

const WORKSPACE_BASE = "/adminV2/workspace";

type WorkUnitRow = {
    id: string;
    department_id: string;
    key: string | null;
    name: string | null;
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

export default function AdminV2OpportunityWorkUnitPage() {
    const params = useParams();
    const departmentId = workspaceRouteParam(params.departmentId);
    const workUnitId = workspaceRouteParam(params.workUnitId);
    const searchParams = useSearchParams();
    const { openDrawer, drawer } = useAdminDrawer();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [workUnit, setWorkUnit] = useState<WorkUnitRow | null>(null);
    const [dept, setDept] = useState<DeptRow | null>(null);
    const [oq, setOq] = useState<WorkspaceOpportunityQueueRuntime | null>(null);
    const [needsAttentionWorkUnitId, setNeedsAttentionWorkUnitId] = useState<string | null>(null);

    const [queueSummaries, setQueueSummaries] = useState<QueueSummary[] | null>(null);
    const [queueSummariesError, setQueueSummariesError] = useState<string | null>(null);
    const [queueSummariesRoute, setQueueSummariesRoute] = useState<string | null>(null);
    const [selectedQueueKey, setSelectedQueueKey] = useState<string | null>(null);

    const [queueItems, setQueueItems] = useState<QueueItemsResult | null>(null);
    const [queueItemsError, setQueueItemsError] = useState<string | null>(null);
    const [queueItemsRoute, setQueueItemsRoute] = useState<string | null>(null);
    const [queueItemsLoading, setQueueItemsLoading] = useState(false);

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
                try {
                    const route = `/api/admin/work-units/${encodeURIComponent(workUnitId)}/queues?limit=3`;
                    const res = await fetch(route, init);
                    const j = (await res.json().catch(() => ({}))) as { error?: string; queues?: QueueSummary[] };
                    // Temporary debug logging: helps confirm which path is taken in production.
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
                            setSelectedQueueKey(qs[0]?.key ?? null);
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
                        // Do NOT fall back on validation/query errors; show the error so we don't mask issues with legacy buckets.
                        shouldFallbackToLegacy = false;
                        fallbackReason = `queue_api_${res.status}`;
                        if (!cancelled) {
                            setQueueSummaries(null);
                            setQueueSummariesError(j.error ?? "Failed to load queues");
                            setQueueSummariesRoute(route);
                        }
                    }
                } catch (e) {
                    // Network/runtime failures: allow legacy fallback so the surface doesn't go blank.
                    shouldFallbackToLegacy = true;
                    fallbackReason = "queue_api_exception";
                    const route = `/api/admin/work-units/${encodeURIComponent(workUnitId)}/queues`;
                    console.warn("[adminV2][work-unit] queue summaries failed", { route, error: e });
                    if (!cancelled) {
                        setQueueSummaries(null);
                        setQueueSummariesError(e instanceof Error ? e.message : "Failed to load queues");
                        setQueueSummariesRoute(route);
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
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [departmentId, workUnitId]);

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

    useEffect(() => {
        if (!workUnitId || !selectedQueueKey) return;
        if (!queueSummaries || queueSummaries.length === 0) return;
        void fetchQueueItems(workUnitId, selectedQueueKey);
    }, [fetchQueueItems, queueSummaries, selectedQueueKey, workUnitId]);

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
        return (
            <div className="flex flex-wrap gap-2">
                {queueSummaries.map((q) => {
                    const selected = q.key === selectedQueueKey;
                    return (
                        <button
                            key={q.key}
                            type="button"
                            onClick={() => {
                                setSelectedQueueKey(q.key);
                                void fetchQueueItems(workUnitId, q.key);
                            }}
                            className={`rounded-md border px-3 py-2 text-left ${
                                selected ? "border-alloy-pine bg-alloy-stone/20" : "border-admin-border bg-admin-surface-card"
                            }`}
                            aria-pressed={selected}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <div className="text-sm font-medium text-alloy-forge truncate">{q.label}</div>
                                    {q.description ? (
                                        <div className="text-xs text-alloy-forge/60 truncate">{q.description}</div>
                                    ) : null}
                                </div>
                                <div className="text-xs text-alloy-forge/70 font-semibold">{q.count}</div>
                            </div>
                        </button>
                    );
                })}
            </div>
        );
    }, [fetchQueueItems, queueSummaries, queueSummariesError, queueSummariesRoute, selectedQueueKey, workUnitId]);

    const queueModel = useMemo<WorkUnitWorkspaceModel | null>(() => {
        if (!workUnit || !dept) return null;
        if (!queueSummaries) return null;

        const activeQueue = selectedQueueKey
            ? queueSummaries.find((q) => q.key === selectedQueueKey) ?? queueSummaries[0]
            : queueSummaries[0];

        const entity = queueItems?.queue.entity_type ?? activeQueue?.entity_type ?? "job";
        const items = (queueItems?.items ?? []) as any[];

        const vmItems = items.map((r) => {
            const rid = typeof r?.id === "string" ? r.id : null;
            const id = rid ?? `row_${Math.random().toString(16).slice(2)}`;
            const title =
                typeof r?.title === "string" && r.title.trim()
                    ? r.title.trim()
                    : rid
                      ? rid
                      : "Item";
            const subtitle =
                typeof r?.status_key === "string" && r.status_key.trim()
                    ? `status: ${r.status_key.trim()}`
                    : undefined;
            return {
                id,
                title,
                subtitle,
                quickActions: [],
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
                aiAwarenessLine:
                    entity === "job"
                        ? "Server-evaluated queues (previews only)."
                        : "Queue type not supported yet (previews only).",
            },
            laneInterpretation: {
                laneStatusLine:
                    queueItemsLoading
                        ? "Loading queue items…"
                        : `Queue: ${activeQueue?.key ?? "—"} · ${queueItems?.total ?? activeQueue?.count ?? 0} items`,
                recommendedActionLine:
                    entity === "job"
                        ? "Open a row to view the record in the drawer."
                        : "This queue type is not supported yet in the new queue engine.",
            },
            signals: [],
            kpis: [],
            primaryQueue: {
                id: `wu:${workUnit.id}:queue:${activeQueue?.key ?? "unknown"}`,
                title: laneTitle,
                countBadge: queueItems?.total ?? activeQueue?.count ?? 0,
                items: vmItems,
                sortCaption: errorLine ? errorLine : undefined,
                rollupSummary: activeQueue?.description,
            },
            workSummary: null,
            actionsRail: {
                primaries: [],
                systemActions: [{ id: "wu_back_department", label: "← Department overview", variant: "primary" }],
                quickOperations: [{ id: "wu_manage_work_units", label: "Configure work units" }],
                systemStatusLines: ["Rows are previews only; open a row to see full details."],
            },
            contextRail: { title: "About", groups: [] },
        };
    }, [dept, queueItems, queueItemsError, queueItemsLoading, queueItemsRoute, queueSummaries, selectedQueueKey, workUnit]);

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
        });
    }, [departmentId, dept, oq, searchParams, workUnit]);

    const onAction = useCallback(
        async (action: WorkspaceAction) => {
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
        [departmentId, needsAttentionWorkUnitId, openDrawer, queueItems?.queue.entity_type]
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
            {loading ? (
                <>
                    <WsRouteLoadingRibbon label="Loading work unit" />
                    <WorkUnitRouteSkeletonBody />
                </>
            ) : effectiveModel ? (
                <WorkUnitWorkspace model={effectiveModel} onAction={onAction} queuePicker={queueModel ? queuePicker : null} />
            ) : (
                <p className="text-sm text-alloy-ember px-1 py-4">{error ?? "Unable to load this work unit."}</p>
            )}
        </WorkspaceChrome>
    );
}

