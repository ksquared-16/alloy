"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import SectionCard from "@/components/admin/SectionCard";
import { StatusBadge, getStatusVariant } from "@/components/admin/StatusBadge";
import { formatDateTime } from "@/lib/adminFormatters";
import { ADMIN_FORMS_UI_BASE } from "@/lib/forms/adminFormsUiBase";

type FormRow = {
    id: string;
    key: string;
    name: string;
    kind: string;
    is_active: boolean;
    updated_at: string | null;
    created_at: string;
};

export default function FormsHubClient() {
    const [rows, setRows] = useState<FormRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/forms");
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Failed to load forms");
            setRows((json as { data?: FormRow[] }).data ?? []);
        } catch (e) {
            setError((e as Error).message);
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    return (
        <div className="space-y-6">
            <AdminPageHeader title="Forms" subtitle="Definitions, public embed links, and submissions." />
            <SectionCard title="Form definitions">
                {loading ? (
                    <p className="text-sm text-[#59678b]">Loading…</p>
                ) : error ? (
                    <p className="text-sm text-red-700">{error}</p>
                ) : rows.length === 0 ? (
                    <p className="text-sm text-[#59678b]">No forms in this org.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-[#e6e8ec]">
                                    <th className="pb-2 pr-4 text-left font-semibold text-[#59678b]">Name</th>
                                    <th className="pb-2 pr-4 text-left font-semibold text-[#59678b]">Key</th>
                                    <th className="pb-2 pr-4 text-left font-semibold text-[#59678b]">Kind</th>
                                    <th className="pb-2 pr-4 text-left font-semibold text-[#59678b]">Active</th>
                                    <th className="pb-2 text-left font-semibold text-[#59678b]">Updated</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#e6e8ec]">
                                {rows.map((r) => (
                                    <tr key={r.id} className="hover:bg-[#F4F6F9]/50">
                                        <td className="py-2.5 pr-4">
                                            <Link
                                                href={`${ADMIN_FORMS_UI_BASE}/${r.id}`}
                                                className="font-medium text-[#00458C] hover:underline"
                                            >
                                                {r.name}
                                            </Link>
                                        </td>
                                        <td className="py-2.5 pr-4 font-mono text-xs text-[#31394d]">{r.key}</td>
                                        <td className="py-2.5 pr-4 text-[#59678b]">{r.kind}</td>
                                        <td className="py-2.5 pr-4">
                                            <StatusBadge
                                                label={r.is_active ? "Active" : "Inactive"}
                                                variant={getStatusVariant(r.is_active ? "active" : "inactive")}
                                            />
                                        </td>
                                        <td className="py-2.5 text-[#59678b]">
                                            {r.updated_at ? formatDateTime(r.updated_at) : "—"}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </SectionCard>
        </div>
    );
}
