"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useEntityLabels, getEntityLabel } from "@/contexts/EntityLabelsContext";
import AdminListPageHeader from "@/components/admin/AdminListPageHeader";
import Drawer from "@/components/admin/Drawer";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { formatDateTime } from "@/lib/adminFormatters";
import { Filter } from "lucide-react";

type WorkflowRunRow = {
    id: string;
    workflow_id: string;
    workflow_name: string | null;
    event_id: string | null;
    event_type: string | null;
    entity_type: string | null;
    entity_id: string | null;
    status: string;
    error: string | null;
    started_at: string;
    completed_at: string | null;
    event_payload: Record<string, unknown>;
    has_failed_action?: boolean;
};

type WorkflowActionRunRow = {
    id: string;
    workflow_run_id: string;
    action_order: number;
    action_type: string;
    status: string;
    error: string | null;
    meta: Record<string, unknown>;
    started_at: string;
    completed_at: string | null;
    inputs: Record<string, unknown>;
    outputs: Record<string, unknown>;
};

/** Best-effort admin route for entity_type. Returns null if unknown. Uses labels for display when provided. */
function entityAdminRoute(
    entityType: string | null,
    _entityId: string,
    labels?: Record<string, { singular: string | null; plural: string | null }>
): { href: string; label: string } | null {
    if (!entityType) return null;
    const t = entityType.toLowerCase();
    const label = (key: string) => (labels ? getEntityLabel(labels, key, "plural") : key.charAt(0).toUpperCase() + key.slice(1));
    if (t === "job" || t === "jobs") return { href: "/admin/jobs", label: label("jobs") };
    if (t === "schedule" || t === "schedules") return { href: "/admin/schedules", label: label("schedules") };
    if (t === "customer" || t === "customers") return { href: "/admin/customers", label: label("customers") };
    if (t === "contact" || t === "contacts") return { href: "/admin/contacts", label: label("contacts") };
    if (t === "vendor" || t === "vendors") return { href: "/admin/vendors", label: label("vendors") };
    if (t === "opportunity" || t === "opportunities") return { href: "/admin/opportunities", label: label("opportunities") };
    return null;
}

const RANGE_OPTIONS = [
    { value: "", label: "All time" },
    { value: "24h", label: "Last 24 hours" },
    { value: "7d", label: "Last 7 days" },
    { value: "30d", label: "Last 30 days" },
];

const STATUS_OPTIONS = [
    { value: "", label: "All" },
    { value: "completed", label: "Completed" },
    { value: "failed", label: "Failed" },
    { value: "skipped", label: "Skipped" },
    { value: "running", label: "Running" },
];

function statusVariant(status: string): "default" | "success" | "warning" | "neutral" {
    if (status === "completed") return "success";
    if (status === "failed") return "warning";
    if (status === "skipped") return "neutral";
    return "default";
}

function formatDuration(started: string, completed: string | null): string {
    if (!completed) return "—";
    const a = new Date(started).getTime();
    const b = new Date(completed).getTime();
    if (Number.isNaN(a) || Number.isNaN(b)) return "—";
    const ms = b - a;
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
}

function ActionRunItem({
    ar,
    formatDuration: fd,
    statusVariant: sv,
}: {
    ar: WorkflowActionRunRow;
    formatDuration: (s: string, c: string | null) => string;
    statusVariant: (s: string) => "default" | "success" | "warning" | "neutral";
}) {
    const [metaOpen, setMetaOpen] = useState(false);
    const hasMeta = ar.meta && Object.keys(ar.meta).length > 0;
    return (
        <li className="border border-alloy-stone/30 rounded-md p-3 bg-alloy-stone/10">
            <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-sm">{ar.action_type}</span>
                <StatusBadge label={ar.status} variant={sv(ar.status)} />
                <span className="text-xs text-alloy-midnight/60">{fd(ar.started_at, ar.completed_at)}</span>
                {hasMeta && (
                    <button
                        type="button"
                        onClick={() => setMetaOpen((o) => !o)}
                        className="text-xs text-alloy-blue hover:underline"
                    >
                        {metaOpen ? "Hide" : "Show"} meta
                    </button>
                )}
            </div>
            {ar.status === "failed" && ar.error && (
                <pre className="mt-2 bg-red-50 text-red-800 rounded p-2 text-xs font-mono whitespace-pre-wrap break-words border border-red-200">
                    {ar.error}
                </pre>
            )}
            {metaOpen && hasMeta && (
                <pre className="mt-2 bg-alloy-stone/20 rounded p-2 text-xs overflow-x-auto font-mono whitespace-pre-wrap break-words">
                    {JSON.stringify(ar.meta, null, 2)}
                </pre>
            )}
        </li>
    );
}

