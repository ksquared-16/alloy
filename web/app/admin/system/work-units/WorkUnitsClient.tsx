"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import SettingsPageHeader from "@/components/adminV2/settings/SettingsPageHeader";
import SectionCard from "@/components/admin/SectionCard";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { getQueueDefinitionStoredVersion } from "@/lib/rrs/queue/queueDefinitionV1";
import { validateQueueDefinition } from "@/lib/config/queueDefinitionSchema";
import type { DepartmentRow } from "../departments/DepartmentsClient";
import { dedupeAdminFetchWithTtl } from "@/lib/workspace/workspaceAdminFetchDedupe";
import RuntimeMetadataReadOnlyPanel from "@/components/adminV2/settings/RuntimeMetadataReadOnlyPanel";

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

export type WorkUnitRow = {
    id: string;
    org_id: string;
    department_id: string;
    key: string;
    name: string;
    description: string | null;
    sort_order: number;
    is_active: boolean;
    queue_definition: Record<string, unknown>;
    /** JSONB — opportunity attention, activity signals, etc. (read-only in Settings UI). */
    metadata?: unknown;
    created_at: string;
    updated_at: string | null;
};

const KEY_REGEX = /^[a-z0-9_]{2,64}$/;

function stringifyQueue(q: Record<string, unknown>): string {
    try {
        return JSON.stringify(q ?? {}, null, 2);
    } catch {
        return "{}";
    }
}

