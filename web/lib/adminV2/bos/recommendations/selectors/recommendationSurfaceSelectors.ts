/**
 * Read-order selectors for operational recommendation surfaces (Phase 1 / Card 1.8).
 * Prefer canonical `_operational_recommendation*` fields; fallback to legacy compat shapes.
 * Selectors do not generate copy — they only resolve already-attached server data.
 *
 * Field ownership (Phase 2 / Card 2.7):
 * - Queue L0: `resolveQueueOperationalReadSlot` → operationalRead, typeCue, staleCue, previewBoundary
 * - Drawer: `resolveDrawerReviewAssistViewModel` → display, supportingDetail, readinessChrome
 * - Handoff: `getRecommendationHandoff` → operationalRead, whyNow, doNext, readinessNote
 * - Legacy wire: `_attention_suggestion*`, `why_line` — compatibility only via read-order fallbacks
 */

import type { AttentionSuggestionQueuePreviewV1, AttentionSuggestionV1 } from "@/lib/agent/needsAttentionSuggestion/types";
import type { OperationalRecommendationHandoffCopy } from "@/lib/adminV2/bos/operationalRecommendationHandoff";
import type { OpportunityAttentionResult } from "@/lib/opportunities/opportunityAttentionResolver";
import type {
    OperationalRecommendationQueuePreviewV1,
    OperationalRecommendationV1,
    RecommendationTypeV1,
    UrgencyBandV1,
} from "@/lib/adminV2/bos/recommendations/types";
import {
    queueTypeCueLabel,
    recommendationTypeLabel,
    resolveClassificationContextLine,
    resolveEscalationChipLabel,
    shouldShowDrawerTypeLine,
} from "@/lib/adminV2/bos/recommendations/selectors/recommendationClassificationSemantics";
import {
    resolveDrawerReadinessChrome,
    resolveHandoffTrustNote,
    resolveQueuePreviewTrustChrome,
    type ResolvedDrawerReadinessChrome,
    type ResolvedQueuePreviewTrustChrome,
} from "@/lib/adminV2/bos/recommendations/selectors/recommendationTrustChrome";

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
    recommendationType?: RecommendationTypeV1 | null;
    isStale?: boolean;
    source: RecommendationReadSource;
};

/** L0 queue scan line — structural join of server preview fields only (Phase 2 / Card 2.3). */
export type ResolvedQueueOperationalReadPreview = {
    /** Merged next + why scan line for queue L0. */
    operationalRead: string;
    urgencyChipLabel: string | null;
    urgencyBand: UrgencyBandV1 | null;
    /** Quiet type cue when recommendation_type adds scan meaning (Card 2.5). */
    typeCue: string | null;
    /** Compact stale cue when preview is_stale (Card 2.6). */
    staleCue: string | null;
    source: RecommendationReadSource;
};

export type { ResolvedDrawerReadinessChrome, ResolvedQueuePreviewTrustChrome };

const QUEUE_URGENCY_CHIP_LABELS: Record<UrgencyBandV1, string> = {
    p0_urgent: "Urgent",
    p1_today: "Today",
    p2_soon: "Soon",
    p3_fyi: "FYI",
};

export function queueUrgencyChipLabel(band: UrgencyBandV1 | null | undefined): string | null {
    if (!band || band === "p3_fyi") return null;
    return QUEUE_URGENCY_CHIP_LABELS[band];
}

function formatQueueOperationalReadLine(preview: ResolvedQueueRecommendationPreview): string | null {
    const next = preview.nextLabel.trim();
    const why = preview.whyLine.trim();
    if (next && why) return `${next} — ${why}`;
    if (next) return next;
    if (why) return why;
    return null;
}

/**
 * Queue L0 operational read — canonical preview → single scan line + sequencing chip metadata.
 */
