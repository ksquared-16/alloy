/**
 * Process env gates for AI enrichment (stub + telemetry). No secrets.
 * @see docs/sprints/05_2026/ai_enrichment_and_agent_actions_v1.md
 */

function truthyEnv(name: string): boolean {
    const v = process.env[name]?.trim().toLowerCase();
    return v === "true" || v === "1" || v === "yes";
}

/** Global gate for stub enrichment paths (org policy must also allow). */
export function isAiEnrichmentStubEnvEnabled(): boolean {
    return truthyEnv("AI_ENRICHMENT_STUB_ENABLED");
}

/** Global gate for emitting schema-bound `ai_enrichment_usage_v1` workflow events. */
export function isAiEnrichmentTelemetryEnvEnabled(): boolean {
    return truthyEnv("AI_ENRICHMENT_TELEMETRY_ENABLED");
}
