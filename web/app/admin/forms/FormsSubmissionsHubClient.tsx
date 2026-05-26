"use client";

import clsx from "clsx";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FormsOperationalLink, FormsWorkspaceShell } from "@/components/forms/workspace";
import { StatusBadge, getStatusVariant } from "@/components/admin/StatusBadge";
import { formatDateTimeForUserDisplay } from "@/lib/adminFormatters";
import { useAdminViewerTimezone } from "@/contexts/AdminViewerTimezoneContext";
import { ADMIN_FORMS_UI_BASE } from "@/lib/forms/adminFormsUiBase";
import { formsWorkspaceBreadcrumbs } from "@/lib/forms/formsModuleNav";
import { submissionListLinkageBadge } from "@/lib/forms/submissionLinkageReviewUx";
import { opGroupedSurface, opMetadata, opMutedMeta } from "@/lib/operational/ui/operationalVisualTokens";

type SubmissionRow = {
    id: string;
    status: string;
    created_at: string;
    submitted_at: string | null;
    form_definition_id: string;
    person_id?: string | null;
    customer_id?: string | null;
    customer_member_id?: string | null;
    opportunity_id?: string | null;
    payload?: { meta?: Record<string, unknown> };
};

type FormRow = {
    id: string;
    name: string;
};

export default function FormsSubmissionsHubClient() {
    const viewerTz = useAdminViewerTimezone();
    const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
    const [formsById, setFormsById] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [subRes, formsRes] = await Promise.all([
                fetch("/api/admin/forms/submissions?limit=40", { credentials: "include" }),
                fetch("/api/admin/forms", { credentials: "include" }),
            ]);
            const subJson = await subRes.json().catch(() => ({}));
            const formsJson = await formsRes.json().catch(() => ({}));
            if (!subRes.ok) throw new Error((subJson as { error?: string }).error ?? "Failed to load submissions");
            setSubmissions((subJson as { data?: SubmissionRow[] }).data ?? []);
            const map: Record<string, string> = {};
            for (const f of (formsJson as { data?: FormRow[] }).data ?? []) {
                map[f.id] = f.name;
            }
            setFormsById(map);
        } catch (e) {
            setError((e as Error).message);
            setSubmissions([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    return (
        <FormsWorkspaceShell
            title="Submissions"
            subtitle="Recent intake across all forms — open a row to review answers, linkage, and documents."
            breadcrumbs={formsWorkspaceBreadcrumbs([{ label: "Submissions" }])}
            actions={
                <FormsOperationalLink href={ADMIN_FORMS_UI_BASE}>Browse forms</FormsOperationalLink>
            }
        >
            {loading ?
                <p className={opMetadata}>Loading recent submissions…</p>
            : error ?
                <p className="text-sm text-alloy-ember">{error}</p>
            : submissions.length === 0 ?
                <p className={opMetadata}>
                    No submissions yet. Distribute a form or packet link from the{" "}
                    <FormsOperationalLink href={ADMIN_FORMS_UI_BASE}>workspace</FormsOperationalLink>.
                </p>
            :   <ul className={opGroupedSurface} data-testid="submissions-hub-list">
                    {submissions.map((row) => {
                        const formName = formsById[row.form_definition_id] ?? "Form";
                        const linkage = submissionListLinkageBadge({
                            status: row.status,
                            payloadMeta: row.payload?.meta,
                            attachRow: {
                                person_id: row.person_id ?? null,
                                customer_id: row.customer_id ?? null,
                                customer_member_id: row.customer_member_id ?? null,
                                opportunity_id: row.opportunity_id ?? null,
                            },
                        });
                        const linkageBadge =
                            linkage.kind === "none" ? null
                            : linkage.kind === "needs_review" ?
                                { label: "Needs review", variant: "warning" as const }
                            :   { label: "Link CRM", variant: "neutral" as const };
                        return (
                            <li key={row.id} className="px-4 py-3">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <Link
                                            href={`${ADMIN_FORMS_UI_BASE}/${encodeURIComponent(row.form_definition_id)}/submissions/${encodeURIComponent(row.id)}`}
                                            className="text-sm font-medium text-alloy-midnight hover:underline"
                                        >
                                            {formName}
                                        </Link>
                                        <p className={clsx("mt-0.5", opMutedMeta)}>
                                            {row.submitted_at ?
                                                `Submitted ${formatDateTimeForUserDisplay(row.submitted_at, viewerTz)}`
                                            :   `Created ${formatDateTimeForUserDisplay(row.created_at, viewerTz)}`}
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <StatusBadge label={row.status} variant={getStatusVariant(row.status)} />
                                        {linkageBadge ?
                                            <StatusBadge
                                                label={linkageBadge.label}
                                                variant={linkageBadge.variant}
                                            />
                                        :   null}
                                    </div>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-3">
                                    <FormsOperationalLink
                                        href={`${ADMIN_FORMS_UI_BASE}/${encodeURIComponent(row.form_definition_id)}/submissions/${encodeURIComponent(row.id)}`}
                                    >
                                        Review submission
                                    </FormsOperationalLink>
                                    <FormsOperationalLink
                                        href={`${ADMIN_FORMS_UI_BASE}/${encodeURIComponent(row.form_definition_id)}`}
                                    >
                                        Form workspace
                                    </FormsOperationalLink>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            }
        </FormsWorkspaceShell>
    );
}
