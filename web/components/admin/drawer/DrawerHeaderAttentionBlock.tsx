"use client";

import { useEffect, useRef, useState } from "react";

import { FormsReviewBadge } from "@/components/forms/review/FormsReviewBadge";
import type { FormsReviewBadgeTone } from "@/lib/forms/review/formsReviewPresentation";
import {
    buildDrawerHeaderMoreGuidance,
    buildReadinessDrawerHeaderMoreGuidance,
    DRAWER_HEADER_ATTENTION_MAX_WIDTH,
    DRAWER_HEADER_ATTENTION_SURFACE,
    drawerHeaderAttentionSummaryLine,
    hasDrawerHeaderAttentionExpandableContent,
    isDrawerHeaderReviewAssistVisible,
    resolveDrawerHeaderReadinessAttention,
} from "@/lib/admin/drawer/drawerHeaderAttentionPresentation";
import { resolveDrawerReviewAssistViewModel } from "@/lib/adminV2/bos/recommendations/selectors/recommendationSurfaceViewModels";
import {
    drawerUrgencyChipLabel,
    shouldShowDrawerUrgencyChip,
} from "@/lib/adminV2/bos/recommendations/selectors/reviewAssistPresentation";
import type { OpportunityAttentionSeverity } from "@/lib/opportunities/opportunityAttentionConfig";
import type { UrgencyBandV1 } from "@/lib/adminV2/bos/recommendations/types";
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

function readinessSeverityChipTone(severity: OpportunityAttentionSeverity | string | null | undefined): FormsReviewBadgeTone {
    switch (severity) {
        case "critical":
        case "high":
            return "warning";
        case "medium":
            return "info";
        default:
            return "neutral";
    }
}

function ReadinessSupportingDetail({ line }: { line: string }) {
    return (
        <p
            className="w-full min-w-0 text-left text-[10px] leading-snug text-alloy-midnight/72"
            data-testid="header-attention-readiness-supporting"
        >
            {line}
        </p>
    );
}

/**
 * Drawer header operational attention — context (not controls).
 * Collapsed: chips, summary (≤2 lines), More guidance.
 * Expanded: in-drawer overlay panel with explanation (no route/modal).
 */
export function DrawerHeaderAttentionBlock({ overviewData }: Props) {
    const readinessCtx = resolveDrawerHeaderReadinessAttention(overviewData);
    const reviewAssist = resolveDrawerReviewAssistViewModel(overviewData);
    const bosVisible = isDrawerHeaderReviewAssistVisible(overviewData);
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

    if (!bosVisible && !readinessCtx.hasReadinessAttention) return null;

    if (!bosVisible && readinessCtx.hasReadinessAttention) {
        const hasExpandable = hasDrawerHeaderAttentionExpandableContent(overviewData);
        const moreGuidance = buildReadinessDrawerHeaderMoreGuidance(readinessCtx);

        return (
            <div
                ref={rootRef}
                className={clsx("relative", DRAWER_HEADER_ATTENTION_MAX_WIDTH)}
                data-drawer-slot="header_attention_strip"
            >
                <div
                    className={clsx(
                        DRAWER_HEADER_ATTENTION_SURFACE,
                        "flex w-full flex-col items-start gap-1.5 px-3 py-2",
                    )}
                    data-opportunity-header-attention="true"
                    data-attention-surface="readiness_primary"
                >
                    {readinessCtx.primarySummaryLine ?
                        <p
                            className="line-clamp-2 w-full min-w-0 text-left text-[11px] font-medium leading-snug text-alloy-midnight"
                            data-testid="header-attention-summary"
                            title={readinessCtx.primarySummaryLine}
                        >
                            {readinessCtx.primarySummaryLine}
                        </p>
                    :   null}
                    {readinessCtx.nextStepLine ?
                        <p
                            className="w-full min-w-0 text-left text-[11px] leading-snug text-alloy-midnight/78"
                            data-testid="header-attention-readiness-next"
                        >
                            {readinessCtx.nextStepLine}
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
                        aria-label="Attention guidance detail"
                    >
                        <div className="space-y-2">
                            {moreGuidance.map((line) => (
                                <p key={line.key} data-header-more-guidance-row={line.key}>
                                    <span className="font-medium text-alloy-midnight/60">{line.label} · </span>
                                    {line.body}
                                </p>
                            ))}
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

    if (!reviewAssist) return null;

    const { display, urgencyChipContext, priorityExplanation, supportingDetail } = reviewAssist;
    const useReadinessPrimary = readinessCtx.primaryIsReadiness;
    const drawerChipLabel = useReadinessPrimary
        ? readinessCtx.severityChipLabel
        : drawerUrgencyChipLabel(display, urgencyChipContext);
    const showChip = useReadinessPrimary
        ? Boolean(readinessCtx.severityChipLabel)
        : shouldShowDrawerUrgencyChip(display, urgencyChipContext);
    const showEscalationChip = useReadinessPrimary ? false : Boolean(display.escalationChipLabel?.trim());
    const summary =
        useReadinessPrimary && readinessCtx.primarySummaryLine
            ? readinessCtx.primarySummaryLine
            : drawerHeaderAttentionSummaryLine(display);
    const hasExpandable = hasDrawerHeaderAttentionExpandableContent(overviewData);
    const doNext =
        useReadinessPrimary && readinessCtx.nextStepLine
            ? readinessCtx.nextStepLine
            : (display.doNext?.trim() ?? "");
    const chipTone = useReadinessPrimary
        ? readinessSeverityChipTone(readinessCtx.primaryReason?.severity)
        : urgencyChipTone(display.urgencyBand);
    const moreGuidance = buildDrawerHeaderMoreGuidance({
        display,
        summary,
        doNext,
        readinessCtx,
        supportingDetail,
    });

    return (
        <div
            ref={rootRef}
            className={clsx("relative", DRAWER_HEADER_ATTENTION_MAX_WIDTH)}
            data-drawer-slot="header_attention_strip"
        >
            <div
                className={clsx(
                    DRAWER_HEADER_ATTENTION_SURFACE,
                    "flex w-full flex-col items-start gap-1.5 px-3 py-2",
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
                                <FormsReviewBadge label={drawerChipLabel!.trim()} tone={chipTone} />
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
                {readinessCtx.hasReadinessAttention &&
                !readinessCtx.primaryIsReadiness &&
                readinessCtx.supportingLine ?
                    <ReadinessSupportingDetail line={readinessCtx.supportingLine} />
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
                    className="absolute left-0 top-full z-30 mt-1 w-full min-w-[18rem] max-w-full rounded-xl border border-alloy-stone/20 bg-white px-3 py-2.5 text-[11px] leading-snug shadow-lg ring-1 ring-alloy-midnight/[0.06]"
                    data-testid="header-attention-expanded-panel"
                    role="region"
                    aria-label="Operational guidance detail"
                >
                    <div className="space-y-2">
                        {moreGuidance.map((line) => (
                            <p key={line.key} data-header-more-guidance-row={line.key}>
                                <span className="font-medium text-alloy-midnight/60">{line.label} · </span>
                                {line.body}
                            </p>
                        ))}
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
