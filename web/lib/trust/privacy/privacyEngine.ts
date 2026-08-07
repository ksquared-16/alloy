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
import type { PrivacyTransformRefusalCode, TransformationRecord } from "@/lib/trust/privacy/transformationDispatch";
import { applyTransformation } from "@/lib/trust/privacy/transformationDispatch";
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
    /**
     * What each element's transformation actually did — one record per declared
     * element, including withheld ones.
     *
     * This is the auditable half of the privacy claim. Before transformation
     * dispatch existed, the context reported the classes present but nothing
     * about whether their transformations had been performed, so a no-op was
     * indistinguishable from a transformation. A reader of this list can tell
     * `implemented` from `compatibility_preserved` without reading the engine.
     */
    readonly transformations: readonly TransformationRecord[];
};

export type KnowledgeReference = {
    readonly asset_key: string;
    readonly version: string;
    readonly provider_key: string;
};

export type PrivacyTransformRefusal = "PRIVACY_PROHIBITED_CLASS" | PrivacyTransformRefusalCode;

export type PrivacyTransformResult =
    | { readonly ok: true; readonly context: ReasoningContextV1 }
    | {
          readonly ok: false;
          readonly refusal_code: PrivacyTransformRefusal;
          readonly detail: string;
          /**
           * The per-element records produced before the refusal. Present so a
           * refusal is diagnosable without re-running the transform.
           */
          readonly transformations: readonly TransformationRecord[];
      };

/**
 * Applies the policy to classified elements and constructs the Reasoning
 * Context.
 *
 * Two refusals, and both refuse the WHOLE transform rather than dropping an
 * element:
 *
 *  - **`PRIVACY_PROHIBITED_CLASS`** — the policy refuses to admit this class of
 *    information at all. Checked first, and unchanged by this slice.
 *  - **`PRIVACY_TRANSFORM_UNSUPPORTED`** — the class's declared transformation
 *    cannot be performed. Admitting the element anyway would attach the name of
 *    a transformation that never ran, which is the precise falsehood this
 *    dispatch exists to prevent.
 *
 * A silent drop is refused in both cases for the same reason it always was:
 * reasoning must never proceed on a context the contract did not declare.
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
            transformations: [],
        };
    }

    const admitted: Record<string, unknown> = {};
    const transformations: TransformationRecord[] = [];

    for (const element of input.classification.elements) {
        const outcome = applyTransformation({ transformation: element.transformation, value: element.value });

        const base = {
            key: element.key,
            information_class: element.information_class,
            transformation: element.transformation,
        } as const;

        if (outcome.disposition === "refused") {
            transformations.push({
                ...base,
                disposition: "refused",
                support: "unsupported",
                refusal_code: outcome.refusal_code,
                rationale: outcome.rationale,
            });
            return {
                ok: false,
                refusal_code: outcome.refusal_code,
                // The element KEY is deliberately absent. This detail becomes the
                // Decision Package's explanation, and a key is caller-supplied
                // text: echoing it would let an unmapped element write its own
                // name into an immutable package — which is how a smuggled
                // `proposed_command` or `provider_key` would reach a package by
                // the back door, through the very refusal meant to stop it.
                // Diagnosis uses `transformations` below, which does not persist.
                detail:
                    `Privacy policy ${input.policy.key} declares transformation "${element.transformation}" for ` +
                    `information class "${element.information_class}", and that transformation is not ` +
                    `implemented. ${outcome.rationale}`,
                transformations,
            };
        }

        if (outcome.disposition === "withheld") {
            transformations.push({ ...base, disposition: "withheld", support: "implemented", rationale: outcome.rationale });
            continue;
        }

        admitted[element.key] = outcome.value;
        transformations.push({
            ...base,
            disposition: "admitted",
            support: outcome.support,
            rationale: outcome.rationale,
        });
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
            transformations,
        },
    };
}
