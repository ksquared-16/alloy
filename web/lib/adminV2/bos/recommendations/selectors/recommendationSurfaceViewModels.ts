/**
 * Composite view-models for BOS operational cognition surfaces (Phase 2 / Card 2.7).
 * Components consume these VMs — no field interpretation in React.
 */

import type { OpportunityAttentionResult } from "@/lib/opportunities/opportunityAttentionResolver";
import type { UrgencyBandV1 } from "@/lib/adminV2/bos/recommendations/types";
import type { ResolvedDrawerReadinessChrome } from "@/lib/adminV2/bos/recommendations/selectors/recommendationTrustChrome";
import {
    getRecommendationDetailSummary,
    getRecommendationDrawerStrip,
    resolveDrawerReadinessChromeForOverview,
    resolveQueueOperationalReadPreview,
    type RecommendationReadSource,
    type ResolvedDrawerRecommendationDisplay,
    type ResolvedDrawerSupportingDetail,
} from "@/lib/adminV2/bos/recommendations/selectors/recommendationSurfaceSelectors";

/** Queue L0 preview boundary label — preview-only truth (Card 2.3 / 2.6). */
export const QUEUE_PREVIEW_BOUNDARY_LABEL = "Preview" as const;

/** Normalized queue operational read slot for CRM compact rows. */
export type QueueOperationalReadPreviewSlot = {
    operationalRead: string;
    urgencyChipLabel: string | null;
    urgencyBand: UrgencyBandV1 | null;
    typeCue: string | null;
    staleCue: string | null;
    previewBoundary: typeof QUEUE_PREVIEW_BOUNDARY_LABEL;
    source: RecommendationReadSource;
};

/** Drawer Review Assist composite — display + supporting detail + readiness chrome. */
export type ResolvedDrawerReviewAssistViewModel = {
    display: ResolvedDrawerRecommendationDisplay;
    supportingDetail: ResolvedDrawerSupportingDetail | null;
    readinessChrome: ResolvedDrawerReadinessChrome;
};

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
    return {
        operationalRead: preview.operationalRead,
        urgencyChipLabel: preview.urgencyChipLabel,
        urgencyBand: preview.urgencyBand,
        typeCue: preview.typeCue,
        staleCue: preview.staleCue,
        previewBoundary: QUEUE_PREVIEW_BOUNDARY_LABEL,
        source: preview.source,
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

    const supportingDetail = getRecommendationDetailSummary(overviewData);
    const readinessChrome = resolveDrawerReadinessChromeForOverview(overviewData, {
        hasSupportingDetail: Boolean(supportingDetail),
        hasActivitySignal: hasActivitySignal(parseOperationalAttention(overviewData)),
    });

    return { display, supportingDetail, readinessChrome };
}

/** Alias — collapsed supporting detail (Card 2.4). */
export const resolveDrawerSupportingDetail = getRecommendationDetailSummary;
