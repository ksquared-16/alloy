/**
 * Strategy Engine.
 *
 * Selects HOW reasoning should occur. Selection is deterministic and always
 * picks the least expensive strategy capable of satisfying the contract —
 * "expensive reasoning is earned".
 *
 * Provider resolution happens strictly AFTER strategy selection and strictly
 * inside the Reasoning Runtime. V1 registers no providers at all.
 *
 * @see docs/platform/trust/trust-economics.md
 */

import type { DecisionClassDefinitionV1 } from "@/lib/trust/decisionClasses/decisionClassRegistry";
import type { ReasoningStrategyV1 } from "@/lib/trust/reasoning/reasoningStrategy";
import { escalationLevelOf, REASONING_STRATEGY_KINDS } from "@/lib/trust/reasoning/reasoningStrategy";
import { TRUST_REGISTRY } from "@/lib/trust/registry/trustRegistry";

export type StrategySelection =
    | { readonly ok: true; readonly strategy: ReasoningStrategyV1; readonly escalation_level: number }
    | {
          readonly ok: false;
          readonly refusal_code: "STRATEGY_UNAVAILABLE" | "STRATEGY_EXCEEDS_ESCALATION_BUDGET";
          readonly detail: string;
      };

/**
 * Least-cost-sufficient selection.
 *
 * Candidates are ordered by escalation level, not by registration order, so a
 * probabilistic strategy added later can never be chosen ahead of a
 * deterministic one that satisfies the same class.
 */
export function selectStrategy(decisionClass: DecisionClassDefinitionV1): StrategySelection {
    // Indexed by the composition root, so this is a lookup rather than a scan.
    // The composed list is frozen; sorting a copy keeps it that way.
    const candidates = [...TRUST_REGISTRY.listStrategiesForDecisionClass(decisionClass.key)].sort(
        (a, b) => escalationLevelOf(a.kind) - escalationLevelOf(b.kind),
    );

    if (candidates.length === 0) {
        return {
            ok: false,
            refusal_code: "STRATEGY_UNAVAILABLE",
            detail: `No reasoning strategy is registered for decision class ${decisionClass.key}.`,
        };
    }

    const preferred = decisionClass.strategy_preference;
    const chosen =
        candidates.find((c) => preferred.includes(c.kind)) ?? candidates[0]!;
    const level = escalationLevelOf(chosen.kind);

    if (level > decisionClass.economic_policy.max_escalation_level) {
        return {
            ok: false,
            refusal_code: "STRATEGY_EXCEEDS_ESCALATION_BUDGET",
            detail: `Strategy ${chosen.key} sits at escalation level ${level}, above the class ceiling of ${decisionClass.economic_policy.max_escalation_level}.`,
        };
    }

    return { ok: true, strategy: chosen, escalation_level: level };
}

/** Exposed for the certification suite's ordering assertions. */
export const STRATEGY_LADDER = REASONING_STRATEGY_KINDS;
