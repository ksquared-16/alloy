"use client";

import { useCallback, useEffect, useState } from "react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import SectionCard from "@/components/admin/SectionCard";
import { formatDateTime, formatMoneyFromCents } from "@/lib/adminFormatters";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";

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
    const title = labels?.payments?.plural ?? "Payments";
    const [payments, setPayments] = useState<PaymentRow[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState("");
    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");
    const [jobIdSearch, setJobIdSearch] = useState("");
    const [jobIdApplied, setJobIdApplied] = useState("");

    const fetchList = useCallback(async () => {
        setLoading(true);
        const params = new URLSearchParams();
        params.set("limit", "100");
        params.set("offset", "0");
        if (status) params.set("status", status);
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
    }, [status, fromDate, toDate, jobIdApplied]);

    useEffect(() => {
        fetchList();
    }, [fetchList]);

    return (
        <>
            <AdminPageHeader title={title} />
            <SectionCard title="Filters" className="mb-4">
                <div className="flex flex-wrap items-end gap-4">
                    <div>
                        <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">Status</label>
                        <select
                            value={status}
                            onChange={(e) => setStatus(e.target.value)}
                            className="px-2 py-1.5 border border-alloy-stone/40 rounded text-sm min-w-[120px]"
                        >
                            {STATUS_OPTIONS.map((o) => (
                                <option key={o.value || "all"} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">From date</label>
                        <input
                            type="date"
                            value={fromDate}
                            onChange={(e) => setFromDate(e.target.value)}
                            className="px-2 py-1.5 border border-alloy-stone/40 rounded text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">To date</label>
                        <input
                            type="date"
                            value={toDate}
                            onChange={(e) => setToDate(e.target.value)}
                            className="px-2 py-1.5 border border-alloy-stone/40 rounded text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">Job ID</label>
                        <div className="flex gap-1">
                            <input
                                type="text"
                                placeholder="Job ID"
                                value={jobIdSearch}
                                onChange={(e) => setJobIdSearch(e.target.value)}
                                className="px-2 py-1.5 border border-alloy-stone/40 rounded text-sm w-48 font-mono text-xs"
                            />
                            <button
                                type="button"
                                onClick={() => setJobIdApplied(jobIdSearch.trim())}
                                className="px-3 py-1.5 text-sm bg-alloy-stone/30 rounded hover:bg-alloy-stone/50"
                            >
                                Apply
                            </button>
                            {jobIdApplied && (
                                <button
                                    type="button"
                                    onClick={() => { setJobIdSearch(""); setJobIdApplied(""); }}
                                    className="px-2 py-1.5 text-sm text-alloy-midnight/70 hover:underline"
                                >
                                    Clear
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </SectionCard>
            <SectionCard title="Payments (view-only)">
                {loading ? (
                    <p className="text-sm text-alloy-midnight/60">Loading…</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-alloy-stone/30 text-left text-alloy-midnight/70">
                                    <th className="pb-2 pr-4">Created</th>
                                    <th className="pb-2 pr-4">Amount</th>
                                    <th className="pb-2 pr-4">Status</th>
                                    <th className="pb-2 pr-4">Job</th>
                                    <th className="pb-2 pr-4">Provider ID</th>
                                </tr>
                            </thead>
                            <tbody>
                                {payments.length === 0 ? (
                                    <tr><td colSpan={5} className="py-4 text-alloy-midnight/60">No payments found.</td></tr>
                                ) : (
                                    payments.map((p) => (
                                        <tr key={p.id} className="border-b border-alloy-stone/20">
                                            <td className="py-2 pr-4">{formatDateTime(p.created_at)}</td>
                                            <td className="py-2 pr-4">{formatMoneyFromCents(p.amount_cents)}</td>
                                            <td className="py-2 pr-4">{p.payment_statuses?.key ? <StatusBadge statusKey={p.payment_statuses.key} /> : "—"}</td>
                                            <td className="py-2 pr-4">
                                                {p.job_id ? (
                                                    <button type="button" onClick={() => openDrawer({ type: "jobs", id: p.job_id! })} className="text-alloy-blue hover:underline font-mono text-xs text-left">
                                                        {p.job_id.slice(0, 8)}…
                                                    </button>
                                                ) : "—"}
                                            </td>
                                            <td className="py-2 pr-4 font-mono text-xs text-alloy-midnight/60">{p.provider_payment_id ?? "—"}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
                {!loading && total > 0 && <p className="mt-2 text-xs text-alloy-midnight/60">Showing {payments.length} of {total}</p>}
            </SectionCard>
        </>
    );
}
