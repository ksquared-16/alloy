"use client";

import clsx from "clsx";
import Link from "next/link";
import { FormsReviewBadge } from "@/components/forms/review/FormsReviewBadge";
import { formatDateTimeForUserDisplay } from "@/lib/adminFormatters";
import { ADMIN_FORMS_UI_BASE } from "@/lib/forms/adminFormsUiBase";
import {
    submissionInboxContextLine,
    submissionInboxPrimaryAction,
    submissionInboxStatusLabel,
    type SubmissionInboxLaneKey,
    type SubmissionInboxRow,
} from "@/lib/forms/submissionInboxPresentation";
import { submissionListLinkageBadge } from "@/lib/forms/submissionLinkageReviewUx";
import {
    operatorReviewStatusTone,
    submissionStatusTone,
} from "@/lib/forms/review/formsReviewPresentation";
import { opMutedMeta } from "@/lib/operational/ui/operationalVisualTokens";
import {
    intakeWorkspaceBtnPrimary,
    intakeWorkspaceBtnSecondary,
} from "@/components/forms/workspace/IntakeWorkspaceHubView";

type Props = {
    row: SubmissionInboxRow;
    formName: string;
    lane: SubmissionInboxLaneKey;
    viewerTz: string;
    href: string;
    emphasize?: boolean;
};

export function SubmissionInboxRowView({ row, formName, lane, viewerTz, href, emphasize = false }: Props) {
    const context = submissionInboxContextLine(row);
    const action = submissionInboxPrimaryAction(lane);
    const timestamp =
        row.submitted_at ?
            `Submitted ${formatDateTimeForUserDisplay(row.submitted_at, viewerTz)}`
        :   `Created ${formatDateTimeForUserDisplay(row.created_at, viewerTz)}`;

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

    const actionClass =
        action.kind === "review" ? intakeWorkspaceBtnPrimary
        : action.kind === "continue" ? intakeWorkspaceBtnSecondary
        : intakeWorkspaceBtnSecondary;

    const statusTone = submissionStatusTone(row.status);
    const linkageTone =
        linkage.kind === "needs_review" ? "warning"
        : linkage.kind === "needs_crm_link" ? "attention"
        : "neutral";

    return (
        <li
            className={clsx(
                "px-4 py-3",
                emphasize && "bg-amber-50/70 ring-1 ring-inset ring-amber-200/60 first:rounded-t-xl last:rounded-b-xl"
            )}
            data-testid={`submission-inbox-row-${row.id}`}
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <Link href={href} className="text-sm font-medium text-alloy-midnight hover:underline">
                        {formName}
                    </Link>
                    {context ?
                        <p className={clsx("mt-0.5 line-clamp-2", opMutedMeta)}>{context}</p>
                    :   null}
                    <p className={clsx("mt-0.5", opMutedMeta)}>{timestamp}</p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                    <FormsReviewBadge label={submissionInboxStatusLabel(row.status)} tone={statusTone} />
                    {linkage.kind !== "none" ?
                        <FormsReviewBadge
                            label={linkage.kind === "needs_review" ? "Needs review" : "Link CRM"}
                            tone={linkageTone === "attention" ? "attention" : operatorReviewStatusTone("needs_review")}
                        />
                    :   null}
                </div>
            </div>
            <div className="mt-2.5">
                <Link href={href} className={actionClass} data-testid={`submission-inbox-action-${row.id}`}>
                    {action.label}
                </Link>
            </div>
        </li>
    );
}

export function submissionDetailHref(formDefinitionId: string, submissionId: string): string {
    return `${ADMIN_FORMS_UI_BASE}/${encodeURIComponent(formDefinitionId)}/submissions/${encodeURIComponent(submissionId)}`;
}
