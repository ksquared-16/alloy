"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import SectionCard from "@/components/admin/SectionCard";

type Industry = { id: string; key: string; label: string };

export default function VerticalsIndustriesClient() {
    const [industries, setIndustries] = useState<Industry[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchIndustries = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/industries");
            const json = await res.json().catch(() => ({}));
            if (res.ok) setIndustries((json as { industries?: Industry[] }).industries ?? []);
        } catch {
            setIndustries([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchIndustries();
    }, [fetchIndustries]);

    return (
        <>
            <AdminPageHeader
                title="Verticals & Industries"
                subtitle="Configure verticals (business domains) and industries (used for entity label defaults per org)."
            />
            <div className="grid gap-6 md:grid-cols-2">
                <SectionCard title="Industries">
                    <p className="mb-4 text-sm text-[#59678b]">
                        Industries drive default entity labels (e.g. Cleaning). Your org’s industry is set per org; entity label defaults come from the org’s industry.
                    </p>
                    {loading ? (
                        <p className="text-sm text-[#59678b]">Loading…</p>
                    ) : industries.length === 0 ? (
                        <p className="text-sm text-[#59678b]">No active industries in the system.</p>
                    ) : (
                        <ul className="space-y-1.5 text-sm">
                            {industries.map((i) => (
                                <li key={i.id} className="flex items-center gap-2 text-[#31394d]">
                                    <span className="font-medium">{i.label}</span>
                                    <span className="text-[#59678b]">({i.key})</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </SectionCard>
                <SectionCard title="Verticals">
                    <p className="mb-4 text-sm text-[#59678b]">
                        Verticals are business domains (e.g. cleaning, childcare). Manage verticals and their settings below.
                    </p>
                    <Link
                        href="/admin/verticals"
                        className="inline-flex items-center rounded-md border border-[#e6e8ec] bg-white px-4 py-2 text-sm font-medium text-[#31394d] hover:bg-[#F4F6F9]"
                    >
                        Manage verticals
                    </Link>
                </SectionCard>
            </div>
        </>
    );
}
