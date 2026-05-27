"use client";

import clsx from "clsx";
import Link from "next/link";
import { useCallback, useState } from "react";
import type { IntakeWorkspaceFilterPanel } from "@/lib/forms/intakeWorkspaceFilters";
import { SubmissionQuickReviewDrawer } from "@/components/forms/workspace/SubmissionQuickReviewDrawer";
import {
    opBody,
    opGroupedRowInner,
    opGroupedSurface,
    opMetadata,
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

/** Inline contextual workload panel with quick review drawer (OI-4). */
export function IntakeWorkspaceFilterPanelView({ panel, viewerTz, onRefresh }: Props) {
    const [quickReviewRow, setQuickReviewRow] = useState<(typeof panel.items)[number] | null>(null);

    const closeDrawer = useCallback(() => setQuickReviewRow(null), []);

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
                        {panel.items.map((item) => (
                            <li
                                key={item.id}
                                className={clsx(
                                    opGroupedRowInner,
                                    "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between transition-colors hover:bg-alloy-stone/10"
                                )}
                                data-testid={`intake-filter-item-${item.id}`}
                            >
                                <div className="min-w-0 flex-1">
                                    {item.formName ?
                                        <p className={opMetadata}>{item.formName}</p>
                                    :   null}
                                    <p className="text-sm font-semibold text-alloy-midnight">{item.title}</p>
                                    <p className={clsx("mt-1 line-clamp-3", opBody)}>{item.meta}</p>
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
                        ))}
                    </ul>
                }
            </section>

            {quickReviewRow ?
                <SubmissionQuickReviewDrawer
                    open
                    onClose={closeDrawer}
                    row={quickReviewRow.submission ?? null}
                    formName={quickReviewRow.formName ?? "Form"}
                    viewerTz={viewerTz}
                    onUpdated={onRefresh}
                />
            :   null}
        </>
    );
}
