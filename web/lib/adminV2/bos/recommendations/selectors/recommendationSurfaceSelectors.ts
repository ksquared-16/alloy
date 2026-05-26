/**
 * Read-order selectors for operational recommendation surfaces (Phase 1 / Card 1.8).
 * Prefer canonical `_operational_recommendation*` fields; fallback to legacy compat shapes.
 * Selectors do not generate copy — they only resolve already-attached server data.
 */

import type { AttentionSuggestionQueuePreviewV1, AttentionSuggestionV1 } from "@/lib/agent/needsAttentionSuggestion/types";
import type { OperationalRecommendationHandoffCopy } from "@/lib/adminV2/bos/operationalRecommendationHandoff";
import type {
    OperationalRecommendationQueuePreviewV1,
    OperationalRecommendationV1,
    UrgencyBandV1,
} from "@/lib/adminV2/bos/recommendations/types";

export type RecommendationReadSource =
    | "canonical_queue_preview"
    | "legacy_queue_preview"
    | "legacy_why_line"
    | "canonical_drawer_strip"
    | "canonical_handoff"
    | "legacy_attention_suggestion";

export type ResolvedQueueRecommendationPreview = {
    nextLabel: string;
    whyLine: string;
    urgencyBand?: UrgencyBandV1 | null;
    source: RecommendationReadSource;
};

export type ResolvedDrawerRecommendationDisplay = {
    nextActionLabel: string;
    whyLine: string;
    title?: string | null;
    outcomeLine?: string | null;
    urgencyLabel?: string | null;
    source: RecommendationReadSource;
};

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
}

function parseOperationalRecommendation(
    data: Record<string, unknown> | null | undefined
): OperationalRecommendationV1 | null {
    const raw = data?._operational_recommendation;
    if (!raw || typeof raw !== "object") return null;
    const rec = raw as OperationalRecommendationV1;
    if (rec.version !== 1) return null;
    return rec;
}

function parseAttentionSuggestion(
    data: Record<string, unknown> | null | undefined
): AttentionSuggestionV1 | null {
    const raw = data?._attention_suggestion;
    if (!raw || typeof raw !== "object") return null;
    const suggestion = raw as AttentionSuggestionV1;
    if (suggestion.version !== 1 || !suggestion.next_action?.label?.trim()) return null;
    return suggestion;
}

function parseQueuePreview(
    raw: unknown
): OperationalRecommendationQueuePreviewV1 | AttentionSuggestionQueuePreviewV1 | null {
    if (!raw || typeof raw !== "object") return null;
    const preview = raw as { next_label?: unknown; why_line?: unknown };
    if (typeof preview.next_label !== "string" || typeof preview.why_line !== "string") return null;
    return {
        next_label: preview.next_label,
        why_line: preview.why_line,
        ...(typeof (preview as OperationalRecommendationQueuePreviewV1).urgency_band === "string"
            ? { urgency_band: (preview as OperationalRecommendationQueuePreviewV1).urgency_band }
            : {}),
    } as OperationalRecommendationQueuePreviewV1 | AttentionSuggestionQueuePreviewV1;
}

/**
 * Queue row read-order:
 * 1. `_operational_recommendation_preview`
 * 2. `_attention_suggestion_preview`
 * 3. top-level `why_line` (why-only fallback)
 */
