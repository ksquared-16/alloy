/**
 * Composite view-models for BOS operational cognition surfaces (Phase 2 / Card 2.7).
 * Components consume these VMs — no field interpretation in React.
 */

import type { OpportunityAttentionResult } from "@/lib/opportunities/opportunityAttentionResolver";
import {
    buildOperationalPriorityExplainability,
    type OperationalPriorityExplainability,
} from "@/lib/adminV2/bos/recommendations/operationalPriorityExplainability";
import type { UrgencyBandV1 } from "@/lib/adminV2/bos/recommendations/types";
import type { ResolvedDrawerReadinessChrome } from "@/lib/adminV2/bos/recommendations/selectors/recommendationTrustChrome";
import {
    getRecommendationDetailSummary,
    getRecommendationDrawerStrip,
    resolveDrawerReadinessChromeForOverview,
    resolveQueueOperationalReadPreview,
    type QueueUrgencyChipContext,
    type RecommendationReadSource,
    type ResolvedDrawerRecommendationDisplay,
    type ResolvedDrawerSupportingDetail,
} from "@/lib/adminV2/bos/recommendations/selectors/recommendationSurfaceSelectors";
import { drawerUrgencyChipLabel } from "@/lib/adminV2/bos/recommendations/selectors/reviewAssistPresentation";

/** Queue L0 preview boundary label — preview-only truth (Card 2.3 / 2.6). */
export const QUEUE_PREVIEW_BOUNDARY_LABEL = "Preview" as const;

/** Normalized queue operational read slot for CRM compact rows. */
export type QueueOperationalReadPreviewSlot = {
    /** L0 line 1 — recommended action (do next). */
    operationalRead: string;
    /** L0 line 2 — grounded timing / SLA context (why now). */
    whyNow: string | null;
    urgencyChipLabel: string | null;
    urgencyBand: UrgencyBandV1 | null;
    typeCue: string | null;
    staleCue: string | null;
    previewBoundary: typeof QUEUE_PREVIEW_BOUNDARY_LABEL;
    source: RecommendationReadSource;
    priorityExplanation: OperationalPriorityExplainability | null;
};

/** Drawer Review Assist composite — display + supporting detail + readiness chrome. */
export type ResolvedDrawerReviewAssistViewModel = {
    display: ResolvedDrawerRecommendationDisplay;
    supportingDetail: ResolvedDrawerSupportingDetail | null;
    readinessChrome: ResolvedDrawerReadinessChrome;
    urgencyChipContext: QueueUrgencyChipContext;
    priorityExplanation: OperationalPriorityExplainability | null;
};

function parseOperationalAttentionFromRow(
    row: Record<string, unknown> | null | undefined
): OpportunityAttentionResult | null {
    const raw = row?._operational_attention;
    if (!raw || typeof raw !== "object") return null;
    return raw as OpportunityAttentionResult;
}

function parseOperationalAttention(
    overviewData: Record<string, unknown> | null | undefined
): OpportunityAttentionResult | null {
    const raw = overviewData?._operational_attention;
    if (!raw || typeof raw !== "object") return null;
    return raw as OpportunityAttentionResult;
}

function hasActivitySignal(attention: OpportunityAttentionResult | null): boolean {
    return Boolean(attention?.auxiliary?.activity_stale?.label?.trim());
}

/**
 * Queue L0 operational read slot — canonical selector output with normalized field names.
 */
export function resolveQueueOperationalReadSlot(
    row: Record<string, unknown> | null | undefined
): QueueOperationalReadPreviewSlot | null {
    const preview = resolveQueueOperationalReadPreview(row);
    if (!preview) return null;
    const attention = row ? parseOperationalAttentionFromRow(row) : null;
    const priorityExplanation = buildOperationalPriorityExplainability({
        urgencyBand: preview.urgencyBand,
        chipLabel: preview.urgencyChipLabel,
        slaTier: attention?.primary_reason?.sla_tier ?? null,
        severity: attention?.primary_reason?.severity ?? null,
        urgencyReason: preview.whyLine?.trim() || preview.whyNow?.trim() || null,
        primaryReasonLabel: attention?.primary_reason?.label ?? null,
    });
    return {
        operationalRead: preview.operationalRead,
        whyNow: preview.whyNow ?? null,
        urgencyChipLabel: preview.urgencyChipLabel,
        urgencyBand: preview.urgencyBand,
        typeCue: preview.typeCue,
        staleCue: preview.staleCue,
        previewBoundary: QUEUE_PREVIEW_BOUNDARY_LABEL,
        source: preview.source,
        priorityExplanation: priorityExplanation.chipLabel ? priorityExplanation : null,
    };
}

/**
 * Drawer Review Assist — single pass-through VM for header strip + assist band.
 */
export function resolveDrawerReviewAssistViewModel(
    overviewData: Record<string, unknown> | null | undefined
): ResolvedDrawerReviewAssistViewModel | null {
    const display = getRecommendationDrawerStrip(overviewData);
    if (!display) return null;

    const attention = parseOperationalAttention(overviewData);
    const supportingDetail = getRecommendationDetailSummary(overviewData);
    const readinessChrome = resolveDrawerReadinessChromeForOverview(overviewData, {
        hasSupportingDetail: Boolean(supportingDetail),
        hasActivitySignal: hasActivitySignal(attention),
    });
    const urgencyChipContext: QueueUrgencyChipContext = {
        primarySeverity: attention?.primary_reason?.severity ?? null,
        slaTier: attention?.primary_reason?.sla_tier ?? null,
    };
    const chipLabel = drawerUrgencyChipLabel(display, urgencyChipContext);
    const priorityExplanation = buildOperationalPriorityExplainability({
        urgencyBand: display.urgencyBand ?? null,
        chipLabel,
        slaTier: urgencyChipContext.slaTier ?? null,
        severity: urgencyChipContext.primarySeverity ?? null,
        urgencyReason: display.urgencyReason?.trim() || null,
        primaryReasonLabel: attention?.primary_reason?.label ?? null,
    });

    return {
        display,
        supportingDetail,
        readinessChrome,
        urgencyChipContext,
        priorityExplanation: priorityExplanation.chipLabel ? priorityExplanation : null,
    };
}

/** Alias — collapsed supporting detail (Card 2.4). */
export const resolveDrawerSupportingDetail = getRecommendationDetailSummary;
