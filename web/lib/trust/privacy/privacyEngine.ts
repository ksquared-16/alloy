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

export type PrivacyPolicyV1 = {
    readonly key: string;
    readonly pii_mode: PiiMode;
    /** Classes this policy refuses to admit to reasoning at all. */
    readonly prohibited_classes: readonly InformationClass[];
};

export const ATTENTION_SUGGESTION_MINIMIZATION_V1: PrivacyPolicyV1 = {
    key: "attention_suggestion_minimization_v1",
    pii_mode: "strict",
    prohibited_classes: ["financial"],
};

const PRIVACY_POLICIES: ReadonlyMap<string, PrivacyPolicyV1> = new Map([
    [ATTENTION_SUGGESTION_MINIMIZATION_V1.key, ATTENTION_SUGGESTION_MINIMIZATION_V1],
]);

export function resolvePrivacyPolicy(key: string): PrivacyPolicyV1 | null {
    return PRIVACY_POLICIES.get(key) ?? null;
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
