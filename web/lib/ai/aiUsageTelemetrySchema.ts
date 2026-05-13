import { z } from "zod";

import type { AiUsageTelemetryPayloadV1 } from "@/lib/ai/enrichmentContracts";

const outcomeZ = z.enum(["disabled", "policy_denied", "stub_noop", "stub_success", "redaction_only", "error"]);

export const aiUsageTelemetryPayloadV1Schema = z.object({
    schema_version: z.literal(1),
    event_kind: z.enum(["enrichment_request", "enrichment_skipped", "policy_eval"]),
    correlation_id: z.string().min(1),
    request_id: z.string().nullable().optional(),
    org_id: z.string().nullable().optional(),
    entity_type: z.string().nullable().optional(),
    entity_id: z.string().nullable().optional(),
    feature: z.string().min(1),
    provider_key: z.enum(["disabled", "stub", "openai", "anthropic", "azure_openai"]),
    outcome: outcomeZ,
    latency_ms: z.number().finite().nonnegative().optional(),
    redaction: z
        .object({
            steps_total: z.number().int().nonnegative(),
            kinds: z.array(z.string()),
        })
        .strict()
        .optional(),
});

export function safeParseAiUsageTelemetryPayloadV1(raw: unknown): AiUsageTelemetryPayloadV1 | null {
    const r = aiUsageTelemetryPayloadV1Schema.safeParse(raw);
    return r.success ? (r.data as AiUsageTelemetryPayloadV1) : null;
}
