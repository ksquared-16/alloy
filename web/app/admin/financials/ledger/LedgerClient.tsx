"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AdminListPageHeader from "@/components/admin/AdminListPageHeader";
import DataTable from "@/components/admin/DataTable";
import Drawer from "@/components/admin/Drawer";
import { formatDateTime, formatMoneyFromCents, formatDate } from "@/lib/adminFormatters";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { Filter } from "lucide-react";

export type LedgerRow = {
    id: string;
    occurred_at: string;
    status: string;
    type: string;
    direction: string;
    amount_cents: number;
    currency: string;
    provider: string | null;
    provider_ref: string | null;
    job_id: string | null;
    schedule_id: string | null;
    customer_id: string | null;
    vendor_id: string | null;
    journal_entry_id: string | null;
    _customer_name: string | null;
    _vendor_name: string | null;
    _job_label: string | null;
    _schedule_label: string | null;
};

type JournalLine = {
    id: string;
    line_no: number;
    account_id: string;
    description: string | null;
    debit_cents: number;
    credit_cents: number;
    currency: string;
    account?: { code: string; name: string; type: string } | null;
};

const STATUS_OPTIONS = ["pending", "confirmed", "failed", "reversed"];
const DIRECTION_OPTIONS = [
    { value: "", label: "All" },
    { value: "in", label: "In" },
    { value: "out", label: "Out" },
];

