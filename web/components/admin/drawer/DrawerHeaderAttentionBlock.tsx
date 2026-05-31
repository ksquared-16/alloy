"use client";

import { useEffect, useRef, useState } from "react";

import { FormsReviewBadge } from "@/components/forms/review/FormsReviewBadge";
import type { FormsReviewBadgeTone } from "@/lib/forms/review/formsReviewPresentation";
import {
    DRAWER_HEADER_ATTENTION_SURFACE,
    drawerHeaderAttentionSummaryLine,
    hasDrawerHeaderAttentionExpandableContent,
    isDrawerHeaderAttentionVisible,
} from "@/lib/admin/drawer/drawerHeaderAttentionPresentation";
import { resolveDrawerReviewAssistViewModel } from "@/lib/adminV2/bos/recommendations/selectors/recommendationSurfaceViewModels";
import {
    drawerUrgencyChipLabel,
    shouldShowDrawerUrgencyChip,
    shouldShowDrawerWhatChanged,
} from "@/lib/adminV2/bos/recommendations/selectors/reviewAssistPresentation";
import type { ResolvedDrawerSupportingDetail } from "@/lib/adminV2/bos/recommendations/selectors/recommendationSurfaceSelectors";
import type { UrgencyBandV1 } from "@/lib/adminV2/bos/recommendations/types";
import { opMetadata } from "@/lib/operational/ui/operationalVisualTokens";
import clsx from "clsx";

type Props = {
    overviewData: Record<string, unknown>;
};

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

function SupportingDetailBlock({ detail }: { detail: ResolvedDrawerSupportingDetail }) {
    return (
        <div className="mt-1 space-y-0.5 text-[10px] leading-snug text-alloy-midnight/70">
            {detail.primaryFactorLabel ? (
                <p>
                    <span className="font-medium text-alloy-midnight/60">Primary factor · </span>
                    {detail.primaryFactorLabel}
                </p>
            ) : null}
            {detail.displaySignalLabels.length > 0 ? (
                <ul className="list-inside list-disc space-y-0.5">
                    {detail.displaySignalLabels.map((label) => (
                        <li key={label}>{label}</li>
                    ))}
                </ul>
            ) : null}
            {detail.secondaryFactorLabels.map((label) => (
                <p key={label}>{label}</p>
            ))}
            {detail.timingHint ? (
                <p className="text-alloy-midnight/60">
                    <span className="font-medium">Timing · </span>
                    {detail.timingHint}
                </p>
            ) : null}
            {detail.provenanceLine ? <p className="text-alloy-midnight/60">{detail.provenanceLine}</p> : null}
        </div>
    );
}

/**
 * Drawer header operational attention — context (not controls).
 * Collapsed: chips, summary (≤2 lines), More guidance.
 * Expanded: in-drawer overlay panel with explanation (no route/modal).
 */
