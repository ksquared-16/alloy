import type { CrmCompactRowSemanticSlots } from "@/lib/ui-v2/workspace-types";
import type {
    QueueRowPlacementPriorityV2Vm,
    QueueRowPlacementPriorityVm,
    QueueRowPlacementWaitlistCandidateVm,
} from "@/lib/ui-v2/workspace-types";

/** Inline header attention — expand to band only above this length. */
export const QUEUE_ROW_HEADER_INLINE_ATTENTION_MAX = 72;

/** Header line-2 subline — reason + next step before exceptional expand. */
export const QUEUE_ROW_HEADER_SUBLINE_MAX = 140;

const INTERNAL_REASON_FRAGMENTS = [
    "breached vs goal",
    "preview",
    "operational-read",
    "operational read",
] as const;

export type EnrollmentHeaderAttentionInline = {
    inline: string | null;
    urgencyLabel: string | null;
    /** Operational read headline shown in header — excluded from expanded band. */
    headlineSummary: string | null;
    fullText: string | null;
};

export type AttentionExpandedDetail = {
    reasonDetail: string | null;
    nextStepLine: string | null;
    hintLine: string | null;
    childLifecycleSummary: string | null;
    operationalSummary: string | null;
    hasContent: boolean;
};

export type WaitlistHeaderInline = {
    rankingChip: string | null;
    reasonShort: string | null;
    fullRankingTitle: string | null;
};

function truncateInline(raw: string, max: number): string {
    const t = raw.trim();
    if (t.length <= max) return t;
    return `${t.slice(0, max - 1).trimEnd()}…`;
}

/** Short operator-facing attention headline — strips catalog verb phrases. */
export function deriveConciseAttentionSummary(raw: string): string {
    let s = raw.trim();
    if (!s) return s;

    s = s.replace(/^complete the\s+/i, "");
    s = s.replace(/^finish the\s+/i, "");
    s = s.replace(/^follow up on (?:the\s+)?/i, "follow-up on ");
    s = s.replace(/^schedule (?:the\s+)?/i, "schedule ");
    s = s.replace(/\s+and log the next step(?:\s+on the record)?\.?$/i, "");
    s = s.replace(/\s+and record the next step(?:\s+on the record)?\.?$/i, "");
    s = s.replace(/\s+on the record\.?$/i, "");
    s = s.replace(/\s+and record (?:the\s+)?(?:outcome|result)\.?$/i, "");
    s = s.replace(/\s+in (?:the|your) (?:crm|system)\.?$/i, "");

    if (/^[A-Z]/.test(s) && s.length < 56 && !s.includes(". ")) {
        s = s.charAt(0).toLowerCase() + s.slice(1);
    }

    return s.trim() || raw.trim();
}

/** Operator-friendly reason detail — drops internal/system fragments. */
export function sanitizeOperatorReasonDetail(raw: string): string {
    const parts = raw
        .split(/\s*·\s*/)
        .map((part) => part.trim())
        .filter(Boolean)
        .filter((part) => {
            const lower = part.toLowerCase();
            return !INTERNAL_REASON_FRAGMENTS.some((frag) => lower.includes(frag));
        })
        .map((part) => {
            if (/^commitment date passed\b/i.test(part)) {
                return part.replace(/^commitment date passed/i, "Commitment date missed");
            }
            return part;
        });

    return parts.join(" · ").trim();
}

export function buildEnrollmentHeaderAttentionInline(
    slots: CrmCompactRowSemanticSlots
): EnrollmentHeaderAttentionInline {
    const read = slots.operationalReadPreview;
    if (read?.operationalRead?.trim()) {
        const urgency = read.urgencyChipLabel?.trim() || null;
        const summary = deriveConciseAttentionSummary(read.operationalRead.trim());
        const inlineBase = urgency ? `${urgency}: ${summary}` : summary;
        const whyRaw = read.whyNow?.trim() || null;
        const why = whyRaw ? sanitizeOperatorReasonDetail(whyRaw) : null;
        const fullText = why ? `${inlineBase} · ${why}` : inlineBase;
        return {
            inline: inlineBase,
            urgencyLabel: urgency,
            headlineSummary: summary,
            fullText,
        };
    }

    const reason = slots.attentionReason?.trim() || slots.queuePriorityExplanation?.trim() || null;
    if (reason) {
        const inline = reason.replace(/^needs attention:\s*/i, "").trim() || reason;
        return {
            inline,
            urgencyLabel: null,
            headlineSummary: inline,
            fullText: inline,
        };
    }

    return { inline: null, urgencyLabel: null, headlineSummary: null, fullText: null };
}

