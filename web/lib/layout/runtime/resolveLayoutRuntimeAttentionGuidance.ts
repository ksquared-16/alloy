/**
 * Shared attention summary + More guidance resolution for drawer summary cards and queue widgets.
 *
 * Sources (existing selectors only — no new resolver precedence):
 * - `resolveDrawerReviewAssistViewModel` / readiness projection / queue preview preview fields
 */

import {
    buildDrawerHeaderMoreGuidance,
    buildReadinessDrawerHeaderMoreGuidance,
    drawerHeaderAttentionSummaryLine,
    hasDrawerHeaderMoreGuidanceContent,
    resolveDrawerHeaderReadinessAttention,
    type DrawerHeaderMoreGuidanceLine,
} from "@/lib/admin/drawer/drawerHeaderAttentionPresentation";
import { resolveDrawerReviewAssistViewModel } from "@/lib/adminV2/bos/recommendations/selectors/recommendationSurfaceViewModels";
import { getRecommendationQueuePreview } from "@/lib/adminV2/bos/recommendations/selectors/recommendationSurfaceSelectors";

const ATTENTION_OVERVIEW_PASSTHROUGH_KEYS = [
    "_operational_attention",
    "_operational_recommendation",
    "_operational_recommendation_preview",
    "_attention_suggestion",
    "_attention_suggestion_preview",
    "_inquiry_summary_tasks",
    "_attention",
    "_attention_reason_label",
    "opportunity.attention_reason",
] as const;

/** Merge queue/drawer record + nested overview into one attention overview blob. */
export function mergeLayoutRuntimeAttentionOverview(record: Record<string, unknown>): Record<string, unknown> {
    const nested =
        record._overview_data && typeof record._overview_data === "object" && !Array.isArray(record._overview_data)
            ? (record._overview_data as Record<string, unknown>)
            : {};
    const merged: Record<string, unknown> = { ...nested, ...record };
    for (const key of ATTENTION_OVERVIEW_PASSTHROUGH_KEYS) {
        const top = record[key];
        const inner = nested[key];
        if (top !== undefined && top !== null && top !== "") merged[key] = top;
        else if (inner !== undefined && inner !== null && inner !== "") merged[key] = inner;
    }
    return merged;
}

function readAttentionFallback(record: Record<string, unknown>): string {
    return String(
        record["_attention_reason_label"]
        ?? record["opportunity.attention_reason"]
        ?? record._attention
        ?? "",
    ).trim();
}

/** Operator-facing attention summary — matches drawer header priority. */
export function resolveLayoutRuntimeAttentionSummaryLine(
    record: Record<string, unknown>,
    fallback?: string,
): string {
    const overview = mergeLayoutRuntimeAttentionOverview(record);
    const readinessCtx = resolveDrawerHeaderReadinessAttention(overview);
    const reviewAssist = resolveDrawerReviewAssistViewModel(overview);

    if (reviewAssist) {
        if (readinessCtx.primaryIsReadiness && readinessCtx.primarySummaryLine) {
            return readinessCtx.primarySummaryLine;
        }
        const line = drawerHeaderAttentionSummaryLine(reviewAssist.display).trim();
        if (line) return line;
    }

    if (readinessCtx.primarySummaryLine) return readinessCtx.primarySummaryLine;
    if (readinessCtx.nextStepLine) return readinessCtx.nextStepLine;

    const preview = getRecommendationQueuePreview(overview);
    if (preview?.nextLabel) return preview.nextLabel.trim();

    return fallback?.trim() || readAttentionFallback(overview) || "";
}

/** More guidance panel lines — hide link when this returns empty. */
export function resolveLayoutRuntimeAttentionGuidanceLines(
    record: Record<string, unknown>,
    summaryLine: string,
): DrawerHeaderMoreGuidanceLine[] {
    const overview = mergeLayoutRuntimeAttentionOverview(record);
    const readinessCtx = resolveDrawerHeaderReadinessAttention(overview);
    const reviewAssist = resolveDrawerReviewAssistViewModel(overview);

    if (reviewAssist) {
        return buildDrawerHeaderMoreGuidance({
            display: reviewAssist.display,
            summary: summaryLine,
            doNext: reviewAssist.display.doNext?.trim() ?? readinessCtx.nextStepLine ?? "",
            readinessCtx,
            supportingDetail: reviewAssist.supportingDetail,
        });
    }

    if (readinessCtx.hasReadinessAttention) {
        return buildReadinessDrawerHeaderMoreGuidance(readinessCtx);
    }

    const preview = getRecommendationQueuePreview(overview);
    if (!preview) return [];

    const lines: DrawerHeaderMoreGuidanceLine[] = [];
    const why = preview.whyLine.trim();
    if (why) {
        lines.push({ key: "why", label: "Why this needs attention", body: why });
    }
    const next = preview.nextLabel.trim();
    if (next && next.toLowerCase() !== summaryLine.trim().toLowerCase()) {
        lines.push({ key: "next", label: "What to do next", body: next });
    }
    return lines;
}

/** True when More guidance affordance should render. */
export function layoutRuntimeAttentionHasMoreGuidance(record: Record<string, unknown>, summaryLine: string): boolean {
    const overview = mergeLayoutRuntimeAttentionOverview(record);
    if (hasDrawerHeaderMoreGuidanceContent(overview)) return true;
    return resolveLayoutRuntimeAttentionGuidanceLines(record, summaryLine).length > 0;
}
