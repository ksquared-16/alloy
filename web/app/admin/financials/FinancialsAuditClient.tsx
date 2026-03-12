"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import SectionCard from "@/components/admin/SectionCard";
import Drawer from "@/components/admin/Drawer";
import { formatDateTime, formatMoneyFromCents } from "@/lib/adminFormatters";

type LedgerRow = {
    id: string;
    occurred_at: string;
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
};

type JournalEntryRow = {
    id: string;
    entry_date: string | null;
    status: string | null;
    source_type: string | null;
    source_id: string | null;
    description: string | null;
    created_at: string | null;
};

type JournalEntryDetail = {
    entry: {
        id: string;
        entry_date: string | null;
        status: string | null;
        source_type: string | null;
        source_id: string | null;
        description: string | null;
        created_at: string | null;
    };
    lines: {
        line_no: number;
        account_id: string;
        account_code: string | null;
        account_name: string | null;
        debit_cents: number;
        credit_cents: number;
        job_id: string | null;
        schedule_id: string | null;
        customer_id: string | null;
        vendor_id: string | null;
    }[];
};

const DIRECTION_OPTIONS = ["in", "out"];
const TYPE_OPTIONS = ["customer_payment", "vendor_payout", "schedule_completed"];
const SOURCE_TYPE_OPTIONS = ["schedule_completed", "customer_payment", "vendor_payout"];

