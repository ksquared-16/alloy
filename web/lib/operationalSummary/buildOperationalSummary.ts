/**
 * Deterministic operational summaries.
 *
 * Applies authoritative rules to known resolver truth. Under the Reasoning
 * Boundary Test this is NOT reasoning, so it belongs to the operational layer
 * rather than the Trust Platform. Moved verbatim from `lib/ai/`; behaviour and
 * output are unchanged.
 * @see docs/platform/trust/trust-platform-manifesto.md#reasoning-boundary-test
 */

import type { AttentionSuggestionV1 } from "@/lib/agent/needsAttentionSuggestion/types";
import type {
    OperationalSummaryQueuePreviewV1,
    OperationalSummaryRiskHint,
    OperationalSummarySourceKind,
    OperationalSummaryV1,
} from "@/lib/operationalSummary/operationalSummaryContracts";
import { isEnrollmentWaitBucket } from "@/lib/opportunities/attentionPlatformCatalog";
import {
    nextStepGuidance,
    worstTierAmongReasons,
} from "@/lib/opportunities/operationalAttentionExplain";
import type { OpportunityAttentionResult } from "@/lib/opportunities/opportunityAttentionResolver";
import type { AttentionSlaTier } from "@/lib/opportunities/attentionSla";

export const MAX_HEADLINE = 240;
export const MAX_BULLET = 160;
export const MAX_BULLETS = 3;

export function clip(s: string, max: number): string {
    const t = s.trim();
    if (t.length <= max) return t;
    return `${t.slice(0, Math.max(0, max - 1))}…`;
}

export function compactBullets(lines: (string | null | undefined)[]): readonly string[] {
    const out: string[] = [];
    for (const x of lines) {
        const s = typeof x === "string" ? clip(x, MAX_BULLET) : "";
        if (s && out.length < MAX_BULLETS) out.push(s);
    }
    return out;
}

function riskFromSeverity(
    sev: "critical" | "high" | "medium" | "low" | string | null | undefined,
): OperationalSummaryRiskHint {
    if (sev === "critical" || sev === "high") return "high";
    if (sev === "medium") return "medium";
    return "low";
}

function riskFromSlaWorst(worst: AttentionSlaTier): OperationalSummaryRiskHint {
    if (worst === "breached") return "high";
    if (worst === "approaching") return "medium";
    return "low";
}

function baseSource(
    attention: OpportunityAttentionResult,
    suggestionPresent: boolean,
    kind: OperationalSummarySourceKind,
): OperationalSummaryV1["source"] {
    return {
        kind,
        resolver_version: attention.resolver_version,
        attention_primary_code: attention.primary_reason?.code ?? null,
        suggestion_present: suggestionPresent,
    };
}

/**
 * Deterministic narrative from resolver + optional needs-attention suggestion (same inputs as drawer chrome).
 * Returns null when there is nothing operator-relevant to say.
 */
export function buildOperationalSummaryDeterministic(input: {
    attention: OpportunityAttentionResult;
    suggestion: AttentionSuggestionV1 | null;
    nowIso: string;
}): OperationalSummaryV1 | null {
    const { attention: payload, suggestion } = input;
    const activityStale = payload.auxiliary?.activity_stale;
    const suggestionPresent = Boolean(suggestion);

    if (!payload.needs_attention || !payload.primary_reason) {
        if (activityStale?.label?.trim()) {
            const headline = clip(`Activity signal: ${activityStale.label.trim()}`, MAX_HEADLINE);
            const bullets = compactBullets([
                "This line reflects configured idle/stale rules — open operational detail for full timing.",
                suggestion ? `Suggested next step when you open the record: ${suggestion.next_action.label}.` : null,
            ]);
            return {
                version: 1,
                headline,
                bullets,
                risk_urgency_hint: riskFromSeverity(activityStale.severity),
                generated_at_iso: input.nowIso,
                generation_mode: "deterministic",
                source: baseSource(payload, suggestionPresent, "deterministic_aggregate"),
                redaction: null,
            };
        }
        return null;
    }

    const primary = payload.primary_reason;
    const wb = isEnrollmentWaitBucket(payload.waiting.bucket) ? payload.waiting.bucket : "none";
    const worst = worstTierAmongReasons(payload.reasons);
    const nextLine = nextStepGuidance({
        primaryCode: primary.code,
        waitingBucket: wb,
        worstSlaTier: worst,
    });
    const draftReady = Boolean(suggestion?.suggested_content?.body?.trim());
    const activityLabel = activityStale?.label?.trim() ?? "";

    let headline: string;
    if (suggestion && draftReady && activityLabel) {
        headline = `${primary.label}. Activity timing looks quiet; a draft follow-up is ready to review (not sent).`;
    } else if (suggestion && draftReady) {
        headline = `${primary.label}. A draft follow-up is ready to review (not sent).`;
    } else if (suggestion) {
        headline = `${primary.label}. Suggested next step: ${suggestion.next_action.label}.`;
    } else {
        headline = `${primary.label}. ${nextLine}`;
    }

    const bullets = compactBullets([
        suggestion ? clip(suggestion.reasoning.summary, MAX_BULLET) : clip(nextLine, MAX_BULLET),
        activityLabel ? `Activity: ${activityLabel}` : null,
        draftReady ? "Draft lives in the drawer — copy and edit before sending." : null,
    ]);

    const riskHint =
        riskFromSeverity(primary.severity) === "high" || riskFromSlaWorst(worst) === "high"
            ? "high"
            : riskFromSeverity(primary.severity) === "medium" || riskFromSlaWorst(worst) === "medium"
              ? "medium"
              : "low";

    return {
        version: 1,
        headline: clip(headline, MAX_HEADLINE),
        bullets,
        risk_urgency_hint: riskHint,
        generated_at_iso: input.nowIso,
        generation_mode: "deterministic",
        source: baseSource(payload, suggestionPresent, "deterministic_aggregate"),
        redaction: null,
    };
}

export function toOperationalSummaryQueuePreview(summary: OperationalSummaryV1): OperationalSummaryQueuePreviewV1 {
    return {
        headline: clip(summary.headline, 140),
        risk_urgency_hint: summary.risk_urgency_hint,
    };
}
