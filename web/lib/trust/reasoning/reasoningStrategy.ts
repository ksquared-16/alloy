/**
 * Reasoning Strategy contracts.
 *
 * The Reasoning Runtime owns proposal generation and confidence. It never owns
 * retrieval, privacy, validation, trust semantics or execution.
 *
 * A strategy consumes a prepared Reasoning Context and returns a proposal. It
 * cannot retrieve anything: the context is all it sees.
 *
 * @see docs/platform/trust/reasoning-runtime.md
 */

import type { ReasoningContextV1 } from "@/lib/trust/privacy/privacyEngine";

/**
 * Strategy kinds, cheapest first. V1 implements `deterministic` only; the rest
 * are declared so the escalation ladder is a real ordering rather than a future
 * refactor.
 */
export const REASONING_STRATEGY_KINDS = [
    "deterministic",
    "knowledge_retrieval",
    "classification",
    "small_reasoning",
    "large_reasoning",
    "human_review",
] as const;

export type ReasoningStrategyKind = (typeof REASONING_STRATEGY_KINDS)[number];

/** Escalation level, index into {@link REASONING_STRATEGY_KINDS}. */
export function escalationLevelOf(kind: ReasoningStrategyKind): number {
    return REASONING_STRATEGY_KINDS.indexOf(kind);
}

export type ReasoningEvidenceItem = {
    readonly kind: "authoritative_record" | "policy" | "knowledge_asset" | "deterministic_rule" | "observation";
    readonly reference: string;
    readonly detail: string;
};

export type ReasoningProposalV1 = {
    /** The proposal payload. Shape is owned by the Decision Class, not by the strategy kind. */
    readonly recommendation: Record<string, unknown>;
    /** Statistical certainty only. Never operational approval, never trust. */
    readonly confidence: number;
    readonly evidence: readonly ReasoningEvidenceItem[];
    readonly explanation: string;
    /** Uncertainty the runtime could not remove; surfaced in the package. */
    readonly remaining_uncertainty: readonly string[];
};

export type ReasoningOutcome =
    | { readonly ok: true; readonly proposal: ReasoningProposalV1 }
    | { readonly ok: false; readonly refusal_code: "REASONING_UNABLE"; readonly detail: string };

export type ReasoningStrategyV1 = {
    readonly key: string;
    readonly kind: ReasoningStrategyKind;
    /** Bumped when the strategy's behaviour changes; pinned into the package for replay. */
    readonly version: string;
    /** The Decision Class this strategy can satisfy. */
    readonly decision_class_key: string;
    /**
     * Produces a proposal from prepared context. Pure with respect to the
     * context and the supplied clock — no I/O, no retrieval, no provider.
     */
    reason(input: { context: ReasoningContextV1; nowIso: string }): ReasoningOutcome;
};
