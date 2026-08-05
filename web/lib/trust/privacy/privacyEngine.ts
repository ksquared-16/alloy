/**
 * Privacy Engine.
 *
 * Transforms classified information into the minimum trustworthy Reasoning
 * Context. Reasoning never receives raw operational truth — it receives what
 * this module produces, and nothing else.
 *
 * Privacy is achieved by minimization, not by post-processing.
 *
 * @see docs/platform/trust/privacy-runtime.md
 */

import type { ClassificationResult, InformationClass } from "@/lib/trust/classification/informationClasses";
import type { PiiMode, RedactionStep } from "@/lib/privacy/redactObject";
import { redactObjectForAi } from "@/lib/privacy/redactObject";
import { TRUST_REGISTRY } from "@/lib/trust/registry/trustRegistry";

export type PrivacyPolicyV1 = {
    readonly key: string;
    readonly pii_mode: PiiMode;
    /** Classes this policy refuses to admit to reasoning at all. */
    readonly prohibited_classes: readonly InformationClass[];
};

/**
 * Re-exported from its platform-owned home. Doctrine places policy ownership
 * with the platform (`privacy-runtime.md` §Privacy Policies), so the definition
 * lives in `lib/trust/platform/` and capabilities reference it by key.
 */
export { ATTENTION_SUGGESTION_MINIMIZATION_V1 } from "@/lib/trust/platform/platformPrivacyPolicies";

/**
 * Absent returns `null`. The runtime turns a missing policy into a
 * `refused_policy` Decision Package rather than throwing — reasoning may not
 * proceed without a policy, and that refusal is auditable.
 *
 * A policy that a registered Decision Class *references* can never be missing
 * in practice: composition refuses a dangling reference at startup.
 */
export function resolvePrivacyPolicy(key: string): PrivacyPolicyV1 | null {
    return TRUST_REGISTRY.getPrivacyPolicy(key);
}

/**
 * What reasoning is allowed to see. Contains only transformed information plus
 * whatever knowledge was authorized — never a raw record, never a raw document.
 */
export type ReasoningContextV1 = {
    readonly transformed: Readonly<Record<string, unknown>>;
    readonly knowledge: readonly KnowledgeReference[];
    readonly redaction_steps: readonly RedactionStep[];
    readonly classes_present: readonly InformationClass[];
    readonly pii_mode: PiiMode;
};

export type KnowledgeReference = {
    readonly asset_key: string;
    readonly version: string;
    readonly provider_key: string;
};

export type PrivacyTransformResult =
    | { readonly ok: true; readonly context: ReasoningContextV1 }
    | { readonly ok: false; readonly refusal_code: "PRIVACY_PROHIBITED_CLASS"; readonly detail: string };

/**
 * Applies the policy to classified elements and constructs the Reasoning
 * Context. A prohibited class refuses the whole transform — it is never
 * silently dropped, because a silent drop would let reasoning proceed on a
 * context the contract did not declare.
 */
export function transformForReasoning(input: {
    classification: ClassificationResult;
    policy: PrivacyPolicyV1;
    knowledge: readonly KnowledgeReference[];
}): PrivacyTransformResult {
    const prohibited = input.classification.elements.filter((e) =>
        input.policy.prohibited_classes.includes(e.information_class),
    );
    if (prohibited.length > 0) {
        return {
            ok: false,
            refusal_code: "PRIVACY_PROHIBITED_CLASS",
            detail: `Privacy policy ${input.policy.key} prohibits information class(es): ${[
                ...new Set(prohibited.map((e) => e.information_class)),
            ].join(", ")}.`,
        };
    }

    const admitted: Record<string, unknown> = {};
    for (const element of input.classification.elements) {
        if (element.transformation === "withhold") continue;
        admitted[element.key] = element.value;
    }

    const { redacted, steps } = redactObjectForAi(admitted, { pii_mode: input.policy.pii_mode });

    return {
        ok: true,
        context: {
            transformed: redacted,
            knowledge: input.knowledge,
            redaction_steps: steps,
            classes_present: input.classification.classes_present,
            pii_mode: input.policy.pii_mode,
        },
    };
}