export function resolveQueueOperationalReadPreview(
    row: Record<string, unknown> | null | undefined
): ResolvedQueueOperationalReadPreview | null {
    const preview = getRecommendationQueuePreview(row);
    if (!preview) return null;
    const line = formatQueueOperationalReadLine(preview);
    if (!line) return null;
    const urgencyBand = preview.urgencyBand ?? null;
    const recommendationType = preview.recommendationType ?? null;
    const staleCue = resolveQueuePreviewTrustChrome(preview.isStale).staleCueLabel;
    return {
        operationalRead: line,
        urgencyBand,
        urgencyChipLabel: queueUrgencyChipLabel(urgencyBand),
        typeCue: queueTypeCueLabel(recommendationType),
        staleCue,
        source: preview.source,
    };
}

export type ResolvedDrawerRecommendationDisplay = {
    /** Row 1 — catalog judgment headline (operational read). */
    operationalRead: string;
    /** Row 2 — why_it_matters / legacy reasoning summary. */
    whyNow: string;
    /** Row 3 — recommended_action.label */
    doNext: string;
    likelyOutcome?: string | null;
    urgencyLabel?: string | null;
    urgencyBand?: UrgencyBandV1 | null;
    urgencyReason?: string | null;
    /** @deprecated Selector-internal; use readinessChrome trust lines in UI. */
    staleBanner?: string | null;
    /** @deprecated Selector-internal; use readinessChrome trust lines in UI. */
    confidenceLabel?: string | null;
    signalLabels?: string[];
    isStale?: boolean;
    /** Restrained operational type cue (Card 2.5). */
    typeCue?: string | null;
    /** Policy basis, timing, or workflow context — secondary to operational read. */
    classificationContextLine?: string | null;
    /** Discrete escalation chip when recommendation_type is escalation. */
    escalationChipLabel?: string | null;
    recommendationType?: RecommendationTypeV1 | null;
    source: RecommendationReadSource;
};

/** Layer 6 — collapsed supporting detail (Phase 2 / Card 2.4). Labels only; no raw codes. */
export type ResolvedDrawerSupportingDetail = {
    collapsedSummary: string;
    signalCount: number;
    displaySignalLabels: string[];
    primaryFactorLabel: string | null;
    secondaryFactorLabels: string[];
    provenanceLine: string | null;
    timingHint: string | null;
    source: RecommendationReadSource;
};

const MAX_SUPPORTING_DETAIL_SIGNAL_DISPLAY = 3;

function uniqueTrimmedLabels(labels: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of labels) {
        const t = raw.trim();
        if (!t || seen.has(t)) continue;
        seen.add(t);
        out.push(t);
    }
    return out;
}

function buildSupportingDetailCollapsedSummary(signalCount: number, factorCount: number): string {
    if (signalCount > 0) {
        return `Supporting detail · Based on ${signalCount} signal${signalCount === 1 ? "" : "s"}`;
    }
    if (factorCount > 0) {
        return `Supporting detail · ${factorCount} factor${factorCount === 1 ? "" : "s"}`;
    }
    return "Supporting detail";
}