export function DrawerHeaderAttentionBlock({ overviewData }: Props) {
    const reviewAssist = resolveDrawerReviewAssistViewModel(overviewData);
    const [expanded, setExpanded] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!expanded) return;
        const onKey = (ev: KeyboardEvent) => {
            if (ev.key === "Escape") setExpanded(false);
        };
        const onPointer = (ev: MouseEvent) => {
            const el = rootRef.current;
            if (!el || el.contains(ev.target as Node)) return;
            setExpanded(false);
        };
        window.addEventListener("keydown", onKey);
        document.addEventListener("mousedown", onPointer);
        return () => {
            window.removeEventListener("keydown", onKey);
            document.removeEventListener("mousedown", onPointer);
        };
    }, [expanded]);

    if (!reviewAssist || !isDrawerHeaderAttentionVisible(overviewData)) return null;

    const { display, urgencyChipContext, priorityExplanation, supportingDetail, readinessChrome } = reviewAssist;
    const drawerChipLabel = drawerUrgencyChipLabel(display, urgencyChipContext);
    const showChip = shouldShowDrawerUrgencyChip(display, urgencyChipContext);
    const showEscalationChip = Boolean(display.escalationChipLabel?.trim());
    const summary = drawerHeaderAttentionSummaryLine(display);
    const showWhatChanged = shouldShowDrawerWhatChanged(display);
    const trustLines = readinessChrome?.trustLines ?? [];
    const hasExpandable = hasDrawerHeaderAttentionExpandableContent(overviewData);
    const doNext = display.doNext?.trim() ?? "";
    const showDoNextInPanel = Boolean(doNext && doNext !== summary);

    return (
        <div ref={rootRef} className="relative w-full min-w-0" data-drawer-slot="header_attention_strip">
            <div
                className={clsx(
                    DRAWER_HEADER_ATTENTION_SURFACE,
                    "flex w-full min-w-0 flex-col items-start gap-1 px-2.5 py-1.5",
                )}
                data-opportunity-header-attention="true"
            >
                {showChip || showEscalationChip ?
                    <div className="flex flex-wrap items-center gap-1">
                        {showChip ?
                            <span
                                data-testid="header-attention-urgency-chip"
                                title={priorityExplanation?.ariaLabel ?? drawerChipLabel ?? undefined}
                                aria-label={priorityExplanation?.ariaLabel ?? drawerChipLabel ?? undefined}
                            >
                                <FormsReviewBadge
                                    label={drawerChipLabel!.trim()}
                                    tone={urgencyChipTone(display.urgencyBand)}
                                />
                            </span>
                        :   null}
                        {showEscalationChip ?
                            <span data-testid="header-attention-escalation-chip">
                                <FormsReviewBadge label={display.escalationChipLabel!.trim()} tone="neutral" />
                            </span>
                        :   null}
                    </div>
                :   null}
                {summary ?
                    <p
                        className="line-clamp-2 w-full min-w-0 text-left text-[11px] font-medium leading-snug text-alloy-midnight"
                        data-testid="header-attention-summary"
                        title={summary}
                    >
                        {summary}
                    </p>
                :   null}
                {hasExpandable ?
                    <button
                        type="button"
                        className="text-left text-[10px] font-medium text-alloy-midnight/55 hover:text-alloy-midnight/75"
                        data-testid="header-attention-more-guidance"
                        aria-expanded={expanded}
                        onClick={() => setExpanded((v) => !v)}
                    >
                        More guidance
                    </button>
                :   null}
            </div>
            {expanded && hasExpandable ?
                <div
                    className="absolute left-0 top-full z-30 mt-1 w-full min-w-[18rem] rounded-xl border border-alloy-stone/20 bg-white px-3 py-2.5 text-[11px] leading-snug shadow-lg ring-1 ring-alloy-midnight/[0.06]"
                    data-testid="header-attention-expanded-panel"
                    role="region"
                    aria-label="Operational guidance detail"
                >
                    <div className="space-y-1.5">
                        {display.whyNow?.trim() ?
                            <p data-review-assist-row="why_now" className={opMetadata}>
                                <span className="font-medium text-alloy-midnight/60">Why now · </span>
                                {display.whyNow.trim()}
                            </p>
                        :   null}
                        {showDoNextInPanel ?
                            <p data-review-assist-row="do_next" className={opMetadata}>
                                <span className="font-medium text-alloy-midnight/60">Recommended next step · </span>
                                {doNext}
                            </p>
                        :   null}
                        {showWhatChanged ?
                            <p data-review-assist-row="what_changed" className={opMetadata}>
                                <span className="font-medium text-alloy-midnight/60">What changed · </span>
                                {display.urgencyReason!.trim()}
                            </p>
                        :   null}
                        {trustLines.length > 0 ?
                            <p className={opMetadata} data-testid="review-assist-trust-notes">
                                {trustLines.join(" · ")}
                            </p>
                        :   null}
                        {showChip && priorityExplanation?.compactReason ?
                            <p className={opMetadata} data-testid="review-assist-priority-explanation">
                                Priority · {priorityExplanation.compactReason}
                            </p>
                        :   null}
                        {supportingDetail ? <SupportingDetailBlock detail={supportingDetail} /> : null}
                    </div>
                    <button
                        type="button"
                        className="mt-2 text-[10px] font-medium text-alloy-midnight/50 hover:text-alloy-midnight/70"
                        onClick={() => setExpanded(false)}
                    >
                        Close
                    </button>
                </div>
            :   null}
        </div>
    );
}

/** @deprecated Use DrawerHeaderAttentionBlock */
export const OpportunityDrawerHeaderAttentionStrip = DrawerHeaderAttentionBlock;
