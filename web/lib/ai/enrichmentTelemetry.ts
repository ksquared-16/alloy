/**
 * Optional `workflow_events` emission for AI enrichment (schema-bound, no PII bodies).
 * Emits only when **both** `AI_ENRICHMENT_TELEMETRY_ENABLED` and org `logging_mode === "verbose"`.
 * @see docs/sprints/05_2026/ai_enrichment_and_agent_actions_v1.md
 */

import type { ResolvedAiOrgPolicyV1 } from "@/lib/ai/aiPolicy";
import { isAiEnrichmentTelemetryEnvEnabled } from "@/lib/ai/aiEnrichmentEnv";
import type { AiUsageTelemetryPayloadV1 } from "@/lib/ai/enrichmentContracts";
import { aiUsageTelemetryPayloadV1ToJson } from "@/lib/ai/enrichmentContracts";
import { safeParseAiUsageTelemetryPayloadV1 } from "@/lib/ai/aiUsageTelemetrySchema";
import { emitEvent } from "@/lib/emitEvent";

export const AI_ENRICHMENT_USAGE_EVENT_TYPE = "ai_enrichment_usage_v1" as const;

export function shouldEmitAiEnrichmentTelemetry(policy: ResolvedAiOrgPolicyV1): boolean {
    return isAiEnrichmentTelemetryEnvEnabled() && policy.logging_mode === "verbose";
}

/**
 * Inserts one `workflow_events` row when policy + env allow. Payload is validated before insert.
 * Never includes prompt text, draft bodies, or redacted payload dumps.
 */
export async function maybeEmitAiEnrichmentTelemetryEvent(input: {
    org_id: string;
    policy: ResolvedAiOrgPolicyV1;
    payload: AiUsageTelemetryPayloadV1;
}): Promise<{ emitted: boolean }> {
    if (!shouldEmitAiEnrichmentTelemetry(input.policy)) {
        return { emitted: false };
    }
    const validated = safeParseAiUsageTelemetryPayloadV1(input.payload);
    if (!validated) {
        console.warn("[ai-enrichment-telemetry] payload failed schema validation; skip emit");
        return { emitted: false };
    }
    try {
        await emitEvent({
            org_id: input.org_id,
            event_type: AI_ENRICHMENT_USAGE_EVENT_TYPE,
            entity_type: validated.entity_type ?? null,
            entity_id: validated.entity_id ?? null,
            payload: aiUsageTelemetryPayloadV1ToJson(validated) as Record<string, unknown>,
        });
        return { emitted: true };
    } catch (e) {
        console.warn("[ai-enrichment-telemetry] emitEvent failed:", e instanceof Error ? e.message : e);
        return { emitted: false };
    }
}
