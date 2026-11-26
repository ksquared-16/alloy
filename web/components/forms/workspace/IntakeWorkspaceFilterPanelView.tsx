"use client";

import clsx from "clsx";
import Link from "next/link";
import { useCallback, useState } from "react";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { formatDateTimeForUserDisplay } from "@/lib/adminFormatters";
import { useOperatorRecordFocus } from "@/lib/runtime/focus/useOperatorRecordFocus";
import type { IntakeWorkspaceFilterItem, IntakeWorkspaceFilterPanel } from "@/lib/forms/intakeWorkspaceFilters";
import { SubmissionQuickReviewModal } from "@/components/forms/workspace/SubmissionQuickReviewModal";
import {
    opBody,
    opGroupedRowInner,
    opGroupedSurface,
    opMetadata,
    opMutedMeta,
    opSectionTitle,
} from "@/lib/operational/ui/operationalVisualTokens";
import {
    intakeWorkspaceBtnPrimary,
    intakeWorkspaceBtnSecondary,
} from "@/components/forms/workspace/IntakeWorkspaceHubView";

type Props = {
    panel: IntakeWorkspaceFilterPanel;
    viewerTz: string;
    onRefresh?: () => void;
};

function formatSubmittedTime(iso: string, viewerTz: string): string {
    const full = formatDateTimeForUserDisplay(iso, viewerTz);
    const comma = full.indexOf(", ");
    if (comma > 0) return full.slice(comma + 2);
    return full;
}

function caseRowTestId(item: IntakeWorkspaceFilterItem): string {
    if (item.caseKey) {
        return `intake-case-row-${item.caseKey.replace(/[^a-zA-Z0-9_-]+/g, "-")}`;
    }
    if (item.submission) {
        return `intake-submission-row-${item.submission.id}`;
    }
    return `intake-filter-item-${item.id}`;
}

/** Inline contextual workload panel — intake-case oriented rows. */
export function IntakeWorkspaceFilterPanelView({ panel, viewerTz, onRefresh }: Props) {
    const [quickReviewRow, setQuickReviewRow] = useState<(typeof panel.items)[number] | null>(null);
    const focusRecord = useOperatorRecordFocus();

    const closeModal = useCallback(() => setQuickReviewRow(null), []);

    const openLead = useCallback(
        (opportunityId: string) => {
            void focusRecord({ entity_type: "opportunities", entity_id: opportunityId });
        },
        [focusRecord]
    );

    return (
        <>
            <section data-testid={`intake-filter-panel-${panel.filter}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                        <h2 className={opSectionTitle}>{panel.title}</h2>
                        <p className={clsx("mt-0.5", opMetadata)}>{panel.lead}</p>
                    </div>
                    <span className={opMetadata}>
                        {panel.items.length} item{panel.items.length === 1 ? "" : "s"}
                    </span>
                </div>
                {panel.items.length === 0 ?
                    <p
                        className={clsx(
                            "mt-2 rounded-xl bg-alloy-stone/20 px-3 py-4 text-center ring-1 ring-alloy-midnight/[0.05]",
                            opMetadata
                        )}
                        data-testid={`intake-filter-empty-${panel.filter}`}
                    >
                        {panel.empty}
                    </p>
                :   <ul className={clsx(opGroupedSurface, "mt-2")}>
                        {panel.items.map((item) => {
                            const activityIso =
                                item.latestActivityAt ??
                                item.submission?.submitted_at ??
                                item.submission?.created_at;
                            const activityTime =
                                activityIso ? formatSubmittedTime(activityIso, viewerTz) : null;
                            const rowLead =
                                item.isCaseRow ? item.title
                                : item.familyLabel && item.title ?
                                    `${item.familyLabel} — ${item.title}`
                                :   item.title;

                            return (
                                <li
                                    key={item.id}
                                    className={clsx(
                                        opGroupedRowInner,
                                        "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between transition-colors hover:bg-alloy-stone/10"
                                    )}
                                    data-testid={caseRowTestId(item)}
                                >
                                    <div className="min-w-0 flex-1 space-y-1">
                                        <p className="text-sm font-semibold text-alloy-midnight">{rowLead}</p>
                                        {item.meta ?
                                            <p className={opMutedMeta}>{item.meta}</p>
                                        :   null}
                                        {activityTime ?
                                            <p className={opMutedMeta} data-testid="intake-row-activity-at">
                                                Latest activity · {activityTime}
                                            </p>
                                        :   null}
                                        {(item.submissionCount ?? 0) > 1 ?
                                            <p className={opBody} data-testid="intake-row-submission-count">
                                                {item.submissionCount} forms in this intake case
                                            </p>
                                        :   null}
                                        {!item.isCaseRow && item.createdSummary ?
                                            <p className={opBody}>{item.createdSummary}</p>
                                        :   null}
                                        {(item.hasSignature || item.hasGeneratedDocument) ?
                                            <p className={opMutedMeta} data-testid="intake-row-evidence-indicators">
                                                {[
                                                    item.hasSignature ? "Signed" : null,
                                                    item.hasGeneratedDocument ? "Document generated" : null,
                                                ]
                                                    .filter(Boolean)
                                                    .join(" · ")}
                                            </p>
                                        :   null}
                                        {item.attentionReasons && item.attentionReasons.length > 0 ?
                                            <p className={clsx("font-medium text-alloy-ember/90", opMetadata)}>
                                                {item.attentionReasons.join(" · ")}
                                            </p>
                                        :   null}
                                        {item.operatorAction ?
                                            <p className={clsx("font-medium", opMetadata)}>
                                                Next: {item.operatorAction}
                                            </p>
                                        :   null}
                                        {item.operationalChips && item.operationalChips.length > 0 ?
                                            <div
                                                className="flex flex-wrap gap-1.5 pt-0.5"
                                                data-testid="intake-row-operational-chips"
                                            >
                                                {item.operationalChips.map((chip) => (
                                                    <StatusBadge key={chip} label={chip} variant="info" />
                                                ))}
                                            </div>
                                        :   null}
                                    </div>
                                    <div className="flex flex-shrink-0 flex-wrap gap-2">
                                        {item.quickReview && item.submission ?
                                            <button
                                                type="button"
                                                className={intakeWorkspaceBtnPrimary}
                                                data-testid={`intake-quick-review-${item.id}`}
                                                onClick={() => setQuickReviewRow(item)}
                                            >
                                                Quick review
                                            </button>
                                        :   null}
                                        {item.opportunityId ?
                                            <button
                                                type="button"
                                                className={intakeWorkspaceBtnSecondary}
                                                data-testid={`intake-open-lead-${item.id}`}
                                                onClick={() => openLead(item.opportunityId!)}
                                            >
                                                Open lead
                                            </button>
                                        :   null}
                                        {item.workUnitHref ?
                                            <Link href={item.workUnitHref} className={intakeWorkspaceBtnSecondary}>
                                                View in pipeline
                                            </Link>
                                        :   null}
                                        <Link href={item.intakeFileHref ?? item.href} className={intakeWorkspaceBtnSecondary}>
                                            {item.opportunityId ? "Intake file" : item.quickReview ? "Open" : item.cta}
                                        </Link>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                }
            </section>

            {quickReviewRow ?
                <SubmissionQuickReviewModal
                    open
                    onClose={closeModal}
                    row={quickReviewRow.submission ?? null}
                    formName={quickReviewRow.formName ?? "Form"}
                    viewerTz={viewerTz}
                    onUpdated={onRefresh}
                    submissionCount={quickReviewRow.submissionCount}
                    caseContext={quickReviewRow.quickReviewCaseContext}
                />
            :   null}
        </>
    );
}
