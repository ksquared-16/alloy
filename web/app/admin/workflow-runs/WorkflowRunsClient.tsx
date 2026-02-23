"use client";

import { useCallback, useEffect, useState } from "react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import SectionCard from "@/components/admin/SectionCard";
import Drawer from "@/components/admin/Drawer";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { formatDateTime } from "@/lib/adminFormatters";

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
};

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

export default function WorkflowRunsClient() {
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
    const limit = 50;

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

    return (
        <>
            <AdminPageHeader title="Workflow Runs" subtitle="Read-only view of workflow_runs for the current org." />
            <SectionCard title="Filters" className="mb-4">
                <div className="flex flex-wrap items-end gap-4">
                    <div>
                        <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">Status</label>
                        <select
                            value={status}
                            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
                            className="px-2 py-1.5 border border-alloy-stone/40 rounded text-sm min-w-[120px]"
                        >
                            {STATUS_OPTIONS.map((o) => (
                                <option key={o.value || "all"} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">Workflow</label>
                        <select
                            value={workflowId}
                            onChange={(e) => { setWorkflowId(e.target.value); setPage(1); }}
                            className="px-2 py-1.5 border border-alloy-stone/40 rounded text-sm min-w-[180px]"
                        >
                            <option value="">All</option>
                            {workflows.map((w) => (
                                <option key={w.id} value={w.id}>{w.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">Event type</label>
                        <select
                            value={eventType}
                            onChange={(e) => { setEventType(e.target.value); setPage(1); }}
                            className="px-2 py-1.5 border border-alloy-stone/40 rounded text-sm min-w-[160px]"
                        >
                            <option value="">All</option>
                            {eventTypes.map((t) => (
                                <option key={t} value={t}>{t}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">Date range</label>
                        <select
                            value={range}
                            onChange={(e) => { setRange(e.target.value); setPage(1); }}
                            className="px-2 py-1.5 border border-alloy-stone/40 rounded text-sm min-w-[140px]"
                        >
                            {RANGE_OPTIONS.map((o) => (
                                <option key={o.value || "all"} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">Search (id, error, payload, entity_id)</label>
                        <div className="flex gap-1">
                            <input
                                type="text"
                                placeholder="Search…"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), setSearchApplied(search.trim()), setPage(1))}
                                className="px-2 py-1.5 border border-alloy-stone/40 rounded text-sm w-48"
                            />
                            <button
                                type="button"
                                onClick={() => { setSearchApplied(search.trim()); setPage(1); }}
                                className="px-3 py-1.5 text-sm bg-alloy-stone/30 rounded hover:bg-alloy-stone/50"
                            >
                                Apply
                            </button>
                            {searchApplied && (
                                <button type="button" onClick={() => { setSearch(""); setSearchApplied(""); setPage(1); }} className="px-2 py-1.5 text-sm text-alloy-midnight/70 hover:underline">
                                    Clear
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </SectionCard>
            <SectionCard title="Runs">
                {loading ? (
                    <p className="text-sm text-alloy-midnight/60">Loading…</p>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-alloy-stone/30 text-left text-alloy-midnight/70">
                                        <th className="pb-2 pr-4">Started at</th>
                                        <th className="pb-2 pr-4">Workflow</th>
                                        <th className="pb-2 pr-4">Event</th>
                                        <th className="pb-2 pr-4">Entity</th>
                                        <th className="pb-2 pr-4">Status</th>
                                        <th className="pb-2 pr-4">Duration</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {runs.length === 0 ? (
                                        <tr><td colSpan={6} className="py-4 text-alloy-midnight/60">No runs found.</td></tr>
                                    ) : (
                                        runs.map((r) => (
                                            <tr
                                                key={r.id}
                                                className="border-b border-alloy-stone/20 hover:bg-alloy-stone/20 cursor-pointer"
                                                onClick={() => setSelected(r)}
                                            >
                                                <td className="py-2 pr-4">{formatDateTime(r.started_at)}</td>
                                                <td className="py-2 pr-4">{r.workflow_name ?? r.workflow_id?.slice(0, 8) ?? "—"}</td>
                                                <td className="py-2 pr-4">{r.event_type ?? "—"}</td>
                                                <td className="py-2 pr-4 font-mono text-xs truncate max-w-[120px]" title={r.entity_id ?? undefined}>
                                                    {r.entity_type && r.entity_id ? `${r.entity_type}: ${r.entity_id.slice(0, 8)}…` : (r.entity_id ? `${r.entity_id.slice(0, 8)}…` : "—")}
                                                </td>
                                                <td className="py-2 pr-4">
                                                    <StatusBadge label={r.status} variant={statusVariant(r.status)} />
                                                </td>
                                                <td className="py-2 pr-4">{formatDuration(r.started_at, r.completed_at)}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs text-alloy-midnight/60">
                                Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
                            </p>
                            <div className="flex gap-1">
                                <button
                                    type="button"
                                    disabled={page <= 1}
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    className="px-2 py-1 text-sm border border-alloy-stone/40 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-alloy-stone/30"
                                >
                                    Previous
                                </button>
                                <span className="px-2 py-1 text-sm text-alloy-midnight/70">
                                    Page {page} of {totalPages}
                                </span>
                                <button
                                    type="button"
                                    disabled={page >= totalPages}
                                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                    className="px-2 py-1 text-sm border border-alloy-stone/40 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-alloy-stone/30"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </SectionCard>

            <Drawer
                isOpen={!!selected}
                onClose={() => setSelected(null)}
                title={selected ? `Run ${selected.id.slice(0, 8)}…` : ""}
                zIndexBackdrop={60}
                zIndexPanel={70}
            >
                {selected && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-2 text-sm">
                            <div><span className="text-alloy-midnight/60">Workflow</span><br />{selected.workflow_name ?? selected.workflow_id ?? "—"}</div>
                            <div><span className="text-alloy-midnight/60">Event type</span><br />{selected.event_type ?? "—"}</div>
                            <div><span className="text-alloy-midnight/60">Entity</span><br />{selected.entity_type && selected.entity_id ? `${selected.entity_type}: ${selected.entity_id}` : (selected.entity_id ?? "—")}</div>
                            <div><span className="text-alloy-midnight/60">Status</span><br /><StatusBadge label={selected.status} variant={statusVariant(selected.status)} /></div>
                            <div><span className="text-alloy-midnight/60">Started at</span><br />{formatDateTime(selected.started_at)}</div>
                            <div><span className="text-alloy-midnight/60">Completed at</span><br />{selected.completed_at ? formatDateTime(selected.completed_at) : "—"}</div>
                            <div><span className="text-alloy-midnight/60">Duration</span><br />{formatDuration(selected.started_at, selected.completed_at)}</div>
                            <div className="col-span-2"><span className="text-alloy-midnight/60">ID</span><br /><span className="font-mono text-xs break-all">{selected.id}</span></div>
                        </div>
                        {selected.error && (
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wider text-alloy-midnight/60 mb-2">Error</p>
                                <pre className="bg-red-50 text-red-800 rounded p-3 text-xs overflow-x-auto font-mono whitespace-pre-wrap break-words border border-red-200">
                                    {selected.error}
                                </pre>
                            </div>
                        )}
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wider text-alloy-midnight/60 mb-2">event_payload</p>
                            <pre className="bg-alloy-stone/20 rounded p-3 text-xs overflow-x-auto max-h-[60vh] overflow-y-auto font-mono whitespace-pre-wrap break-words">
                                {JSON.stringify(selected.event_payload, null, 2)}
                            </pre>
                        </div>
                    </div>
                )}
            </Drawer>
        </>
    );
}