function normalizeAttentionText(raw: string): string {
    return raw.replace(/\s+/g, " ").trim().toLowerCase();
}

function textAlreadyInHeader(headerInline: EnrollmentHeaderAttentionInline | null, candidate: string): boolean {
    if (!headerInline?.inline?.trim()) return false;
    const normHeader = normalizeAttentionText(headerInline.inline);
    const normCandidate = normalizeAttentionText(candidate);
    if (!normCandidate) return false;
    return normHeader.includes(normCandidate) || normCandidate.includes(normHeader);
}

/** Supplemental lines only — never repeats the header attention headline. */
export function buildAttentionExpandedDetail(
    slots: CrmCompactRowSemanticSlots,
    headerInline: EnrollmentHeaderAttentionInline | null
): AttentionExpandedDetail {
    const read = slots.operationalReadPreview;

    let reasonDetail = read?.whyNow?.trim() ? sanitizeOperatorReasonDetail(read.whyNow.trim()) : null;
    if (reasonDetail && textAlreadyInHeader(headerInline, reasonDetail)) {
        reasonDetail = null;
    }

    if (!reasonDetail && slots.queuePriorityExplanation?.trim()) {
        const expl = sanitizeOperatorReasonDetail(slots.queuePriorityExplanation.trim());
        if (expl && !textAlreadyInHeader(headerInline, expl)) reasonDetail = expl;
    }

    if (!reasonDetail && slots.attentionReason?.trim() && !read?.operationalRead?.trim()) {
        const attn = slots.attentionReason.trim().replace(/^needs attention:\s*/i, "").trim();
        const sanitized = attn ? sanitizeOperatorReasonDetail(attn) : null;
        if (sanitized && !textAlreadyInHeader(headerInline, sanitized)) reasonDetail = sanitized;
    }

    const nextRaw = slots.nextStep?.trim() || slots.operationalNextHint?.trim() || null;
    const nextStepLine = nextRaw ? `Next step: ${nextRaw}` : null;

    const hintLine =
        read?.typeCue?.trim() ||
        read?.staleCue?.trim() ||
        null;

    const childLifecycleSummary = slots.childLifecycleSummary?.trim() || null;
    const operationalSummary = slots.operationalSummaryPreview?.headline?.trim() || null;

    const hasContent = Boolean(
        reasonDetail || nextStepLine || hintLine || childLifecycleSummary || operationalSummary
    );

    return {
        reasonDetail,
        nextStepLine,
        hintLine,
        childLifecycleSummary,
        operationalSummary,
        hasContent,
    };
}

/** Header line-2 parts — operational context consolidated before exceptional expand. */
export function buildEnrollmentHeaderSublineParts(detail: AttentionExpandedDetail): string[] {
    return [
        detail.reasonDetail,
        detail.nextStepLine,
        detail.hintLine,
        detail.childLifecycleSummary,
        detail.operationalSummary,
    ].filter(Boolean) as string[];
}

/** Exceptional expand — subline too long for header line 2. */
export function shouldExpandAttentionBandFromDetail(detail: AttentionExpandedDetail): boolean {
    if (!detail.hasContent) return false;
    const sublineLen = buildEnrollmentHeaderSublineParts(detail).join(" · ").length;
    return sublineLen > QUEUE_ROW_HEADER_SUBLINE_MAX;
}

export function shouldExpandAttentionBand(
    slots: CrmCompactRowSemanticSlots,
    headerInline: EnrollmentHeaderAttentionInline | null
): boolean {
    return shouldExpandAttentionBandFromDetail(buildAttentionExpandedDetail(slots, headerInline));
}

/** Compact header line 2 — reason, next step, and supporting context when not exceptionally expanded. */
export function buildEnrollmentHeaderSubline(
    detail: AttentionExpandedDetail,
    expandAttentionBand: boolean
): string | null {
    if (expandAttentionBand || !detail.hasContent) return null;
    const parts = buildEnrollmentHeaderSublineParts(detail);
    return parts.length ? parts.join(" · ") : null;
}