function truncateId(id: string | null): string {
    if (!id) return "—";
    return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

export default function FinancialsAuditClient() {
    const { openDrawer } = useAdminDrawer();
    const [tab, setTab] = useState<"ledger" | "journal">("ledger");

    const [ledgerData, setLedgerData] = useState<LedgerRow[]>([]);
    const [ledgerTotal, setLedgerTotal] = useState(0);
    const [ledgerLoading, setLedgerLoading] = useState(false);
    const [journalData, setJournalData] = useState<JournalEntryRow[]>([]);
    const [journalTotal, setJournalTotal] = useState(0);
    const [journalLoading, setJournalLoading] = useState(false);

    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [typeFilter, setTypeFilter] = useState("");
    const [directionFilter, setDirectionFilter] = useState("");
    const [sourceTypeFilter, setSourceTypeFilter] = useState("");
    const [jobIdFilter, setJobIdFilter] = useState("");
    const [scheduleIdFilter, setScheduleIdFilter] = useState("");
    const [customerIdFilter, setCustomerIdFilter] = useState("");
    const [vendorIdFilter, setVendorIdFilter] = useState("");
    const [limit] = useState(100);

    const [jeDetailId, setJeDetailId] = useState<string | null>(null);
    const [jeDetail, setJeDetail] = useState<JournalEntryDetail | null>(null);
    const [jeDetailLoading, setJeDetailLoading] = useState(false);

    const fetchLedger = useCallback(async () => {
        setLedgerLoading(true);
        const params = new URLSearchParams();
        params.set("limit", String(limit));
        if (dateFrom) params.set("date_from", dateFrom);
        if (dateTo) params.set("date_to", dateTo);
        if (typeFilter) params.set("type", typeFilter);
        if (directionFilter) params.set("direction", directionFilter);
        if (jobIdFilter) params.set("job_id", jobIdFilter.trim());
        if (scheduleIdFilter) params.set("schedule_id", scheduleIdFilter.trim());
        if (customerIdFilter) params.set("customer_id", customerIdFilter.trim());
        if (vendorIdFilter) params.set("vendor_id", vendorIdFilter.trim());
        try {
            const res = await fetch(`/api/admin/financials/ledger?${params}`);
            const json = await res.json();
            if (res.ok) {
                setLedgerData(json.data ?? []);
                setLedgerTotal(json.total ?? 0);
            }
        } finally {
            setLedgerLoading(false);
        }
    }, [limit, dateFrom, dateTo, typeFilter, directionFilter, jobIdFilter, scheduleIdFilter, customerIdFilter, vendorIdFilter]);

    const fetchJournal = useCallback(async () => {
        setJournalLoading(true);
        const params = new URLSearchParams();
        params.set("limit", String(limit));
        if (dateFrom) params.set("date_from", dateFrom);
        if (dateTo) params.set("date_to", dateTo);
        if (sourceTypeFilter) params.set("source_type", sourceTypeFilter);
        if (jobIdFilter) params.set("job_id", jobIdFilter.trim());
        if (scheduleIdFilter) params.set("schedule_id", scheduleIdFilter.trim());
        if (customerIdFilter) params.set("customer_id", customerIdFilter.trim());
        if (vendorIdFilter) params.set("vendor_id", vendorIdFilter.trim());
        try {
            const res = await fetch(`/api/admin/financials/journal-entries?${params}`);
            const json = await res.json();
            if (res.ok) {
                setJournalData(json.data ?? []);
                setJournalTotal(json.total ?? 0);
            }
        } finally {
            setJournalLoading(false);
        }
    }, [limit, dateFrom, dateTo, sourceTypeFilter, jobIdFilter, scheduleIdFilter, customerIdFilter, vendorIdFilter]);

    useEffect(() => {
        if (tab === "ledger") fetchLedger();
    }, [tab, fetchLedger]);

    useEffect(() => {
        if (tab === "journal") fetchJournal();
    }, [tab, fetchJournal]);

    const applyFilters = () => {
        if (tab === "ledger") fetchLedger();
        else fetchJournal();
    };

    const clearFilters = () => {
        setDateFrom("");
        setDateTo("");
        setTypeFilter("");
        setDirectionFilter("");
        setSourceTypeFilter("");
        setJobIdFilter("");
        setScheduleIdFilter("");
        setCustomerIdFilter("");
        setVendorIdFilter("");
    };

    const openJeDetail = useCallback(async (entryId: string) => {
        setJeDetailId(entryId);
        setJeDetail(null);
        setJeDetailLoading(true);
        try {
            const res = await fetch(`/api/admin/financials/journal-entries/${entryId}`);
            const json = await res.json();
            if (res.ok) setJeDetail(json);
        } finally {
            setJeDetailLoading(false);
        }
    }, []);

    const handleLedgerJeClick = (e: React.MouseEvent, journalEntryId: string | null) => {
        e.stopPropagation();
        if (journalEntryId) openJeDetail(journalEntryId);
    };

    return (
        <div className="space-y-6">
            <AdminPageHeader
                title="Financials"
                subtitle="Audit ledger transactions and journal entries."
            />

            <div className="flex gap-2 border-b border-admin-border">
                <button
                    type="button"
                    onClick={() => setTab("ledger")}
                    className={`px-4 py-2 text-sm font-medium rounded-t-md border-b-2 -mb-px transition-colors ${tab === "ledger" ? "border-alloy-pine text-alloy-pine" : "border-transparent text-alloy-muted hover:bg-alloy-pine/5"}`}
                >
                    Ledger transactions
                </button>
                <button
                    type="button"
                    onClick={() => setTab("journal")}
                    className={`px-4 py-2 text-sm font-medium rounded-t-md border-b-2 -mb-px transition-colors ${tab === "journal" ? "border-alloy-pine text-alloy-pine" : "border-transparent text-alloy-muted hover:bg-alloy-pine/5"}`}
                >
                    Journal entries
                </button>
            </div>

            <SectionCard title="Filters">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                        <label className="block text-xs font-semibold text-[#59678b] mb-1">Date from</label>
                        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full px-3 py-2 border border-[#e6e8ec] rounded-md text-sm" />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-[#59678b] mb-1">Date to</label>
                        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full px-3 py-2 border border-[#e6e8ec] rounded-md text-sm" />
                    </div>
                    {tab === "ledger" && (
                        <>
                            <div>
                                <label className="block text-xs font-semibold text-[#59678b] mb-1">Type</label>
                                <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-full px-3 py-2 border border-[#e6e8ec] rounded-md text-sm">
                                    <option value="">All</option>
                                    {TYPE_OPTIONS.map((t) => (
                                        <option key={t} value={t}>{t}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-[#59678b] mb-1">Direction</label>
                                <select value={directionFilter} onChange={(e) => setDirectionFilter(e.target.value)} className="w-full px-3 py-2 border border-[#e6e8ec] rounded-md text-sm">
                                    <option value="">All</option>
                                    {DIRECTION_OPTIONS.map((d) => (
                                        <option key={d} value={d}>{d}</option>
                                    ))}
                                </select>
                            </div>
                        </>
                    )}
                    {tab === "journal" && (
                        <div>
                            <label className="block text-xs font-semibold text-[#59678b] mb-1">Source type</label>
                            <select value={sourceTypeFilter} onChange={(e) => setSourceTypeFilter(e.target.value)} className="w-full px-3 py-2 border border-[#e6e8ec] rounded-md text-sm">
                                <option value="">All</option>
                                {SOURCE_TYPE_OPTIONS.map((t) => (
                                    <option key={t} value={t}>{t}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mt-3">
                    <div>
                        <label className="block text-xs font-semibold text-[#59678b] mb-1">Job ID</label>
                        <input type="text" value={jobIdFilter} onChange={(e) => setJobIdFilter(e.target.value)} placeholder="UUID" className="w-full px-3 py-2 border border-[#e6e8ec] rounded-md text-sm font-mono" />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-[#59678b] mb-1">Schedule ID</label>
                        <input type="text" value={scheduleIdFilter} onChange={(e) => setScheduleIdFilter(e.target.value)} placeholder="UUID" className="w-full px-3 py-2 border border-[#e6e8ec] rounded-md text-sm font-mono" />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-[#59678b] mb-1">Customer ID</label>
                        <input type="text" value={customerIdFilter} onChange={(e) => setCustomerIdFilter(e.target.value)} placeholder="UUID" className="w-full px-3 py-2 border border-[#e6e8ec] rounded-md text-sm font-mono" />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-[#59678b] mb-1">Vendor ID</label>
                        <input type="text" value={vendorIdFilter} onChange={(e) => setVendorIdFilter(e.target.value)} placeholder="UUID" className="w-full px-3 py-2 border border-[#e6e8ec] rounded-md text-sm font-mono" />
                    </div>
                </div>
                <div className="mt-3 flex gap-2">
                    <button type="button" onClick={applyFilters} className="px-3 py-1.5 text-sm bg-alloy-blue text-white rounded-md hover:opacity-90">Apply</button>
                    <button type="button" onClick={clearFilters} className="px-3 py-1.5 text-sm border border-[#e6e8ec] rounded-md hover:bg-[#F4F6F9]">Clear</button>
                </div>
            </SectionCard>

            {tab === "ledger" && (
                <SectionCard title="Ledger transactions">
                    {ledgerLoading ? (
                        <p className="text-sm text-[#59678b]">Loading…</p>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-[#e6e8ec]">
                                            <th className="pb-2 pr-2 text-left font-semibold text-[#59678b]">Occurred</th>
                                            <th className="pb-2 pr-2 text-left font-semibold text-[#59678b]">Type</th>
                                            <th className="pb-2 pr-2 text-left font-semibold text-[#59678b]">Direction</th>
                                            <th className="pb-2 pr-2 text-right font-semibold text-[#59678b]">Amount</th>
                                            <th className="pb-2 pr-2 text-left font-semibold text-[#59678b]">Provider</th>
                                            <th className="pb-2 pr-2 text-left font-semibold text-[#59678b]">Provider ref</th>
                                            <th className="pb-2 pr-2 text-left font-semibold text-[#59678b]">Job</th>
                                            <th className="pb-2 pr-2 text-left font-semibold text-[#59678b]">Schedule</th>
                                            <th className="pb-2 pr-2 text-left font-semibold text-[#59678b]">Customer</th>
                                            <th className="pb-2 pr-2 text-left font-semibold text-[#59678b]">Vendor</th>
                                            <th className="pb-2 text-left font-semibold text-[#59678b]">JE</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#e6e8ec]">
                                        {ledgerData.map((row) => (
                                            <tr key={row.id} className="hover:bg-[#F4F6F9]/50">
                                                <td className="py-2 pr-2 text-[#31394d]">{formatDateTime(row.occurred_at)}</td>
                                                <td className="py-2 pr-2 text-[#31394d]">{row.type}</td>
                                                <td className="py-2 pr-2 text-[#31394d]">{row.direction}</td>
                                                <td className="py-2 pr-2 text-right text-[#31394d]">{formatMoneyFromCents(row.amount_cents)}</td>
                                                <td className="py-2 pr-2 text-[#59678b]">{row.provider ?? "—"}</td>
                                                <td className="py-2 pr-2 text-[#59678b] truncate max-w-[120px]" title={row.provider_ref ?? undefined}>{row.provider_ref ?? "—"}</td>
                                                <td className="py-2 pr-2">
                                                    {row.job_id ? (
                                                        <button type="button" onClick={() => openDrawer({ type: "jobs", id: row.job_id! })} className="text-alloy-blue hover:underline font-mono text-xs text-left">
                                                            {truncateId(row.job_id)}
                                                        </button>
                                                    ) : (
                                                        <span className="text-[#59678b]">—</span>
                                                    )}
                                                </td>
                                                <td className="py-2 pr-2">
                                                    {row.schedule_id ? (
                                                        <button type="button" onClick={() => openDrawer({ type: "schedules", id: row.schedule_id! })} className="text-alloy-blue hover:underline font-mono text-xs text-left">
                                                            {truncateId(row.schedule_id)}
                                                        </button>
                                                    ) : (
                                                        <span className="text-[#59678b]">—</span>
                                                    )}
                                                </td>
                                                <td className="py-2 pr-2">
                                                    {row.customer_id ? (
                                                        <button type="button" onClick={() => openDrawer({ type: "customers", id: row.customer_id! })} className="text-alloy-blue hover:underline font-mono text-xs text-left">
                                                            {truncateId(row.customer_id)}
                                                        </button>
                                                    ) : (
                                                        <span className="text-[#59678b]">—</span>
                                                    )}
                                                </td>
                                                <td className="py-2 pr-2">
                                                    {row.vendor_id ? (
                                                        <button type="button" onClick={() => openDrawer({ type: "vendors", id: row.vendor_id! })} className="text-alloy-blue hover:underline font-mono text-xs text-left">
                                                            {truncateId(row.vendor_id)}
                                                        </button>
                                                    ) : (
                                                        <span className="text-[#59678b]">—</span>
                                                    )}
                                                </td>
                                                <td className="py-2">
                                                    {row.journal_entry_id ? (
                                                        <button type="button" onClick={(e) => handleLedgerJeClick(e, row.journal_entry_id)} className="text-alloy-blue hover:underline font-mono text-xs text-left">
                                                            {truncateId(row.journal_entry_id)}
                                                        </button>
                                                    ) : (
                                                        <span className="text-[#59678b]">—</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {ledgerData.length === 0 && <p className="text-sm text-[#59678b] py-4">No transactions match the filters.</p>}
                            <p className="text-xs text-[#59678b] mt-2">Showing up to {limit} of {ledgerTotal}</p>
                        </>
                    )}
                </SectionCard>
            )}

            {tab === "journal" && (
                <SectionCard title="Journal entries">
                    {journalLoading ? (
                        <p className="text-sm text-[#59678b]">Loading…</p>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-[#e6e8ec]">
                                            <th className="pb-2 pr-2 text-left font-semibold text-[#59678b]">Entry date</th>
                                            <th className="pb-2 pr-2 text-left font-semibold text-[#59678b]">Source type</th>
                                            <th className="pb-2 pr-2 text-left font-semibold text-[#59678b]">Source id</th>
                                            <th className="pb-2 pr-2 text-left font-semibold text-[#59678b]">Status</th>
                                            <th className="pb-2 pr-2 text-left font-semibold text-[#59678b]">Description</th>
                                            <th className="pb-2 pr-2 text-left font-semibold text-[#59678b]">Created</th>
                                            <th className="pb-2 text-left font-semibold text-[#59678b]">View</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#e6e8ec]">
                                        {journalData.map((row) => (
                                            <tr
                                                key={row.id}
                                                className="hover:bg-[#F4F6F9]/50 cursor-pointer"
                                                onClick={() => openJeDetail(row.id)}
                                            >
                                                <td className="py-2 pr-2 text-[#31394d]">{row.entry_date ?? "—"}</td>
                                                <td className="py-2 pr-2 text-[#31394d]">{row.source_type ?? "—"}</td>
                                                <td className="py-2 pr-2 font-mono text-xs text-[#31394d]">{truncateId(row.source_id)}</td>
                                                <td className="py-2 pr-2 text-[#31394d]">{row.status ?? "—"}</td>
                                                <td className="py-2 pr-2 text-[#59678b] truncate max-w-[200px]" title={row.description ?? undefined}>{row.description ?? "—"}</td>
                                                <td className="py-2 pr-2 text-[#59678b]">{row.created_at ? formatDateTime(row.created_at) : "—"}</td>
                                                <td className="py-2 text-alloy-blue hover:underline">View</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {journalData.length === 0 && <p className="text-sm text-[#59678b] py-4">No journal entries match the filters.</p>}
                            <p className="text-xs text-[#59678b] mt-2">Showing up to {limit} of {journalTotal}</p>
                        </>
                    )}
                </SectionCard>
            )}

            <Drawer
                isOpen={!!jeDetailId}
                onClose={() => { setJeDetailId(null); setJeDetail(null); }}
                title="Journal entry"
            >
                {jeDetailLoading && <p className="text-sm text-[#59678b]">Loading…</p>}
                {!jeDetailLoading && jeDetail && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                            <span className="text-[#59678b]">Entry date</span><span>{jeDetail.entry.entry_date ?? "—"}</span>
                            <span className="text-[#59678b]">Status</span><span>{jeDetail.entry.status ?? "—"}</span>
                            <span className="text-[#59678b]">Source type</span><span>{jeDetail.entry.source_type ?? "—"}</span>
                            <span className="text-[#59678b]">Source id</span><span className="font-mono text-xs">{jeDetail.entry.source_id ?? "—"}</span>
                            <span className="text-[#59678b]">Description</span><span className="col-span-2">{jeDetail.entry.description ?? "—"}</span>
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold text-[#59678b] mb-2">Lines</h3>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-[#e6e8ec]">
                                            <th className="pb-2 pr-2 text-left font-semibold text-[#59678b]">#</th>
                                            <th className="pb-2 pr-2 text-left font-semibold text-[#59678b]">Account</th>
                                            <th className="pb-2 pr-2 text-right font-semibold text-[#59678b]">Debit</th>
                                            <th className="pb-2 pr-2 text-right font-semibold text-[#59678b]">Credit</th>
                                            <th className="pb-2 pr-2 text-left font-semibold text-[#59678b]">Job</th>
                                            <th className="pb-2 pr-2 text-left font-semibold text-[#59678b]">Schedule</th>
                                            <th className="pb-2 pr-2 text-left font-semibold text-[#59678b]">Customer</th>
                                            <th className="pb-2 text-left font-semibold text-[#59678b]">Vendor</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#e6e8ec]">
                                        {jeDetail.lines.map((line) => (
                                            <tr key={line.line_no}>
                                                <td className="py-1.5 pr-2">{line.line_no}</td>
                                                <td className="py-1.5 pr-2">{(line.account_code ?? line.account_name ?? line.account_id) || "—"}</td>
                                                <td className="py-1.5 pr-2 text-right">{line.debit_cents > 0 ? formatMoneyFromCents(line.debit_cents) : "—"}</td>
                                                <td className="py-1.5 pr-2 text-right">{line.credit_cents > 0 ? formatMoneyFromCents(line.credit_cents) : "—"}</td>
                                                <td className="py-1.5 pr-2">
                                                    {line.job_id ? (
                                                        <button type="button" onClick={() => openDrawer({ type: "jobs", id: line.job_id! })} className="text-alloy-blue hover:underline font-mono text-xs">{truncateId(line.job_id)}</button>
                                                    ) : "—"}
                                                </td>
                                                <td className="py-1.5 pr-2">
                                                    {line.schedule_id ? (
                                                        <button type="button" onClick={() => openDrawer({ type: "schedules", id: line.schedule_id! })} className="text-alloy-blue hover:underline font-mono text-xs">{truncateId(line.schedule_id)}</button>
                                                    ) : "—"}
                                                </td>
                                                <td className="py-1.5 pr-2">
                                                    {line.customer_id ? (
                                                        <button type="button" onClick={() => openDrawer({ type: "customers", id: line.customer_id! })} className="text-alloy-blue hover:underline font-mono text-xs">{truncateId(line.customer_id)}</button>
                                                    ) : "—"}
                                                </td>
                                                <td className="py-1.5">
                                                    {line.vendor_id ? (
                                                        <button type="button" onClick={() => openDrawer({ type: "vendors", id: line.vendor_id! })} className="text-alloy-blue hover:underline font-mono text-xs">{truncateId(line.vendor_id)}</button>
                                                    ) : "—"}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
                {!jeDetailLoading && !jeDetail && jeDetailId && <p className="text-sm text-[#59678b]">Could not load entry.</p>}
            </Drawer>
        </div>
    );
}
