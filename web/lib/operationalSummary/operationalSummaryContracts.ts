/**
 * Operational Summary contracts.
 *
 * A derived, read-only operational narrative over resolver output. It is
 * deterministic and is NOT reasoning: it applies authoritative rules to known
 * truth, so under the Reasoning Boundary Test it stays with the operational
 * layer rather than moving to the Trust Platform.
 *
 * Moved verbatim from `lib/ai/enrichmentContracts.ts`; `lib/ai` re-exports these
 * types for compatibility.
 * @see docs/platform/trust/trust-platform-manifesto.md#reasoning-boundary-test
 */

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

/** Derived, read-only operational narrative — never authoritative vs resolver / suggestion contracts. */
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
    /** Present when the stub overlay redacted template fields. */
    redaction?: {
        steps_total: number;
        kinds: readonly string[];
    } | null;
};

export function operationalSummaryV1ToJson(value: OperationalSummaryV1): Record<string, unknown> {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}