export default function WorkflowRunsClient() {
    const { labels } = useEntityLabels();
    const [runs, setRuns] = useState<WorkflowRunRow[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [workflows, setWorkflows] = useState<{ id: string; name: string }[]>([]);
    const [eventTypes, setEventTypes] = useState<string[]>([]);
    const [status, setStatus] = useState("");
    const [workflowId, setWorkflowId] = useState("");
    const [eventType, setEventType] = useState("");
    const [range, setRange] = useState("");
    const [search, setSearch] = useState("");
    const [searchApplied, setSearchApplied] = useState("");
    const [page, setPage] = useState(1);
    const [selected, setSelected] = useState<WorkflowRunRow | null>(null);
    const [actionRuns, setActionRuns] = useState<WorkflowActionRunRow[]>([]);
    const [actionRunsLoading, setActionRunsLoading] = useState(false);
    const [filterOpen, setFilterOpen] = useState(false);
    const filterRef = useRef<HTMLDivElement>(null);
    const limit = 50;

    const hasActiveFilters = !!(status || workflowId || eventType || range || searchApplied);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        if (!selected) {
            setActionRuns([]);
            return;
        }
        let cancelled = false;
        setActionRunsLoading(true);
        fetch(`/api/admin/workflow-runs/${selected.id}/action-runs`)
            .then((res) => res.json())
            .then((json) => {
                if (!cancelled && Array.isArray(json.action_runs)) setActionRuns(json.action_runs);
            })
            .finally(() => { if (!cancelled) setActionRunsLoading(false); });
        return () => { cancelled = true; };
    }, [selected?.id]);

    const fetchWorkflows = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/workflow-runs?list=workflows");
            const json = await res.json();
            if (res.ok && Array.isArray(json.workflows)) setWorkflows(json.workflows);
        } catch (_) {}
    }, []);

    const fetchEventTypes = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/workflow-runs?list=event_types");
            const json = await res.json();
            if (res.ok && Array.isArray(json.event_types)) setEventTypes(json.event_types);
        } catch (_) {}
    }, []);

    const fetchList = useCallback(async () => {
        setLoading(true);
        const params = new URLSearchParams();
        params.set("limit", String(limit));
        params.set("page", String(page));
        if (status) params.set("status", status);
        if (workflowId) params.set("workflow_id", workflowId);
        if (eventType) params.set("event_type", eventType);
        if (searchApplied) params.set("search", searchApplied);
        if (range) params.set("range", range);
        try {
            const res = await fetch(`/api/admin/workflow-runs?${params}`);
            const json = await res.json();
            if (res.ok) {
                setRuns(json.runs ?? []);
                setTotal(Number(json.total) ?? 0);
            }
        } finally {
            setLoading(false);
        }
    }, [page, status, workflowId, eventType, searchApplied, range]);

    useEffect(() => {
        fetchWorkflows();
        fetchEventTypes();
    }, [fetchWorkflows, fetchEventTypes]);

    useEffect(() => {
        fetchList();
    }, [fetchList]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    const filterTrigger = (
        <div className="relative" ref={filterRef}>
            <button
                type="button"
                onClick={() => setFilterOpen((o) => !o)}
                className={`flex items-center gap-2 rounded-lg border border-alloy-stone/40 bg-white px-3 py-2 text-sm font-medium text-alloy-midnight/80 hover:bg-alloy-stone/50 focus:outline-none focus:ring-2 focus:ring-alloy-blue/20 ${filterOpen ? "border-alloy-blue/50 ring-2 ring-alloy-blue/20" : ""}`}
                aria-expanded={filterOpen}
                aria-haspopup="true"
            >
                <Filter className="h-4 w-4 text-alloy-muted" />
                Filter
                {hasActiveFilters && <span className="h-1.5 w-1.5 rounded-full bg-alloy-blue" aria-hidden />}
            </button>
            {filterOpen && (
                <div className="absolute left-0 top-full z-20 mt-1.5 w-80 rounded-lg border border-alloy-stone/40 bg-white p-4 shadow-lg max-h-[85vh] overflow-y-auto">
                    <div className="space-y-3">
                        <div>
                            <label className="mb-1 block text-xs font-medium text-alloy-muted">Status</label>
                            <select
                                value={status}
                                onChange={(e) => { setStatus(e.target.value); setPage(1); }}
                                className="w-full rounded-lg border border-alloy-stone/40 bg-white px-3 py-2 text-sm text-alloy-midnight focus:border-alloy-blue focus:outline-none focus:ring-2 focus:ring-alloy-blue/20"
                            >
                                {STATUS_OPTIONS.map((o) => (
                                    <option key={o.value || "all"} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-medium text-alloy-muted">Workflow</label>
                            <select
                                value={workflowId}
                                onChange={(e) => { setWorkflowId(e.target.value); setPage(1); }}
                                className="w-full rounded-lg border border-alloy-stone/40 bg-white px-3 py-2 text-sm text-alloy-midnight focus:border-alloy-blue focus:outline-none focus:ring-2 focus:ring-alloy-blue/20"
                            >
                                <option value="">All</option>
                                {workflows.map((w) => (
                                    <option key={w.id} value={w.id}>{w.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-medium text-alloy-muted">Event type</label>
                            <select
                                value={eventType}
                                onChange={(e) => { setEventType(e.target.value); setPage(1); }}
                                className="w-full rounded-lg border border-alloy-stone/40 bg-white px-3 py-2 text-sm text-alloy-midnight focus:border-alloy-blue focus:outline-none focus:ring-2 focus:ring-alloy-blue/20"
                            >
                                <option value="">All</option>
                                {eventTypes.map((t) => (
                                    <option key={t} value={t}>{t}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-medium text-alloy-muted">Date range</label>
                            <select
                                value={range}
                                onChange={(e) => { setRange(e.target.value); setPage(1); }}
                                className="w-full rounded-lg border border-alloy-stone/40 bg-white px-3 py-2 text-sm text-alloy-midnight focus:border-alloy-blue focus:outline-none focus:ring-2 focus:ring-alloy-blue/20"
                            >
                                {RANGE_OPTIONS.map((o) => (
                                    <option key={o.value || "all"} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-medium text-alloy-muted">Search (id, error, payload, entity_id)</label>
                            <input
                                type="text"
                                placeholder="Search…"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), setSearchApplied(search.trim()), setPage(1), setFilterOpen(false))}
                                className="w-full rounded-lg border border-alloy-stone/40 bg-white px-3 py-2 text-sm text-alloy-midnight placeholder:text-alloy-muted/70 focus:border-alloy-blue focus:outline-none focus:ring-2 focus:ring-alloy-blue/20"
                            />
                        </div>
                        <div className="flex gap-2 pt-1">
                            <button
                                type="button"
                                onClick={() => { setSearchApplied(search.trim()); setPage(1); setFilterOpen(false); }}
                                className="rounded-lg bg-alloy-blue px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-alloy-blue/30"
                            >
                                Apply
                            </button>
                            {hasActiveFilters && (
                                <button
                                    type="button"
                                    onClick={() => { setStatus(""); setWorkflowId(""); setEventType(""); setRange(""); setSearch(""); setSearchApplied(""); setPage(1); setFilterOpen(false); }}
                                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-alloy-muted hover:text-alloy-midnight hover:underline"
                                >
                                    Clear
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    return (
        <>
            <AdminListPageHeader title="Workflow Runs" toolbarLeft={filterTrigger} />
            <div className="pt-4">
                <div className="rounded-xl border border-admin-border bg-admin-surface-card shadow-sm overflow-hidden">
                {loading ? (
                    <div className="p-10 text-center text-sm text-alloy-muted">Loading…</div>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-admin-border bg-alloy-blue/[0.08]">
                                        <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-alloy-slate">Started at</th>
                                        <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-alloy-slate">Workflow</th>
                                        <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-alloy-slate">Event</th>
                                        <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-alloy-slate">Entity</th>
                                        <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-alloy-slate">Status</th>
                                        <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-alloy-slate">Duration</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-alloy-stone/30">
                                    {runs.length === 0 ? (
                                        <tr><td colSpan={6} className="px-5 py-14 text-center text-sm text-alloy-muted">No runs found.</td></tr>
                                    ) : (
                                        runs.map((r) => (
                                            <tr
                                                key={r.id}
                                                className="cursor-pointer hover:bg-alloy-juniper/[0.08] transition-colors duration-100"
                                                onClick={() => setSelected(r)}
                                            >
                                                <td className="px-5 py-3.5 text-alloy-midnight/90">{formatDateTime(r.started_at)}</td>
                                                <td className="px-5 py-3.5 text-alloy-midnight/90">{r.workflow_name ?? r.workflow_id?.slice(0, 8) ?? "—"}</td>
                                                <td className="px-5 py-3.5 text-alloy-midnight/90">{r.event_type ?? "—"}</td>
                                                <td className="px-5 py-3.5 font-mono text-xs truncate max-w-[120px] text-alloy-midnight/90" title={r.entity_id ?? undefined}>
                                                    {r.entity_type && r.entity_id ? `${r.entity_type}: ${r.entity_id.slice(0, 8)}…` : (r.entity_id ? `${r.entity_id.slice(0, 8)}…` : "—")}
                                                </td>
                                                <td className="px-5 py-3.5">
                                                    <span className="flex items-center gap-1.5 flex-wrap">
                                                        <StatusBadge label={r.status} variant={statusVariant(r.status)} />
                                                        {(r.status === "failed" || r.has_failed_action) && (
                                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 border border-red-200" title="Run or an action failed">
                                                                Failed
                                                            </span>
                                                        )}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3.5 text-alloy-midnight/90">{formatDuration(r.started_at, r.completed_at)}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-t border-admin-border">
                            <p className="text-xs text-alloy-muted">
                                Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
                            </p>
                            <div className="flex gap-1">
                                <button
                                    type="button"
                                    disabled={page <= 1}
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    className="rounded-lg border border-alloy-stone/40 px-3 py-1.5 text-sm font-medium text-alloy-midnight/80 hover:bg-alloy-stone/50 focus:outline-none focus:ring-2 focus:ring-alloy-blue/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Previous
                                </button>
                                <span className="px-2 py-1.5 text-sm text-alloy-muted">
                                    Page {page} of {totalPages}
                                </span>
                                <button
                                    type="button"
                                    disabled={page >= totalPages}
                                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                    className="rounded-lg border border-alloy-stone/40 px-3 py-1.5 text-sm font-medium text-alloy-midnight/80 hover:bg-alloy-stone/50 focus:outline-none focus:ring-2 focus:ring-alloy-blue/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    </>
                )}
                </div>
            </div>

            <Drawer
                isOpen={!!selected}
                onClose={() => setSelected(null)}
                title={
                    selected ? (
                        <span className="flex flex-col gap-0.5">
                            <span>Run {selected.id.slice(0, 8)}…</span>
                            {(() => {
                                const firstFailed = actionRuns.find((a) => a.status === "failed");
                                if (!firstFailed) return null;
                                return (
                                    <span className="text-xs font-normal text-red-700 mt-0.5">
                                        Failed action: {firstFailed.action_type} — {firstFailed.error ?? "Unknown error"}
                                    </span>
                                );
                            })()}
                        </span>
                    ) : ""
                }
                zIndexBackdrop={60}
                zIndexPanel={70}
            >
                {selected && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                                <span className="text-alloy-midnight/60">Workflow</span>
                                <br />
                                {selected.workflow_id ? (
                                    <Link href={`/admin/workflows/${selected.workflow_id}`} className="text-alloy-blue hover:underline">
                                        {selected.workflow_name ?? selected.workflow_id.slice(0, 8) + "…"}
                                    </Link>
                                ) : (selected.workflow_name ?? "—")}
                            </div>
                            <div>
                                <span className="text-alloy-midnight/60">Event</span>
                                <br />
                                {selected.event_id ? (
                                    <Link href={`/admin/workflow-events?event_id=${encodeURIComponent(selected.event_id)}`} className="text-alloy-blue hover:underline">
                                        {selected.event_type ?? selected.event_id.slice(0, 8) + "…"}
                                    </Link>
                                ) : (selected.event_type ?? "—")}
                            </div>
                            <div className="col-span-2">
                                <span className="text-alloy-midnight/60">Entity</span>
                                <br />
                                {selected.entity_type && selected.entity_id ? (
                                    <span className="flex items-center gap-2 flex-wrap">
                                        <span className="font-mono text-xs break-all">{selected.entity_type}: {selected.entity_id}</span>
                                        <button
                                            type="button"
                                            onClick={() => { navigator.clipboard.writeText(selected.entity_id ?? ""); }}
                                            className="px-2 py-0.5 text-xs border border-alloy-stone/40 rounded hover:bg-alloy-stone/20"
                                        >
                                            Copy ID
                                        </button>
                                        {entityAdminRoute(selected.entity_type, selected.entity_id, labels) && (
                                            <Link
                                                href={entityAdminRoute(selected.entity_type, selected.entity_id, labels)!.href}
                                                className="text-alloy-blue hover:underline text-xs"
                                            >
                                                View {entityAdminRoute(selected.entity_type, selected.entity_id, labels)!.label}
                                            </Link>
                                        )}
                                    </span>
                                ) : selected.entity_id ? (
                                    <span className="flex items-center gap-2">
                                        <span className="font-mono text-xs break-all">{selected.entity_id}</span>
                                        <button
                                            type="button"
                                            onClick={() => { navigator.clipboard.writeText(selected.entity_id ?? ""); }}
                                            className="px-2 py-0.5 text-xs border border-alloy-stone/40 rounded hover:bg-alloy-stone/20"
                                        >
                                            Copy
                                        </button>
                                    </span>
                                ) : "—"}
                            </div>
                            <div><span className="text-alloy-midnight/60">Status</span><br /><StatusBadge label={selected.status} variant={statusVariant(selected.status)} /></div>
                            <div><span className="text-alloy-midnight/60">Started at</span><br />{formatDateTime(selected.started_at)}</div>
                            <div><span className="text-alloy-midnight/60">Completed at</span><br />{selected.completed_at ? formatDateTime(selected.completed_at) : "—"}</div>
                            <div><span className="text-alloy-midnight/60">Duration</span><br />{formatDuration(selected.started_at, selected.completed_at)}</div>
                            <div className="col-span-2"><span className="text-alloy-midnight/60">Run ID</span><br /><span className="font-mono text-xs break-all">{selected.id}</span></div>
                        </div>
                        {selected.error && (
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wider text-alloy-midnight/60 mb-2">Run error</p>
                                <pre className="bg-red-50 text-red-800 rounded p-3 text-xs overflow-x-auto font-mono whitespace-pre-wrap break-words border border-red-200">
                                    {selected.error}
                                </pre>
                            </div>
                        )}

                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wider text-alloy-midnight/60 mb-2">Actions timeline</p>
                            {actionRunsLoading ? (
                                <p className="text-sm text-alloy-midnight/60">Loading actions…</p>
                            ) : actionRuns.length === 0 ? (
                                <p className="text-sm text-alloy-midnight/60">No action runs recorded.</p>
                            ) : (
                                <ul className="space-y-2">
                                    {actionRuns.map((ar) => (
                                        <ActionRunItem key={ar.id} ar={ar} formatDuration={formatDuration} statusVariant={statusVariant} />
                                    ))}
                                </ul>
                            )}
                        </div>

                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wider text-alloy-midnight/60 mb-2">event_payload</p>
                            <pre className="bg-alloy-stone/20 rounded p-3 text-xs overflow-x-auto max-h-[40vh] overflow-y-auto font-mono whitespace-pre-wrap break-words">
                                {JSON.stringify(selected.event_payload, null, 2)}
                            </pre>
                        </div>
                    </div>
                )}
            </Drawer>
        </>
    );
}
