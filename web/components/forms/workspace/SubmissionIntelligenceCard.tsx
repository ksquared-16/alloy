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

type Props = {
    row: SubmissionInboxRow;
    formName: string;
    intelligence: SubmissionIntelligenceView;
    viewerTz: string;
    href: string;
    emphasize?: boolean;
};

/** Compressed operational intelligence card (FD-2). */
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
            formatDateTimeForUserDisplay(row.submitted_at, viewerTz)
        :   formatDateTimeForUserDisplay(row.created_at, viewerTz);

    const primaryCta =
        intelligence.accelerationCta.kind === "review" ||
        intelligence.accelerationCta.kind === "link" ||
        intelligence.accelerationCta.kind === "finalize";
    const actionClass = primaryCta ? intakeWorkspaceBtnPrimary : intakeWorkspaceBtnSecondary;

    const contextLine = [intelligence.entitySummary, intelligence.prefillCompletenessLabel, timestamp]
        .filter(Boolean)
        .join(" · ");

    return (
        <li
            className={clsx(
                "group px-4 py-2.5 transition-colors hover:bg-alloy-stone/10",
                emphasize && "bg-amber-50/70 ring-1 ring-inset ring-amber-200/60 first:rounded-t-xl last:rounded-b-xl"
            )}
            data-testid={`submission-inbox-row-${row.id}`}
        >
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    <Link href={href} className="text-sm font-semibold text-alloy-midnight group-hover:underline">
                        {formName}
                    </Link>
                    <FormsReviewBadge
                        label={intelligence.readinessLabel}
                        tone={READINESS_TONE[intelligence.readinessTone]}
                    />
                </div>
                <Link
                    href={href}
                    className={actionClass}
                    data-testid={`submission-inbox-action-${row.id}`}
                >
                    {intelligence.accelerationCta.label}
                </Link>
            </div>

            <p className={clsx("mt-1 line-clamp-2", opBody)}>{intelligence.operationalSummary}</p>

            {contextLine ?
                <p className={clsx("mt-1", opMutedMeta)} data-testid={`submission-inbox-context-${row.id}`}>
                    {contextLine}
                </p>
            :   null}

            {intelligence.blockerGroups.length > 0 ?
                <div className="mt-2 flex flex-wrap gap-2" data-testid={`submission-inbox-blockers-${row.id}`}>
                    {intelligence.blockerGroups.map((group) => (
                        <div
                            key={group.category}
                            className="rounded-md bg-alloy-stone/25 px-2 py-1 text-xs text-alloy-midnight/80"
                        >
                            <span className="font-semibold">{group.label}:</span> {group.items.join("; ")}
                        </div>
                    ))}
                </div>
            : intelligence.readyAfter ?
                <p className={clsx("mt-1.5", opMetadata)}>Blocked until: {intelligence.readyAfter}</p>
            :   null}
        </li>
    );
}
