/**
 * S14 / A2 — compile-time proof that a Decision Contract cannot represent
 * reasoning implementation.
 *
 * These assertions are checked by `npm run typecheck:tests`, not at runtime.
 * `@ts-expect-error` is itself an error when the expected error disappears, so
 * if someone widens the contract type to admit a prompt, a provider, a model or
 * an API parameter, THIS FILE fails to compile.
 */

import { createDecisionContract } from "@/lib/trust/contract/createDecisionContract";
import { ATTENTION_SUGGESTION_ENRICHMENT_CLASS_KEY } from "@/lib/trust/decisionClasses/decisionClassRegistry";

const base = {
    org_id: "org",
    decision_class_key: ATTENTION_SUGGESTION_ENRICHMENT_CLASS_KEY,
    intent: "intent",
    correlation_id: "corr",
    initiating_actor: { actor_type: "system", actor_id: null },
    channel: "system",
} as const;

// A legitimate declared context compiles.
createDecisionContract({ ...base, context: { surface: "needs_attention_suggestion", entity_id: "abc" } });

// Nested declared context compiles.
createDecisionContract({ ...base, context: { surface: "x", nested: { stage: "tour", ordinal: 2 } } });

// 1 — a prompt cannot be represented.
// @ts-expect-error Decision Contracts may not carry a prompt.
createDecisionContract({ ...base, context: { prompt: "You are a helpful assistant" } });

// 2 — a provider name cannot be represented.
// @ts-expect-error Decision Contracts may not name a provider.
createDecisionContract({ ...base, context: { provider: "openai" } });

// 3 — a model identifier cannot be represented.
// @ts-expect-error Decision Contracts may not name a model.
createDecisionContract({ ...base, context: { model: "gpt-4o" } });

// 4 — an API parameter cannot be represented.
// @ts-expect-error Decision Contracts may not carry API parameters.
createDecisionContract({ ...base, context: { temperature: 0.7 } });

// 5 — nor at depth.
// @ts-expect-error A nested prompt is still a prompt.
createDecisionContract({ ...base, context: { outer: { inner: { system_prompt: "..." } } } });

// 6 — nor inside an array.
// @ts-expect-error A prompt inside an array is still a prompt.
createDecisionContract({ ...base, context: { items: [{ max_tokens: 10 }] } });
