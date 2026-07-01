"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FormsOperationalLink, FormsWorkspaceShell, SubmissionsInboxView } from "@/components/forms/workspace";
import { formsWorkspaceBreadcrumbs } from "@/lib/forms/formsModuleNav";
import { useAdminViewerTimezone } from "@/contexts/AdminViewerTimezoneContext";
import { ADMIN_FORMS_UI_BASE } from "@/lib/forms/adminFormsUiBase";
import type { SubmissionInboxRow } from "@/lib/forms/submissionInboxPresentation";

type SubmissionListRow = SubmissionInboxRow & {
    form_definition_version_id: string;
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
                    `/api/admin/forms/submissions?form_definition_id=${encodeURIComponent(formId)}&limit=200`,
                    { credentials: "include" }
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

    const formsById = useMemo(
        () => (formName && formId ? { [formId]: formName } : {}),
        [formName, formId]
    );

    if (!formId) {
        return <p className="p-6 text-sm text-alloy-ember">Missing form id.</p>;
    }

    return (
        <FormsWorkspaceShell
            title={formName ? `Intake inbox — ${formName}` : "Intake inbox"}
            subtitle="Review, link, and produce outputs from incoming responses."
            breadcrumbs={formsWorkspaceBreadcrumbs([
                { label: formName ?? "Form", href: `${ADMIN_FORMS_UI_BASE}/${encodeURIComponent(formId)}` },
                { label: "Submissions" },
            ])}
            actions={
                <FormsOperationalLink href={`${ADMIN_FORMS_UI_BASE}/${encodeURIComponent(formId)}`}>
                    Form workspace
                </FormsOperationalLink>
            }
            contentClassName="space-y-0"
        >
            <SubmissionsInboxView
                rows={rows}
                formsById={formsById}
                viewerTz={viewerTz}
                loading={loading}
                error={error}
                emptyMessage="No submissions for this form yet."
                orientationLead={`Intake for ${formName ?? "this form"} — grouped by review and linkage priority.`}
            />
        </FormsWorkspaceShell>
    );
}
