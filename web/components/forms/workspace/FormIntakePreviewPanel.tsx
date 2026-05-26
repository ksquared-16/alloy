"use client";

import clsx from "clsx";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { StatusBadge, getStatusVariant } from "@/components/admin/StatusBadge";
import { FormsOperationalLink } from "@/components/forms/workspace/FormsOperationalLink";
import { formatDateTimeForUserDisplay } from "@/lib/adminFormatters";
import { ADMIN_FORMS_UI_BASE } from "@/lib/forms/adminFormsUiBase";
import { submissionListLinkageBadge } from "@/lib/forms/submissionLinkageReviewUx";
import { opGroupedRowInner, opGroupedSurface, opMetadata, opMutedMeta } from "@/lib/operational/ui/operationalVisualTokens";

type SubmissionPreviewRow = {
    id: string;
    status: string;
    created_at: string;
    submitted_at: string | null;
    person_id?: string | null;
    customer_id?: string | null;
    customer_member_id?: string | null;
    opportunity_id?: string | null;
    payload?: { meta?: Record<string, unknown> };
};

type Props = {
    formId: string;
    viewerTz: string;
    limit?: number;
};

/** Recent submissions preview for form lifecycle workspace (OW-3). */
export function FormIntakePreviewPanel({ formId, viewerTz, limit = 5 }: Props) {
    const [rows, setRows] = useState<SubmissionPreviewRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const submissionsHref = `${ADMIN_FORMS_UI_BASE}/${encodeURIComponent(formId)}/submissions`;

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(
                `/api/admin/forms/submissions?form_definition_id=${encodeURIComponent(formId)}&limit=${limit}`,
                { credentials: "include" }
            );
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Failed to load submissions");
            setRows((json as { data?: SubmissionPreviewRow[] }).data ?? []);
        } catch (e) {
            setError((e as Error).message);
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, [formId, limit]);

    useEffect(() => {
        void load();
    }, [load]);

    if (loading) return <p className={opMetadata}>Loading recent intake…</p>;
    if (error) return <p className="text-sm text-alloy-ember">{error}</p>;

    return (
        <div data-testid="form-intake-preview-panel">
            {rows.length === 0 ?
                <p className={opMetadata}>No submissions yet. Share a link to start collecting responses.</p>
            :   <ul className={opGroupedSurface}>
                    {rows.map((row) => {
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
                            <li key={row.id} className={opGroupedRowInner}>
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <Link
                                            href={`${submissionsHref}/${encodeURIComponent(row.id)}`}
                                            className="text-sm font-medium text-alloy-midnight hover:underline"
                                        >
                                            {row.status === "submitted" ? "Submitted response" : "Draft response"}
                                        </Link>
                                        <p className={clsx("mt-0.5", opMutedMeta)}>
                                            {row.submitted_at ?
                                                formatDateTimeForUserDisplay(row.submitted_at, viewerTz)
                                            :   formatDateTimeForUserDisplay(row.created_at, viewerTz)}
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        <StatusBadge label={row.status} variant={getStatusVariant(row.status)} />
                                        {linkageBadge ?
                                            <StatusBadge
                                                label={linkageBadge.label}
                                                variant={linkageBadge.variant}
                                            />
                                        :   null}
                                    </div>
                                </div>
                                <div className="mt-2">
                                    <FormsOperationalLink href={`${submissionsHref}/${encodeURIComponent(row.id)}`}>
                                        Review submission
                                    </FormsOperationalLink>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            }
            <div className="mt-3">
                <FormsOperationalLink href={submissionsHref}>View full intake inbox</FormsOperationalLink>
            </div>
        </div>
    );
}
