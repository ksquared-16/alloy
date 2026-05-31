import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveDrawerReviewAssistViewModel } from "@/lib/adminV2/bos/recommendations/selectors/recommendationSurfaceViewModels";
import type { ResolvedDrawerRecommendationDisplay } from "@/lib/adminV2/bos/recommendations/selectors/recommendationSurfaceSelectors";
import {
    shouldShowDrawerUrgencyChip,
    shouldShowDrawerWhatChanged,
} from "@/lib/adminV2/bos/recommendations/selectors/reviewAssistPresentation";

function trimOrNull(v: unknown): string | null {
    const s = v != null ? String(v).trim() : "";
    return s || null;
}

/** Primary header attention line — recommendation first, then operational read. */
export function drawerHeaderAttentionSummaryLine(display: ResolvedDrawerRecommendationDisplay): string {
    return display.doNext?.trim() || display.operationalRead?.trim() || "";
}

/** Header attention strip is visible (chips and/or summary). */
export function isDrawerHeaderAttentionVisible(overviewData: Record<string, unknown> | null | undefined): boolean {
    const reviewAssist = resolveDrawerReviewAssistViewModel(overviewData);
    if (!reviewAssist) return false;

    const { display, urgencyChipContext } = reviewAssist;
    const showChip = shouldShowDrawerUrgencyChip(display, urgencyChipContext);
    const showEscalationChip = Boolean(display.escalationChipLabel?.trim());
    const summary = trimOrNull(drawerHeaderAttentionSummaryLine(display));
    return showChip || showEscalationChip || Boolean(summary);
}

/** Expanded header panel has non-duplicate guidance content. */
export function hasDrawerHeaderAttentionExpandableContent(
    overviewData: Record<string, unknown> | null | undefined
): boolean {
    const reviewAssist = resolveDrawerReviewAssistViewModel(overviewData);
    if (!reviewAssist) return false;

    const { display, supportingDetail, readinessChrome, priorityExplanation, urgencyChipContext } = reviewAssist;
    const trustLines = readinessChrome?.trustLines ?? [];
    const summary = drawerHeaderAttentionSummaryLine(display);
    const doNext = display.doNext?.trim() ?? "";

    return (
        Boolean(trimOrNull(display.whyNow)) ||
        shouldShowDrawerWhatChanged(display) ||
        trustLines.length > 0 ||
        Boolean(supportingDetail) ||
        Boolean(priorityExplanation?.compactReason && shouldShowDrawerUrgencyChip(display, urgencyChipContext)) ||
        Boolean(doNext && doNext !== summary)
    );
}

/** @deprecated Header owns all review-assist messaging when visible. */
export function hasDrawerReviewAssistBodyGuidance(
    overviewData: Record<string, unknown> | null | undefined
): boolean {
    return hasDrawerHeaderAttentionExpandableContent(overviewData);
}

/** Shared surface for drawer header attention (matches body intelligence band accent). */
export const DRAWER_HEADER_ATTENTION_SURFACE =
    "rounded-xl bg-gradient-to-br from-white via-white to-alloy-stone/25 ring-1 ring-alloy-midnight/[0.06] border-l-[3px] border-l-alloy-blue/40";

/** Full rail width — header attention is context, not a compact control. */
export const DRAWER_HEADER_ATTENTION_MAX_WIDTH = "w-full max-w-full";

const REVIEWABLE_OPERATOR_STATUSES = new Set(["needs_review", "needs_correction"]);

function sessionNeedsReview(row: {
    status?: string | null;
    operator_review_status?: string | null;
}): boolean {
    if (row.status !== "completed") return false;
    const review = row.operator_review_status;
    if (review == null) return true;
    return REVIEWABLE_OPERATOR_STATUSES.has(String(review).trim());
}

/** True when opportunity has at least one completed packet awaiting operator review. */
export async function opportunityHasReviewableEnrollmentPacket(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string
): Promise<boolean> {
    const { data: bySnap, error: snapErr } = await supabase
        .from("form_packet_sessions")
        .select("id, status, operator_review_status")
        .eq("org_id", orgId)
        .filter("crm_snapshot->>opportunity_id", "eq", opportunityId)
        .eq("status", "completed")
        .limit(40);

    if (!snapErr && (bySnap ?? []).some(sessionNeedsReview)) return true;

    const { data: links, error: linkErr } = await supabase
        .from("form_public_links")
        .select("id")
        .eq("org_id", orgId)
        .filter("metadata->>form_context_mode", "eq", "packet")
        .filter("metadata->>source_entity_type", "eq", "opportunity")
        .filter("metadata->>source_entity_id", "eq", opportunityId)
        .limit(80);

    if (linkErr || !links?.length) return false;

    const linkIds = links.map((r) => (r as { id: string }).id).filter(Boolean);
    if (!linkIds.length) return false;

    const { data: byLink, error: linkSessionsErr } = await supabase
        .from("form_packet_sessions")
        .select("id, status, operator_review_status")
        .eq("org_id", orgId)
        .in("started_via_public_link_id", linkIds)
        .eq("status", "completed")
        .limit(40);

    if (linkSessionsErr) return false;
    return (byLink ?? []).some(sessionNeedsReview);
}
