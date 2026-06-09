import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveDrawerReviewAssistViewModel } from "@/lib/adminV2/bos/recommendations/selectors/recommendationSurfaceViewModels";
import type { ResolvedDrawerRecommendationDisplay } from "@/lib/adminV2/bos/recommendations/selectors/recommendationSurfaceSelectors";
import {
    shouldShowDrawerUrgencyChip,
} from "@/lib/adminV2/bos/recommendations/selectors/reviewAssistPresentation";
import type {
    OpportunityAttentionResult,
    ResolvedOpportunityAttentionReason,
} from "@/lib/opportunities/opportunityAttentionResolver";
import { READINESS_ATTENTION_REASON_CODE } from "@/lib/opportunities/readinessAttentionProjection";

/** Scroll target for the drawer Required Information panel (PR B). */
export const DRAWER_REQUIRED_INFORMATION_PANEL_ANCHOR_ID = "opportunity-drawer-required-information";

export const DRAWER_REQUIRED_INFORMATION_LINK_LABEL = "View required fields";

function trimOrNull(v: unknown): string | null {
    const s = v != null ? String(v).trim() : "";
    return s || null;
}

/** Primary header attention line — recommendation first, then operational read. */
export function drawerHeaderAttentionSummaryLine(display: ResolvedDrawerRecommendationDisplay): string {
    return display.doNext?.trim() || display.operationalRead?.trim() || "";
}

function parseOperationalAttentionFromOverview(
    overviewData: Record<string, unknown> | null | undefined
): OpportunityAttentionResult | null {
    const raw = overviewData?._operational_attention;
    if (!raw || typeof raw !== "object") return null;
    return raw as OpportunityAttentionResult;
}

/** True when a reason was projected from readiness (consumes attach payload only). */
export function isReadinessSourcedAttentionReason(reason: ResolvedOpportunityAttentionReason): boolean {
    if (reason.code === READINESS_ATTENTION_REASON_CODE) return true;
    if (reason.attention_source === "readiness") return true;
    return Boolean(reason.readiness_gap_ids?.length);
}

export function collectReadinessAttentionReasons(
    attention: OpportunityAttentionResult
): ResolvedOpportunityAttentionReason[] {
    return attention.reasons.filter(isReadinessSourcedAttentionReason);
}

export type DrawerHeaderReadinessAttentionContext = {
    hasReadinessAttention: boolean;
    readinessReasons: ResolvedOpportunityAttentionReason[];
    /** Primary attention reason is readiness-sourced. */
    primaryIsReadiness: boolean;
    primaryReason: ResolvedOpportunityAttentionReason | null;
    gapLabels: string[];
    primarySummaryLine: string | null;
    nextStepLine: string | null;
    /** When platform/BOS is primary but readiness gaps also exist. */
    supportingLine: string | null;
    severityChipLabel: string | null;
};

function formatReadinessSupportingLine(gapLabels: string[]): string | null {
    const missing = readinessHeaderMissingLine(gapLabels);
    if (!missing) return null;
    return `Also missing: ${missing}`;
}

/** Short missing-fields line for readiness header surfacing. */
export function readinessHeaderMissingLine(gapLabels: string[]): string | null {
    if (!gapLabels.length) return null;
    if (gapLabels.length === 1) return gapLabels[0]!;
    const head = gapLabels.slice(0, 2).join(", ");
    const extra = gapLabels.length > 2 ? ` +${gapLabels.length - 2} more` : "";
    return `${head}${extra}`;
}

/** Collapsed-card action preview — display labels, no raw keys. */
export function readinessHeaderActionLine(gapLabels: string[]): string {
    if (gapLabels.length === 1) {
        return `Add ${gapLabels[0]!} to continue this inquiry.`;
    }
    return "Complete the missing fields to continue this inquiry.";
}

/** More-guidance action line — short imperative, display labels preserved. */
export function readinessHeaderActionDetail(gapLabels: string[]): string {
    if (gapLabels.length === 1) {
        return `Add ${gapLabels[0]!}.`;
    }
    return "Complete the missing fields.";
}

/** One-line why for readiness gaps. */
export function readinessHeaderWhyLine(): string {
    return "Needed to continue this inquiry.";
}

