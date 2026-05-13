/**
 * Zod validation for {@link OperationalSummaryV1} (fixtures + tests; not for logging raw content).
 */

import { z } from "zod";

const riskHintSchema = z.enum(["low", "medium", "high"]);
const generationModeSchema = z.enum(["deterministic", "deterministic_plus_stub_overlay"]);
const sourceKindSchema = z.enum(["deterministic_aggregate", "deterministic_aggregate_stub_overlay"]);

const operationalSummaryV1Schema = z.object({
    version: z.literal(1),
    headline: z.string().min(1).max(500),
    bullets: z.array(z.string()).max(5),
    risk_urgency_hint: riskHintSchema,
    generated_at_iso: z.string().min(1),
    generation_mode: generationModeSchema,
    source: z.object({
        kind: sourceKindSchema,
        resolver_version: z.number().int().nullable().optional(),
        attention_primary_code: z.string().nullable().optional(),
        suggestion_present: z.boolean(),
    }),
    redaction: z
        .object({
            steps_total: z.number().int().nonnegative(),
            kinds: z.array(z.string()),
        })
        .nullable()
        .optional(),
});

export function safeParseOperationalSummaryV1(value: unknown): z.infer<typeof operationalSummaryV1Schema> | null {
    const r = operationalSummaryV1Schema.safeParse(value);
    return r.success ? r.data : null;
}
