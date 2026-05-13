/**
 * Deterministic operational summaries (Phase 2) + optional stub overlay (no network).
 * @see docs/sprints/05_2026/ai_enrichment_and_agent_actions_v1.md
 */

import type { AttentionSuggestionV1 } from "@/lib/agent/needsAttentionSuggestion/types";
import type { ResolvedAiOrgPolicyV1 } from "@/lib/ai/aiPolicy";
import type {
    OperationalSummaryGenerationMode,
    OperationalSummaryQueuePreviewV1,
    OperationalSummaryRiskHint,
    OperationalSummarySourceKind,
    OperationalSummaryV1,
} from "@/lib/ai/enrichmentContracts";
import { isAiEnrichmentStubEnvEnabled } from "@/lib/ai/aiEnrichmentEnv";
import { redactObjectForAi } from "@/lib/ai/redaction";
import { isEnrollmentWaitBucket } from "@/lib/opportunities/attentionPlatformCatalog";
import {
    nextStepGuidance,
    worstTierAmongReasons,
} from "@/lib/opportunities/operationalAttentionExplain";
import type { OpportunityAttentionResult } from "@/lib/opportunities/opportunityAttentionResolver";
import type { AttentionSlaTier } from "@/lib/opportunities/attentionSla";

const MAX_HEADLINE = 240;
const MAX_BULLET = 160;
const MAX_BULLETS = 3;

function clip(s: string, max: number): string {
    const t = s.trim();
    if (t.length <= max) return t;
    return `${t.slice(0, Math.max(0, max - 1))}…`;
}

function compactBullets(lines: (string | null | undefined)[]): readonly string[] {
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

/**
 * Optional stub overlay: synthetic bullet + redaction metadata on template text only (no record bodies).
 * Gated by {@link isAiEnrichmentStubEnvEnabled} and org policy (`operational_summary` feature, stub provider).
 */
export function applyStubOperationalSummaryOverlay(
    base: OperationalSummaryV1,
    policy: ResolvedAiOrgPolicyV1,
): OperationalSummaryV1 {
    if (!isAiEnrichmentStubEnvEnabled()) return base;
    if (!policy.enabled || policy.provider !== "stub") return base;
    if (!policy.allowed_features.includes("operational_summary")) return base;

    const template = {
        stub_line:
            "Stub overlay: narrative tone polish is reserved for a future approved model — resolver output stays authoritative.",
    };
    const { redacted, steps } = redactObjectForAi(template, { pii_mode: policy.pii_mode });
    const stubBullet = clip(String(redacted.stub_line ?? template.stub_line), MAX_BULLET);
    const kinds = [...new Set(steps.map((s) => s.kind))];
    const roomForStub = Math.max(0, MAX_BULLETS - 1);
    const trimmedBase = base.bullets.slice(0, roomForStub);
    const nextBullets = compactBullets([...trimmedBase, stubBullet]);

    return {
        ...base,
        bullets: nextBullets,
        generation_mode: "deterministic_plus_stub_overlay" satisfies OperationalSummaryGenerationMode,
        source: {
            ...base.source,
            kind: "deterministic_aggregate_stub_overlay" satisfies OperationalSummarySourceKind,
        },
        redaction: { steps_total: steps.length, kinds },
    };
}

export function toOperationalSummaryQueuePreview(summary: OperationalSummaryV1): OperationalSummaryQueuePreviewV1 {
    return {
        headline: clip(summary.headline, 140),
        risk_urgency_hint: summary.risk_urgency_hint,
    };
}
