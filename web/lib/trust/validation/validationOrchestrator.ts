/**
 * Validation orchestration.
 *
 * Per Decision 022 the Validation Engine ORCHESTRATES. It calls the validator
 * owned by the domain or platform that owns each rule and records the result.
 * It owns no business rule and never re-implements one.
 *
 * Every entry below is a call-out. If a rule needs to change, it changes in its
 * owning module, not here.
 *
 * @see docs/platform/trust/trust-platform-decisions.md — Decision 022
 */

import { safeParseAttentionSuggestionAiEnrichmentV1 } from "@/lib/ai/attentionSuggestionAiEnrichmentSchema";

export type ValidatorResult = {
    /** The module that owns the rule. Recorded so a package names its authority. */
    readonly owner: string;
    readonly validator_key: string;
    readonly passed: boolean;
    readonly detail: string;
};

export type ValidationReport = {
    readonly policy_key: string;
    readonly policy_version: string;
    readonly results: readonly ValidatorResult[];
    readonly passed: boolean;
};

/**
 * A validation policy is an ordered list of call-outs into authoritative
 * validators. The callback body must do nothing but invoke and report.
 */
type ValidationPolicyV1 = {
    readonly key: string;
    readonly version: string;
    readonly callOuts: readonly {
        readonly owner: string;
        readonly validator_key: string;
        readonly invoke: (recommendation: Record<string, unknown>) => { passed: boolean; detail: string };
    }[];
};

const ATTENTION_SUGGESTION_ENRICHMENT_V1: ValidationPolicyV1 = {
    key: "attention_suggestion_enrichment_v1",
    version: "1.0.0",
    callOuts: [
        {
            // The enrichment envelope's shape is owned by lib/ai, which authored
            // the operator-facing contract. Trust calls that owner's parser; it
            // does not restate the schema.
            owner: "lib/ai/attentionSuggestionAiEnrichmentSchema",
            validator_key: "safeParseAttentionSuggestionAiEnrichmentV1",
            invoke(recommendation) {
                const parsed = safeParseAttentionSuggestionAiEnrichmentV1(recommendation);
                return parsed
                    ? { passed: true, detail: "Recommendation satisfies AttentionSuggestionAiEnrichmentV1." }
                    : { passed: false, detail: "Recommendation does not satisfy AttentionSuggestionAiEnrichmentV1." };
            },
        },
    ],
};

const VALIDATION_POLICIES: ReadonlyMap<string, ValidationPolicyV1> = new Map([
    [ATTENTION_SUGGESTION_ENRICHMENT_V1.key, ATTENTION_SUGGESTION_ENRICHMENT_V1],
]);

export function resolveValidationPolicyVersion(key: string): string | null {
    return VALIDATION_POLICIES.get(key)?.version ?? null;
}

export type ValidationOrchestrationResult =
    | { readonly ok: true; readonly report: ValidationReport }
    | { readonly ok: false; readonly refusal_code: "VALIDATION_POLICY_UNKNOWN"; readonly detail: string };

/**
 * Runs every call-out for the policy. Validation is deterministic and never
 * depends on reasoning: it sees the proposal only, never the strategy.
 */
export function orchestrateValidation(input: {
    policy_key: string;
    recommendation: Record<string, unknown>;
}): ValidationOrchestrationResult {
    const policy = VALIDATION_POLICIES.get(input.policy_key);
    if (!policy) {
        return {
            ok: false,
            refusal_code: "VALIDATION_POLICY_UNKNOWN",
            detail: `No validation policy registered for key ${input.policy_key}.`,
        };
    }

    const results: ValidatorResult[] = policy.callOuts.map((c) => {
        const r = c.invoke(input.recommendation);
        return { owner: c.owner, validator_key: c.validator_key, passed: r.passed, detail: r.detail };
    });

    return {
        ok: true,
        report: {
            policy_key: policy.key,
            policy_version: policy.version,
            results,
            passed: results.every((r) => r.passed),
        },
    };
}
