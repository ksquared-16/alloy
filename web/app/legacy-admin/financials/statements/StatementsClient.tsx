"use client";

import { useCallback, useEffect, useState } from "react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import SectionCard from "@/components/admin/SectionCard";
import { formatMoneyFromCents } from "@/lib/adminFormatters";

const now = new Date();
const mtdStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
const mtdEnd = now.toISOString().split("T")[0];

type PLResponse = {
    period: "pl";
    start: string;
    end: string;
    revenue: { code: string; name: string; amountCents: number }[];
    expenses: { code: string; name: string; amountCents: number }[];
    totalRevenueCents: number;
    totalExpensesCents: number;
    netIncomeCents: number;
};

type BSResponse = {
    period: "bs";
    as_of: string;
    assets: { code: string; name: string; balanceCents: number }[];
    liabilities: { code: string; name: string; balanceCents: number }[];
    equity: { code: string; name: string; balanceCents: number }[];
    totalAssetsCents: number;
    totalLiabilitiesCents: number;
    totalEquityCents: number;
    totalLiabilitiesPlusEquityCents: number;
    differenceCents: number;
    balanced: boolean;
};

export default function StatementsClient() {
    const [activeTab, setActiveTab] = useState<"pl" | "bs">("pl");
    const [start, setStart] = useState(mtdStart);
    const [end, setEnd] = useState(mtdEnd);
    const [asOf, setAsOf] = useState(mtdEnd);
    const [plData, setPlData] = useState<PLResponse | null>(null);
    const [bsData, setBsData] = useState<BSResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [plError, setPlError] = useState<string | null>(null);
    const [bsError, setBsError] = useState<string | null>(null);

    const fetchPL = useCallback(async () => {
        setLoading(true);
        setPlError(null);
        try {
            const res = await fetch(`/api/admin/financials/statements?period=pl&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
            const json = await res.json();
            if (res.ok) setPlData(json);
            else setPlError(json.error || "Failed to load");
        } finally {
            setLoading(false);
        }
    }, [start, end]);

    const fetchBS = useCallback(async () => {
        setLoading(true);
        setBsError(null);
        try {
            const res = await fetch(`/api/admin/financials/statements?period=bs&as_of=${encodeURIComponent(asOf)}`);
            const json = await res.json();
            if (res.ok) setBsData(json);
            else setBsError(json.error || "Failed to load");
        } finally {
            setLoading(false);
        }
    }, [asOf]);

    useEffect(() => {
        if (activeTab === "pl") fetchPL();
    }, [activeTab, fetchPL]);

    useEffect(() => {
        if (activeTab === "bs") fetchBS();
    }, [activeTab, fetchBS]);

    return (
        <div className="space-y-6">
            <AdminPageHeader title="Statements" subtitle="Income statement and balance sheet from the general ledger." />

            <SectionCard title="Date range">
                <div className="flex flex-wrap gap-4 items-end">
                    <div>
                        <label className="block text-xs font-semibold text-[#59678b] mb-1">Start (P&L)</label>
                        <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="px-3 py-2 border border-[#e6e8ec] rounded-md text-sm" />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-[#59678b] mb-1">End (P&L)</label>
                        <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="px-3 py-2 border border-[#e6e8ec] rounded-md text-sm" />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-[#59678b] mb-1">As of (Balance Sheet)</label>
                        <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="px-3 py-2 border border-[#e6e8ec] rounded-md text-sm" />
                    </div>
                </div>
            </SectionCard>

            <div className="flex gap-2 border-b border-[#e6e8ec]">
                <button type="button" onClick={() => setActiveTab("pl")} className={`px-4 py-2 text-sm font-medium ${activeTab === "pl" ? "border-b-2 border-[#31394d] text-[#31394d]" : "text-[#59678b] hover:text-[#31394d]"}`}>Income Statement (P&L)</button>
                <button type="button" onClick={() => setActiveTab("bs")} className={`px-4 py-2 text-sm font-medium ${activeTab === "bs" ? "border-b-2 border-[#31394d] text-[#31394d]" : "text-[#59678b] hover:text-[#31394d]"}`}>Balance Sheet</button>
            </div>

            {activeTab === "pl" && (
                <SectionCard title={`Income Statement (${start} to ${end})`}>
                    {loading && !plData && <p className="text-sm text-[#59678b]">Loading…</p>}
                    {plError && <p className="text-sm text-red-600">{plError}</p>}
                    {plData && !loading && (
                        <div className="space-y-4">
                            <div>
                                <h4 className="text-xs font-semibold text-[#59678b] mb-2">Revenue</h4>
                                <table className="w-full text-sm">
                                    <tbody className="divide-y divide-[#e6e8ec]">
                                        {plData.revenue.map((r) => (
                                            <tr key={r.code}>
                                                <td className="py-1 pr-4">{r.code} {r.name}</td>
                                                <td className="py-1 text-right font-medium">{formatMoneyFromCents(r.amountCents)}</td>
                                            </tr>
                                        ))}
                                        {plData.revenue.length === 0 && <tr><td className="py-2 text-[#59678b]">No revenue accounts</td></tr>}
                                    </tbody>
                                </table>
                                <p className="mt-2 font-semibold border-t border-[#e6e8ec] pt-2">Total Revenue: {formatMoneyFromCents(plData.totalRevenueCents)}</p>
                            </div>
                            <div>
                                <h4 className="text-xs font-semibold text-[#59678b] mb-2">Expenses</h4>
                                <table className="w-full text-sm">
                                    <tbody className="divide-y divide-[#e6e8ec]">
                                        {plData.expenses.map((e) => (
                                            <tr key={e.code}>
                                                <td className="py-1 pr-4">{e.code} {e.name}</td>
                                                <td className="py-1 text-right font-medium">{formatMoneyFromCents(e.amountCents)}</td>
                                            </tr>
                                        ))}
                                        {plData.expenses.length === 0 && <tr><td className="py-2 text-[#59678b]">No expense accounts</td></tr>}
                                    </tbody>
                                </table>
                                <p className="mt-2 font-semibold border-t border-[#e6e8ec] pt-2">Total Expenses: {formatMoneyFromCents(plData.totalExpensesCents)}</p>
                            </div>
                            <p className="text-lg font-bold border-t border-[#e6e8ec] pt-2">Net Income: {formatMoneyFromCents(plData.netIncomeCents)}</p>
                        </div>
                    )}
                </SectionCard>
            )}

            {activeTab === "bs" && (
                <SectionCard title={`Balance Sheet (as of ${asOf})`}>
                    {loading && !bsData && <p className="text-sm text-[#59678b]">Loading…</p>}
                    {bsError && <p className="text-sm text-red-600">{bsError}</p>}
                    {bsData && !loading && (
                        <div className="space-y-4">
                            <div>
                                <h4 className="text-xs font-semibold text-[#59678b] mb-2">Assets</h4>
                                <table className="w-full text-sm">
                                    <tbody className="divide-y divide-[#e6e8ec]">
                                        {bsData.assets.map((a) => (
                                            <tr key={a.code}>
                                                <td className="py-1 pr-4">{a.code} {a.name}</td>
                                                <td className="py-1 text-right font-medium">{formatMoneyFromCents(a.balanceCents)}</td>
                                            </tr>
                                        ))}
                                        {bsData.assets.length === 0 && <tr><td className="py-2 text-[#59678b]">No asset accounts</td></tr>}
                                    </tbody>
                                </table>
                                <p className="mt-2 font-semibold border-t border-[#e6e8ec] pt-2">Total Assets: {formatMoneyFromCents(bsData.totalAssetsCents)}</p>
                            </div>
                            <div>
                                <h4 className="text-xs font-semibold text-[#59678b] mb-2">Liabilities</h4>
                                <table className="w-full text-sm">
                                    <tbody className="divide-y divide-[#e6e8ec]">
                                        {bsData.liabilities.map((l) => (
                                            <tr key={l.code}>
                                                <td className="py-1 pr-4">{l.code} {l.name}</td>
                                                <td className="py-1 text-right font-medium">{formatMoneyFromCents(l.balanceCents)}</td>
                                            </tr>
                                        ))}
                                        {bsData.liabilities.length === 0 && <tr><td className="py-2 text-[#59678b]">No liability accounts</td></tr>}
                                    </tbody>
                                </table>
                                <p className="mt-2 font-semibold border-t border-[#e6e8ec] pt-2">Total Liabilities: {formatMoneyFromCents(bsData.totalLiabilitiesCents)}</p>
                            </div>
                            <div>
                                <h4 className="text-xs font-semibold text-[#59678b] mb-2">Equity</h4>
                                <table className="w-full text-sm">
                                    <tbody className="divide-y divide-[#e6e8ec]">
                                        {bsData.equity.map((e) => (
                                            <tr key={e.code}>
                                                <td className="py-1 pr-4">{e.code} {e.name}</td>
                                                <td className="py-1 text-right font-medium">{formatMoneyFromCents(e.balanceCents)}</td>
                                            </tr>
                                        ))}
                                        {bsData.equity.length === 0 && <tr><td className="py-2 text-[#59678b]">No equity accounts</td></tr>}
                                    </tbody>
                                </table>
                                <p className="mt-2 font-semibold border-t border-[#e6e8ec] pt-2">Total Equity: {formatMoneyFromCents(bsData.totalEquityCents)}</p>
                            </div>
                            <p className="font-semibold border-t border-[#e6e8ec] pt-2">Liabilities + Equity: {formatMoneyFromCents(bsData.totalLiabilitiesPlusEquityCents)}</p>
                            <p className={`text-sm font-medium ${bsData.balanced ? "text-green-600" : "text-amber-600"}`}>
                                {bsData.balanced ? "Balanced (Assets = Liabilities + Equity)" : `Difference: ${formatMoneyFromCents(bsData.differenceCents)}`}
                            </p>
                        </div>
                    )}
                </SectionCard>
            )}
        </div>
    );
}
