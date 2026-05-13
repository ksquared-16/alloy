/**
 * Structured overlays for future AI enrichment (Phase 1 — Card 4).
 * Deterministic `AttentionSuggestionV1` remains authoritative for operational truth.
 * @see docs/sprints/05_2026/ai_enrichment_and_agent_actions_v1.md
 */

import type { AttentionSuggestionV1 } from "@/lib/agent/needsAttentionSuggestion/types";
import type { AiProviderKey, AiProviderExecutionMode } from "@/lib/ai/providerTypes";
import type { ResolvedAiOrgPolicyV1 } from "@/lib/ai/aiPolicy";

export const NEEDS_ATTENTION_SUGGESTION_ENRICHMENT_AGENT_KEY = "needs_attention_suggestion_enrichment" as const;

/**
 * Optional overlay on {@link AttentionSuggestionV1} — wording / drafts / notes only.
 * Must not change resolver-derived action keys or membership.
 */
export type AttentionSuggestionAiEnrichmentV1 = {
    version: 1;
    agent_key: typeof NEEDS_ATTENTION_SUGGESTION_ENRICHMENT_AGENT_KEY;
    /** Optional alternate summary text for UI (does not replace factors). */
    reasoning_summary_overlay?: string | null;
    /** Optional alternate draft body; operator must still confirm before send. */
    suggested_draft_body_overlay?: string | null;
    tone_variant?: string | null;
    confidence_notes?: string | null;
    generated_at_iso: string;
    provider_report: {
        provider_key: AiProviderKey;
        execution_mode: AiProviderExecutionMode;
    };
};

/** Resolver-only aggregate vs optional stub-touched overlay (still no live model). */
export type OperationalSummarySourceKind = "deterministic_aggregate" | "deterministic_aggregate_stub_overlay";

/** How the headline/bullets were produced — deterministic baseline may gain a stub note only. */
export type OperationalSummaryGenerationMode = "deterministic" | "deterministic_plus_stub_overlay";

/** Compact urgency for UI rails — maps from attention severity / SLA (derived, not model output). */
export type OperationalSummaryRiskHint = "low" | "medium" | "high";

/** Queue / list preview — headline + urgency only (no bullets). */
export type OperationalSummaryQueuePreviewV1 = {
    headline: string;
    risk_urgency_hint: OperationalSummaryRiskHint;
};

/**
 * Derived, read-only operational narrative — never authoritative vs resolver / suggestion contracts.
 * @see docs/sprints/05_2026/ai_enrichment_and_agent_actions_v1.md (Phase 2)
 */
export type OperationalSummaryV1 = {
    version: 1;
    headline: string;
    /** At most three short lines for drawer density; avoid raw comms bodies. */
    bullets: readonly string[];
    risk_urgency_hint: OperationalSummaryRiskHint;
    generated_at_iso: string;
    generation_mode: OperationalSummaryGenerationMode;
    source: {
        kind: OperationalSummarySourceKind;
        resolver_version?: number | null;
        attention_primary_code?: string | null;
        suggestion_present: boolean;
    };
    /** Present when stub overlay ran {@link redactObjectForAi} on template fields. */
    redaction?: {
        steps_total: number;
        kinds: readonly string[];
    } | null;
};

export function operationalSummaryV1ToJson(value: OperationalSummaryV1): Record<string, unknown> {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

/**
 * Bundles deterministic suggestion with optional enrichment for API responses.
 * `enrichment` is null when provider/policy blocks or stub returns nothing.
 */
export type AiEnrichmentEnvelopeV1 = {
    version: 1;
    deterministic_suggestion: AttentionSuggestionV1 | null;
    enrichment: AttentionSuggestionAiEnrichmentV1 | null;
    /** Snapshot of policy used for this bundle (JSON-serializable). */
    policy_snapshot: Pick<ResolvedAiOrgPolicyV1, "enabled" | "provider" | "pii_mode" | "allowed_features">;
};

export type AiTelemetryOutcome =
    | "disabled"
    | "policy_denied"
    | "stub_noop"
    | "stub_success"
    | "live_success"
    | "redaction_only"
    | "error";

/**
 * Schema-bound payload safe for `workflow_events` / observability (no raw prompts).
 * Must not include prompt bodies, raw record blobs, redacted payload copies, or draft text.
 */
export type AiUsageTelemetryPayloadV1 = {
    schema_version: 1;
    event_kind: "enrichment_request" | "enrichment_skipped" | "policy_eval";
    correlation_id: string;
    request_id?: string | null;
    org_id?: string | null;
    entity_type?: string | null;
    entity_id?: string | null;
    feature: string;
    provider_key: AiProviderKey;
    outcome: AiTelemetryOutcome;
    latency_ms?: number;
    redaction?: {
        steps_total: number;
        kinds: readonly string[];
    };
};

export function aiUsageTelemetryPayloadV1ToJson(value: AiUsageTelemetryPayloadV1): Record<string, unknown> {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

export function aiEnrichmentEnvelopeV1ToJson(value: AiEnrichmentEnvelopeV1): Record<string, unknown> {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}
