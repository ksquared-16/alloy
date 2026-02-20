"use client";

import { useEffect, useState } from "react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import SectionCard from "@/components/admin/SectionCard";

type GlAccount = {
    id: string;
    code: string;
    name: string;
    type: string;
    currency: string;
    is_active: boolean;
    created_at?: string;
};

export default function AccountsClient() {
    const [data, setData] = useState<GlAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch("/api/admin/financials/accounts");
                const json = await res.json();
                if (cancelled) return;
                if (!res.ok) {
                    setError(json.error ?? "Failed to load accounts");
                    return;
                }
                setData(json.data ?? []);
            } catch (e) {
                if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    return (
        <>
            <AdminPageHeader title="Accounts" />
            <SectionCard title="Chart of accounts (read-only)">
                <p className="text-xs text-[#59678b] mb-4">GL accounts for the current org. No edits here.</p>
                {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
                {loading ? (
                    <p className="text-sm text-[#59678b]">Loading…</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm border-collapse">
                            <thead>
                                <tr className="border-b border-[#e2e6ed] text-left text-[#59678b]">
                                    <th className="py-2 pr-4 font-medium">Code</th>
                                    <th className="py-2 pr-4 font-medium">Name</th>
                                    <th className="py-2 pr-4 font-medium">Type</th>
                                    <th className="py-2 pr-4 font-medium">Currency</th>
                                    <th className="py-2 pr-4 font-medium">Active</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.map((row) => (
                                    <tr key={row.id} className="border-b border-[#e2e6ed]/80">
                                        <td className="py-2 pr-4 text-[#31394d] font-mono">{row.code}</td>
                                        <td className="py-2 pr-4 text-[#31394d]">{row.name}</td>
                                        <td className="py-2 pr-4 text-[#31394d]">{row.type}</td>
                                        <td className="py-2 pr-4 text-[#31394d]">{row.currency ?? "—"}</td>
                                        <td className="py-2 pr-4 text-[#31394d]">{row.is_active ? "Yes" : "No"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {data.length === 0 && !error && <p className="text-sm text-[#59678b] py-4">No accounts found.</p>}
                    </div>
                )}
            </SectionCard>
        </>
    );
}
