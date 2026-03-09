"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AdminListPageHeader from "@/components/admin/AdminListPageHeader";
import { formatDateTime, formatMoneyFromCents } from "@/lib/adminFormatters";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";
import { Filter } from "lucide-react";

type PaymentRow = {
    id: string;
    created_at: string;
    amount_cents: number;
    provider_payment_id: string | null;
    payment_status_id: string;
    job_id: string | null;
    payment_statuses: { key: string } | null;
};

const STATUS_OPTIONS = [
    { value: "", label: "All" },
    { value: "paid", label: "Paid" },
    { value: "pending", label: "Pending" },
    { value: "failed", label: "Failed" },
];

function StatusBadge({ statusKey }: { statusKey: string }) {
    const variant =
        statusKey === "paid" ? "bg-green-100 text-green-800" : statusKey === "failed" ? "bg-amber-100 text-amber-800" : "bg-alloy-stone/20 text-alloy-midnight/80";
    return (
        <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${variant}`}>
            {statusKey.charAt(0).toUpperCase() + statusKey.slice(1)}
        </span>
    );
}

export default function PaymentsClient() {
    const { openDrawer } = useAdminDrawer();
    const { labels } = useEntityLabels();
    const plural = labels?.payments?.plural ?? "Payments";
    const title = plural;
    const [payments, setPayments] = useState<PaymentRow[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState("");
    const [statusKeyFilter, setStatusKeyFilter] = useState("");
    const [statusKeyOptions, setStatusKeyOptions] = useState<{ status_key: string; status_label: string | null }[]>([]);
    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");
    const [jobIdSearch, setJobIdSearch] = useState("");
    const [jobIdApplied, setJobIdApplied] = useState("");
    const [filterOpen, setFilterOpen] = useState(false);
    const filterRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const hasActiveFilters = status || statusKeyFilter || fromDate || toDate || jobIdApplied;

    useEffect(() => {
        fetch("/api/admin/status-definitions?entity_type=payments")
            .then((r) => r.ok ? r.json() : { statuses: [] })
            .then((j: { statuses?: { status_key: string; status_label: string | null }[] }) => setStatusKeyOptions((j.statuses ?? []).filter((s) => s.status_key)));
    }, []);

    const fetchList = useCallback(async () => {
        setLoading(true);
        const params = new URLSearchParams();
        params.set("limit", "100");
        params.set("offset", "0");
        if (status) params.set("status", status);
        if (statusKeyFilter) params.set("status_key", statusKeyFilter);
        if (fromDate) params.set("from_date", fromDate);
        if (toDate) params.set("to_date", toDate);
        if (jobIdApplied) params.set("job_id", jobIdApplied);
        try {
            const res = await fetch(`/api/admin/payments?${params}`);
            const json = await res.json();
            if (res.ok) {
                setPayments(json.payments ?? []);
                setTotal(json.total ?? 0);
            }
        } finally {
            setLoading(false);
        }
    }, [status, statusKeyFilter, fromDate, toDate, jobIdApplied]);

    useEffect(() => {
        fetchList();
    }, [fetchList]);

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
                <div className="absolute left-0 top-full z-20 mt-1.5 w-80 rounded-lg border border-alloy-stone/40 bg-white p-4 shadow-lg">
                    <div className="space-y-3">
                        <div>
                            <label className="mb-1 block text-xs font-medium text-alloy-muted">Payment status</label>
                            <select
                                value={status}
                                onChange={(e) => setStatus(e.target.value)}
                                className="w-full rounded-lg border border-alloy-stone/40 bg-white px-3 py-2 text-sm text-alloy-midnight focus:border-alloy-blue focus:outline-none focus:ring-2 focus:ring-alloy-blue/20"
                            >
                                {STATUS_OPTIONS.map((o) => (
                                    <option key={o.value || "all"} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-medium text-alloy-muted">Status (config)</label>
                            <select
                                value={statusKeyFilter}
                                onChange={(e) => setStatusKeyFilter(e.target.value)}
                                className="w-full rounded-lg border border-alloy-stone/40 bg-white px-3 py-2 text-sm text-alloy-midnight focus:border-alloy-blue focus:outline-none focus:ring-2 focus:ring-alloy-blue/20"
                            >
                                <option value="">All</option>
                                {statusKeyOptions.map((s) => (
                                    <option key={s.status_key} value={s.status_key}>{s.status_label ?? s.status_key}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-medium text-alloy-muted">From date</label>
                            <input
                                type="date"
                                value={fromDate}
                                onChange={(e) => setFromDate(e.target.value)}
                                className="w-full rounded-lg border border-alloy-stone/40 bg-white px-3 py-2 text-sm text-alloy-midnight focus:border-alloy-blue focus:outline-none focus:ring-2 focus:ring-alloy-blue/20"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-medium text-alloy-muted">To date</label>
                            <input
                                type="date"
                                value={toDate}
                                onChange={(e) => setToDate(e.target.value)}
                                className="w-full rounded-lg border border-alloy-stone/40 bg-white px-3 py-2 text-sm text-alloy-midnight focus:border-alloy-blue focus:outline-none focus:ring-2 focus:ring-alloy-blue/20"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-medium text-alloy-muted">Job ID</label>
                            <input
                                type="text"
                                placeholder="Job ID"
                                value={jobIdSearch}
                                onChange={(e) => setJobIdSearch(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), setJobIdApplied(jobIdSearch.trim()), setFilterOpen(false))}
                                className="w-full rounded-lg border border-alloy-stone/40 bg-white px-3 py-2 text-sm font-mono text-alloy-midnight focus:border-alloy-blue focus:outline-none focus:ring-2 focus:ring-alloy-blue/20"
                            />
                        </div>
                        <div className="flex gap-2 pt-1">
                            <button
                                type="button"
                                onClick={() => { setJobIdApplied(jobIdSearch.trim()); setFilterOpen(false); }}
                                className="rounded-lg bg-alloy-blue px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-alloy-blue/30"
                            >
                                Apply
                            </button>
                            {hasActiveFilters && (
                                <button
                                    type="button"
                                    onClick={() => { setStatus(""); setStatusKeyFilter(""); setFromDate(""); setToDate(""); setJobIdSearch(""); setJobIdApplied(""); setFilterOpen(false); }}
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
            <AdminListPageHeader
                title={title}
                subtitle="View-only list. Use filters to narrow results."
                toolbarLeft={filterTrigger}
            />
            <div className="pt-6">
                <div className="rounded-xl border border-alloy-stone/30 bg-white overflow-hidden">
                    {loading ? (
                        <div className="p-10 text-center text-sm text-alloy-muted">Loading…</div>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-alloy-stone/30 bg-alloy-stone/40">
                                            <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-alloy-slate">Created</th>
                                            <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-alloy-slate">Amount</th>
                                            <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-alloy-slate">Status</th>
                                            <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-alloy-slate">Job</th>
                                            <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-alloy-slate">Provider ID</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-alloy-stone/30">
                                        {payments.length === 0 ? (
                                            <tr>
                                                <td colSpan={5} className="px-5 py-14 text-center text-sm text-alloy-muted">No payments found.</td>
                                            </tr>
                                        ) : (
                                            payments.map((p) => (
                                                <tr key={p.id} className="hover:bg-alloy-stone/50">
                                                    <td className="px-5 py-3.5 text-alloy-midnight/90">{formatDateTime(p.created_at)}</td>
                                                    <td className="px-5 py-3.5 text-alloy-midnight/90">{formatMoneyFromCents(p.amount_cents)}</td>
                                                    <td className="px-5 py-3.5">{p.payment_statuses?.key ? <StatusBadge statusKey={p.payment_statuses.key} /> : "—"}</td>
                                                    <td className="px-5 py-3.5">
                                                        {p.job_id ? (
                                                            <button type="button" onClick={() => openDrawer({ type: "jobs", id: p.job_id! })} className="text-alloy-blue hover:underline font-mono text-xs text-left">
                                                                {p.job_id.slice(0, 8)}…
                                                            </button>
                                                        ) : "—"}
                                                    </td>
                                                    <td className="px-5 py-3.5 font-mono text-xs text-alloy-midnight/60">{p.provider_payment_id ?? "—"}</td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            {total > 0 && <p className="px-5 py-2 text-xs text-alloy-muted border-t border-alloy-stone/30">Showing {payments.length} of {total}</p>}
                        </>
                    )}
                </div>
            </div>
        </>
    );
}