function stripLegacyOperationalAttentionPrefix(text: string): string {
    return text.replace(/^Operational attention:\s*/i, "").trim();
}

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
    const preview = raw as {
        next_label?: unknown;
        why_line?: unknown;
        urgency_band?: unknown;
        recommendation_type?: unknown;
        is_stale?: unknown;
    };
    if (typeof preview.next_label !== "string" || typeof preview.why_line !== "string") return null;
    return {
        next_label: preview.next_label,
        why_line: preview.why_line,
        ...(typeof preview.urgency_band === "string"
            ? { urgency_band: preview.urgency_band as UrgencyBandV1 }
            : {}),
        ...(typeof preview.recommendation_type === "string"
            ? { recommendation_type: preview.recommendation_type as RecommendationTypeV1 }
            : {}),
        ...(preview.is_stale === true ? { is_stale: true } : {}),
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
            const canonicalPreview = canonical as OperationalRecommendationQueuePreviewV1;
            return {
                nextLabel,
                whyLine,
                urgencyBand: "urgency_band" in canonical ? (canonicalPreview.urgency_band ?? null) : null,
                recommendationType:
                    "recommendation_type" in canonical ? (canonicalPreview.recommendation_type ?? null) : null,
                isStale: "is_stale" in canonical ? canonicalPreview.is_stale === true : false,
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
        const operationalRead = strip?.title?.trim() || rec.title?.trim() || "";
        if (nextActionLabel && whyLine && operationalRead) {
            const recommendationType = rec.recommendation_type ?? null;
            const typeCue = shouldShowDrawerTypeLine(recommendationType)
                ? recommendationTypeLabel(recommendationType)
                : null;
            return {
                operationalRead,
                whyNow: whyLine,
                doNext: nextActionLabel,
                likelyOutcome: strip?.outcome_line?.trim() || rec.likely_outcome?.trim() || null,
                urgencyLabel: strip?.urgency_label?.trim() || null,
                urgencyBand: rec.urgency ?? null,
                urgencyReason: strip?.urgency_reason?.trim() || rec.urgency_reason?.trim() || null,
                staleBanner: strip?.stale_banner?.trim() || null,
                confidenceLabel: strip?.confidence_label?.trim() || null,
                signalLabels: strip?.signal_labels?.length ? [...strip.signal_labels] : [],
                isStale: strip?.is_stale === true,
                typeCue,
                classificationContextLine: resolveClassificationContextLine({
                    recommendationType,
                    escalationPolicyBasis: rec.escalation_reference?.policy_basis,
                    communicationTimingHint: rec.communication_reference?.timing_hint,
                }),
                escalationChipLabel: resolveEscalationChipLabel(recommendationType),
                recommendationType,
                source: "canonical_drawer_strip",
            };
        }
    }

    const suggestion = parseAttentionSuggestion(data);
    if (suggestion) {
        const whyNow = suggestion.reasoning.summary.trim();
        const operationalRead =
            stripLegacyOperationalAttentionPrefix(whyNow) || suggestion.next_action.label.trim();
        if (operationalRead && whyNow && suggestion.next_action.label.trim()) {
            return {
                operationalRead,
                whyNow,
                doNext: suggestion.next_action.label.trim(),
                source: "legacy_attention_suggestion",
            };
        }
    }

    return null;
}

/**
 * Handoff read-order:
 * 1. `_operational_recommendation.render.handoff` + drawer strip fields
 * 2. null (caller may fall back to legacy handoff builder)
 */
export function getRecommendationHandoff(
    overviewData: Record<string, unknown> | null | undefined
): OperationalRecommendationHandoffCopy | null {
    const rec = parseOperationalRecommendation(asRecord(overviewData));
    const handoff = rec?.render?.handoff;
    if (!handoff) return null;

    const strip = rec.render?.drawer_strip;
    const operationalRead = handoff.primary_recommendation?.trim() || strip?.title?.trim() || rec.title?.trim();
    const whyNow =
        handoff.operational_reason?.trim() || strip?.why_line?.trim() || rec.why_it_matters?.trim();
    const doNext =
        strip?.next_action_label?.trim() ||
        rec.recommended_action?.label?.trim() ||
        operationalRead;
    if (!operationalRead || !whyNow || !doNext) return null;

    const signalCount = strip?.signal_labels?.length ?? 0;
    const contextLine = handoff.context_line?.trim() || "Active record";
    const supportingContext =
        signalCount > 0 ?
            `${contextLine} · Based on ${signalCount} signal${signalCount === 1 ? "" : "s"}`
        :   contextLine;

    return {
        eyebrow: "Review assist",
        operationalRead,
        whyNow,
        doNext,
        likelyOutcome: strip?.outcome_line?.trim() || rec.likely_outcome?.trim() || null,
        supportingContext,
        contextLine,
        ctaLabel: "Continue in Orchestrator",
        readinessNote: resolveHandoffTrustNote({
            isStale: strip?.is_stale === true,
            confidenceLabel: strip?.confidence_label,
        }),
    };
}

/**
 * Drawer readiness/trust lines — canonical display + activity/supporting detail from overview.
 */
