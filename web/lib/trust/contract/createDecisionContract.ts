/**
 * Decision Contract builder.
 *
 * The only sanctioned way to create a contract. Its signature carries the
 * structural guarantee: a context declaring a prompt, provider, model or API
 * parameter — at any depth — resolves to `never` and fails to compile.
 *
 * @see docs/platform/trust/decision-contract.md
 */

import { randomUUID } from "crypto";

import type {
    DecisionContractV1,
    RejectsReasoningImplementation,
    TrustChannel,
    TrustDeclaredValue,
    TrustInitiatingActor,
} from "@/lib/trust/contract/decisionContractTypes";
import { TRUST_RUNTIME_VERSION } from "@/lib/trust/contract/decisionContractTypes";
import type { DecisionClassDefinitionV1 } from "@/lib/trust/decisionClasses/decisionClassRegistry";
import { DECISION_CLASS_REGISTRY_VERSION, resolveDecisionClass } from "@/lib/trust/decisionClasses/decisionClassRegistry";

export type CreateDecisionContractInput<C extends Record<string, TrustDeclaredValue>> = {
    readonly org_id: string;
    readonly decision_class_key: string;
    readonly intent: string;
    /** Declared operational context. Never inferred, never implementation. */
    readonly context: C & RejectsReasoningImplementation<C>;
    readonly correlation_id: string;
    readonly initiating_actor: TrustInitiatingActor;
    readonly channel: TrustChannel;
    readonly nowIso?: string;
    /**
     * A DETERMINISTIC contract id, derived by the capability from a stable
     * decision identity. Omit it and a fresh random id is generated, exactly as
     * before — every existing caller is unaffected.
     *
     * Supplying one turns the contract table's primary key into an exactly-once
     * guarantee for that identity: a concurrent second create loses on the
     * primary key rather than quietly producing a duplicate governed decision.
     *
     * Only sound for a DETERMINISTIC Decision Class, where the same inputs
     * provably yield the same judgment. A probabilistic class must not pass one.
     */
    readonly id?: string;
};

export type CreateDecisionContractResult =
    | { readonly ok: true; readonly contract: DecisionContractV1; readonly decisionClass: DecisionClassDefinitionV1 }
    | {
          readonly ok: false;
          readonly refusal_code: "UNKNOWN_DECISION_CLASS" | "INVALID_CONTRACT";
          readonly detail: string;
          /** A contract that cannot be built still needs a package; this is its shell. */
          readonly contract: DecisionContractV1;
      };

/**
 * Builds a contract from a registered Decision Class.
 *
 * Requirements are read from the class, not supplied by the caller: a
 * capability declares WHICH decision it needs, and governance declares what
 * that decision requires.
 */
export function createDecisionContract<C extends Record<string, TrustDeclaredValue>>(
    input: CreateDecisionContractInput<C>,
): CreateDecisionContractResult {
    const nowIso = input.nowIso ?? new Date().toISOString();
    const decisionClass = resolveDecisionClass(input.decision_class_key);

    const base = {
        schema_version: 1 as const,
        id: input.id ?? randomUUID(),
        org_id: input.org_id,
        decision_class_key: input.decision_class_key,
        intent: input.intent,
        context: input.context as TrustDeclaredValue,
        correlation_id: input.correlation_id,
        initiating_actor: input.initiating_actor,
        channel: input.channel,
        lifecycle_state: "created" as const,
        runtime_version: TRUST_RUNTIME_VERSION,
        registry_version: DECISION_CLASS_REGISTRY_VERSION,
        created_at_iso: nowIso,
    };

    if (!decisionClass) {
        return {
            ok: false,
            refusal_code: "UNKNOWN_DECISION_CLASS",
            detail: `Decision class ${input.decision_class_key} is not registered.`,
            contract: {
                ...base,
                information_requirements: [],
                knowledge_requirements: [],
                privacy_policy_key: "unresolved",
                validation_policy_key: "unresolved",
                economic_constraints: { max_latency_ms: 0, max_escalation_level: 0 },
                success_criteria: [],
            },
        };
    }

    if (!input.org_id.trim() || !input.correlation_id.trim() || !input.intent.trim()) {
        return {
            ok: false,
            refusal_code: "INVALID_CONTRACT",
            detail: "org_id, correlation_id and intent are all required on a Decision Contract.",
            contract: {
                ...base,
                information_requirements: decisionClass.required_information,
                knowledge_requirements: decisionClass.knowledge_categories,
                privacy_policy_key: decisionClass.privacy_policy_key,
                validation_policy_key: decisionClass.validation_policy_key,
                economic_constraints: decisionClass.economic_policy,
                success_criteria: [],
            },
        };
    }

    return {
        ok: true,
        decisionClass,
        contract: {
            ...base,
            information_requirements: decisionClass.required_information,
            knowledge_requirements: decisionClass.knowledge_categories,
            privacy_policy_key: decisionClass.privacy_policy_key,
            validation_policy_key: decisionClass.validation_policy_key,
            economic_constraints: decisionClass.economic_policy,
            success_criteria: [
                "recommendation_produced",
                "deterministic_validation_passed",
                "decision_package_complete",
            ],
        },
    };
}
