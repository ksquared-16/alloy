/**
 * Deterministic copy for drawer → Orchestrator recommendation handoff (BOS Phase 2 / Card 2.2).
 * Read-order: `_operational_recommendation.render.handoff` + drawer strip → legacy attention/suggestion.
 */

import type { AttentionSuggestionV1 } from "@/lib/agent/needsAttentionSuggestion/types";
import { suggestionActionForReasonCode } from "@/lib/agent/needsAttentionSuggestion/suggestionActionMap";
import {
    getRecommendationDrawerStrip,
    getRecommendationHandoff,
} from "@/lib/adminV2/bos/recommendations/selectors/recommendationSurfaceSelectors";
import { isEnrollmentWaitBucket } from "@/lib/opportunities/attentionPlatformCatalog";
import {
    nextStepGuidance,
    timingPhraseForReason,
    worstTierAmongReasons,
} from "@/lib/opportunities/operationalAttentionExplain";
import type { OpportunityAttentionResult } from "@/lib/opportunities/opportunityAttentionResolver";

/** Review-assist vocabulary (aligned with drawer band). */
export const HANDOFF_EYEBROW = "Review assist";
export const HANDOFF_CTA_CONTINUE = "Continue in Orchestrator";

export type OperationalRecommendationHandoffCopy = {
    eyebrow: string;
    operationalRead: string;
    whyNow: string;
    doNext: string;
    likelyOutcome?: string | null;
    supportingContext?: string | null;
    contextLine: string;
    ctaLabel: string;
};

function parseSuggestion(overviewData: Record<string, unknown> | null | undefined): AttentionSuggestionV1 | null {
    const raw = overviewData?._attention_suggestion;
    if (!raw || typeof raw !== "object") return null;
    const s = raw as AttentionSuggestionV1;
    if (s.version !== 1 || !s.next_action?.label?.trim()) return null;
    return s;
}

function parseAttention(overviewData: Record<string, unknown> | null | undefined): OpportunityAttentionResult | null {
    const raw = overviewData?._operational_attention;
    if (!raw || typeof raw !== "object") return null;
    return raw as OpportunityAttentionResult;
}

function stripLegacyOperationalAttentionPrefix(text: string): string {
    return text.replace(/^Operational attention:\s*/i, "").trim();
}

function handoffCtaLabel(actionFamily: string | null | undefined): string {
    switch (actionFamily) {
        case "follow_up":
        case "send_message":
        case "schedule":
            return HANDOFF_CTA_CONTINUE;
        case "review":
        case "update_record":
        case "workflow":
            return HANDOFF_CTA_CONTINUE;
        default:
            return HANDOFF_CTA_CONTINUE;
    }
}

function operationalReasonFromAttention(attention: OpportunityAttentionResult): string | null {
    const primary = attention.primary_reason;
    if (!primary) return null;
    const nowMs = Date.now();
    const wb = attention.waiting.bucket;
    const safeBucket = isEnrollmentWaitBucket(wb) ? wb : "none";
    const timing = timingPhraseForReason(primary, attention.waiting, nowMs);
    const summary = primary.label.trim();
    if (timing && timing !== "—") {
        return `${summary} · ${timing}`;
    }
    const guidance = nextStepGuidance({
        primaryCode: primary.code,
        waitingBucket: safeBucket,
        worstSlaTier: worstTierAmongReasons(attention.reasons),
    });
    if (guidance) return `${summary} · ${guidance}`;
    return summary;
}

function primaryFromOpenTask(overviewData: Record<string, unknown> | null | undefined): string | null {
    const tasks = overviewData?._operational_tasks_preview;
    if (!Array.isArray(tasks) || !tasks.length) return null;
    const first = tasks[0];
    if (!first || typeof first !== "object") return null;
    const title = (first as { title?: unknown }).title;
    return typeof title === "string" && title.trim() ? title.trim() : null;
}

