"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AdminListPageHeader from "@/components/admin/AdminListPageHeader";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";
import DataTable from "@/components/admin/DataTable";
import { StatusBadge, getStatusVariant } from "@/components/admin/StatusBadge";
import { buildEntityTableColumns } from "@/components/admin/entity/buildEntityTableColumns";
import { Filter } from "lucide-react";

export type PaymentRow = {
    id: string;
    created_at: string;
    updated_at?: string | null;
    amount_cents: number;
    provider_payment_id: string | null;
    payment_status_id: string;
    job_id: string | null;
    customer_id: string | null;
    status_key: string | null;
    payment_statuses: { key: string; label?: string | null } | null;
    paid_at?: string | null;
    posted_to_ledger_at?: string | null;
    provider?: string | null;
    _payment_label?: string | null;
    _customer_name?: string | null;
    _job_label?: string | null;
    _status_display?: string | null;
    _amount_display?: number | null;
    _posted_yes_no?: boolean;
    _updated?: string | null;
};

const STATUS_OPTIONS = [
    { value: "", label: "All" },
    { value: "paid", label: "Paid" },
    { value: "pending", label: "Pending" },
    { value: "failed", label: "Failed" },
];

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

    const hasActiveFilters = !!status || !!statusKeyFilter || !!fromDate || !!toDate || !!jobIdApplied;

    useEffect(() => {
        fetch("/api/admin/status-definitions?entity_type=payments")
            .then((r) => (r.ok ? r.json() : { statuses: [] }))
            .then((j: { statuses?: { status_key: string; status_label: string | null }[] }) =>
                setStatusKeyOptions((j.statuses ?? []).filter((s) => s.status_key))
            );
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

    useEffect(() => {
        const onSaved = (e: Event) => {
            const d = (e as CustomEvent<{ type: string; id: string }>)?.detail;
            if (d?.type === "payments") fetchList();
        };
        window.addEventListener("admin-entity-saved", onSaved);
        return () => window.removeEventListener("admin-entity-saved", onSaved);
    }, [fetchList]);

    const columns = useMemo(() => {
        return buildEntityTableColumns<PaymentRow>("payments", {
            _customer_name: (_value: unknown, row: PaymentRow) => {
                const name = row._customer_name ?? "—";
                const id = row.customer_id;
                if (!id) return <span className="text-alloy-midnight/70">{name}</span>;
                return (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            openDrawer({ type: "customers", id });
                        }}
                        className="text-left text-alloy-blue hover:underline"
                    >
                        {name}
                    </button>
                );
            },
            _job_label: (_value: unknown, row: PaymentRow) => {
                const name = row._job_label ?? "—";
                const id = row.job_id;
                if (!id) return <span className="text-alloy-midnight/70">{name}</span>;
                return (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            openDrawer({ type: "jobs", id });
                        }}
                        className="text-left text-alloy-blue hover:underline"
                    >
                        {name}
                    </button>
                );
            },
            _status_display: (_value: unknown, row: PaymentRow) => {
                const sk = row.status_key ?? null;
                const label =
                    (sk && statusKeyOptions.find((s) => s.status_key === sk)?.status_label?.trim()) ||
                    row._status_display ||
                    sk ||
                    "—";
                return <StatusBadge label={label} variant={getStatusVariant(sk)} />;
            },
        });
    }, [openDrawer, statusKeyOptions]);

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
                                onClick={() => {
                                    setJobIdApplied(jobIdSearch.trim());
                                    setFilterOpen(false);
                                }}
                                className="rounded-lg bg-alloy-blue px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-alloy-blue/30"
                            >
                                Apply
                            </button>
                            {hasActiveFilters && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setStatus("");
                                        setStatusKeyFilter("");
                                        setFromDate("");
                                        setToDate("");
                                        setJobIdSearch("");
                                        setJobIdApplied("");
                                        setFilterOpen(false);
                                    }}
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
            <AdminListPageHeader title={title} toolbarLeft={filterTrigger} />
            <div className="pt-4">
                <DataTable
                    data={payments}
                    columns={columns}
                    filters={[]}
                    searchable={false}
                    hideToolbar
                    loading={loading}
                    onRowClick={(row) => openDrawer({ type: "payments", id: row.id })}
                />
                {total > 0 && (
                    <p className="mt-2 px-1 text-xs text-alloy-muted">Showing {payments.length} of {total}</p>
                )}
            </div>
        </>
    );
}
