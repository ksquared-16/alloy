/**
 * Validation orchestration.
 *
 * Per Decision 022 the Validation Engine ORCHESTRATES. It calls the validator
 * owned by the domain or platform that owns each rule and records the result.
 * It owns no business rule and never re-implements one.
 *
 * Every policy is a list of call-outs. If a rule needs to change, it changes in
 * its owning module, not here. The POLICIES themselves live in their owning
 * capability's contribution module and are composed by the composition root
 * (Slice 0.2); this module owns the policy type and the orchestration, not the
 * entries.
 *
 * @see docs/platform/trust/trust-platform-decisions.md — Decision 022
 * @see lib/trust/registry/trustRegistry.ts — the composition root
 */

import { TRUST_REGISTRY } from "@/lib/trust/registry/trustRegistry";

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

/** What one call-out reports. */
export type ValidatorOutcome = { passed: boolean; detail: string };

/**
 * What a call-out's `invoke` may return.
 *
 * Most authoritative validators in Alloy read the database, so a
 * synchronous-only signature could only ever admit pure in-memory checks. The
 * union widens to permit real domain validators without changing the meaning
 * of a call-out: it still invokes and reports, and it still owns no rule.
 */
export type ValidatorExecution = ValidatorOutcome | Promise<ValidatorOutcome>;

/**
 * A validation policy is an ordered list of call-outs into authoritative
 * validators. The callback body must do nothing but invoke and report.
 */
export type ValidationPolicyV1 = {
    readonly key: string;
    readonly version: string;
    readonly callOuts: readonly {
        readonly owner: string;
        readonly validator_key: string;
        readonly invoke: (recommendation: Record<string, unknown>) => ValidatorExecution;
    }[];
};

export function resolveValidationPolicyVersion(key: string): string | null {
    return TRUST_REGISTRY.getValidationPolicy(key)?.version ?? null;
}

export type ValidationOrchestrationResult =
    | { readonly ok: true; readonly report: ValidationReport }
    | { readonly ok: false; readonly refusal_code: "VALIDATION_POLICY_UNKNOWN"; readonly detail: string };

/**
 * The orchestration core: runs every call-out of ONE policy, in declared order.
 *
 * Call-outs run **sequentially**, exactly as the previous synchronous `map`
 * did. Sequential execution is the behaviour-preserving choice: a validator can
 * never observe another call-out mid-flight, and the report's ordering is the
 * policy's ordering rather than a completion race.
 *
 * A call-out that throws — or whose promise rejects — propagates, unchanged
 * from the synchronous contract. The orchestrator reports validation *results*;
 * it does not convert a broken validator into a passing or failing one.
 */
export async function runValidationPolicy(
    policy: ValidationPolicyV1,
    recommendation: Record<string, unknown>,
): Promise<ValidationReport> {
    const results: ValidatorResult[] = [];
    for (const c of policy.callOuts) {
        const r = await c.invoke(recommendation);
        results.push({ owner: c.owner, validator_key: c.validator_key, passed: r.passed, detail: r.detail });
    }

    return {
        policy_key: policy.key,
        policy_version: policy.version,
        results,
        passed: results.every((r) => r.passed),
    };
}

/**
 * Resolves the policy and runs it. Validation is deterministic and never
 * depends on reasoning: it sees the proposal only, never the strategy.
 *
 * Synchronous and asynchronous call-outs share this one path — there is no
 * second orchestration route, and none may be introduced.
 */
export async function orchestrateValidation(input: {
    policy_key: string;
    recommendation: Record<string, unknown>;
}): Promise<ValidationOrchestrationResult> {
    const policy = TRUST_REGISTRY.getValidationPolicy(input.policy_key);
    if (!policy) {
        return {
            ok: false,
            refusal_code: "VALIDATION_POLICY_UNKNOWN",
            detail: `No validation policy registered for key ${input.policy_key}.`,
        };
    }

    return { ok: true, report: await runValidationPolicy(policy, input.recommendation) };
}