export default function WorkUnitsClient({ adminV2Chrome = false }: { adminV2Chrome?: boolean } = {}) {
    const { canMutate } = useAdminAuth();
    const [departments, setDepartments] = useState<DepartmentRow[]>([]);
    const [items, setItems] = useState<WorkUnitRow[]>([]);
    const [filterDeptId, setFilterDeptId] = useState<string>("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [modalOpen, setModalOpen] = useState(false);
    const [modalId, setModalId] = useState<string | null>(null);
    const [modalDeptId, setModalDeptId] = useState("");
    const [modalKey, setModalKey] = useState("");
    const [modalName, setModalName] = useState("");
    const [modalDescription, setModalDescription] = useState("");
    const [modalSortOrder, setModalSortOrder] = useState(0);
    const [modalActive, setModalActive] = useState(true);
    const [modalQueueJson, setModalQueueJson] = useState("{}");
    /** Optimistic concurrency for PATCH `queue_definition` (see `expected_queue_definition_version`). */
    const [modalQueueExpectedVersion, setModalQueueExpectedVersion] = useState(0);
    /** Effective metadata from list API — not edited in this modal */
    const [modalMetadata, setModalMetadata] = useState<unknown>(null);
    const [modalSaving, setModalSaving] = useState(false);
    const [modalError, setModalError] = useState<string | null>(null);

    const [queuesLoading, setQueuesLoading] = useState(false);
    const [queuesError, setQueuesError] = useState<string | null>(null);
    const [queuesRoute, setQueuesRoute] = useState<string | null>(null);
    const [queueSummaries, setQueueSummaries] = useState<QueueSummary[]>([]);
    const [selectedQueueKey, setSelectedQueueKey] = useState<string | null>(null);

    const [queueItemsLoading, setQueueItemsLoading] = useState(false);
    const [queueItemsError, setQueueItemsError] = useState<string | null>(null);
    const [queueItemsRoute, setQueueItemsRoute] = useState<string | null>(null);
    const [queueItemsResult, setQueueItemsResult] = useState<QueueItemsResult | null>(null);

    const [statusOptionsOpp, setStatusOptionsOpp] = useState<Array<{ value: string; label: string }>>([]);

    const modalQueueBuckets = useMemo(() => {
        try {
            const raw = JSON.parse((modalQueueJson ?? "").trim() || "{}") as unknown;
            const parsed = validateQueueDefinition(raw);
            return {
                ok: true as const,
                value: parsed,
            };
        } catch (e) {
            return {
                ok: false as const,
                error: e instanceof Error ? e.message : "Invalid queue definition",
            };
        }
    }, [modalQueueJson]);

    const modalQueueStatusKeysByQueueKey = useMemo(() => {
        const out = new Map<string, string[]>();
        if (!modalQueueBuckets.ok) return out;
        for (const q of modalQueueBuckets.value.queues) {
            const statusKeys: string[] = [];
            for (const f of q.filters ?? []) {
                if (!f || typeof f !== "object") continue;
                const ff = f as Record<string, unknown>;
                if (ff.type === "status" && ff.operator === "in" && Array.isArray(ff.values)) {
                    for (const v of ff.values) if (typeof v === "string" && v.trim()) statusKeys.push(v.trim());
                }
            }
            if (statusKeys.length) out.set(q.key, statusKeys);
        }
        return out;
    }, [modalQueueJson, modalQueueBuckets.ok]);

    type BucketSection = "pipeline" | "attention" | "internal";
    type QueueBucketEditorRow = {
        key: string;
        label: string;
        section: BucketSection;
        status_keys: string[];
    };

    const [queueEditorEnabled, setQueueEditorEnabled] = useState(false);
    const [queueEditorRows, setQueueEditorRows] = useState<QueueBucketEditorRow[]>([]);
    const [queueEditorExcludedStatusKeys, setQueueEditorExcludedStatusKeys] = useState<string[]>([]);
    const [queueEditorErrors, setQueueEditorErrors] = useState<string[]>([]);
    const [queueEditorWarnings, setQueueEditorWarnings] = useState<string[]>([]);

    useEffect(() => {
        if (!modalOpen) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await dedupeAdminFetchWithTtl(
                    "/api/admin/status-options?entity_type=opportunities",
                    { credentials: "include" },
                    60_000
                );
                const json = (await res.json().catch(() => ({}))) as {
                    options?: Array<{ status_key?: string; status_label?: string }>;
                };
                const opts = Array.isArray(json.options)
                    ? json.options
                          .map((o) => ({
                              value: String(o.status_key ?? "").trim(),
                              label: String(o.status_label ?? o.status_key ?? "").trim(),
                          }))
                          .filter((o) => o.value)
                    : [];
                if (!cancelled) setStatusOptionsOpp(opts);
            } catch {
                if (!cancelled) setStatusOptionsOpp([]);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [modalOpen]);

    useEffect(() => {
        if (!modalOpen) return;
        if (!modalQueueBuckets.ok || modalQueueBuckets.value.entity_type !== "opportunity") {
            setQueueEditorEnabled(false);
            setQueueEditorRows([]);
            setQueueEditorExcludedStatusKeys([]);
            setQueueEditorErrors([]);
            setQueueEditorWarnings([]);
            return;
        }

        const def = modalQueueBuckets.value;
        const pipelineKeys = def.ui?.sections?.find((s) => (s.tone ?? "standard") !== "critical")?.queue_keys ?? [];
        const attentionKeys =
            def.ui?.sections?.find((s) => (s.tone ?? "standard") === "critical")?.queue_keys ??
            def.ui?.sections?.find((s) => s.key.toLowerCase().includes("attention"))?.queue_keys ??
            [];
        const pipeline = new Set(pipelineKeys);
        const attention = new Set(attentionKeys);

        const statusKeysForQueue = (filters: unknown): string[] => {
            if (!Array.isArray(filters)) return [];
            const out: string[] = [];
            for (const f of filters) {
                if (!f || typeof f !== "object") continue;
                const ff = f as Record<string, unknown>;
                if (ff.type === "status" && ff.operator === "in" && Array.isArray(ff.values)) {
                    for (const v of ff.values) if (typeof v === "string" && v.trim()) out.push(v.trim());
                }
            }
            return out;
        };

        const rows: QueueBucketEditorRow[] = [];
        for (const q of def.queues) {
            const key = String(q.key ?? "").trim();
            const label = String(q.label ?? "").trim();
            const section: BucketSection = attention.has(key) ? "attention" : pipeline.has(key) ? "pipeline" : "internal";
            rows.push({
                key,
                label: label || key,
                section,
                status_keys: statusKeysForQueue(q.filters),
            });
        }
        setQueueEditorRows(rows);
        setQueueEditorExcludedStatusKeys([]);
        setQueueEditorEnabled(true);
    }, [modalOpen, modalQueueBuckets.ok]);

    const queueEditorValidation = useMemo(() => {
        if (!queueEditorEnabled) return { errors: [] as string[], warnings: [] as string[] };
        const errors: string[] = [];
        const warnings: string[] = [];

        const pipelineBuckets = queueEditorRows.filter((r) => r.section === "pipeline");
        const attentionBuckets = queueEditorRows.filter((r) => r.section === "attention");

        if (pipelineBuckets.some((b) => b.key === "needs_attention")) {
            errors.push("needs_attention must not be in the pipeline section.");
        }

        const internalWithStatus = queueEditorRows.filter((r) => r.section === "internal" && r.status_keys.length > 0);
        if (internalWithStatus.length) {
            warnings.push("Some internal buckets have status mappings; they will not appear in UI sections.");
        }

        const seen = new Map<string, string>();
        for (const b of pipelineBuckets) {
            for (const sk of b.status_keys) {
                const prev = seen.get(sk);
                if (prev && prev !== b.key) {
                    errors.push(`Status ${sk} appears in multiple pipeline buckets: ${prev}, ${b.key}.`);
                } else {
                    seen.set(sk, b.key);
                }
            }
        }

        const activeStatusKeys = statusOptionsOpp.map((o) => o.value);
        const excluded = new Set(queueEditorExcludedStatusKeys);
        const covered = new Set<string>();
        for (const b of pipelineBuckets) for (const sk of b.status_keys) covered.add(sk);
        const missing = activeStatusKeys.filter((sk) => !covered.has(sk) && !excluded.has(sk));
        if (missing.length) {
            errors.push(`Active statuses must be mapped or excluded. Missing: ${missing.join(", ")}.`);
        }

        const needsInAttention = attentionBuckets.some((b) => b.key === "needs_attention");
        if (queueEditorRows.some((b) => b.key === "needs_attention") && !needsInAttention) {
            warnings.push("needs_attention is present but not assigned to the attention section.");
        }

        return { errors, warnings };
    }, [queueEditorEnabled, queueEditorRows, queueEditorExcludedStatusKeys, statusOptionsOpp]);

    useEffect(() => {
        setQueueEditorErrors(queueEditorValidation.errors);
        setQueueEditorWarnings(queueEditorValidation.warnings);
    }, [queueEditorValidation.errors, queueEditorValidation.warnings]);

    function buildQueueDefinitionFromEditor(): Record<string, unknown> {
        const rows = queueEditorRows
            .map((r) => ({
                key: r.key.trim(),
                label: r.label.trim() || r.key.trim(),
                section: r.section,
                status_keys: r.status_keys.map((s) => s.trim()).filter(Boolean),
            }))
            .filter((r) => r.key);

        const pipelineStatusKeys = Array.from(
            new Set(rows.filter((r) => r.section === "pipeline").flatMap((r) => r.status_keys))
        );

        const queues = rows.map((r) => ({
            key: r.key,
            label: r.label,
            filters:
                r.key === "needs_attention"
                    ? [{ type: "exception", operator: "exists" }]
                    : [{ type: "status", operator: "in", values: r.status_keys }],
            sort: [{ field: "updated_at", direction: r.section === "pipeline" ? "desc" : "asc" }],
            limit: 50,
            priority: r.key === "needs_attention" ? "critical" : "standard",
            display: "list",
        }));

        if (!queues.some((q) => q.key === "pipeline_total")) {
            queues.push({
                key: "pipeline_total",
                label: "Pipeline total",
                filters: [{ type: "status", operator: "in", values: pipelineStatusKeys }],
                sort: [{ field: "updated_at", direction: "desc" }],
                limit: 1,
                priority: "standard",
                display: "list",
            });
        }

        const pipelineKeys = rows.filter((r) => r.section === "pipeline").map((r) => r.key);
        const attentionKeys = rows.filter((r) => r.section === "attention").map((r) => r.key);

        return {
            version: 1,
            entity_type: "opportunity",
            ui: {
                layout: "pipeline_with_attention",
                primary_total_label: "Pipeline families",
                primary_total_queue: "pipeline_total",
                sections: [
                    { key: "pipeline", label: "Pipeline", queue_keys: pipelineKeys },
                    { key: "attention", label: "Needs Attention", tone: "critical", queue_keys: attentionKeys },
                ],
            },
            queues,
        };
    }

    const deptNameById = useMemo(() => {
        const m = new Map<string, string>();
        for (const d of departments) m.set(d.id, d.name);
        return m;
    }, [departments]);

    const fetchDepartments = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/departments");
            const json = await res.json().catch(() => ({}));
            if (res.ok) setDepartments((json as { items?: DepartmentRow[] }).items ?? []);
        } catch {
            setDepartments([]);
        }
    }, []);

    const fetchItems = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const q = filterDeptId ? `?department_id=${encodeURIComponent(filterDeptId)}` : "";
            const res = await fetch(`/api/admin/work-units${q}`);
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Failed to load");
            const raw = (json as { items?: WorkUnitRow[] }).items ?? [];
            setItems(
                raw.map((r) => ({
                    ...r,
                    queue_definition:
                        typeof r.queue_definition === "object" && r.queue_definition !== null
                            ? (r.queue_definition as Record<string, unknown>)
                            : {},
                }))
            );
        } catch (e) {
            setError((e as Error).message);
            setItems([]);
        } finally {
            setLoading(false);
        }
    }, [filterDeptId]);

    useEffect(() => {
        fetchDepartments();
    }, [fetchDepartments]);

    useEffect(() => {
        fetchItems();
    }, [fetchItems]);

    const sortedForDisplay = useMemo(() => {
        return [...items].sort((a, b) => {
            const da = deptNameById.get(a.department_id) ?? "";
            const db = deptNameById.get(b.department_id) ?? "";
            if (da !== db) return da.localeCompare(db);
            if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
            return a.name.localeCompare(b.name);
        });
    }, [items, deptNameById]);

    const openCreate = () => {
        setModalId(null);
        setModalDeptId(filterDeptId || (departments[0]?.id ?? ""));
        setModalKey("");
        setModalName("");
        setModalDescription("");
        setModalSortOrder(0);
        setModalActive(true);
        setModalQueueJson("{}");
        setModalQueueExpectedVersion(0);
        setModalMetadata(null);
        setModalError(null);
        setQueuesLoading(false);
        setQueuesError(null);
        setQueuesRoute(null);
        setQueueSummaries([]);
        setSelectedQueueKey(null);
        setQueueItemsLoading(false);
        setQueueItemsError(null);
        setQueueItemsRoute(null);
        setQueueItemsResult(null);
        setModalOpen(true);
    };

    const openEdit = (row: WorkUnitRow) => {
        setModalId(row.id);
        setModalDeptId(row.department_id);
        setModalKey(row.key);
        setModalName(row.name);
        setModalDescription(row.description ?? "");
        setModalSortOrder(row.sort_order);
        setModalActive(row.is_active);
        setModalQueueJson(stringifyQueue(row.queue_definition));
        setModalQueueExpectedVersion(getQueueDefinitionStoredVersion(row.queue_definition));
        setModalMetadata(row.metadata ?? null);
        setModalError(null);
        setQueuesLoading(false);
        setQueuesError(null);
        setQueuesRoute(null);
        setQueueSummaries([]);
        setSelectedQueueKey(null);
        setQueueItemsLoading(false);
        setQueueItemsError(null);
        setQueueItemsRoute(null);
        setQueueItemsResult(null);
        setModalOpen(true);
    };

    const fetchQueueSummaries = useCallback(async (workUnitId: string) => {
        setQueuesLoading(true);
        setQueuesError(null);
        const route = `/api/admin/work-units/${workUnitId}/queues`;
        setQueuesRoute(route);
        try {
            const res = await fetch(route);
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                const msg = (json as { error?: string }).error ?? "Failed to load queues";
                throw new Error(msg);
            }
            setQueueSummaries(((json as { queues?: QueueSummary[] }).queues ?? []) as QueueSummary[]);
        } catch (e) {
            setQueueSummaries([]);
            setQueuesError((e as Error).message);
        } finally {
            setQueuesLoading(false);
        }
    }, []);

    const fetchQueueItems = useCallback(async (workUnitId: string, queueKey: string) => {
        setQueueItemsLoading(true);
        setQueueItemsError(null);
        const route = `/api/admin/queues/${encodeURIComponent(workUnitId)}/${encodeURIComponent(queueKey)}?limit=20&offset=0`;
        setQueueItemsRoute(route);
        try {
            const res = await fetch(route);
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                const status = res.status;
                if (status === 501) {
                    throw new Error("Queue type not supported yet");
                }
                const msg = (json as { error?: string }).error ?? "Failed to load queue items";
                throw new Error(msg);
            }
            setQueueItemsResult(json as QueueItemsResult);
        } catch (e) {
            setQueueItemsResult(null);
            setQueueItemsError((e as Error).message);
        } finally {
            setQueueItemsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!modalOpen || !modalId) return;
        fetchQueueSummaries(modalId);
    }, [modalOpen, modalId, fetchQueueSummaries]);

    const entityHref = useCallback((entityType: QueueSummary["entity_type"] | undefined, id: string) => {
        if (entityType === "job") return `/admin/jobs/${id}`;
        if (entityType === "schedule") return `/admin/schedules/${id}`;
        if (entityType === "opportunity") return `/admin/opportunities/${id}`;
        return null;
    }, []);

    const saveModal = async () => {
        if (!canMutate) return;
        const key = modalKey
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, "_")
            .replace(/_+/g, "_")
            .replace(/^_|_$/g, "");
        if (!key || !KEY_REGEX.test(key)) {
            setModalError("Key: 2–64 chars, lowercase letters, numbers, underscores only.");
            return;
        }
        if (!modalName.trim()) {
            setModalError("Name is required.");
            return;
        }
        if (!modalDeptId) {
            setModalError("Department is required.");
            return;
        }
        let queueParsed: Record<string, unknown>;
        try {
            let jsonText = modalQueueJson.trim() || "{}";
            if (queueEditorEnabled) {
                if (queueEditorErrors.length) {
                    setModalError(queueEditorErrors[0] ?? "Queue definition validation failed.");
                    return;
                }
                const built = buildQueueDefinitionFromEditor();
                const nextJson = JSON.stringify(built, null, 2);
                jsonText = nextJson;
                setModalQueueJson(nextJson);
            }
            const p = JSON.parse(jsonText) as unknown;
            if (typeof p !== "object" || p === null || Array.isArray(p)) {
                setModalError("Queue definition must be a JSON object.");
                return;
            }
            queueParsed = p as Record<string, unknown>;
        } catch {
            setModalError("Invalid JSON in queue definition.");
            return;
        }
        const touchesQueueDefinition = Object.keys(queueParsed).length > 0;

        setModalSaving(true);
        setModalError(null);
        try {
            if (modalId) {
                const patchBody: Record<string, unknown> = {
                    department_id: modalDeptId,
                    key,
                    name: modalName.trim(),
                    description: modalDescription.trim() || null,
                    sort_order: modalSortOrder,
                    is_active: modalActive,
                };
                if (touchesQueueDefinition) {
                    patchBody.queue_definition = queueParsed;
                    patchBody.expected_queue_definition_version = modalQueueExpectedVersion;
                }
                const res = await fetch(`/api/admin/work-units/${modalId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(patchBody),
                });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error((json as { error?: string }).error ?? "Save failed");
            } else {
                const queue_definition = queueParsed;
                const res = await fetch("/api/admin/work-units", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        department_id: modalDeptId,
                        key,
                        name: modalName.trim(),
                        description: modalDescription.trim() || null,
                        sort_order: modalSortOrder,
                        is_active: modalActive,
                        queue_definition,
                    }),
                });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error((json as { error?: string }).error ?? "Create failed");
            }
            setModalOpen(false);
            await fetchItems();
        } catch (e) {
            setModalError((e as Error).message);
        } finally {
            setModalSaving(false);
        }
    };

    const remove = async (row: WorkUnitRow) => {
        if (!canMutate) return;
        if (!window.confirm(`Delete work unit “${row.name}”? Jobs linked to it will clear work_unit_id.`)) return;
        const res = await fetch(`/api/admin/work-units/${row.id}`, { method: "DELETE" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
            alert((json as { error?: string }).error ?? "Delete failed");
            return;
        }
        await fetchItems();
    };

    const addWuAction = canMutate ? (
        <button
            type="button"
            onClick={openCreate}
            disabled={departments.length === 0}
            className="rounded-lg bg-alloy-pine px-4 py-2 text-sm font-medium text-white hover:bg-alloy-pine/90 disabled:opacity-50"
            data-testid="work-units-add-button"
        >
            Add Work Unit
        </button>
    ) : null;

    return (
        <div>
            {adminV2Chrome ? (
                <SettingsPageHeader
                    title="Work Units & Queues"
                    subtitle="Pipeline lanes where staff work inquiries by lifecycle stage. Use the queue editor for day-to-day changes."
                    actions={addWuAction}
                />
            ) : (
                <AdminPageHeader
                    title="Work units"
                    subtitle="Operational queues or cohorts within a department."
                    actions={addWuAction}
                />
            )}

            <SectionCard title="Filter">
                <label className="flex flex-wrap items-center gap-2 text-sm text-alloy-forge">
                    <span>Department</span>
                    <select
                        className="border border-admin-border rounded-md px-3 py-2 text-sm min-w-[200px]"
                        value={filterDeptId}
                        onChange={(e) => setFilterDeptId(e.target.value)}
                    >
                        <option value="">All departments</option>
                        {departments.map((d) => (
                            <option key={d.id} value={d.id}>
                                {d.name}
                            </option>
                        ))}
                    </select>
                </label>
                {departments.length === 0 ? (
                    <p className="mt-2 text-sm text-amber-700">Create at least one department first.</p>
                ) : null}
            </SectionCard>

            <SectionCard title="Work units">
                {loading ? (
                    <p className="text-sm text-alloy-forge/70">Loading…</p>
                ) : error ? (
                    <p className="text-sm text-red-600">{error}</p>
                ) : sortedForDisplay.length === 0 ? (
                    <div className="space-y-3">
                        <p className="text-sm text-alloy-forge/70">No work units yet.</p>
                        {canMutate && departments.length > 0 ? (
                            <button
                                type="button"
                                onClick={openCreate}
                                className="rounded-lg bg-alloy-pine px-4 py-2 text-sm font-medium text-white hover:bg-alloy-pine/90"
                                data-testid="work-units-add-button-empty"
                            >
                                Add Work Unit
                            </button>
                        ) : null}
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left border-collapse">
                            <thead>
                                <tr className="border-b border-admin-border text-alloy-forge/70">
                                    <th className="py-2 pr-4 font-medium">Department</th>
                                    <th className="py-2 pr-4 font-medium">Name</th>
                                    <th className="py-2 pr-4 font-medium">Key</th>
                                    <th className="py-2 pr-4 font-medium">Sort</th>
                                    <th className="py-2 pr-4 font-medium">Active</th>
                                    <th className="py-2 pr-4 font-medium w-40">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedForDisplay.map((row) => (
                                    <tr key={row.id} className="border-b border-admin-border/60">
                                        <td className="py-2 pr-4 text-alloy-forge">{deptNameById.get(row.department_id) ?? row.department_id.slice(0, 8)}</td>
                                        <td className="py-2 pr-4 font-medium text-alloy-forge">
                                            {row.name}
                                            {adminV2Chrome && row.key === "enrollment_pipeline" ? (
                                                <span className="mt-0.5 block text-[11px] font-normal text-alloy-pine/90">
                                                    Enrollment lifecycle queues
                                                </span>
                                            ) : null}
                                        </td>
                                        <td className="py-2 pr-4 font-mono text-xs">{row.key}</td>
                                        <td className="py-2 pr-4">{row.sort_order}</td>
                                        <td className="py-2 pr-4">{row.is_active ? "Yes" : "No"}</td>
                                        <td className="py-2 pr-4 space-x-2">
                                            {canMutate ? (
                                                <>
                                                    <button type="button" className="text-alloy-pine text-sm font-medium" onClick={() => openEdit(row)}>
                                                        Edit
                                                    </button>
                                                    <button type="button" className="text-red-600 text-sm font-medium" onClick={() => remove(row)}>
                                                        Delete
                                                    </button>
                                                </>
                                            ) : (
                                                <span className="text-alloy-forge/50 text-sm">View only</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </SectionCard>

            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-alloy-midnight/40 overflow-y-auto">
                    <div className="bg-admin-surface-card border border-admin-border rounded-xl shadow-lg max-w-3xl w-full my-8 max-h-[min(92vh,900px)] flex flex-col">
                        <div className="shrink-0 border-b border-admin-border px-6 py-4">
                            <h2 className="text-lg font-semibold text-alloy-forge">
                                {modalId ? "Edit work unit" : "New work unit"}
                            </h2>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 space-y-3">
                            <label className="block text-sm">
                                <span className="text-alloy-forge/80">Department</span>
                                <select
                                    className="mt-1 w-full border border-admin-border rounded-md px-3 py-2 text-sm"
                                    value={modalDeptId}
                                    onChange={(e) => setModalDeptId(e.target.value)}
                                >
                                    <option value="">Select…</option>
                                    {departments.map((d) => (
                                        <option key={d.id} value={d.id}>
                                            {d.name}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="block text-sm">
                                <span className="text-alloy-forge/80">Key</span>
                                <input
                                    className="mt-1 w-full border border-admin-border rounded-md px-3 py-2 text-sm"
                                    value={modalKey}
                                    onChange={(e) => setModalKey(e.target.value)}
                                />
                            </label>
                            <label className="block text-sm">
                                <span className="text-alloy-forge/80">Name</span>
                                <input
                                    className="mt-1 w-full border border-admin-border rounded-md px-3 py-2 text-sm"
                                    value={modalName}
                                    onChange={(e) => setModalName(e.target.value)}
                                />
                            </label>
                            <label className="block text-sm">
                                <span className="text-alloy-forge/80">Description</span>
                                <textarea
                                    className="mt-1 w-full border border-admin-border rounded-md px-3 py-2 text-sm min-h-[64px]"
                                    value={modalDescription}
                                    onChange={(e) => setModalDescription(e.target.value)}
                                />
                            </label>
                            <label className="block text-sm">
                                <span className="text-alloy-forge/80">Sort order</span>
                                <input
                                    type="number"
                                    className="mt-1 w-full border border-admin-border rounded-md px-3 py-2 text-sm"
                                    value={modalSortOrder}
                                    onChange={(e) => setModalSortOrder(Number(e.target.value))}
                                />
                            </label>
                            {adminV2Chrome ? (
                                <details className="rounded-lg border border-dashed border-admin-border/80 bg-alloy-stone/[0.04]">
                                    <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-alloy-forge/70">
                                        Advanced — technical metadata
                                    </summary>
                                    <div className="border-t border-admin-border/60 px-3 py-2">
                                        <RuntimeMetadataReadOnlyPanel
                                            metadata={modalMetadata}
                                            entity="work_unit"
                                            isNewRow={!modalId}
                                        />
                                    </div>
                                </details>
                            ) : (
                                <RuntimeMetadataReadOnlyPanel metadata={modalMetadata} entity="work_unit" isNewRow={!modalId} />
                            )}
                            <details className="rounded-lg border border-admin-border/60 bg-white/50" data-testid="work-units-queue-json-advanced">
                                <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-alloy-forge/80">
                                    Advanced — queue definition (JSON)
                                </summary>
                                <label className="block px-3 pb-3 text-sm">
                                    <span className="sr-only">Queue definition JSON</span>
                                    <textarea
                                        className="mt-1 w-full border border-admin-border rounded-md px-3 py-2 text-sm font-mono text-xs min-h-[120px]"
                                        value={modalQueueJson}
                                        onChange={(e) => setModalQueueJson(e.target.value)}
                                    />
                                </label>
                            </details>
                            <div className="rounded-lg border border-admin-border/60 bg-white/70 px-3 py-2">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="text-[11px] font-semibold tracking-wide text-alloy-forge/55">
                                        Queue Definition Editor (beta)
                                    </div>
                                    <label className="flex items-center gap-2 text-xs text-alloy-forge/70">
                                        <input
                                            type="checkbox"
                                            checked={queueEditorEnabled}
                                            onChange={(e) => setQueueEditorEnabled(e.target.checked)}
                                            disabled={!modalQueueBuckets.ok || modalQueueBuckets.value.entity_type !== "opportunity"}
                                        />
                                        Enable
                                    </label>
                                </div>
                                {!modalQueueBuckets.ok ? (
                                    <div className="mt-1 text-xs text-alloy-forge/60">
                                        Not parseable as queue_definition v1. Fix JSON to enable the editor.
                                    </div>
                                ) : modalQueueBuckets.value.entity_type !== "opportunity" ? (
                                    <div className="mt-1 text-xs text-alloy-forge/60">
                                        Editor currently supports opportunity queues only.
                                    </div>
                                ) : !queueEditorEnabled ? (
                                    <div className="mt-1 text-xs text-alloy-forge/60">
                                        Edit buckets + status mappings with validation (still saves to JSON).
                                    </div>
                                ) : (
                                    <div className="mt-3 space-y-3">
                                        {queueEditorErrors.length ? (
                                            <div className="rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-800">
                                                <div className="font-semibold">Blocking validation error</div>
                                                <ul className="mt-1 list-disc pl-5 space-y-0.5">
                                                    {queueEditorErrors.map((m) => (
                                                        <li key={`qe:${m}`}>{m}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        ) : null}
                                        {queueEditorWarnings.length ? (
                                            <div className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
                                                <div className="font-semibold">Warnings</div>
                                                <ul className="mt-1 list-disc pl-5 space-y-0.5">
                                                    {queueEditorWarnings.map((m) => (
                                                        <li key={`qw:${m}`}>{m}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        ) : null}

                                        <div className="space-y-2">
                                            {queueEditorRows.map((r, idx) => (
                                                <div key={`b:${idx}:${r.key}`} className="rounded-md border border-admin-border/60 bg-white px-2.5 py-2">
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                                        <label className="block text-xs">
                                                            <span className="text-alloy-forge/70 font-semibold">Key</span>
                                                            <input
                                                                className="mt-1 w-full border border-admin-border rounded-md px-2 py-1 text-xs font-mono"
                                                                value={r.key}
                                                                onChange={(e) =>
                                                                    setQueueEditorRows((prev) =>
                                                                        prev.map((x, j) => (j === idx ? { ...x, key: e.target.value } : x))
                                                                    )
                                                                }
                                                            />
                                                        </label>
                                                        <label className="block text-xs">
                                                            <span className="text-alloy-forge/70 font-semibold">Label</span>
                                                            <input
                                                                className="mt-1 w-full border border-admin-border rounded-md px-2 py-1 text-xs"
                                                                value={r.label}
                                                                onChange={(e) =>
                                                                    setQueueEditorRows((prev) =>
                                                                        prev.map((x, j) => (j === idx ? { ...x, label: e.target.value } : x))
                                                                    )
                                                                }
                                                            />
                                                        </label>
                                                        <label className="block text-xs">
                                                            <span className="text-alloy-forge/70 font-semibold">Section</span>
                                                            <select
                                                                className="mt-1 w-full border border-admin-border rounded-md px-2 py-1 text-xs"
                                                                value={r.section}
                                                                onChange={(e) =>
                                                                    setQueueEditorRows((prev) =>
                                                                        prev.map((x, j) =>
                                                                            j === idx ? { ...x, section: e.target.value as BucketSection } : x
                                                                        )
                                                                    )
                                                                }
                                                            >
                                                                <option value="pipeline">Pipeline</option>
                                                                <option value="attention">Attention</option>
                                                                <option value="internal">Internal</option>
                                                            </select>
                                                        </label>
                                                    </div>

                                                    <div className="mt-2">
                                                        <div className="text-[11px] font-semibold tracking-wide text-alloy-forge/55">
                                                            Status mappings
                                                        </div>
                                                        {statusOptionsOpp.length === 0 ? (
                                                            <div className="mt-1 text-xs text-alloy-forge/60">No status options loaded.</div>
                                                        ) : (
                                                            <div className="mt-1 grid grid-cols-2 md:grid-cols-3 gap-1">
                                                                {statusOptionsOpp.map((o) => {
                                                                    const checked = r.status_keys.includes(o.value);
                                                                    return (
                                                                        <label
                                                                            key={`${r.key}:sk:${o.value}`}
                                                                            className="flex items-center gap-2 text-xs text-alloy-forge/75"
                                                                        >
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={checked}
                                                                                onChange={(e) => {
                                                                                    const on = e.target.checked;
                                                                                    setQueueEditorRows((prev) =>
                                                                                        prev.map((x, j) => {
                                                                                            if (j !== idx) return x;
                                                                                            const next = new Set(x.status_keys);
                                                                                            if (on) next.add(o.value);
                                                                                            else next.delete(o.value);
                                                                                            return { ...x, status_keys: [...next] };
                                                                                        })
                                                                                    );
                                                                                }}
                                                                            />
                                                                            <span className="truncate">{o.label}</span>
                                                                        </label>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="mt-2 flex items-center justify-between">
                                                        <button
                                                            type="button"
                                                            className="text-xs font-semibold text-red-700"
                                                            onClick={() => setQueueEditorRows((prev) => prev.filter((_, j) => j !== idx))}
                                                        >
                                                            Remove bucket
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        <button
                                            type="button"
                                            className="rounded-md border border-admin-border bg-white px-3 py-2 text-xs font-semibold text-alloy-forge hover:bg-alloy-stone/10"
                                            onClick={() =>
                                                setQueueEditorRows((prev) => [
                                                    ...prev,
                                                    { key: "new_bucket", label: "New bucket", section: "pipeline", status_keys: [] },
                                                ])
                                            }
                                        >
                                            Add bucket
                                        </button>

                                        <div className="rounded-md border border-admin-border/60 bg-white px-2.5 py-2">
                                            <div className="text-[11px] font-semibold tracking-wide text-alloy-forge/55">
                                                Excluded statuses (intentional)
                                            </div>
                                            <div className="mt-1 grid grid-cols-2 md:grid-cols-3 gap-1">
                                                {statusOptionsOpp.map((o) => {
                                                    const checked = queueEditorExcludedStatusKeys.includes(o.value);
                                                    return (
                                                        <label key={`ex:${o.value}`} className="flex items-center gap-2 text-xs text-alloy-forge/75">
                                                            <input
                                                                type="checkbox"
                                                                checked={checked}
                                                                onChange={(e) => {
                                                                    const on = e.target.checked;
                                                                    setQueueEditorExcludedStatusKeys((prev) => {
                                                                        const next = new Set(prev);
                                                                        if (on) next.add(o.value);
                                                                        else next.delete(o.value);
                                                                        return [...next];
                                                                    });
                                                                }}
                                                            />
                                                            <span className="truncate">{o.label}</span>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="rounded-lg border border-admin-border/60 bg-white/70 px-3 py-2">
                                <div className="text-[11px] font-semibold tracking-wide text-alloy-forge/55">
                                    Queue buckets (read-only summary)
                                </div>
                                {!modalQueueBuckets.ok ? (
                                    <div className="mt-1 text-xs text-alloy-forge/60">
                                        Not parseable as queue_definition v1. {modalQueueBuckets.error}
                                    </div>
                                ) : (
                                    <div className="mt-2 space-y-2">
                                        <div className="text-xs text-alloy-forge/70">
                                            Entity: <span className="font-semibold">{modalQueueBuckets.value.entity_type}</span> · Queues:{" "}
                                            <span className="font-semibold">{modalQueueBuckets.value.queues.length}</span>
                                        </div>
                                        {modalQueueBuckets.value.ui?.sections?.length ? (
                                            <div className="space-y-1">
                                                <div className="text-[11px] font-semibold text-alloy-forge/70">UI sections</div>
                                                <div className="space-y-1">
                                                    {modalQueueBuckets.value.ui.sections.map((s) => (
                                                        <div key={s.key} className="text-xs text-alloy-forge/70">
                                                            <span className="font-semibold">{s.label}</span>{" "}
                                                            <span className="text-alloy-forge/50">({s.queue_keys.length})</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : null}
                                        <div className="space-y-1">
                                            <div className="text-[11px] font-semibold text-alloy-forge/70">Queues</div>
                                            <div className="grid grid-cols-1 gap-1">
                                                {modalQueueBuckets.value.queues.map((q) => (
                                                    <div key={q.key} className="flex items-baseline justify-between gap-2 text-xs">
                                                        <span className="min-w-0 truncate text-alloy-forge/80">
                                                            <span className="font-semibold">{q.label}</span>{" "}
                                                            <span className="text-alloy-forge/45">({q.key})</span>
                                                        </span>
                                                        <span className="shrink-0 text-alloy-forge/45">
                                                            {q.filters.length ? `${q.filters.length} filter${q.filters.length === 1 ? "" : "s"}` : "no filters"}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="mt-2 rounded-md border border-admin-border/50 bg-white/60 px-2.5 py-2">
                                                <div className="text-[11px] font-semibold tracking-wide text-alloy-forge/55">
                                                    Status filters by bucket
                                                </div>
                                                <div className="mt-1 space-y-1">
                                                    {modalQueueBuckets.value.queues.map((q) => {
                                                        const statusFilters = (q.filters ?? [])
                                                            .filter((f) => (f as any)?.type === "status" && (f as any)?.operator === "in")
                                                            .flatMap((f) => (((f as any).values as unknown[]) ?? []).filter((x): x is string => typeof x === "string"));
                                                        return (
                                                            <div key={`sf:${q.key}`} className="text-xs text-alloy-forge/70">
                                                                <span className="font-semibold">{q.label}</span>{" "}
                                                                <span className="text-alloy-forge/45">({q.key})</span>
                                                                <span className="text-alloy-forge/50"> · </span>
                                                                <span className="font-mono text-[11px] text-alloy-midnight/55">
                                                                    {statusFilters.length ? statusFilters.join(", ") : "—"}
                                                                </span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <label className="flex items-center gap-2 text-sm">
                                <input type="checkbox" checked={modalActive} onChange={(e) => setModalActive(e.target.checked)} />
                                <span>Active</span>
                            </label>
                            {modalError ? <p className="text-sm text-red-600">{modalError}</p> : null}

                        {modalId ? (
                            <div className="mt-6 border-t border-admin-border/70 pt-4">
                                <div className="flex items-center justify-between gap-2">
                                    <div>
                                        <h3 className="text-sm font-semibold text-alloy-forge">Queue configuration preview</h3>
                                        <p className="mt-0.5 text-xs text-alloy-forge/60">
                                            This is a read-only preview of server-evaluated queues for validating configuration (not the primary workspace UI).
                                        </p>
                                        {queueEditorEnabled && queueEditorErrors.length ? (
                                            <p className="mt-1 text-xs text-red-700">
                                                Editor validation error: <span className="font-semibold">{queueEditorErrors[0]}</span>
                                            </p>
                                        ) : queueEditorEnabled && queueEditorWarnings.length ? (
                                            <p className="mt-1 text-xs text-amber-800">
                                                Editor warning: <span className="font-semibold">{queueEditorWarnings[0]}</span>
                                            </p>
                                        ) : null}
                                    </div>
                                    <button
                                        type="button"
                                        className="text-sm text-alloy-pine font-medium"
                                        onClick={() => fetchQueueSummaries(modalId)}
                                        disabled={queuesLoading}
                                    >
                                        {queuesLoading ? "Refreshing…" : "Refresh"}
                                    </button>
                                </div>

                                {queuesError ? (
                                    <p className="mt-2 text-sm text-red-600">
                                        {queuesError}
                                        {queuesRoute ? (
                                            <span className="block text-xs text-red-600/80 mt-1">Route: {queuesRoute}</span>
                                        ) : null}
                                    </p>
                                ) : queuesLoading ? (
                                    <p className="mt-2 text-sm text-alloy-forge/70">Loading queues…</p>
                                ) : queueSummaries.length === 0 ? (
                                    <p className="mt-2 text-sm text-alloy-forge/70">No queues returned.</p>
                                ) : (
                                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {queueSummaries.map((q) => (
                                            <button
                                                type="button"
                                                key={q.key}
                                                onClick={() => {
                                                    setSelectedQueueKey(q.key);
                                                    void fetchQueueItems(modalId, q.key);
                                                }}
                                                className={`text-left rounded-lg border px-4 py-3 hover:bg-alloy-stone/20 ${
                                                    selectedQueueKey === q.key ? "border-alloy-pine" : "border-admin-border"
                                                }`}
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div>
                                                        <div className="font-medium text-alloy-forge">{q.label}</div>
                                                        {q.description ? (
                                                            <div className="mt-0.5 text-xs text-alloy-forge/70">
                                                                {q.description}
                                                            </div>
                                                        ) : null}
                                                        {modalQueueStatusKeysByQueueKey.get(q.key)?.length ? (
                                                            <div className="mt-1 text-xs text-alloy-forge/60">
                                                                Statuses:{" "}
                                                                <span className="font-mono">
                                                                    {modalQueueStatusKeysByQueueKey.get(q.key)!.join(", ")}
                                                                </span>
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-sm font-semibold text-alloy-forge">{q.count}</div>
                                                        <div className="text-xs text-alloy-forge/60">
                                                            {q.priority} • {q.display}
                                                        </div>
                                                    </div>
                                                </div>
                                                {Array.isArray(q.preview) && q.preview.length ? (
                                                    <div className="mt-2 space-y-1">
                                                        {q.preview.slice(0, 3).map((it, idx) => {
                                                            const rec =
                                                                it && typeof it === "object" && !Array.isArray(it)
                                                                    ? (it as Record<string, unknown>)
                                                                    : null;
                                                            const rid = rec && typeof rec.id === "string" ? rec.id : null;
                                                            const title = rec && typeof rec.title === "string" ? rec.title : null;
                                                            return (
                                                                <div key={idx} className="text-xs text-alloy-forge/70 truncate">
                                                                    {title ?? rid ?? JSON.stringify(it)}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                ) : null}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {selectedQueueKey ? (
                                    <div className="mt-4 rounded-lg border border-admin-border p-4">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="text-sm font-semibold text-alloy-forge">
                                                Queue: {selectedQueueKey}
                                            </div>
                                            <button
                                                type="button"
                                                className="text-sm text-alloy-pine font-medium"
                                                onClick={() => void fetchQueueItems(modalId, selectedQueueKey)}
                                                disabled={queueItemsLoading}
                                            >
                                                {queueItemsLoading ? "Loading…" : "Reload"}
                                            </button>
                                        </div>

                                        {queueItemsError ? (
                                            <p className="mt-2 text-sm text-red-600">
                                                {queueItemsError}
                                                {queueItemsRoute ? (
                                                    <span className="block text-xs text-red-600/80 mt-1">Route: {queueItemsRoute}</span>
                                                ) : null}
                                            </p>
                                        ) : queueItemsLoading ? (
                                            <p className="mt-2 text-sm text-alloy-forge/70">Loading items…</p>
                                        ) : !queueItemsResult ? (
                                            <p className="mt-2 text-sm text-alloy-forge/70">No items loaded.</p>
                                        ) : (
                                            <>
                                                <div className="mt-2 text-xs text-alloy-forge/60">
                                                    Total: {queueItemsResult.total} • Showing {queueItemsResult.items.length} • Limit {queueItemsResult.limit} • Offset {queueItemsResult.offset}
                                                </div>
                                                <div className="mt-3 space-y-2">
                                                    {queueItemsResult.items.slice(0, 20).map((it, idx) => {
                                                        const rec =
                                                            it && typeof it === "object" && !Array.isArray(it)
                                                                ? (it as Record<string, unknown>)
                                                                : null;
                                                        const rid = rec && typeof rec.id === "string" ? rec.id : null;
                                                        const title = rec && typeof rec.title === "string" ? rec.title : null;
                                                        const href = rid ? entityHref(queueItemsResult.queue.entity_type, rid) : null;
                                                        return (
                                                            <div key={idx} className="flex items-center justify-between gap-3 rounded-md border border-admin-border/70 px-3 py-2">
                                                                <div className="min-w-0">
                                                                    <div className="text-sm text-alloy-forge truncate">{title ?? rid ?? "Item"}</div>
                                                                    {rid ? (
                                                                        <div className="text-xs text-alloy-forge/60 font-mono truncate">
                                                                            {rid}
                                                                        </div>
                                                                    ) : null}
                                                                </div>
                                                                {href ? (
                                                                    <a
                                                                        className="text-sm text-alloy-pine font-medium whitespace-nowrap"
                                                                        href={href}
                                                                        target="_blank"
                                                                        rel="noreferrer"
                                                                    >
                                                                        Open
                                                                    </a>
                                                                ) : (
                                                                    <span className="text-xs text-alloy-forge/50">Preview only</span>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ) : null}
                            </div>
                        ) : null}
                        </div>

                        <div className="shrink-0 sticky bottom-0 border-t border-admin-border bg-admin-surface-card px-6 py-4 flex justify-end gap-2">
                            <button
                                type="button"
                                className="px-4 py-2 text-sm border border-admin-border rounded-lg"
                                onClick={() => setModalOpen(false)}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                disabled={modalSaving || !canMutate}
                                className="px-4 py-2 text-sm bg-alloy-pine text-white rounded-lg disabled:opacity-50"
                                onClick={saveModal}
                                data-testid="work-units-modal-save"
                            >
                                {modalSaving ? "Saving…" : "Save"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
