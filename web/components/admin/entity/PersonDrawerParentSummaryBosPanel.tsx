"use client";

import { useMemo } from "react";
import MissingRequirementsSummary from "@/components/admin/completion/MissingRequirementsSummary";
import BosDrawerAssistCta from "@/components/admin/drawer/BosDrawerAssistCta";
import {
    INQUIRY_RIGHT_COLUMN_GROUP_LABEL_CLASS,
    INQUIRY_SUMMARY_RIGHT_COLUMN_ROOT_CLASS,
} from "@/lib/admin/drawer/opportunityInquiryRightColumnGeometry";
import { evaluatePersonDrawerCompletionPreview } from "@/lib/admin/person/personDrawerLayoutCompletionBridge";

/** Parent summary assist column with completion guardrails preview. */
export default function PersonDrawerParentSummaryBosPanel({
    personId,
    overviewData,
    layoutVariantKey,
}: {
    personId: string;
    overviewData: Record<string, unknown>;
    layoutVariantKey?: string | null;
}) {
    const completionPreview = useMemo(
        () =>
            evaluatePersonDrawerCompletionPreview({
                personId,
                record: overviewData,
                layoutVariantKey,
            }),
        [personId, overviewData, layoutVariantKey]
    );

    const hasBlocking = completionPreview.blocking.length > 0;

    return (
        <aside
            className={`${INQUIRY_SUMMARY_RIGHT_COLUMN_ROOT_CLASS} h-full min-h-[12rem] rounded-lg border border-alloy-stone/10 bg-alloy-stone/[0.02] px-2.5 py-2`}
            data-person-drawer-parent-bos="true"
            data-person-drawer-completion-layout-variant={layoutVariantKey ?? undefined}
            aria-label="Parent assist"
        >
            <p className={INQUIRY_RIGHT_COLUMN_GROUP_LABEL_CLASS}>Assist</p>
            {!hasBlocking ? (
                <p className="mt-1.5 text-[11px] leading-snug text-alloy-midnight/50" data-review-assist-calm="true">
                    No urgent action flagged.
                </p>
            ) : null}
            <div className="mt-2">
                <MissingRequirementsSummary result={completionPreview} compact />
            </div>
            <div className="mt-2 border-t border-alloy-stone/10 pt-2">
                <BosDrawerAssistCta
                    entityId={personId}
                    overviewData={overviewData}
                    opportunitySingular="Parent"
                />
            </div>
        </aside>
    );
}