/** Readiness-generated attention from `_operational_attention` for drawer header surfacing. */
export function resolveDrawerHeaderReadinessAttention(
    overviewData: Record<string, unknown> | null | undefined
): DrawerHeaderReadinessAttentionContext {
    const empty: DrawerHeaderReadinessAttentionContext = {
        hasReadinessAttention: false,
        readinessReasons: [],
        primaryIsReadiness: false,
        primaryReason: null,
        gapLabels: [],
        primarySummaryLine: null,
        nextStepLine: null,
        supportingLine: null,
        severityChipLabel: null,
    };

    const attention = parseOperationalAttentionFromOverview(overviewData);
    if (!attention?.needs_attention) return empty;

    const readinessReasons = collectReadinessAttentionReasons(attention);
    if (!readinessReasons.length) return empty;

    const primary = attention.primary_reason;
    const primaryIsReadiness = primary != null && isReadinessSourcedAttentionReason(primary);

    const gapLabels: string[] = [];
    const seen = new Set<string>();
    for (const reason of readinessReasons) {
        const label = reason.label.trim();
        if (!label || seen.has(label)) continue;
        seen.add(label);
        gapLabels.push(label);
    }

    const primaryLabel =
        primaryIsReadiness && primary
            ? primary.label.trim() || readinessHeaderMissingLine(gapLabels)
            : null;
    const severityChipLabel = null;

    const nextStepLine = primaryIsReadiness ? readinessHeaderActionLine(gapLabels) : null;

    return {
        hasReadinessAttention: true,
        readinessReasons,
        primaryIsReadiness,
        primaryReason: primaryIsReadiness ? primary : null,
        gapLabels,
        primarySummaryLine: primaryLabel,
        nextStepLine,
        supportingLine: primaryIsReadiness ? null : formatReadinessSupportingLine(gapLabels),
        severityChipLabel,
    };
}

/** BOS / review-assist header chrome visible (unchanged pre-readiness behavior). */
export function isDrawerHeaderReviewAssistVisible(
    overviewData: Record<string, unknown> | null | undefined
): boolean {
    const reviewAssist = resolveDrawerReviewAssistViewModel(overviewData);
    if (!reviewAssist) return false;

    const { display, urgencyChipContext } = reviewAssist;
    const showChip = shouldShowDrawerUrgencyChip(display, urgencyChipContext);
    const showEscalationChip = Boolean(display.escalationChipLabel?.trim());
    const summary = trimOrNull(drawerHeaderAttentionSummaryLine(display));
    return showChip || showEscalationChip || Boolean(summary);
}

/** Header attention strip is visible (chips and/or summary). */
export function isDrawerHeaderAttentionVisible(overviewData: Record<string, unknown> | null | undefined): boolean {
    if (resolveDrawerHeaderReadinessAttention(overviewData).hasReadinessAttention) return true;
    return isDrawerHeaderReviewAssistVisible(overviewData);
}

/** Expanded header panel has non-duplicate guidance content. */
export function hasDrawerHeaderAttentionExpandableContent(
    overviewData: Record<string, unknown> | null | undefined
): boolean {
    return hasDrawerHeaderMoreGuidanceContent(overviewData);
}

/** @deprecated Header owns all review-assist messaging when visible. */
export function hasDrawerReviewAssistBodyGuidance(
    overviewData: Record<string, unknown> | null | undefined
): boolean {
    return hasDrawerHeaderAttentionExpandableContent(overviewData);
}

export type DrawerHeaderMoreGuidanceLine = {
    key: string;
    label: string;
    body: string;
};

function humanizeGuidanceCopy(text: string): string {
    const trimmed = text.trim();
    if (!trimmed) return "";
    const dedupedBreached = trimmed
        .replace(/\bSLA breached\s*[·•|]\s*breached\b/gi, "Past due")
        .replace(/\bbreached\s*[·•|]\s*breached\b/gi, "Past due");
    const parts = dedupedBreached.split(/\s*[·•|]\s*/).map((p) => p.trim()).filter(Boolean);
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const part of parts) {
        const key = part.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(part);
    }
    return unique.join(" · ");
}

