"use client";

import clsx from "clsx";
import Link from "next/link";
import { FormsReviewBadge } from "@/components/forms/review/FormsReviewBadge";
import { formatDateTimeForUserDisplay } from "@/lib/adminFormatters";
import type { SubmissionIntelligenceView } from "@/lib/forms/submissionIntelligencePresentation";
import {
    intakeWorkspaceBtnPrimary,
    intakeWorkspaceBtnSecondary,
} from "@/components/forms/workspace/IntakeWorkspaceHubView";
import { opBody, opMetadata, opMutedMeta } from "@/lib/operational/ui/operationalVisualTokens";
import type { SubmissionInboxRow } from "@/lib/forms/submissionInboxPresentation";

const READINESS_TONE = {
    ready: "success",
    attention: "warning",
    blocked: "warning",
    waiting: "info",
    neutral: "neutral",
} as const;

const CONFIDENCE_TONE = {
    high: "success",
    medium: "warning",
    low: "attention",
    none: "neutral",
} as const;

type Props = {
    row: SubmissionInboxRow;
    formName: string;
    intelligence: SubmissionIntelligenceView;
    viewerTz: string;
    href: string;
    emphasize?: boolean;
};

/** Operational intelligence card for submission inbox rows (OI-2 / OI-3). */
export function SubmissionIntelligenceCard({
    row,
    formName,
    intelligence,
    viewerTz,
    href,
    emphasize = false,
}: Props) {
    const timestamp =
        row.submitted_at ?
            `Submitted ${formatDateTimeForUserDisplay(row.submitted_at, viewerTz)}`
        :   `Created ${formatDateTimeForUserDisplay(row.created_at, viewerTz)}`;

    const actionClass =
        intelligence.accelerationCta.kind === "review" || intelligence.accelerationCta.kind === "link" ?
            intakeWorkspaceBtnPrimary
        :   intakeWorkspaceBtnSecondary;

    return (
        <li
            className={clsx(
                "group px-4 py-3.5 transition-colors hover:bg-alloy-stone/10",
                emphasize && "bg-amber-50/70 ring-1 ring-inset ring-amber-200/60 first:rounded-t-xl last:rounded-b-xl"
            )}
            data-testid={`submission-inbox-row-${row.id}`}
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <Link
                        href={href}
                        className="text-sm font-semibold text-alloy-midnight group-hover:underline"
                    >
                        {formName}
                    </Link>
                    <p className={clsx("mt-1 line-clamp-2", opBody)}>{intelligence.operationalSummary}</p>
                    <p className={clsx("mt-1", opMutedMeta)}>{timestamp}</p>
                </div>
                <div className="flex max-w-[11rem] flex-col items-end gap-1.5">
                    <FormsReviewBadge
                        label={intelligence.readinessLabel}
                        tone={READINESS_TONE[intelligence.readinessTone]}
                    />
                    <FormsReviewBadge
                        label={intelligence.linkageConfidenceLabel}
                        tone={CONFIDENCE_TONE[intelligence.linkageConfidence]}
                    />
                </div>
            </div>

            {intelligence.missingRequirements.length > 0 ?
                <ul className={clsx("mt-2.5 list-disc space-y-0.5 pl-4", opMetadata)}>
                    {intelligence.missingRequirements.slice(0, 2).map((req) => (
                        <li key={req}>{req}</li>
                    ))}
                </ul>
            :   null}

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className={clsx("min-w-0 flex-1 text-xs leading-snug", opMutedMeta)}>
                    {intelligence.readyAfter ?
                        <>Ready after: {intelligence.readyAfter}</>
                    :   intelligence.likelyNextAction}
                </p>
                <Link
                    href={href}
                    className={actionClass}
                    data-testid={`submission-inbox-action-${row.id}`}
                >
                    {intelligence.accelerationCta.label}
                </Link>
            </div>
        </li>
    );
}