/** Waitlist header line 2 — priority explanation, sibling context, placement guidance. */
export function buildWaitlistHeaderSubline(
    inline: WaitlistHeaderInline,
    candidate?: QueueRowPlacementWaitlistCandidateVm | null
): string | null {
    const parts: string[] = [];
    if (inline.reasonShort?.trim()) parts.push(inline.reasonShort.trim());
    if (candidate) {
        for (const line of candidate.siblingContextLines ?? []) {
            const trimmed = line?.trim();
            if (!trimmed) continue;
            if (parts.some((p) => p.includes(trimmed) || trimmed.includes(p))) continue;
            parts.push(trimmed);
        }
        const forecast = candidate.forecastHints?.[0]?.trim();
        if (forecast && !parts.some((p) => p.includes(forecast))) {
            parts.push(forecast);
        }
        const linkLabel = candidate.linkModeLabel?.trim();
        if (linkLabel && !parts.some((p) => p.includes(linkLabel))) {
            parts.push(linkLabel);
        }
    }
    if (!parts.length) return null;
    const joined = parts.join(" · ");
    if (joined.length <= QUEUE_ROW_HEADER_SUBLINE_MAX) return joined;
    return parts.slice(0, 2).join(" · ") || null;
}

export function buildWaitlistHeaderInlineFromPlacement(
    preview: QueueRowPlacementPriorityVm
): WaitlistHeaderInline {
    const pos =
        !preview.shadowMode &&
        preview.scopedWaitlistPosition != null &&
        preview.scopedWaitlistPosition >= 1
            ? preview.scopedWaitlistPosition
            : null;
    const rule = preview.priorityRuleLabel?.trim() || "";
    let rankingChip: string | null = null;
    if (pos != null && rule) {
        rankingChip = `#${pos} ${rule}`;
    } else if (pos != null) {
        rankingChip = `#${pos}`;
    } else if (rule) {
        rankingChip = rule;
    }
    const reasonShort = preview.priorityReasonShort?.trim() || null;
    return {
        rankingChip,
        reasonShort,
        fullRankingTitle: preview.scopedWaitlistPositionLabel?.trim() || rankingChip,
    };
}

export function buildWaitlistHeaderInlineFromV2(preview: QueueRowPlacementPriorityV2Vm): WaitlistHeaderInline {
    const cohort = preview.primaryCohortLabel?.trim() || "";
    const bucket = preview.familyBucketLabel?.trim() || "";
    const rankingChip = [cohort, bucket].filter(Boolean).join(" · ") || null;
    return {
        rankingChip,
        reasonShort: preview.blockedByStrictLink
            ? "Sibling link — family position uses slowest child in group."
            : preview.strictLinkCrossOpportunityIncomplete
              ? "Sibling link may include children on other records."
              : null,
        fullRankingTitle: rankingChip,
    };
}

export function buildWaitlistHeaderInlineFromCandidate(
    row: QueueRowPlacementWaitlistCandidateVm
): WaitlistHeaderInline {
    const pos = row.runtimePosition != null && row.runtimePosition >= 1 ? row.runtimePosition : null;
    const bucket = row.bucketLabel?.trim() || "";
    let rankingChip: string | null = null;
    if (pos != null && bucket) rankingChip = `#${pos} ${bucket}`;
    else if (pos != null) rankingChip = `#${pos}`;
    else if (bucket) rankingChip = bucket;
    const reasonShort =
        row.siblingContextLines?.[0]?.trim() ||
        row.linkModeLabel?.trim() ||
        row.forecastHints[0]?.trim() ||
        null;
    return {
        rankingChip,
        reasonShort,
        fullRankingTitle: row.runtimePositionLabel?.trim() || rankingChip,
    };
}

export function waitlistCandidateNeedsExpandedBand(row: QueueRowPlacementWaitlistCandidateVm): boolean {
    return Boolean(
        row.hasManualPositionAdjustment ||
            (row.siblingContextLines?.length ?? 0) > 1 ||
            (row.activeOverrides?.length ?? 0) > 0
    );
}
