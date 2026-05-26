"use client";

import type { ReactNode } from "react";

import { FormsReviewBadge } from "@/components/forms/review/FormsReviewBadge";
import type { FormsReviewBadgeTone } from "@/lib/forms/review/formsReviewPresentation";
import type {
    ResolvedDrawerRecommendationDisplay,
    ResolvedDrawerSupportingDetail,
} from "@/lib/adminV2/bos/recommendations/selectors/recommendationSurfaceSelectors";
import type { UrgencyBandV1 } from "@/lib/adminV2/bos/recommendations/types";
import {
    opInsightSummaryCompact,
    opIntelligenceSurface,
    opLabelCaps,
    opMetadata,
    opStackSectionCompact,
} from "@/lib/operational/ui/operationalVisualTokens";
import clsx from "clsx";

const REVIEW_ASSIST_TITLE = "Review assist";
const REVIEW_ASSIST_LEAD = "Operational guidance · read-only";

type Props = {
    display: ResolvedDrawerRecommendationDisplay;
    variant: "chrome" | "panel";
    suppressSectionBrandLabel?: boolean;
    activityStaleLabel?: string | null;
    supportingDetail?: ResolvedDrawerSupportingDetail | null;
    draftSlot?: ReactNode;
    enhanceSlot?: ReactNode;
};

function SupportingDetailDisclosure({ detail }: { detail: ResolvedDrawerSupportingDetail }) {
    return (
        <details
            className="mt-0.5 text-[10px] leading-snug text-alloy-midnight/65"
            data-review-assist-supporting-detail
        >
            <summary
                className="cursor-pointer select-none font-medium text-alloy-midnight/55 [&::-webkit-details-marker]:hidden"
                data-testid="review-assist-supporting-detail"
            >
                {detail.collapsedSummary}
            </summary>
            <div className="mt-1 space-y-0.5">
                {detail.primaryFactorLabel ? (
                    <p className="text-alloy-midnight/70">
                        <span className="font-medium text-alloy-midnight/60">Primary factor · </span>
                        {detail.primaryFactorLabel}
                    </p>
                ) : null}
                {detail.displaySignalLabels.length > 0 ? (
                    <ul className="list-inside list-disc space-y-0.5 text-alloy-midnight/70">
                        {detail.displaySignalLabels.map((label) => (
                            <li key={label}>{label}</li>
                        ))}
                    </ul>
                ) : null}
                {detail.secondaryFactorLabels.map((label) => (
                    <p key={label} className="text-alloy-midnight/70">
                        {label}
                    </p>
                ))}
                {detail.timingHint ? (
                    <p className="text-alloy-midnight/60">
                        <span className="font-medium">Timing · </span>
                        {detail.timingHint}
                    </p>
                ) : null}
                {detail.provenanceLine ? (
                    <p className="text-alloy-midnight/60">{detail.provenanceLine}</p>
                ) : null}
            </div>
        </details>
    );
}

function urgencyChipTone(band: UrgencyBandV1 | null | undefined): FormsReviewBadgeTone {
    switch (band) {
        case "p0_urgent":
            return "warning";
        case "p1_today":
            return "info";
        case "p2_soon":
            return "neutral";
        default:
            return "neutral";
    }
}

function showUrgencyChip(band: UrgencyBandV1 | null | undefined, label: string | null | undefined): boolean {
    if (!label?.trim()) return false;
    return band !== "p3_fyi";
}

function RowLabel({ children }: { children: React.ReactNode }) {
    return <span className={clsx(opLabelCaps, "text-[10px]")}>{children}</span>;
}

/**
 * Calm operational review-assist band (BOS Phase 2 / Card 2.1).
 * Cognition order: readiness → why now → do next → optional likely → supporting detail.
 */
