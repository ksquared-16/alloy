"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import SectionCard from "@/components/admin/SectionCard";
import { FormsOperationalLink, FormsWorkspaceShell } from "@/components/forms/workspace";
import { formsWorkspaceBreadcrumbs } from "@/lib/forms/formsModuleNav";
import { StatusBadge, getStatusVariant } from "@/components/admin/StatusBadge";
import { formatDateTimeForUserDisplay } from "@/lib/adminFormatters";
import { useAdminViewerTimezone } from "@/contexts/AdminViewerTimezoneContext";
import { ADMIN_FORMS_UI_BASE } from "@/lib/forms/adminFormsUiBase";
import { submissionListLinkageBadge } from "@/lib/forms/submissionLinkageReviewUx";

type SubmissionListRow = {
    id: string;
    status: string;
    created_at: string;
    submitted_at: string | null;
    form_definition_version_id: string;
    person_id: string | null;
    customer_id: string | null;
    customer_member_id?: string | null;
    opportunity_id?: string | null;
    payload?: { meta?: Record<string, unknown> };
};

export default function FormSubmissionsClient() {
    const viewerTz = useAdminViewerTimezone();
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
        <FormsWorkspaceShell
            title={formName ? `Intake inbox — ${formName}` : "Intake inbox"}
            subtitle="Draft and submitted responses for this form — open a row for case-file review."
            breadcrumbs={formsWorkspaceBreadcrumbs([
                { label: formName ?? "Form", href: `${ADMIN_FORMS_UI_BASE}/${encodeURIComponent(formId)}` },
                { label: "Submissions" },
            ])}
            actions={
                <FormsOperationalLink href={`${ADMIN_FORMS_UI_BASE}/${encodeURIComponent(formId)}`}>
                    Form workspace
                </FormsOperationalLink>
            }
        >
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
                                    <th className="pb-2 pr-4 text-left font-semibold text-[#59678b]">Linkage</th>
                                    <th className="pb-2 pr-4 text-left font-semibold text-[#59678b]">Created</th>
                                    <th className="pb-2 pr-4 text-left font-semibold text-[#59678b]">Submitted</th>
                                    <th className="pb-2 text-left font-semibold text-[#59678b]">Open</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#e6e8ec]">
                                {rows.map((r) => {
                                    const attachRow = {
                                        person_id: r.person_id,
                                        customer_id: r.customer_id,
                                        customer_member_id: r.customer_member_id ?? null,
                                        opportunity_id: r.opportunity_id ?? null,
                                    };
                                    const linkBadge = submissionListLinkageBadge({
                                        status: r.status,
                                        payloadMeta: r.payload?.meta,
                                        attachRow,
                                    });
                                    return (
                                    <tr key={r.id} className="hover:bg-[#F4F6F9]/50">
                                        <td className="py-2.5 pr-4">
                                            <StatusBadge label={r.status} variant={getStatusVariant(r.status)} />
                                        </td>
                                        <td className="py-2.5 pr-4 align-top">
                                            {linkBadge.kind === "none" ?
                                                <span className="text-[#59678b]">—</span>
                                            : linkBadge.kind === "needs_review" ?
                                                <span title={linkBadge.tooltip}>
                                                    <StatusBadge label="Needs review" variant="warning" />
                                                </span>
                                            :   <span title={linkBadge.tooltip}>
                                                    <StatusBadge label="Link CRM" variant="neutral" />
                                                </span>}
                                        </td>
                                        <td className="py-2.5 pr-4 text-[#59678b]">{formatDateTimeForUserDisplay(r.created_at, viewerTz)}</td>
                                        <td className="py-2.5 pr-4 text-[#59678b]">
                                            {r.submitted_at ? formatDateTimeForUserDisplay(r.submitted_at, viewerTz) : "—"}
                                        </td>
                                        <td className="py-2.5">
                                            <Link
                                                href={`${ADMIN_FORMS_UI_BASE}/${encodeURIComponent(formId)}/submissions/${encodeURIComponent(r.id)}`}
                                                className="font-medium text-[#00458C] hover:underline"
                                            >
                                                View
                                            </Link>
                                        </td>
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </SectionCard>
        </FormsWorkspaceShell>
    );
}
