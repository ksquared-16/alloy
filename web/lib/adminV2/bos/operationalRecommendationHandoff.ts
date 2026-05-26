/**
 * Deterministic copy for drawer → Orchestrator recommendation handoff (BOS UX Gate A).
 * Read-order: `_operational_recommendation.render.handoff` → legacy `_attention_suggestion` / attention explain.
 */

import type { AttentionSuggestionV1 } from "@/lib/agent/needsAttentionSuggestion/types";
import { getRecommendationHandoff } from "@/lib/adminV2/bos/recommendations/selectors/recommendationSurfaceSelectors";
import { suggestionActionForReasonCode } from "@/lib/agent/needsAttentionSuggestion/suggestionActionMap";
import { isEnrollmentWaitBucket } from "@/lib/opportunities/attentionPlatformCatalog";
import {
    nextStepGuidance,
    timingPhraseForReason,
    worstTierAmongReasons,
} from "@/lib/opportunities/operationalAttentionExplain";
import type { OpportunityAttentionResult } from "@/lib/opportunities/opportunityAttentionResolver";

export type OperationalRecommendationHandoffCopy = {
    eyebrow: string;
    primaryRecommendation: string;
    operationalReason: string;
    contextLine: string;
    ctaLabel: string;
};

const EYEBROW = "Recommended next step";

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

function handoffCtaLabel(actionFamily: string | null | undefined): string {
    switch (actionFamily) {
        case "follow_up":
        case "send_message":
        case "schedule":
            return "Review next step";
        case "review":
        case "update_record":
        case "workflow":
            return "Open recommendation";
        default:
            return "Review in Orchestrator";
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
        };
    }

    const recordName = args.entityLabel?.trim() || "this inquiry";
    const contextLine = `Active record · ${recordName}`;

    const suggestion = parseSuggestion(args.overviewData);
    const attention = parseAttention(args.overviewData);

    let primaryRecommendation = suggestion?.next_action.label.trim() ?? null;
    let actionFamily = suggestion?.next_action.action_family ?? null;
    let operationalReason = suggestion?.reasoning?.summary?.trim() ?? null;

    if (!primaryRecommendation && attention?.needs_attention && attention.primary_reason) {
        const mapped = suggestionActionForReasonCode(attention.primary_reason.code);
        primaryRecommendation = mapped.label;
        actionFamily = mapped.action_family;
        operationalReason = operationalReason ?? operationalReasonFromAttention(attention);
    }

    if (!primaryRecommendation) {
        primaryRecommendation =
            args.openTaskTitle?.trim() ||
            primaryFromOpenTask(args.overviewData) ||
            "Review operational follow-up";
    }

    if (!operationalReason) {
        if (attention?.needs_attention) {
            operationalReason = operationalReasonFromAttention(attention);
        }
        const stale = attention?.auxiliary?.activity_stale?.label?.trim();
        if (!operationalReason && stale) {
            operationalReason = stale;
        }
    }

    if (!operationalReason) {
        operationalReason = "Operational follow-up is ready for review in the Orchestrator.";
    }

    return {
        eyebrow: EYEBROW,
        primaryRecommendation,
        operationalReason,
        contextLine,
        ctaLabel: handoffCtaLabel(actionFamily),
    };
}
