"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import SectionCard from "@/components/admin/SectionCard";
import { StatusBadge, getStatusVariant } from "@/components/admin/StatusBadge";
import { formatDateTime } from "@/lib/adminFormatters";

type SubmissionListRow = {
    id: string;
    status: string;
    created_at: string;
    submitted_at: string | null;
    form_definition_version_id: string;
    person_id: string | null;
    customer_id: string | null;
};

export default function FormSubmissionsClient() {
    const params = useParams();
    const formId = typeof params?.formId === "string" ? params.formId : "";

    const [rows, setRows] = useState<SubmissionListRow[]>([]);
    const [formName, setFormName] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!formId) return;
        setLoading(true);
        setError(null);
        try {
            const [subRes, formRes] = await Promise.all([
                fetch(
                    `/api/admin/forms/submissions?form_definition_id=${encodeURIComponent(formId)}&limit=200`
                ),
                fetch(`/api/admin/forms/${encodeURIComponent(formId)}`),
            ]);
            const subJson = await subRes.json().catch(() => ({}));
            const formJson = await formRes.json().catch(() => ({}));
            if (!subRes.ok) throw new Error((subJson as { error?: string }).error ?? "Failed to load submissions");
            setRows((subJson as { data?: SubmissionListRow[] }).data ?? []);
            if (formRes.ok) {
                setFormName((formJson as { data?: { name?: string } }).data?.name ?? null);
            }
        } catch (e) {
            setError((e as Error).message);
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, [formId]);

    useEffect(() => {
        void load();
    }, [load]);

    if (!formId) {
        return <p className="p-6 text-sm text-red-700">Missing form id.</p>;
    }

    return (
        <div className="space-y-6">
            <AdminPageHeader
                title={formName ? `Submissions — ${formName}` : "Submissions"}
                subtitle="Draft and submitted responses for this form."
                actions={
                    <div className="flex flex-wrap gap-3">
                        <Link
                            href={`/admin/forms/${encodeURIComponent(formId)}`}
                            className="text-sm font-medium text-[#00458C] hover:underline"
                        >
                            Form detail
                        </Link>
                        <Link href="/admin/forms" className="text-sm font-medium text-[#00458C] hover:underline">
                            All forms
                        </Link>
                    </div>
                }
            />

            <SectionCard title="Recent submissions">
                {loading ? (
                    <p className="text-sm text-[#59678b]">Loading…</p>
                ) : error ? (
                    <p className="text-sm text-red-700">{error}</p>
                ) : rows.length === 0 ? (
                    <p className="text-sm text-[#59678b]">No submissions for this form.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-[#e6e8ec]">
                                    <th className="pb-2 pr-4 text-left font-semibold text-[#59678b]">Status</th>
                                    <th className="pb-2 pr-4 text-left font-semibold text-[#59678b]">Created</th>
                                    <th className="pb-2 pr-4 text-left font-semibold text-[#59678b]">Submitted</th>
                                    <th className="pb-2 text-left font-semibold text-[#59678b]">Open</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#e6e8ec]">
                                {rows.map((r) => (
                                    <tr key={r.id} className="hover:bg-[#F4F6F9]/50">
                                        <td className="py-2.5 pr-4">
                                            <StatusBadge label={r.status} variant={getStatusVariant(r.status)} />
                                        </td>
                                        <td className="py-2.5 pr-4 text-[#59678b]">{formatDateTime(r.created_at)}</td>
                                        <td className="py-2.5 pr-4 text-[#59678b]">
                                            {r.submitted_at ? formatDateTime(r.submitted_at) : "—"}
                                        </td>
                                        <td className="py-2.5">
                                            <Link
                                                href={`/admin/forms/${encodeURIComponent(formId)}/submissions/${encodeURIComponent(r.id)}`}
                                                className="font-medium text-[#00458C] hover:underline"
                                            >
                                                View
                                            </Link>
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
