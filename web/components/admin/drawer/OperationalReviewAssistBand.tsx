"use client";

import type { ReactNode } from "react";

import { FormsReviewBadge } from "@/components/forms/review/FormsReviewBadge";
import type { FormsReviewBadgeTone } from "@/lib/forms/review/formsReviewPresentation";
import type {
    ResolvedDrawerRecommendationDisplay,
    ResolvedDrawerReadinessChrome,
    ResolvedDrawerSupportingDetail,
} from "@/lib/adminV2/bos/recommendations/selectors/recommendationSurfaceSelectors";
import type { QueueUrgencyChipContext } from "@/lib/adminV2/bos/recommendations/selectors/recommendationSurfaceSelectors";
import type { OperationalPriorityExplainability } from "@/lib/adminV2/bos/recommendations/operationalPriorityExplainability";
import {
    drawerUrgencyChipLabel,
    shouldShowDrawerLikelyOutcome,
    shouldShowDrawerUrgencyChip,
    shouldShowDrawerWhatChanged,
} from "@/lib/adminV2/bos/recommendations/selectors/reviewAssistPresentation";
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
    readinessChrome?: ResolvedDrawerReadinessChrome;
    supportingDetail?: ResolvedDrawerSupportingDetail | null;
    draftSlot?: ReactNode;
    enhanceSlot?: ReactNode;
    /** Native BOS assist CTA — fixed platform action, not configurable. */
    bosAssistSlot?: ReactNode;
    urgencyChipContext?: QueueUrgencyChipContext;
    priorityExplanation?: OperationalPriorityExplainability | null;
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
    readinessChrome,
    supportingDetail,
    draftSlot,
    enhanceSlot,
    bosAssistSlot,
    urgencyChipContext,
    priorityExplanation = null,
}: Props) {
    const chrome = variant === "chrome";
    const drawerChipLabel = drawerUrgencyChipLabel(display, urgencyChipContext);
    const showChip = shouldShowDrawerUrgencyChip(display, urgencyChipContext);
    const showEscalationChip = Boolean(display.escalationChipLabel?.trim());
    const trustLines = readinessChrome?.trustLines ?? [];
    const showLikely = shouldShowDrawerLikelyOutcome(display, variant);
    const showWhatChanged = shouldShowDrawerWhatChanged(display);
    const stackClass = chrome ? "space-y-1.5" : opStackSectionCompact;

    return (
        <div
            className={clsx(
                opIntelligenceSurface,
                "min-w-0 max-w-full",
                chrome ? "px-2 py-1.5 text-[11px] leading-snug" : "px-3 py-2.5 text-[11px] leading-snug",
            )}
            data-drawer-slot="operational_review_assist"
            data-attention-surface="review_assist"
            {...(chrome ? { "data-operational-attention-canonical": "chrome" as const, "data-review-assist-compact": "true" as const } : {})}
        >
            {!suppressSectionBrandLabel ? (
                <div className="flex flex-wrap items-start justify-between gap-1.5">
                    <div>
                        <p className="text-[11px] font-semibold text-alloy-midnight">{REVIEW_ASSIST_TITLE}</p>
                        <p className={opMetadata}>{REVIEW_ASSIST_LEAD}</p>
                    </div>
                    {showChip || showEscalationChip ? (
                        <div className="flex flex-wrap items-center justify-end gap-1">
                            {showChip ? (
                                <span
                                    data-testid="review-assist-urgency-chip"
                                    title={priorityExplanation?.ariaLabel ?? drawerChipLabel ?? undefined}
                                    aria-label={priorityExplanation?.ariaLabel ?? drawerChipLabel ?? undefined}
                                >
                                    <FormsReviewBadge
                                        label={drawerChipLabel!.trim()}
                                        tone={urgencyChipTone(display.urgencyBand)}
                                    />
                                </span>
                            ) : null}
                            {showEscalationChip ? (
                                <span data-testid="review-assist-escalation-chip">
                                    <FormsReviewBadge
                                        label={display.escalationChipLabel!.trim()}
                                        tone="neutral"
                                    />
                                </span>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            ) : showChip || showEscalationChip ? (
                <div className="flex flex-wrap justify-end gap-1">
                    {showChip ? (
                        <span
                            data-testid="review-assist-urgency-chip"
                            title={priorityExplanation?.ariaLabel ?? drawerChipLabel ?? undefined}
                            aria-label={priorityExplanation?.ariaLabel ?? drawerChipLabel ?? undefined}
                        >
                            <FormsReviewBadge
                                label={drawerChipLabel!.trim()}
                                tone={urgencyChipTone(display.urgencyBand)}
                            />
                        </span>
                    ) : null}
                    {showEscalationChip ? (
                        <span data-testid="review-assist-escalation-chip">
                            <FormsReviewBadge
                                label={display.escalationChipLabel!.trim()}
                                tone="neutral"
                            />
                        </span>
                    ) : null}
                </div>
            ) : null}

            <div className={clsx(stackClass, suppressSectionBrandLabel ? "" : "mt-2")}>
                <div data-review-assist-row="operational_read" className="min-w-0">
                    {!suppressSectionBrandLabel ? (
                        <div className="mb-0.5">
                            <RowLabel>Operational read</RowLabel>
                        </div>
                    ) : null}
                    <p
                        className={clsx(
                            chrome ? opInsightSummaryCompact : "text-sm leading-snug text-alloy-midnight/85",
                            "font-medium text-alloy-midnight",
                            chrome ? "line-clamp-2" : "",
                        )}
                    >
                        {display.operationalRead}
                    </p>
                    {!chrome && display.typeCue?.trim() ? (
                        <p className={clsx("mt-0.5", opMetadata)} data-testid="review-assist-type-line">
                            Type · {display.typeCue.trim()}
                        </p>
                    ) : null}
                    {!chrome && display.classificationContextLine?.trim() ? (
                        <p className={clsx("mt-0.5", opMetadata)} data-testid="review-assist-classification-context">
                            {display.classificationContextLine.trim()}
                        </p>
                    ) : null}
                </div>

                {showWhatChanged ? (
                    <div data-review-assist-row="what_changed" className="min-w-0">
                        <div className="mb-0.5">
                            <RowLabel>What changed</RowLabel>
                        </div>
                        <p className={clsx(opMetadata, chrome ? "line-clamp-2" : "")}>{display.urgencyReason!.trim()}</p>
                    </div>
                ) : null}

                <div data-review-assist-row="why_now" className="min-w-0">
                    <div className="mb-0.5">
                        <RowLabel>Why now</RowLabel>
                    </div>
                    <p
                        className={clsx(
                            chrome ? opInsightSummaryCompact : "text-sm leading-snug text-alloy-midnight/80",
                            chrome ? "line-clamp-2" : "",
                        )}
                    >
                        {display.whyNow}
                    </p>
                </div>

                <div data-review-assist-row="do_next" className="min-w-0">
                    <div className="mb-0.5">
                        <RowLabel>Do next</RowLabel>
                    </div>
                    <p
                        className={clsx(
                            chrome ? opInsightSummaryCompact : "text-sm leading-snug",
                            "text-alloy-midnight/88",
                            chrome ? "line-clamp-2" : "",
                        )}
                    >
                        {display.doNext}
                    </p>
                </div>

                {trustLines.length > 0 ? (
                    <p className={clsx(opMetadata, "min-w-0")} data-testid="review-assist-trust-notes">
                        {trustLines.join(" · ")}
                    </p>
                ) : null}

                {showChip && priorityExplanation?.compactReason ? (
                    <p
                        className={clsx(opMetadata, "min-w-0")}
                        data-testid="review-assist-priority-explanation"
                    >
                        Priority · {priorityExplanation.compactReason}
                    </p>
                ) : null}

                {showLikely ? (
                    <div data-review-assist-row="likely_outcome" className="min-w-0 text-alloy-midnight/55">
                        <div className="mb-0.5">
                            <RowLabel>Likely</RowLabel>
                        </div>
                        <p className={opMetadata}>{display.likelyOutcome!.trim()}</p>
                    </div>
                ) : null}

                {supportingDetail ? <SupportingDetailDisclosure detail={supportingDetail} /> : null}

                {draftSlot}
                {enhanceSlot}
                {bosAssistSlot}
            </div>
        </div>
    );
}
