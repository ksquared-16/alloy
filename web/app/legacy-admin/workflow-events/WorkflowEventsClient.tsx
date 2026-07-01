"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import SectionCard from "@/components/admin/SectionCard";
import Drawer from "@/components/admin/Drawer";
import { formatDateTimeForUserDisplay } from "@/lib/adminFormatters";
import { useAdminViewerTimezone } from "@/contexts/AdminViewerTimezoneContext";

type WorkflowEventRow = {
    id: string;
    occurred_at: string;
    event_type: string | null;
    entity_type: string | null;
    entity_id: string | null;
    action_type: string | null;
    payload: Record<string, unknown>;
    created_at?: string | null;
};

const RANGE_OPTIONS = [
    { value: "", label: "All time" },
    { value: "24h", label: "Last 24 hours" },
    { value: "7d", label: "Last 7 days" },
    { value: "30d", label: "Last 30 days" },
];

export default function WorkflowEventsClient() {
    const searchParams = useSearchParams();
    const viewerTz = useAdminViewerTimezone();
    const formatEventInstant = useCallback(
        (iso: string | null | undefined) =>
            iso ? formatDateTimeForUserDisplay(iso, viewerTz) : "—",
        [viewerTz]
    );
    const [events, setEvents] = useState<WorkflowEventRow[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [eventTypes, setEventTypes] = useState<string[]>([]);
    const [eventType, setEventType] = useState("");
    const [eventId, setEventId] = useState(() => searchParams.get("event_id") ?? "");
    const [search, setSearch] = useState("");
    const [searchApplied, setSearchApplied] = useState("");
    const [range, setRange] = useState("");
    const [page, setPage] = useState(1);
    const [selected, setSelected] = useState<WorkflowEventRow | null>(null);
    const limit = 50;

    useEffect(() => {
        const id = searchParams.get("event_id") ?? "";
        setEventId((prev) => (id !== prev ? id : prev));
    }, [searchParams]);

    const fetchEventTypes = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/workflow-events?list=event_types");
            const json = await res.json();
            if (res.ok && Array.isArray(json.event_types)) setEventTypes(json.event_types);
        } catch (_) {}
    }, []);

    const fetchList = useCallback(async () => {
        setLoading(true);
        const params = new URLSearchParams();
        params.set("limit", String(limit));
        params.set("page", String(page));
        if (eventType) params.set("event_type", eventType);
        if (eventId) params.set("event_id", eventId);
        if (searchApplied) params.set("search", searchApplied);
        if (range) params.set("range", range);
        try {
            const res = await fetch(`/api/admin/workflow-events?${params}`);
            const json = await res.json();
            if (res.ok) {
                setEvents(json.events ?? []);
                setTotal(Number(json.total) ?? 0);
            }
        } finally {
            setLoading(false);
        }
    }, [page, eventType, eventId, searchApplied, range]);

    useEffect(() => {
        fetchEventTypes();
    }, [fetchEventTypes]);

    useEffect(() => {
        fetchList();
    }, [fetchList]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return (
        <>
            <AdminPageHeader title="Workflow Events" subtitle="Read-only view of workflow_events for the current org." />
            <SectionCard title="Filters" className="mb-4">
                <div className="flex flex-wrap items-end gap-4">
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
                        <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">Event ID</label>
                        <input
                            type="text"
                            placeholder="UUID (e.g. from run details)"
                            value={eventId}
                            onChange={(e) => { setEventId(e.target.value); setPage(1); }}
                            className="px-2 py-1.5 border border-alloy-stone/40 rounded text-sm w-56 font-mono"
                        />
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
                        <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">Search (entity_id or payload)</label>
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
            <SectionCard title="Events">
                {loading ? (
                    <p className="text-sm text-alloy-midnight/60">Loading…</p>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-alloy-stone/30 text-left text-alloy-midnight/70">
                                        <th className="pb-2 pr-4" title="Displayed in your admin display timezone">Occurred at</th>
                                        <th className="pb-2 pr-4">Event type</th>
                                        <th className="pb-2 pr-4">Entity type</th>
                                        <th className="pb-2 pr-4">Entity ID</th>
                                        <th className="pb-2 pr-4">Action type</th>
                                        <th className="pb-2 pr-4">ID</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {events.length === 0 ? (
                                        <tr><td colSpan={6} className="py-4 text-alloy-midnight/60">No events found.</td></tr>
                                    ) : (
                                        events.map((e) => (
                                            <tr
                                                key={e.id}
                                                className="border-b border-alloy-stone/20 hover:bg-alloy-stone/20 cursor-pointer"
                                                onClick={() => setSelected(e)}
                                            >
                                                <td className="py-2 pr-4">{formatEventInstant(e.occurred_at)}</td>
                                                <td className="py-2 pr-4">{e.event_type ?? "—"}</td>
                                                <td className="py-2 pr-4">{e.entity_type ?? "—"}</td>
                                                <td className="py-2 pr-4 font-mono text-xs truncate max-w-[120px]" title={e.entity_id ?? undefined}>{e.entity_id ? `${e.entity_id.slice(0, 8)}…` : "—"}</td>
                                                <td className="py-2 pr-4">{e.action_type ?? "—"}</td>
                                                <td className="py-2 pr-4 font-mono text-xs truncate max-w-[100px]" title={e.id}>{e.id.slice(0, 8)}…</td>
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
                title={selected ? `Event ${selected.id.slice(0, 8)}…` : ""}
                zIndexBackdrop={60}
                zIndexPanel={70}
            >
                {selected && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-2 text-sm">
                            <div><span className="text-alloy-midnight/60">Occurred at</span><br />{formatEventInstant(selected.occurred_at)}</div>
                            {selected.created_at != null && (
                                <div><span className="text-alloy-midnight/60">Created at</span><br />{formatEventInstant(selected.created_at)}</div>
                            )}
                            <div><span className="text-alloy-midnight/60">Event type</span><br />{selected.event_type ?? "—"}</div>
                            <div><span className="text-alloy-midnight/60">Entity type</span><br />{selected.entity_type ?? "—"}</div>
                            <div className="col-span-2"><span className="text-alloy-midnight/60">Entity ID</span><br /><span className="font-mono text-xs break-all">{selected.entity_id ?? "—"}</span></div>
                            <div><span className="text-alloy-midnight/60">Action type</span><br />{selected.action_type ?? "—"}</div>
                            <div className="col-span-2"><span className="text-alloy-midnight/60">ID</span><br /><span className="font-mono text-xs break-all">{selected.id}</span></div>
                        </div>
                        <div>
                            <p className="text-xs font-semibold tracking-wider text-alloy-midnight/60 mb-2">Payload</p>
                            <pre className="bg-alloy-stone/20 rounded p-3 text-xs overflow-x-auto max-h-[60vh] overflow-y-auto font-mono whitespace-pre-wrap break-words">
                                {JSON.stringify(selected.payload, null, 2)}
                            </pre>
                        </div>
                    </div>
                )}
            </Drawer>
        </>
    );
}
