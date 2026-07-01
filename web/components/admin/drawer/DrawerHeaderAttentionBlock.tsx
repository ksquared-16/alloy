"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";

import { FormsReviewBadge } from "@/components/forms/review/FormsReviewBadge";
import type { FormsReviewBadgeTone } from "@/lib/forms/review/formsReviewPresentation";
import {
    buildDrawerHeaderMoreGuidance,
    buildReadinessDrawerHeaderMoreGuidance,
    DRAWER_HEADER_ATTENTION_INNER_LAYOUT,
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

type GuidanceLine = { key: string; label: string; body: string };

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

function MoreGuidancePopover({
    anchorEl,
    lines,
    ariaLabel,
    onClose,
}: {
    anchorEl: HTMLElement;
    lines: GuidanceLine[];
    ariaLabel: string;
    onClose: () => void;
}) {
    const panelRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

    useEffect(() => {
        const update = () => {
            const rect = anchorEl.getBoundingClientRect();
            const width = Math.min(Math.max(rect.width, 288), window.innerWidth - 24);
            setPos({
                top: rect.bottom + 6,
                left: Math.min(Math.max(12, rect.left), window.innerWidth - width - 12),
                width,
            });
        };
        update();
        window.addEventListener("resize", update);
        window.addEventListener("scroll", update, true);
        return () => {
            window.removeEventListener("resize", update);
            window.removeEventListener("scroll", update, true);
        };
    }, [anchorEl]);

    useEffect(() => {
        const onKey = (ev: KeyboardEvent) => {
            if (ev.key === "Escape") onClose();
        };
        const onPointer = (ev: MouseEvent) => {
            const t = ev.target as Node;
            if (anchorEl.contains(t)) return;
            if (panelRef.current?.contains(t)) return;
            onClose();
        };
        window.addEventListener("keydown", onKey);
        const tid = window.setTimeout(() => document.addEventListener("mousedown", onPointer), 0);
        return () => {
            window.clearTimeout(tid);
            window.removeEventListener("keydown", onKey);
            document.removeEventListener("mousedown", onPointer);
        };
    }, [anchorEl, onClose]);

    if (!pos || typeof document === "undefined") return null;

    return createPortal(
        <div
            ref={panelRef}
            className="fixed z-[86] rounded-lg border border-[#e2e5e0] bg-[#fafaf9] px-2.5 py-2 text-[11px] leading-snug shadow-[0_12px_32px_-12px_rgba(15,23,42,0.28)] ring-1 ring-[#eef0ec]"
            style={{ top: pos.top, left: pos.left, width: pos.width }}
            data-testid="header-attention-expanded-panel"
            role="region"
            aria-label={ariaLabel}
        >
            <div className="space-y-1.5">
                {lines.map((line) => (
                    <p key={line.key} data-header-more-guidance-row={line.key}>
                        <span className="font-medium text-[#5c6478]">{line.label} · </span>
                        {line.body}
                    </p>
                ))}
            </div>
            <button
                type="button"
                className="mt-1.5 text-[10px] font-medium text-[#5c6478] hover:text-[#2a3140]"
                onClick={onClose}
            >
                Close
            </button>
        </div>,
        document.body,
    );
}

function MoreGuidanceTrigger({
    expanded,
    onToggle,
    buttonRef,
}: {
    expanded: boolean;
    onToggle: () => void;
    buttonRef: RefObject<HTMLButtonElement | null>;
}) {
    return (
        <button
            ref={buttonRef}
            type="button"
            className="text-left text-[10px] font-medium text-alloy-midnight/55 underline-offset-2 hover:text-alloy-midnight/75 hover:underline"
            data-testid="header-attention-more-guidance"
            aria-expanded={expanded}
            onClick={onToggle}
        >
            More guidance
        </button>
    );
}

/**
 * Drawer header operational attention — context (not controls).
 * Collapsed: chips, summary (≤2 lines), More guidance.
 * Expanded: anchored overlay panel with explanation (no route/modal).
 */
export function DrawerHeaderAttentionBlock({ overviewData }: Props) {
    const readinessCtx = resolveDrawerHeaderReadinessAttention(overviewData);
    const reviewAssist = resolveDrawerReviewAssistViewModel(overviewData);
    const bosVisible = isDrawerHeaderReviewAssistVisible(overviewData);
    const [expanded, setExpanded] = useState(false);
    const guidanceButtonRef = useRef<HTMLButtonElement>(null);
    const closeGuidance = useCallback(() => setExpanded(false), []);
    const toggleGuidance = useCallback(() => setExpanded((v) => !v), []);

    if (!bosVisible && !readinessCtx.hasReadinessAttention) return null;

    if (!bosVisible && readinessCtx.hasReadinessAttention) {
        const hasExpandable = hasDrawerHeaderAttentionExpandableContent(overviewData);
        const moreGuidance = buildReadinessDrawerHeaderMoreGuidance(readinessCtx);

        return (
            <div
                className={clsx("relative", DRAWER_HEADER_ATTENTION_MAX_WIDTH)}
                data-drawer-slot="header_attention_strip"
            >
                <div
                    className={clsx(DRAWER_HEADER_ATTENTION_SURFACE, DRAWER_HEADER_ATTENTION_INNER_LAYOUT)}
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
                        <MoreGuidanceTrigger
                            expanded={expanded}
                            onToggle={toggleGuidance}
                            buttonRef={guidanceButtonRef}
                        />
                    :   null}
                </div>
                {expanded && hasExpandable && guidanceButtonRef.current ?
                    <MoreGuidancePopover
                        anchorEl={guidanceButtonRef.current}
                        lines={moreGuidance}
                        ariaLabel="Attention guidance detail"
                        onClose={closeGuidance}
                    />
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
            className={clsx("relative", DRAWER_HEADER_ATTENTION_MAX_WIDTH)}
            data-drawer-slot="header_attention_strip"
        >
            <div
                className={clsx(DRAWER_HEADER_ATTENTION_SURFACE, DRAWER_HEADER_ATTENTION_INNER_LAYOUT)}
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
                {useReadinessPrimary && readinessCtx.nextStepLine ?
                    <p
                        className="w-full min-w-0 text-left text-[11px] leading-snug text-alloy-midnight/78"
                        data-testid="header-attention-readiness-next"
                    >
                        {readinessCtx.nextStepLine}
                    </p>
                :   null}
                {readinessCtx.hasReadinessAttention &&
                !readinessCtx.primaryIsReadiness &&
                readinessCtx.supportingLine ?
                    <ReadinessSupportingDetail line={readinessCtx.supportingLine} />
                :   null}
                {hasExpandable ?
                    <MoreGuidanceTrigger
                        expanded={expanded}
                        onToggle={toggleGuidance}
                        buttonRef={guidanceButtonRef}
                    />
                :   null}
            </div>
            {expanded && hasExpandable && guidanceButtonRef.current ?
                <MoreGuidancePopover
                    anchorEl={guidanceButtonRef.current}
                    lines={moreGuidance}
                    ariaLabel="Operational guidance detail"
                    onClose={closeGuidance}
                />
            :   null}
        </div>
    );
}

/** @deprecated Use DrawerHeaderAttentionBlock */
export const OpportunityDrawerHeaderAttentionStrip = DrawerHeaderAttentionBlock;
