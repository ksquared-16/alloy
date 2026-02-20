"use client";

import { useCallback, useEffect, useState } from "react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import SectionCard from "@/components/admin/SectionCard";
import Drawer from "@/components/admin/Drawer";
import { formatDateTime, formatMoneyFromCents } from "@/lib/adminFormatters";

type LedgerTxn = {
    id: string;
    occurred_at: string;
    status: string;
    type: string;
    direction: string;
    amount_cents: number;
    currency: string;
    provider: string | null;
    provider_ref: string | null;
    journal_entry_id: string | null;
    metadata: unknown;
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
const DIRECTION_OPTIONS = ["in", "out"];

export default function LedgerClient() {
    const [data, setData] = useState<LedgerTxn[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [limit] = useState(50);
    const [offset, setOffset] = useState(0);
    const [start, setStart] = useState("");
    const [end, setEnd] = useState("");
    const [statuses, setStatuses] = useState<string[]>([]);
    const [direction, setDirection] = useState("");
    const [types, setTypes] = useState<string[]>([]);
    const [provider, setProvider] = useState("");
    const [search, setSearch] = useState("");
    const [detailId, setDetailId] = useState<string | null>(null);
    const [detail, setDetail] = useState<{
        transaction: LedgerTxn;
        journalEntry: Record<string, unknown> | null;
        journalLines: JournalLine[];
    } | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);

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

    const toggleType = (t: string) => {
        if (!t) return;
        setTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
    };

    const uniqueTypes = Array.from(new Set(data.map((r) => r.type).filter(Boolean)));

    let totalDebits = 0;
    let totalCredits = 0;
    if (detail?.journalLines) {
        for (const l of detail.journalLines) {
            totalDebits += Number(l.debit_cents) || 0;
            totalCredits += Number(l.credit_cents) || 0;
        }
    }
    const balanced = detail?.journalLines && Math.abs(totalDebits - totalCredits) < 1;

    return (
        <div className="space-y-6">
            <AdminPageHeader title="Ledger" subtitle="Ledger transactions and linked journal entries." />

            <SectionCard title="Filters">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                        <label className="block text-xs font-semibold text-[#59678b] mb-1">Start date</label>
                        <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="w-full px-3 py-2 border border-[#e6e8ec] rounded-md text-sm" />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-[#59678b] mb-1">End date</label>
                        <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="w-full px-3 py-2 border border-[#e6e8ec] rounded-md text-sm" />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-[#59678b] mb-1">Direction</label>
                        <select value={direction} onChange={(e) => setDirection(e.target.value)} className="w-full px-3 py-2 border border-[#e6e8ec] rounded-md text-sm">
                            <option value="">All</option>
                            {DIRECTION_OPTIONS.map((d) => (
                                <option key={d} value={d}>{d}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-[#59678b] mb-1">Provider</label>
                        <input type="text" value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="Filter by provider" className="w-full px-3 py-2 border border-[#e6e8ec] rounded-md text-sm" />
                    </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 items-center">
                    <span className="text-xs font-semibold text-[#59678b]">Status:</span>
                    {STATUS_OPTIONS.map((s) => (
                        <label key={s} className="inline-flex items-center gap-1 text-sm">
                            <input type="checkbox" checked={statuses.includes(s)} onChange={() => toggleStatus(s)} className="rounded border-[#e6e8ec]" />
                            {s}
                        </label>
                    ))}
                </div>
                {uniqueTypes.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2 items-center">
                        <span className="text-xs font-semibold text-[#59678b]">Type:</span>
                        {uniqueTypes.map((t) => (
                            <label key={t} className="inline-flex items-center gap-1 text-sm">
                                <input type="checkbox" checked={types.includes(t)} onChange={() => toggleType(t)} className="rounded border-[#e6e8ec]" />
                                {t}
                            </label>
                        ))}
                    </div>
                )}
                <div className="mt-3">
                    <label className="block text-xs font-semibold text-[#59678b] mb-1">Search (provider_ref)</label>
                    <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" className="w-full max-w-xs px-3 py-2 border border-[#e6e8ec] rounded-md text-sm" />
                </div>
            </SectionCard>

            <SectionCard title="Transactions">
                {loading ? (
                    <p className="text-sm text-[#59678b]">Loading…</p>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-[#e6e8ec]">
                                        <th className="pb-2 pr-4 text-left font-semibold text-[#59678b]">Occurred</th>
                                        <th className="pb-2 pr-4 text-left font-semibold text-[#59678b]">Status</th>
                                        <th className="pb-2 pr-4 text-left font-semibold text-[#59678b]">Type</th>
                                        <th className="pb-2 pr-4 text-left font-semibold text-[#59678b]">Direction</th>
                                        <th className="pb-2 pr-4 text-right font-semibold text-[#59678b]">Amount</th>
                                        <th className="pb-2 pr-4 text-left font-semibold text-[#59678b]">Currency</th>
                                        <th className="pb-2 pr-4 text-left font-semibold text-[#59678b]">Provider</th>
                                        <th className="pb-2 pr-4 text-left font-semibold text-[#59678b]">Provider ref</th>
                                        <th className="pb-2 text-left font-semibold text-[#59678b]">Journal entry</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#e6e8ec]">
                                    {data.map((row) => (
                                        <tr key={row.id} className="hover:bg-[#F4F6F9]/50 cursor-pointer" onClick={() => openDetail(row.id)}>
                                            <td className="py-2.5 pr-4 text-[#31394d]">{formatDateTime(row.occurred_at)}</td>
                                            <td className="py-2.5 pr-4 text-[#31394d]">{row.status}</td>
                                            <td className="py-2.5 pr-4 text-[#31394d]">{row.type}</td>
                                            <td className="py-2.5 pr-4 text-[#31394d]">{row.direction}</td>
                                            <td className="py-2.5 pr-4 text-right text-[#31394d]">{formatMoneyFromCents(row.amount_cents)}</td>
                                            <td className="py-2.5 pr-4 text-[#59678b]">{row.currency}</td>
                                            <td className="py-2.5 pr-4 text-[#59678b]">{row.provider ?? "—"}</td>
                                            <td className="py-2.5 pr-4 text-[#59678b]">{row.provider_ref ?? "—"}</td>
                                            <td className="py-2.5 text-[#00458C] hover:underline">{row.journal_entry_id ? "View" : "—"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {data.length === 0 && <p className="text-sm text-[#59678b] py-4">No transactions match the filters.</p>}
                        <div className="mt-4 flex items-center gap-4">
                            <button type="button" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - limit))} className="text-sm text-[#00458C] hover:underline disabled:opacity-50">Previous</button>
                            <span className="text-sm text-[#59678b]">{offset + 1}–{Math.min(offset + limit, total)} of {total}</span>
                            <button type="button" disabled={offset + limit >= total} onClick={() => setOffset((o) => o + limit)} className="text-sm text-[#00458C] hover:underline disabled:opacity-50">Next</button>
                        </div>
                    </>
                )}
            </SectionCard>

            <Drawer isOpen={!!detailId} onClose={() => setDetailId(null)} title="Ledger transaction detail">
                {detailLoading && <p className="text-sm text-[#59678b]">Loading…</p>}
                {!detailLoading && detail && (
                    <div className="space-y-6">
                        <div>
                            <h3 className="text-sm font-semibold text-[#59678b] mb-2">Transaction</h3>
                            <pre className="text-xs bg-[#F4F6F9] p-3 rounded overflow-auto max-h-48">{JSON.stringify(detail.transaction, null, 2)}</pre>
                        </div>
                        {detail.journalEntry && (
                            <div>
                                <h3 className="text-sm font-semibold text-[#59678b] mb-2">Journal entry</h3>
                                <pre className="text-xs bg-[#F4F6F9] p-3 rounded overflow-auto max-h-32">{JSON.stringify(detail.journalEntry, null, 2)}</pre>
                            </div>
                        )}
                        {detail.journalLines && detail.journalLines.length > 0 && (
                            <div>
                                <h3 className="text-sm font-semibold text-[#59678b] mb-2">Journal lines</h3>
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-[#e6e8ec]">
                                            <th className="pb-2 pr-2 text-left font-semibold text-[#59678b]">#</th>
                                            <th className="pb-2 pr-2 text-left font-semibold text-[#59678b]">Account</th>
                                            <th className="pb-2 pr-2 text-left font-semibold text-[#59678b]">Description</th>
                                            <th className="pb-2 pr-2 text-right font-semibold text-[#59678b]">Debit</th>
                                            <th className="pb-2 text-right font-semibold text-[#59678b]">Credit</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#e6e8ec]">
                                        {detail.journalLines.map((l) => (
                                            <tr key={l.id}>
                                                <td className="py-1.5 pr-2">{l.line_no}</td>
                                                <td className="py-1.5 pr-2">{l.account ? `${(l.account as { code: string }).code} ${(l.account as { name: string }).name}` : l.account_id}</td>
                                                <td className="py-1.5 pr-2 text-[#59678b]">{l.description ?? "—"}</td>
                                                <td className="py-1.5 pr-2 text-right">{l.debit_cents ? formatMoneyFromCents(l.debit_cents) : "—"}</td>
                                                <td className="py-1.5 text-right">{l.credit_cents ? formatMoneyFromCents(l.credit_cents) : "—"}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <div className="mt-2 flex items-center justify-between text-sm">
                                    <span>Total debits: {formatMoneyFromCents(totalDebits)}</span>
                                    <span>Total credits: {formatMoneyFromCents(totalCredits)}</span>
                                </div>
                                <p className={`mt-1 text-sm font-medium ${balanced ? "text-green-600" : "text-amber-600"}`}>{balanced ? "Balanced" : "Not balanced"}</p>
                            </div>
                        )}
                        {detail.journalEntry && (!detail.journalLines || detail.journalLines.length === 0) && (
                            <p className="text-sm text-[#59678b]">No journal lines for this entry.</p>
                        )}
                    </div>
                )}
            </Drawer>
        </div>
    );
}