export default function OperationalReviewAssistBand({
    display,
    variant,
    suppressSectionBrandLabel = false,
    activityStaleLabel,
    supportingDetail,
    draftSlot,
    enhanceSlot,
}: Props) {
    const chrome = variant === "chrome";
    const showChip = showUrgencyChip(display.urgencyBand, display.urgencyLabel);
    const trustNotes: string[] = [];
    if (display.staleBanner?.trim()) trustNotes.push(display.staleBanner.trim());
    if (display.confidenceLabel?.trim()) trustNotes.push(display.confidenceLabel.trim());
    if (activityStaleLabel?.trim()) trustNotes.push(activityStaleLabel.trim());

    return (
        <div
            className={clsx(
                opIntelligenceSurface,
                chrome ? "px-2.5 py-2 text-[11px] leading-snug" : "px-3 py-2.5 text-[11px] leading-snug",
            )}
            data-drawer-slot="operational_review_assist"
            data-attention-surface="review_assist"
            {...(chrome ? { "data-operational-attention-canonical": "chrome" as const } : {})}
        >
            {!suppressSectionBrandLabel ? (
                <div className="flex flex-wrap items-start justify-between gap-1.5">
                    <div>
                        <p className="text-[11px] font-semibold text-alloy-midnight">{REVIEW_ASSIST_TITLE}</p>
                        <p className={opMetadata}>{REVIEW_ASSIST_LEAD}</p>
                    </div>
                    {showChip ? (
                        <span data-testid="review-assist-urgency-chip">
                            <FormsReviewBadge
                                label={display.urgencyLabel!.trim()}
                                tone={urgencyChipTone(display.urgencyBand)}
                            />
                        </span>
                    ) : null}
                </div>
            ) : showChip ? (
                <div className="flex justify-end">
                    <span data-testid="review-assist-urgency-chip">
                        <FormsReviewBadge
                            label={display.urgencyLabel!.trim()}
                            tone={urgencyChipTone(display.urgencyBand)}
                        />
                    </span>
                </div>
            ) : null}

            <div className={clsx(opStackSectionCompact, suppressSectionBrandLabel ? "" : "mt-2")}>
                <div data-review-assist-row="operational_read">
                    {!suppressSectionBrandLabel ? (
                        <div className="mb-0.5">
                            <RowLabel>Operational read</RowLabel>
                        </div>
                    ) : null}
                    <p
                        className={clsx(
                            chrome ? opInsightSummaryCompact : "text-sm leading-snug text-alloy-midnight/85",
                            "font-medium text-alloy-midnight",
                        )}
                    >
                        {display.operationalRead}
                    </p>
                    {trustNotes.length > 0 ? (
                        <p className={clsx("mt-0.5", opMetadata)} data-testid="review-assist-trust-notes">
                            {trustNotes.join(" · ")}
                        </p>
                    ) : null}
                </div>

                {display.urgencyReason?.trim() &&
                display.urgencyReason.trim() !== display.whyNow.trim() ? (
                    <div data-review-assist-row="what_changed">
                        <div className="mb-0.5">
                            <RowLabel>What changed</RowLabel>
                        </div>
                        <p className={opMetadata}>{display.urgencyReason.trim()}</p>
                    </div>
                ) : null}

                <div data-review-assist-row="why_now">
                    <div className="mb-0.5">
                        <RowLabel>Why now</RowLabel>
                    </div>
                    <p className={chrome ? opInsightSummaryCompact : "text-sm leading-snug text-alloy-midnight/80"}>
                        {display.whyNow}
                    </p>
                </div>

                <div data-review-assist-row="do_next">
                    <div className="mb-0.5">
                        <RowLabel>Do next</RowLabel>
                    </div>
                    <p className={clsx(chrome ? opInsightSummaryCompact : "text-sm leading-snug", "text-alloy-midnight/88")}>
                        {display.nextActionLabel}
                    </p>
                </div>

                {display.outcomeLine?.trim() ? (
                    <div data-review-assist-row="likely_outcome" className="text-alloy-midnight/55">
                        <div className="mb-0.5">
                            <RowLabel>Likely</RowLabel>
                        </div>
                        <p className={opMetadata}>{display.outcomeLine.trim()}</p>
                    </div>
                ) : null}

                {supportingDetail ? <SupportingDetailDisclosure detail={supportingDetail} /> : null}

                {draftSlot}
                {enhanceSlot}
            </div>
        </div>
    );
}