export function resolveDrawerReadinessChromeForOverview(
    overviewData: Record<string, unknown> | null | undefined,
    options?: { hasSupportingDetail?: boolean; hasActivitySignal?: boolean }
): ResolvedDrawerReadinessChrome {
    const data = asRecord(overviewData);
    const attention = data?._operational_attention;
    const activityFromOverview =
        attention && typeof attention === "object"
            ? Boolean((attention as OpportunityAttentionResult).auxiliary?.activity_stale?.label?.trim())
            : false;
    const hasActivitySignal = options?.hasActivitySignal ?? activityFromOverview;

    const display = getRecommendationDrawerStrip(overviewData);
    if (display) {
        return resolveDrawerReadinessChrome({
            isStale: display.isStale,
            confidenceLabel: display.confidenceLabel,
            hasActivitySignal,
            hasSupportingDetail: options?.hasSupportingDetail,
        });
    }
    if (hasActivitySignal) {
        return resolveDrawerReadinessChrome({ hasActivitySignal: true });
    }
    return { trustLines: [] };
}

/**
 * Collapsed supporting detail for drawer Review Assist (canonical → legacy fallbacks).
 * Resolves `render.detail`, strip signal labels, and human-safe factor labels only.
 */
export function getRecommendationDetailSummary(
    overviewData: Record<string, unknown> | null | undefined
): ResolvedDrawerSupportingDetail | null {
    const data = asRecord(overviewData);
    if (!data) return null;

    const rec = parseOperationalRecommendation(data);
    if (rec) {
        const detail = rec.render?.detail;
        const strip = rec.render?.drawer_strip;
        const allSignalLabels = uniqueTrimmedLabels([
            ...(detail?.signal_labels ?? []),
            ...(strip?.signal_labels ?? []),
        ]);
        const factorLabels = uniqueTrimmedLabels(
            (detail?.factors ?? rec.secondary_factors ?? []).map((f) => f.label)
        );
        const displaySignalLabels = allSignalLabels.slice(0, MAX_SUPPORTING_DETAIL_SIGNAL_DISPLAY);
        const primaryFactorLabel = factorLabels[0] ?? null;
        const secondaryFactorLabels = factorLabels.slice(1);
        const provenanceLine = detail?.action_rationale?.trim() || rec.action_rationale?.trim() || null;
        const timingHint = rec.communication_reference?.timing_hint?.trim() || null;

        const signalCount = allSignalLabels.length;
        const factorCount = factorLabels.length;

        if (signalCount === 0 && factorCount === 0 && !provenanceLine && !timingHint) {
            return null;
        }

        return {
            collapsedSummary: buildSupportingDetailCollapsedSummary(signalCount, factorCount),
            signalCount,
            displaySignalLabels,
            primaryFactorLabel,
            secondaryFactorLabels,
            provenanceLine,
            timingHint,
            source: "canonical_drawer_strip",
        };
    }

    const suggestion = parseAttentionSuggestion(data);
    if (suggestion?.reasoning?.factors?.length) {
        const factorLabels = uniqueTrimmedLabels(suggestion.reasoning.factors.map((f) => f.label));
        if (factorLabels.length === 0) return null;
        return {
            collapsedSummary: buildSupportingDetailCollapsedSummary(0, factorLabels.length),
            signalCount: 0,
            displaySignalLabels: [],
            primaryFactorLabel: factorLabels[0] ?? null,
            secondaryFactorLabels: factorLabels.slice(1),
            provenanceLine: null,
            timingHint: null,
            source: "legacy_attention_suggestion",
        };
    }

    const attention = data._operational_attention;
    if (attention && typeof attention === "object") {
        const payload = attention as OpportunityAttentionResult;
        const primary = payload.primary_reason;
        if (payload.needs_attention && primary) {
            const otherLabels = uniqueTrimmedLabels(
                payload.reasons.filter((r) => r.code !== primary.code).map((r) => r.label)
            );
            if (otherLabels.length > 0) {
                return {
                    collapsedSummary: buildSupportingDetailCollapsedSummary(0, otherLabels.length),
                    signalCount: 0,
                    displaySignalLabels: [],
                    primaryFactorLabel: otherLabels[0] ?? null,
                    secondaryFactorLabels: otherLabels.slice(1),
                    provenanceLine: null,
                    timingHint: null,
                    source: "legacy_attention_suggestion",
                };
            }
        }
    }

    return null;
}
