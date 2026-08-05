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
    /**
     * Statistical certainty only. Never operational approval, never trust.
     *
     * `null` means **no calibrated confidence exists** — materially different
     * from `0`, and the honest answer for a deterministic class whose engine
     * produces ordered CATEGORIES rather than probabilities. Reporting `0` there
     * would assert zero certainty, which is a false claim about the judgment.
     *
     * A type-level widening only. `DecisionPackageV1.confidence` and the
     * `confidence numeric` column were already nullable, the runtime passes this
     * value straight through, and every existing strategy returning a `number`
     * stays assignable and behaves identically.
     */
    readonly confidence: number | null;
    readonly evidence: readonly ReasoningEvidenceItem[];
    readonly explanation: string;
    /** Uncertainty the runtime could not remove; surfaced in the package. */
    readonly remaining_uncertainty: readonly string[];
};

/**
 * What one execution cost, as MEASURED by the strategy.
 *
 * Present on both branches: a provider call that ultimately failed still spent
 * something, and reporting only successful cost would understate what reasoning
 * actually consumed.
 *
 * Optional, and omission means zero — a deterministic strategy spends nothing
 * and says nothing. The runtime validates whatever is reported; it never
 * derives a cost, prices a token or consults a rate table.
 */
export type ReasoningCostReport = {
    /** Finite, non-negative units. Validated by `parseProviderCostUnits`. */
    readonly cost_units?: number;
};

export type ReasoningOutcome =
    | ({ readonly ok: true; readonly proposal: ReasoningProposalV1 } & ReasoningCostReport)
    | ({
          readonly ok: false;
          readonly refusal_code: "REASONING_UNABLE";
          readonly detail: string;
      } & ReasoningCostReport);

/**
 * What {@link ReasoningStrategyV1.reason} may return.
 *
 * A strategy that needs no I/O returns the outcome directly; a strategy that
 * must await something returns a promise. The runtime awaits either, so both
 * travel exactly ONE path — there is no second execution route for
 * asynchronous strategies, and none may be introduced.
 *
 * The union is deliberately a widening rather than a replacement: every
 * existing synchronous strategy remains assignable and behaves identically.
 */
export type ReasoningExecution = ReasoningOutcome | Promise<ReasoningOutcome>;

export type ReasoningStrategyV1 = {
    readonly key: string;
    readonly kind: ReasoningStrategyKind;
    /** Bumped when the strategy's behaviour changes; pinned into the package for replay. */
    readonly version: string;
    /** The Decision Class this strategy can satisfy. */
    readonly decision_class_key: string;
    /**
     * Produces a proposal from prepared context, synchronously or
     * asynchronously. The strategy still retrieves nothing: the context is all
     * it sees, and privacy preparation has already happened.
     *
     * Returning a promise permits a strategy to await work it owns — that is
     * the whole of the seam. It does NOT permit the strategy to reach past the
     * context, and it introduces no timeout, retry or cancellation semantics;
     * those belong to execution control, which is not part of this contract.
     */
    reason(input: { context: ReasoningContextV1; nowIso: string }): ReasoningExecution;
};