function buildLegacyHandoffCopy(args: {
    entityLabel: string | null | undefined;
    overviewData: Record<string, unknown> | null | undefined;
    openTaskTitle?: string | null;
}): OperationalRecommendationHandoffCopy {
    const recordName = args.entityLabel?.trim() || "this inquiry";
    const contextLine = `Active record · ${recordName}`;

    const drawer = getRecommendationDrawerStrip(args.overviewData);
    if (drawer) {
        return {
            eyebrow: HANDOFF_EYEBROW,
            operationalRead: drawer.operationalRead,
            whyNow: drawer.whyNow,
            doNext: drawer.nextActionLabel,
            likelyOutcome: drawer.outcomeLine ?? null,
            supportingContext: contextLine,
            contextLine,
            ctaLabel: HANDOFF_CTA_CONTINUE,
        };
    }

    const suggestion = parseSuggestion(args.overviewData);
    const attention = parseAttention(args.overviewData);

    let operationalRead: string | null = null;
    let doNext = suggestion?.next_action.label.trim() ?? null;
    let actionFamily = suggestion?.next_action.action_family ?? null;
    let whyNow = suggestion?.reasoning?.summary?.trim() ?? null;

    if (whyNow) {
        operationalRead = stripLegacyOperationalAttentionPrefix(whyNow) || doNext;
    }

    if (!doNext && attention?.needs_attention && attention.primary_reason) {
        const mapped = suggestionActionForReasonCode(attention.primary_reason.code);
        doNext = mapped.label;
        actionFamily = mapped.action_family;
        whyNow = whyNow ?? operationalReasonFromAttention(attention);
        operationalRead = operationalRead ?? attention.primary_reason.label.trim();
    }

    if (!doNext) {
        doNext =
            args.openTaskTitle?.trim() ||
            primaryFromOpenTask(args.overviewData) ||
            "Review operational follow-up";
    }

    if (!operationalRead) {
        operationalRead = doNext;
    }

    if (!whyNow) {
        if (attention?.needs_attention) {
            whyNow = operationalReasonFromAttention(attention);
        }
        const stale = attention?.auxiliary?.activity_stale?.label?.trim();
        if (!whyNow && stale) {
            whyNow = stale;
        }
    }

    if (!whyNow) {
        whyNow = "Operational follow-up is ready for review in the Orchestrator.";
    }

    return {
        eyebrow: HANDOFF_EYEBROW,
        operationalRead,
        whyNow,
        doNext,
        likelyOutcome: null,
        supportingContext: contextLine,
        contextLine,
        ctaLabel: handoffCtaLabel(actionFamily),
    };
}

/**
 * Build operator-facing recommendation handoff copy from deterministic drawer payload.
 */
export function buildOperationalRecommendationHandoffCopy(args: {
    entityLabel: string | null | undefined;
    overviewData: Record<string, unknown> | null | undefined;
    /** First open operational task title when loaded in strip (optional). */
    openTaskTitle?: string | null;
}): OperationalRecommendationHandoffCopy {
    const canonicalHandoff = getRecommendationHandoff(args.overviewData);
    if (canonicalHandoff) {
        const recordName = args.entityLabel?.trim() || "this inquiry";
        return {
            ...canonicalHandoff,
            contextLine: canonicalHandoff.contextLine.includes("Active record")
                ? `Active record · ${recordName}`
                : canonicalHandoff.contextLine,
            supportingContext:
                canonicalHandoff.supportingContext ??
                (canonicalHandoff.contextLine.includes("Active record")
                    ? `Active record · ${recordName}`
                    : canonicalHandoff.contextLine),
        };
    }

    return buildLegacyHandoffCopy(args);
}

/** Compressed Orchestrator seed — same story as drawer Review assist (not chatbot tone). */
export function formatOrchestratorHandoffSeedFromCopy(
    recordLabel: string,
    copy: OperationalRecommendationHandoffCopy
): string {
    const label = recordLabel.trim() || "this inquiry";
    const segments = [`${copy.operationalRead} (${label})`, `Why now: ${copy.whyNow}`, `Do next: ${copy.doNext}`];
    if (copy.likelyOutcome?.trim()) {
        segments.push(`Likely: ${copy.likelyOutcome.trim()}`);
    }
    return segments.join(" · ");
}

export function hasStructuredOperationalHandoff(
    overviewData: Record<string, unknown> | null | undefined
): boolean {
    if (getRecommendationHandoff(overviewData)) return true;
    if (getRecommendationDrawerStrip(overviewData)) return true;
    if (parseSuggestion(overviewData)) return true;
    const attention = parseAttention(overviewData);
    return Boolean(attention?.needs_attention && attention.primary_reason);
}
