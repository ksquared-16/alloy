"use client";

import clsx from "clsx";
import Link from "next/link";
import { useCallback, useState } from "react";
import { formatDateTimeForUserDisplay } from "@/lib/adminFormatters";
import type { IntakeWorkspaceFilterPanel } from "@/lib/forms/intakeWorkspaceFilters";
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

/** Inline contextual workload panel — intake-case oriented rows. */
export function IntakeWorkspaceFilterPanelView({ panel, viewerTz, onRefresh }: Props) {
    const [quickReviewRow, setQuickReviewRow] = useState<(typeof panel.items)[number] | null>(null);

    const closeModal = useCallback(() => setQuickReviewRow(null), []);

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
                    >
                        {panel.empty}
                    </p>
                :   <ul className={clsx(opGroupedSurface, "mt-2")}>
                        {panel.items.map((item) => {
                            const submittedIso = item.submission?.submitted_at ?? item.submission?.created_at;
                            const submittedTime =
                                submittedIso ? formatSubmittedTime(submittedIso, viewerTz) : null;
                            const rowLead =
                                item.familyLabel && item.title ?
                                    `${item.familyLabel} — ${item.title}`
                                :   item.title;

                            return (
                                <li
                                    key={item.id}
                                    className={clsx(
                                        opGroupedRowInner,
                                        "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between transition-colors hover:bg-alloy-stone/10"
                                    )}
                                    data-testid={
                                        item.submission ?
                                            `intake-submission-row-${item.submission.id}`
                                        :   `intake-filter-item-${item.id}`
                                    }
                                >
                                    <div className="min-w-0 flex-1 space-y-1">
                                        <p className="text-sm font-semibold text-alloy-midnight">{rowLead}</p>
                                        {item.formName && submittedTime ?
                                            <p className={opMutedMeta} data-testid="intake-row-submitted-at">
                                                {item.formName} submitted · {submittedTime}
                                            </p>
                                        : item.formName ?
                                            <p className={opMutedMeta}>{item.formName}</p>
                                        : submittedTime ?
                                            <p className={opMutedMeta} data-testid="intake-row-submitted-at">
                                                Submitted · {submittedTime}
                                            </p>
                                        :   null}
                                        {item.createdSummary ?
                                            <p className={opBody}>{item.createdSummary}</p>
                                        :   null}
                                        {!item.createdSummary && item.meta ?
                                            <p className={opMutedMeta}>{item.meta}</p>
                                        :   null}
                                        {item.operatorAction ?
                                            <p className={clsx("font-medium", opMetadata)}>
                                                Next: {item.operatorAction}
                                            </p>
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
                                        <Link href={item.href} className={intakeWorkspaceBtnSecondary}>
                                            {item.quickReview ? "Open" : item.cta}
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
                />
            :   null}
        </>
    );
}