export function getRecommendationQueuePreview(
    row: Record<string, unknown> | null | undefined
): ResolvedQueueRecommendationPreview | null {
    const rowRec = asRecord(row);
    if (!rowRec) return null;

    const canonical = parseQueuePreview(rowRec._operational_recommendation_preview);
    if (canonical) {
        const nextLabel = canonical.next_label.trim();
        const whyLine = canonical.why_line.trim();
        if (nextLabel && whyLine) {
            return {
                nextLabel,
                whyLine,
                urgencyBand:
                    "urgency_band" in canonical
                        ? ((canonical as OperationalRecommendationQueuePreviewV1).urgency_band ?? null)
                        : null,
                source: "canonical_queue_preview",
            };
        }
    }

    const legacy = parseQueuePreview(rowRec._attention_suggestion_preview);
    if (legacy) {
        const nextLabel = legacy.next_label.trim();
        const whyLine = legacy.why_line.trim();
        if (nextLabel && whyLine) {
            return {
                nextLabel,
                whyLine,
                source: "legacy_queue_preview",
            };
        }
    }

    const whyOnly = typeof rowRec.why_line === "string" ? rowRec.why_line.trim() : "";
    if (whyOnly) {
        return {
            nextLabel: "",
            whyLine: whyOnly,
            source: "legacy_why_line",
        };
    }

    return null;
}

/**
 * Drawer strip read-order:
 * 1. `_operational_recommendation.render.drawer_strip` (+ top-level action/why fallbacks)
 * 2. `_attention_suggestion`
 */
export function getRecommendationDrawerStrip(
    overviewData: Record<string, unknown> | null | undefined
): ResolvedDrawerRecommendationDisplay | null {
    const data = asRecord(overviewData);
    if (!data) return null;

    const rec = parseOperationalRecommendation(data);
    if (rec) {
        const strip = rec.render?.drawer_strip;
        const nextActionLabel =
            strip?.next_action_label?.trim() ||
            rec.recommended_action?.label?.trim() ||
            strip?.title?.trim() ||
            rec.title?.trim();
        const whyLine =
            strip?.why_line?.trim() ||
            rec.why_it_matters?.trim() ||
            rec.render?.queue?.why_line?.trim();
        if (nextActionLabel && whyLine) {
            return {
                nextActionLabel,
                whyLine,
                title: strip?.title?.trim() || rec.title?.trim() || null,
                outcomeLine: strip?.outcome_line?.trim() || rec.likely_outcome?.trim() || null,
                urgencyLabel: strip?.urgency_label?.trim() || null,
                source: "canonical_drawer_strip",
            };
        }
    }

    const suggestion = parseAttentionSuggestion(data);
    if (suggestion) {
        return {
            nextActionLabel: suggestion.next_action.label.trim(),
            whyLine: suggestion.reasoning.summary.trim(),
            source: "legacy_attention_suggestion",
        };
    }

    return null;
}

/**
 * Handoff read-order:
 * 1. `_operational_recommendation.render.handoff`
 * 2. null (caller may fall back to legacy handoff builder)
 */
export function getRecommendationHandoff(
    overviewData: Record<string, unknown> | null | undefined
): OperationalRecommendationHandoffCopy | null {
    const rec = parseOperationalRecommendation(asRecord(overviewData));
    const handoff = rec?.render?.handoff;
    if (!handoff) return null;

    const primaryRecommendation = handoff.primary_recommendation?.trim();
    const operationalReason = handoff.operational_reason?.trim();
    if (!primaryRecommendation || !operationalReason) return null;

    return {
        eyebrow: handoff.eyebrow?.trim() || "Recommended next step",
        primaryRecommendation,
        operationalReason,
        contextLine: handoff.context_line?.trim() || "Active record",
        ctaLabel: handoff.cta_label?.trim() || "Review next step",
    };
}

/** Compact detail summary for expandable panels (canonical only). */
export function getRecommendationDetailSummary(
    overviewData: Record<string, unknown> | null | undefined
): {
    actionRationale: string | null;
    likelyOutcome: string | null;
    likelyRisk: string | null;
} | null {
    const rec = parseOperationalRecommendation(asRecord(overviewData));
    if (!rec) return null;
    const detail = rec.render?.detail;
    return {
        actionRationale: detail?.action_rationale?.trim() || rec.action_rationale?.trim() || null,
        likelyOutcome: detail?.likely_outcome?.trim() || rec.likely_outcome?.trim() || null,
        likelyRisk: detail?.likely_risk?.trim() || rec.likely_risk?.trim() || null,
    };
}
