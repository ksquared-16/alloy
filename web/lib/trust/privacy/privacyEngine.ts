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
import type {
    TextMinimizationClass,
    TextMinimizationRecord,
    TextMinimizationRefusalCode,
} from "@/lib/privacy/minimizeTextContent";
import { minimizeTextContent, validateTextMinimizationRequest } from "@/lib/privacy/minimizeTextContent";
import type { PrivacyTransformRefusalCode, TransformationRecord } from "@/lib/trust/privacy/transformationDispatch";
import { applyTransformation } from "@/lib/trust/privacy/transformationDispatch";
import { TRUST_REGISTRY } from "@/lib/trust/registry/trustRegistry";

export type PrivacyPolicyV1 = {
    readonly key: string;
    readonly pii_mode: PiiMode;
    /** Classes this policy refuses to admit to reasoning at all. */
    readonly prohibited_classes: readonly InformationClass[];
    /**
     * Embedded information classes that must be minimized INSIDE admitted text.
     *
     * Absent or empty means no content-aware minimization runs, which is why
     * every policy registered before Phase 2.2 behaves exactly as it did: the
     * capability is opt-in per policy, not a new default applied to text that
     * was already reviewed under different rules.
     *
     * A class this platform cannot detect deterministically refuses the whole
     * transform — see {@link validateTextMinimizationRequest}.
     */
    readonly required_text_minimizers?: readonly TextMinimizationClass[];
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
    /**
     * What content-aware text minimization removed, per detector.
     *
     * Counts only. The matched substrings are the very thing being removed, so
     * recording one to prove the removal happened would defeat the removal.
     * Empty when the policy requires no text minimization.
     */
    readonly text_minimizations: readonly TextMinimizationRecord[];
};

export type KnowledgeReference = {
    readonly asset_key: string;
    readonly version: string;
    readonly provider_key: string;
};

export type PrivacyTransformRefusal =
    | "PRIVACY_PROHIBITED_CLASS"
    | PrivacyTransformRefusalCode
    | TextMinimizationRefusalCode;

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
    // Policy validity is checked BEFORE any element is examined. A policy asking
    // for a class this platform cannot detect is wrong whether or not a given
    // request happens to contain text — deciding it from the data would make the
    // refusal depend on which message arrived.
    const requestedMinimizers = input.policy.required_text_minimizers ?? [];
    const minimizerCheck = validateTextMinimizationRequest(requestedMinimizers);
    if (!minimizerCheck.ok) {
        return {
            ok: false,
            refusal_code: minimizerCheck.refusal_code,
            detail: `Privacy policy ${input.policy.key}: ${minimizerCheck.detail}`,
            transformations: [],
        };
    }

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
    const textMinimizations = new Map<TextMinimizationClass, TextMinimizationRecord>();

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

        // Content-aware minimization runs BEFORE structural redaction, and the
        // order is not interchangeable. `redactObjectForAi` in `strict` mode
        // reacts to an email-shaped value by replacing the WHOLE string, so
        // "Email me at jane@example.com about Friday" becomes "Em…@e….redacted"
        // — the sentence is destroyed along with the address, and there is
        // nothing left for a content-aware pass to preserve. Removing the
        // embedded identifier first means the structural pass sees ordinary
        // prose and leaves it alone, which is the whole point of this slice.
        let value = outcome.value;
        if (requestedMinimizers.length > 0 && typeof value === "string") {
            const minimized = minimizeTextContent(value, requestedMinimizers);
            if (!minimized.ok) {
                transformations.push({
                    ...base,
                    disposition: "refused",
                    support: "unsupported",
                    rationale: minimized.detail,
                });
                return {
                    ok: false,
                    refusal_code: minimized.refusal_code,
                    // As above: no element key, and — more importantly here — no
                    // fragment of the text being minimized.
                    detail: `Privacy policy ${input.policy.key}: ${minimized.detail}`,
                    transformations,
                };
            }
            value = minimized.text;
            for (const record of minimized.records) {
                const existing = textMinimizations.get(record.detector_key);
                textMinimizations.set(record.detector_key, {
                    detector_key: record.detector_key,
                    redaction_kind: record.redaction_kind,
                    replaced_count: (existing?.replaced_count ?? 0) + record.replaced_count,
                });
            }
        }

        admitted[element.key] = value;
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
            // Stable order, independent of which element happened to be first.
            text_minimizations: [...textMinimizations.values()].sort((a, b) =>
                a.detector_key.localeCompare(b.detector_key),
            ),
        },
    };
}
