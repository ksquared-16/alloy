/**
 * Reasoning execution capability.
 *
 * Answers one question: **could this strategy kind reach a provider?**
 *
 * The answer is derived from the strategy ladder that already exists
 * (`REASONING_STRATEGY_KINDS`) rather than from a new provider abstraction,
 * because the ladder is already the platform's statement about what KIND of
 * reasoning is happening. Two tempting alternatives are both wrong:
 *
 *  - **Not `async`.** A synchronous strategy could call a provider through a
 *    blocking client, and an asynchronous one may await something entirely
 *    local. `reasoningStrategy.ts` says so itself where it introduces the async
 *    seam: returning a promise "does NOT permit the strategy to reach past the
 *    context". Async is a calling convention, not a capability.
 *  - **Not local-vs-remote.** Director decision D-6 and the Phase 2.0
 *    assessment both hold that a local model remains probabilistic model
 *    reasoning. Where the weights sit is an economics and privacy fact, never a
 *    trust authority, so it cannot decide whether governance applies.
 *
 * **Polarity is deliberate: exemption is the allowlist.** The map below names
 * the kinds that are NOT provider-capable, and everything else is. A seventh
 * strategy kind added to the ladder therefore defaults to provider-capable and
 * inherits the enforcement, rather than silently escaping it — and because the
 * table is `satisfies Record<ReasoningStrategyKind, …>`, adding that kind fails
 * to COMPILE until someone states which side it falls on.
 *
 * Pure. No I/O, no clock, no provider, no network.
 *
 * @see lib/trust/reasoning/reasoningStrategy.ts — the ladder this reads
 */

import type { ReasoningStrategyKind } from "@/lib/trust/reasoning/reasoningStrategy";

type CapabilityRule = {
    readonly provider_capable: boolean;
    readonly rationale: string;
};

/**
 * Per-kind capability. Exhaustive by construction.
 *
 * Read this as "what could this kind of reasoning send outside the platform's
 * deterministic boundary" — not "what does today's implementation happen to do".
 * The classification governs a CONTRACT, so it must hold for any conforming
 * strategy of that kind, including ones not yet written.
 */
export const REASONING_EXECUTION_CAPABILITY = {
    /**
     * Rules, tables and pure functions over the reasoning context. Every
     * strategy registered today is this kind, which is why this slice changes
     * no existing behaviour.
     */
    deterministic: {
        provider_capable: false,
        rationale: "Deterministic reasoning is rules and pure functions over the prepared context; it reaches nothing outside the platform.",
    },
    /**
     * A person. There is no model and no egress — the operator already has
     * lawful access to the record under review.
     */
    human_review: {
        provider_capable: false,
        rationale: "Human review is a person deciding, not a model executing; no payload leaves the platform.",
    },
    /**
     * Retrieval can reach an index, an embedding service or a vector store, any
     * of which may be external. Conservative by design: the cost of treating a
     * purely local retriever as governed is one extra required package, and the
     * cost of the reverse is ungoverned egress.
     */
    knowledge_retrieval: {
        provider_capable: true,
        rationale: "Retrieval may reach an external index or embedding service, so it is governed as provider-capable.",
    },
    /**
     * A classifier may be a rule table or a model, and the kind alone cannot
     * distinguish them. A strategy that is genuinely deterministic should
     * declare `deterministic`.
     */
    classification: {
        provider_capable: true,
        rationale: "A classifier at this rung may be model-backed; a genuinely rule-based one should declare `deterministic` instead.",
    },
    small_reasoning: {
        provider_capable: true,
        rationale: "Model reasoning.",
    },
    large_reasoning: {
        provider_capable: true,
        rationale: "Model reasoning.",
    },
} as const satisfies Record<ReasoningStrategyKind, CapabilityRule>;

/**
 * True when reasoning of this kind must originate from a governed Information
 * Package rather than from raw capability-supplied information.
 */
export function isProviderCapableStrategyKind(kind: ReasoningStrategyKind): boolean {
    return REASONING_EXECUTION_CAPABILITY[kind].provider_capable;
}

/** Why a kind is classified as it is. Exposed so a refusal can explain itself. */
export function executionCapabilityRationale(kind: ReasoningStrategyKind): string {
    return REASONING_EXECUTION_CAPABILITY[kind].rationale;
}

/** The kinds exempt from the Information Package requirement. Asserted by test. */
export const NON_PROVIDER_CAPABLE_KINDS: readonly ReasoningStrategyKind[] = Object.freeze(
    (Object.keys(REASONING_EXECUTION_CAPABILITY) as ReasoningStrategyKind[]).filter(
        (k) => !REASONING_EXECUTION_CAPABILITY[k].provider_capable,
    ),
);