/** Readiness-only More guidance — optional detail; collapsed card carries the core fix. */
export function buildReadinessDrawerHeaderMoreGuidance(
    ctx: DrawerHeaderReadinessAttentionContext
): DrawerHeaderMoreGuidanceLine[] {
    const lines: DrawerHeaderMoreGuidanceLine[] = [];
    const missing = readinessHeaderMissingLine(ctx.gapLabels);
    if (missing) {
        lines.push({ key: "missing", label: "What's missing", body: missing });
    }
    const action = readinessHeaderActionDetail(ctx.gapLabels);
    if (action) {
        lines.push({ key: "do", label: "What to do", body: action });
    }
    lines.push({ key: "why", label: "Why it matters", body: readinessHeaderWhyLine() });
    return lines;
}

/** Short operator-facing lines for the drawer header More guidance panel. */
export function buildDrawerHeaderMoreGuidance(input: {
    display: ResolvedDrawerRecommendationDisplay;
    summary: string;
    doNext: string;
    readinessCtx: DrawerHeaderReadinessAttentionContext;
    supportingDetail: import("@/lib/adminV2/bos/recommendations/selectors/recommendationSurfaceSelectors").ResolvedDrawerSupportingDetail | null;
}): DrawerHeaderMoreGuidanceLine[] {
    if (input.readinessCtx.primaryIsReadiness) {
        return buildReadinessDrawerHeaderMoreGuidance(input.readinessCtx);
    }

    const lines: DrawerHeaderMoreGuidanceLine[] = [];

    const why = humanizeGuidanceCopy(input.display.whyNow?.trim() ?? "");
    if (why) {
        lines.push({ key: "why", label: "Why this needs attention", body: why });
    }

    const next = humanizeGuidanceCopy(input.doNext);
    if (next && next.toLowerCase() !== input.summary.trim().toLowerCase()) {
        lines.push({ key: "next", label: "What to do next", body: next });
    }

    if (input.readinessCtx.hasReadinessAttention && input.readinessCtx.supportingLine) {
        const missing = input.readinessCtx.supportingLine.replace(/^Also missing:\s*/i, "").trim();
        if (missing) {
            lines.push({ key: "missing", label: "What's missing", body: missing });
        }
    } else {
        let driving: string | null = input.supportingDetail?.primaryFactorLabel?.trim() ?? null;
        if (!driving) {
            const read = input.display.operationalRead?.trim() ?? "";
            if (read && read.toLowerCase() !== input.summary.trim().toLowerCase()) {
                driving = read;
            }
        }
        const drivingCopy = humanizeGuidanceCopy(driving ?? "");
        if (drivingCopy) {
            lines.push({ key: "driving", label: "What is driving it", body: drivingCopy });
        }
    }

    return lines;
}

export function hasDrawerHeaderMoreGuidanceContent(
    overviewData: Record<string, unknown> | null | undefined
): boolean {
    const readinessCtx = resolveDrawerHeaderReadinessAttention(overviewData);
    if (readinessCtx.primaryIsReadiness) {
        return buildReadinessDrawerHeaderMoreGuidance(readinessCtx).length > 0;
    }

    const reviewAssist = resolveDrawerReviewAssistViewModel(overviewData);
    if (!reviewAssist) {
        return false;
    }
    return (
        buildDrawerHeaderMoreGuidance({
            display: reviewAssist.display,
            summary: drawerHeaderAttentionSummaryLine(reviewAssist.display),
            doNext: reviewAssist.display.doNext?.trim() ?? "",
            readinessCtx,
            supportingDetail: reviewAssist.supportingDetail,
        }).length > 0
    );
}

/** Shared surface for drawer header attention (matches body intelligence band accent). */
export const DRAWER_HEADER_ATTENTION_SURFACE =
    "w-full rounded-lg bg-white ring-1 ring-alloy-midnight/[0.06] border-l-[3px] border-l-alloy-ember/75";

/** Card fills its allocated center column — width comes from the header grid, not a % of a narrow parent. */
export const DRAWER_HEADER_ATTENTION_MAX_WIDTH = "w-full min-w-0";

/** AdminV2 modal header — center column for Needs Attention (450–600px on desktop). */
export const DRAWER_HEADER_ATTENTION_CENTER_COLUMN_CLASS =
    "flex w-full min-w-[min(100%,450px)] max-w-[600px] flex-1 shrink items-start justify-start self-center";

/** Shared inner padding/gap for header attention surfaces — compact for modal title row. */
export const DRAWER_HEADER_ATTENTION_INNER_LAYOUT = "flex w-full flex-col items-start gap-0.5 px-2 py-1";

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