function formatType(t: string): string {
    if (!t) return "—";
    return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDirection(d: string): string {
    if (d === "in") return "In";
    if (d === "out") return "Out";
    return d ? d.charAt(0).toUpperCase() + d.slice(1).toLowerCase() : "—";
}

export default function LedgerClient() {
    const { openDrawer } = useAdminDrawer();
    const [data, setData] = useState<LedgerRow[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [limit] = useState(100);
    const [offset, setOffset] = useState(0);
    const [start, setStart] = useState("");
    const [end, setEnd] = useState("");
    const [statuses, setStatuses] = useState<string[]>([]);
    const [direction, setDirection] = useState("");
    const [types, setTypes] = useState<string[]>([]);
    const [provider, setProvider] = useState("");
    const [search, setSearch] = useState("");
    const [filterOpen, setFilterOpen] = useState(false);
    const filterRef = useRef<HTMLDivElement>(null);

    const [detailId, setDetailId] = useState<string | null>(null);
    const [detail, setDetail] = useState<{
        transaction: LedgerRow & { created_at?: string | null; _customer_name?: string | null; _vendor_name?: string | null; _job_label?: string | null; _schedule_label?: string | null };
        journalEntry: Record<string, unknown> | null;
        journalLines: JournalLine[];
    } | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [drawerTab, setDrawerTab] = useState<"overview" | "related" | "activity" | "journal">("overview");

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const fetchList = useCallback(async () => {
        setLoading(true);
        const params = new URLSearchParams();
        params.set("limit", String(limit));
        params.set("offset", String(offset));
        if (start) params.set("start", start);
        if (end) params.set("end", end);
        if (statuses.length) params.set("status", statuses.join(","));
        if (direction) params.set("direction", direction);
        if (types.length) params.set("type", types.join(","));
        if (provider) params.set("provider", provider);
        if (search) params.set("search", search);
        try {
            const res = await fetch(`/api/admin/financials/ledger?${params}`);
            const json = await res.json();
            if (res.ok) {
                setData(json.data ?? []);
                setTotal(json.total ?? 0);
            }
        } finally {
            setLoading(false);
        }
    }, [limit, offset, start, end, statuses, direction, types, provider, search]);

    useEffect(() => {
        fetchList();
    }, [fetchList]);

    const openDetail = useCallback(async (id: string) => {
        setDetailId(id);
        setDetail(null);
        setDrawerTab("overview");
        setDetailLoading(true);
        try {
            const res = await fetch(`/api/admin/financials/ledger/${id}`);
            const json = await res.json();
            if (res.ok) setDetail(json);
        } finally {
            setDetailLoading(false);
        }
    }, []);

    const toggleStatus = (s: string) => {
        setStatuses((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
    };

    const uniqueTypes = useMemo(() => Array.from(new Set(data.map((r) => r.type).filter(Boolean))), [data]);

    const hasActiveFilters = !!start || !!end || !!direction || statuses.length > 0 || types.length > 0 || !!provider || !!search;
    const applyFilter = () => setFilterOpen(false);
    const clearFilter = () => {
        setStart("");
        setEnd("");
        setDirection("");
        setStatuses([]);
        setTypes([]);
        setProvider("");
        setSearch("");
        setFilterOpen(false);
    };

    const columns = useMemo(
        () => [
            { key: "occurred_at", label: "Occurred At", sortable: true, render: (_: unknown, row: LedgerRow) => formatDateTime(row.occurred_at) },
            { key: "type", label: "Type", sortable: true, render: (_: unknown, row: LedgerRow) => formatType(row.type) },
            { key: "direction", label: "Direction", sortable: true, render: (_: unknown, row: LedgerRow) => formatDirection(row.direction) },
            { key: "amount_cents", label: "Amount", sortable: true, render: (_: unknown, row: LedgerRow) => formatMoneyFromCents(row.amount_cents) },
            { key: "status", label: "Status", sortable: true, render: (_: unknown, row: LedgerRow) => row.status || "—" },
            { key: "_customer_name", label: "Customer", sortable: false, render: (_: unknown, row: LedgerRow) => row._customer_name ?? "—" },
            { key: "_vendor_name", label: "Vendor", sortable: false, render: (_: unknown, row: LedgerRow) => row._vendor_name ?? "—" },
            { key: "_job_label", label: "Job", sortable: false, render: (_: unknown, row: LedgerRow) => row._job_label ?? "—" },
            { key: "_schedule_label", label: "Schedule", sortable: false, render: (_: unknown, row: LedgerRow) => row._schedule_label ?? "—" },
            { key: "provider", label: "Provider", sortable: false, render: (_: unknown, row: LedgerRow) => row.provider ?? "—" },
        ],
        []
    );

    let totalDebits = 0;
    let totalCredits = 0;
    if (detail?.journalLines) {
        for (const l of detail.journalLines) {
            totalDebits += Number(l.debit_cents) || 0;
            totalCredits += Number(l.credit_cents) || 0;
        }
    }
    const balanced = detail?.journalLines && detail.journalLines.length > 0 && Math.abs(totalDebits - totalCredits) < 1;
    const txn = detail?.transaction;

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
                <div className="absolute right-0 top-full z-20 mt-1.5 w-72 rounded-lg border border-alloy-stone/40 bg-white p-4 shadow-lg">
                    <div className="space-y-3">
                        <div>
                            <label className="mb-1 block text-xs font-medium text-alloy-muted">Start date</label>
                            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="w-full rounded-lg border border-alloy-stone/40 px-3 py-2 text-sm" />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-medium text-alloy-muted">End date</label>
                            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="w-full rounded-lg border border-alloy-stone/40 px-3 py-2 text-sm" />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-medium text-alloy-muted">Direction</label>
                            <select value={direction} onChange={(e) => setDirection(e.target.value)} className="w-full rounded-lg border border-alloy-stone/40 px-3 py-2 text-sm">
                                {DIRECTION_OPTIONS.map((o) => (
                                    <option key={o.value || "all"} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-medium text-alloy-muted">Status</label>
                            <div className="flex flex-wrap gap-2">
                                {STATUS_OPTIONS.map((s) => (
                                    <label key={s} className="inline-flex items-center gap-1.5 text-sm">
                                        <input type="checkbox" checked={statuses.includes(s)} onChange={() => toggleStatus(s)} className="rounded border-alloy-stone/40 text-alloy-blue" />
                                        {s}
                                    </label>
                                ))}
                            </div>
                        </div>
                        {uniqueTypes.length > 0 && (
                            <div>
                                <label className="mb-1 block text-xs font-medium text-alloy-muted">Type</label>
                                <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
                                    {uniqueTypes.map((t) => (
                                        <label key={t} className="inline-flex items-center gap-1.5 text-sm">
                                            <input type="checkbox" checked={types.includes(t)} onChange={() => setTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))} className="rounded border-alloy-stone/40 text-alloy-blue" />
                                            {formatType(t)}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div>
                            <label className="mb-1 block text-xs font-medium text-alloy-muted">Provider</label>
                            <input type="text" value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="Filter by provider" className="w-full rounded-lg border border-alloy-stone/40 px-3 py-2 text-sm" />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-medium text-alloy-muted">Search (provider ref)</label>
                            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" className="w-full rounded-lg border border-alloy-stone/40 px-3 py-2 text-sm" />
                        </div>
                        <div className="flex gap-2 pt-1">
                            <button type="button" onClick={applyFilter} className="rounded-lg bg-alloy-blue px-3 py-1.5 text-sm font-medium text-white hover:opacity-90">Apply</button>
                            {hasActiveFilters && (
                                <button type="button" onClick={clearFilter} className="rounded-lg px-3 py-1.5 text-sm font-medium text-alloy-muted hover:text-alloy-midnight hover:underline">Clear</button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    return (
        <>
            <AdminListPageHeader title="Ledger" toolbarLeft={filterTrigger} />
            <div className="pt-4">
                <DataTable
                    data={data}
                    columns={columns}
                    hideToolbar
                    loading={loading}
                    onRowClick={(row) => openDetail(row.id)}
                />
            </div>
            {data.length === 0 && !loading && (
                <p className="text-sm text-alloy-midnight/60 py-4">No transactions match the filters.</p>
            )}
            {total > 0 && (
                <div className="mt-4 flex items-center gap-4 text-sm text-alloy-midnight/70">
                    <span>{offset + 1}–{Math.min(offset + limit, total)} of {total}</span>
                    <button type="button" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - limit))} className="text-alloy-blue hover:underline disabled:opacity-50">Previous</button>
                    <button type="button" disabled={offset + limit >= total} onClick={() => setOffset((o) => o + limit)} className="text-alloy-blue hover:underline disabled:opacity-50">Next</button>
                </div>
            )}

            <Drawer
                isOpen={!!detailId}
                onClose={() => setDetailId(null)}
                title={txn ? `Ledger: ${formatDateTime(txn.occurred_at)} · ${formatType(txn.type)}` : "Ledger transaction"}
                zIndexBackdrop={60}
                zIndexPanel={70}
            >
                {detailLoading && <p className="text-sm text-alloy-midnight/60">Loading…</p>}
                {!detailLoading && detail && txn && (
                    <div className="space-y-4">
                        <div className="flex gap-2 rounded-lg border border-admin-border bg-white p-1">
                            {(["overview", "related", "activity", "journal"] as const).map((tab) => (
                                <button
                                    key={tab}
                                    type="button"
                                    onClick={() => setDrawerTab(tab)}
                                    className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize ${drawerTab === tab ? "bg-alloy-blue text-white shadow-sm" : "text-alloy-forge/80 hover:bg-alloy-stone/50"}`}
                                >
                                    {tab}
                                </button>
                            ))}
                        </div>

                        {drawerTab === "overview" && (
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <div><span className="block text-xs font-medium text-alloy-muted">Occurred at</span><span className="text-sm text-alloy-forge">{formatDateTime(txn.occurred_at)}</span></div>
                                    <div><span className="block text-xs font-medium text-alloy-muted">Type</span><span className="text-sm text-alloy-forge">{formatType(txn.type)}</span></div>
                                    <div><span className="block text-xs font-medium text-alloy-muted">Direction</span><span className="text-sm text-alloy-forge">{formatDirection(txn.direction)}</span></div>
                                    <div><span className="block text-xs font-medium text-alloy-muted">Amount</span><span className="text-sm text-alloy-forge font-medium">{formatMoneyFromCents(txn.amount_cents)}</span></div>
                                    <div><span className="block text-xs font-medium text-alloy-muted">Status</span><span className="text-sm text-alloy-forge">{txn.status || "—"}</span></div>
                                    <div><span className="block text-xs font-medium text-alloy-muted">Currency</span><span className="text-sm text-alloy-forge">{txn.currency || "—"}</span></div>
                                    <div><span className="block text-xs font-medium text-alloy-muted">Provider</span><span className="text-sm text-alloy-forge">{txn.provider ?? "—"}</span></div>
                                    <div><span className="block text-xs font-medium text-alloy-muted">Provider ref</span><span className="text-sm text-alloy-forge">{txn.provider_ref ?? "—"}</span></div>
                                </div>
                                <div className="border-t border-admin-border pt-3">
                                    <span className="block text-xs font-semibold uppercase text-alloy-muted mb-2">Linked records</span>
                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                        {txn.customer_id && (
                                            <div>
                                                <span className="block text-xs text-alloy-muted">Customer</span>
                                                <button type="button" onClick={() => openDrawer({ type: "customers", id: txn.customer_id! })} className="text-sm text-alloy-blue hover:underline text-left">
                                                    {txn._customer_name ?? txn.customer_id}
                                                </button>
                                            </div>
                                        )}
                                        {txn.vendor_id && (
                                            <div>
                                                <span className="block text-xs text-alloy-muted">Vendor</span>
                                                <button type="button" onClick={() => openDrawer({ type: "vendors", id: txn.vendor_id! })} className="text-sm text-alloy-blue hover:underline text-left">
                                                    {txn._vendor_name ?? txn.vendor_id}
                                                </button>
                                            </div>
                                        )}
                                        {txn.job_id && (
                                            <div>
                                                <span className="block text-xs text-alloy-muted">Job</span>
                                                <button type="button" onClick={() => openDrawer({ type: "jobs", id: txn.job_id! })} className="text-sm text-alloy-blue hover:underline text-left">
                                                    {txn._job_label ?? txn.job_id}
                                                </button>
                                            </div>
                                        )}
                                        {txn.schedule_id && (
                                            <div>
                                                <span className="block text-xs text-alloy-muted">Schedule</span>
                                                <button type="button" onClick={() => openDrawer({ type: "schedules", id: txn.schedule_id! })} className="text-sm text-alloy-blue hover:underline text-left">
                                                    {txn._schedule_label ?? txn.schedule_id}
                                                </button>
                                            </div>
                                        )}
                                        {!txn.customer_id && !txn.vendor_id && !txn.job_id && !txn.schedule_id && (
                                            <p className="text-sm text-alloy-muted col-span-2">No linked records.</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {drawerTab === "related" && (
                            <div className="space-y-3">
                                {(txn.customer_id || txn.vendor_id || txn.job_id || txn.schedule_id) ? (
                                    <ul className="space-y-2 list-none p-0 m-0">
                                        {txn.customer_id && (
                                            <li>
                                                <span className="text-xs text-alloy-muted">Customer: </span>
                                                <button type="button" onClick={() => openDrawer({ type: "customers", id: txn.customer_id! })} className="text-alloy-blue hover:underline">
                                                    {txn._customer_name ?? "Open"}
                                                </button>
                                            </li>
                                        )}
                                        {txn.vendor_id && (
                                            <li>
                                                <span className="text-xs text-alloy-muted">Vendor: </span>
                                                <button type="button" onClick={() => openDrawer({ type: "vendors", id: txn.vendor_id! })} className="text-alloy-blue hover:underline">
                                                    {txn._vendor_name ?? "Open"}
                                                </button>
                                            </li>
                                        )}
                                        {txn.job_id && (
                                            <li>
                                                <span className="text-xs text-alloy-muted">Job: </span>
                                                <button type="button" onClick={() => openDrawer({ type: "jobs", id: txn.job_id! })} className="text-alloy-blue hover:underline">
                                                    {txn._job_label ?? "Open"}
                                                </button>
                                            </li>
                                        )}
                                        {txn.schedule_id && (
                                            <li>
                                                <span className="text-xs text-alloy-muted">Schedule: </span>
                                                <button type="button" onClick={() => openDrawer({ type: "schedules", id: txn.schedule_id! })} className="text-alloy-blue hover:underline">
                                                    {txn._schedule_label ?? "Open"}
                                                </button>
                                            </li>
                                        )}
                                    </ul>
                                ) : (
                                    <p className="text-sm text-alloy-muted">No related records.</p>
                                )}
                                <p className="text-xs text-alloy-muted">Payment: linked by provider ref where applicable; no direct payment id on transaction.</p>
                            </div>
                        )}

                        {drawerTab === "activity" && (
                            <div className="space-y-3">
                                {txn.created_at && (
                                    <div><span className="block text-xs font-medium text-alloy-muted">Created</span><span className="text-sm text-alloy-forge">{formatDateTime(txn.created_at)}</span></div>
                                )}
                                <div><span className="block text-xs font-medium text-alloy-muted">Occurred at</span><span className="text-sm text-alloy-forge">{formatDateTime(txn.occurred_at)}</span></div>
                                {!txn.created_at && <p className="text-sm text-alloy-muted">No additional activity data.</p>}
                            </div>
                        )}

                        {drawerTab === "journal" && (
                            <div className="space-y-3">
                                {detail.journalLines && detail.journalLines.length > 0 ? (
                                    <>
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="border-b border-admin-border">
                                                <th className="pb-2 pr-2 text-left font-semibold text-alloy-muted">#</th>
                                                <th className="pb-2 pr-2 text-left font-semibold text-alloy-muted">Account code</th>
                                                <th className="pb-2 pr-2 text-left font-semibold text-alloy-muted">Account name</th>
                                                <th className="pb-2 pr-2 text-left font-semibold text-alloy-muted">Description</th>
                                                <th className="pb-2 pr-2 text-right font-semibold text-alloy-muted">Debit</th>
                                                <th className="pb-2 pr-2 text-right font-semibold text-alloy-muted">Credit</th>
                                                <th className="pb-2 text-left font-semibold text-alloy-muted">Currency</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-admin-border">
                                                {detail.journalLines.map((l) => (
                                                    <tr key={l.id}>
                                                        <td className="py-1.5 pr-2 text-alloy-forge">{l.line_no}</td>
                                                        <td className="py-1.5 pr-2 text-alloy-forge">{l.account ? (l.account as { code: string }).code : "—"}</td>
                                                        <td className="py-1.5 pr-2 text-alloy-forge">{l.account ? (l.account as { name: string }).name : "—"}</td>
                                                        <td className="py-1.5 pr-2 text-alloy-muted">{l.description ?? "—"}</td>
                                                        <td className="py-1.5 pr-2 text-right text-alloy-forge">{l.debit_cents ? formatMoneyFromCents(l.debit_cents) : "—"}</td>
                                                        <td className="py-1.5 pr-2 text-right text-alloy-forge">{l.credit_cents ? formatMoneyFromCents(l.credit_cents) : "—"}</td>
                                                        <td className="py-1.5 text-alloy-muted">{l.currency ?? "—"}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        <div className="flex justify-between text-sm border-t border-admin-border pt-2">
                                            <span>Total debits: {formatMoneyFromCents(totalDebits)}</span>
                                            <span>Total credits: {formatMoneyFromCents(totalCredits)}</span>
                                        </div>
                                        <p className={`text-sm font-medium ${balanced ? "text-green-600" : "text-amber-600"}`}>{balanced ? "Balanced" : "Not balanced"}</p>
                                    </>
                                ) : (
                                    <p className="text-sm text-alloy-muted">No journal lines for this transaction.</p>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </Drawer>
        </>
    );
}
