/**
 * Privacy Transformation Dispatch.
 *
 * Doctrine names six transformations. Before this module, exactly one of them
 * did anything: `withhold` dropped its element and every other transformation
 * fell through to the same generic minimization, so `tokenize`, `abstract`,
 * `aggregate`, `summarize` and `pass_through` were behaviourally identical
 * no-ops. A declared transformation that performs no transformation is a claim
 * the runtime cannot honour, and the Decision Package repeated that claim by
 * recording the classes present as though their policies had been applied.
 *
 * This module makes the claim truthful. Every transformation resolves to
 * exactly one of three dispositions, and there is no fourth option and no
 * default:
 *
 *   - **implemented** — the transformation performs its declared behaviour.
 *   - **compatibility_preserved** — the transformation admits its element
 *     unchanged because sanctioned, already-live behaviour depends on it, and
 *     the record says so rather than claiming the transformation ran.
 *   - **unsupported** — the transformation cannot be performed, so the element
 *     is REFUSED. It is never admitted with its transformation's name attached.
 *
 * The rule table is `satisfies Record<TransformationPolicy, …>`, so adding a
 * seventh transformation to the vocabulary fails to COMPILE until it is given a
 * disposition here. That is the whole point: a new transformation can never
 * again become a silent pass-through by omission.
 *
 * Pure. No I/O, no clock, no provider, no network.
 *
 * @see docs/platform/trust/privacy-runtime.md
 * @see docs/platform/trust/information-classification.md
 */

import type { InformationClass, TransformationPolicy } from "@/lib/trust/classification/informationClasses";

/**
 * How a transformation's behaviour relates to its declared meaning.
 *
 * `compatibility_preserved` exists so that "we did not transform this" is
 * recordable. Without it the only way to keep a live class working would be to
 * label a pass-through as `implemented`, which is the exact lie this slice
 * removes.
 */
export const TRANSFORMATION_SUPPORT_LEVELS = ["implemented", "compatibility_preserved", "unsupported"] as const;

export type TransformationSupport = (typeof TRANSFORMATION_SUPPORT_LEVELS)[number];

export const TRANSFORMATION_DISPOSITIONS = ["admitted", "withheld", "refused"] as const;

export type TransformationDisposition = (typeof TRANSFORMATION_DISPOSITIONS)[number];

/**
 * The one stable refusal code for an unsupported transformation.
 *
 * Stable because operators, tests and future telemetry key off it. The
 * transformation that could not run is carried as DATA on the record rather
 * than encoded into a family of codes, so adding an unsupported transformation
 * later introduces no new code to handle.
 */
export const PRIVACY_TRANSFORM_UNSUPPORTED = "PRIVACY_TRANSFORM_UNSUPPORTED" as const;

export type PrivacyTransformRefusalCode = typeof PRIVACY_TRANSFORM_UNSUPPORTED;

/** What one element's transformation did. Recorded for every element, always. */
export type TransformationRecord = {
    readonly key: string;
    readonly information_class: InformationClass;
    readonly transformation: TransformationPolicy;
    readonly disposition: TransformationDisposition;
    readonly support: TransformationSupport;
    /** Present only on `refused`. */
    readonly refusal_code?: PrivacyTransformRefusalCode;
    /** Why this disposition, in one sentence. Present on every record. */
    readonly rationale: string;
};

export type TransformationOutcome =
    | { readonly disposition: "admitted"; readonly support: "implemented" | "compatibility_preserved"; readonly value: unknown; readonly rationale: string }
    | { readonly disposition: "withheld"; readonly support: "implemented"; readonly rationale: string }
    | {
          readonly disposition: "refused";
          readonly support: "unsupported";
          readonly refusal_code: PrivacyTransformRefusalCode;
          readonly rationale: string;
      };

type TransformationRule = {
    readonly disposition: TransformationDisposition;
    readonly support: TransformationSupport;
    readonly rationale: string;
};

/**
 * The complete dispatch table. Exhaustive by construction.
 *
 * Read this table as the answer to "what does Trust actually do with an element
 * of this class today" — it is the honest version of
 * `INFORMATION_CLASS_TRANSFORMATIONS`.
 */
export const TRANSFORMATION_RULES = {
    /**
     * Implemented. The element is dropped before reasoning sees it. This is the
     * one transformation that always did what it said.
     */
    withhold: {
        disposition: "withheld",
        support: "implemented",
        rationale: "The element is removed before reasoning; withheld information is never admitted to the context.",
    },

    /**
     * Implemented. `pass_through` means "admit unchanged and let the policy's
     * own minimization apply" — that is its declared behaviour, so performing
     * it is not a compatibility concession. `operational`, `compliance` and
     * `knowledge` are the classes that carry it, and every element of all three
     * registered decision classes is `operational`.
     */
    pass_through: {
        disposition: "admitted",
        support: "implemented",
        rationale: "Pass-through admits the element unchanged by definition; policy-level minimization still applies.",
    },

    /**
     * Compatibility-preserved, deliberately (Director decision D-4).
     *
     * Doctrine's `summarize` means semantic reduction of communications
     * content, which requires reasoning — and this slice may introduce no
     * provider-backed reasoning. Turning `summarize` into a refusal instead
     * would silently break the one live registered class that carries it:
     * `attention_suggestion_enrichment` classifies `channel` and `draft_body`
     * as `communications`, and refusing them would strip an operator surface
     * that has been shipping since Trust Runtime V1.
     *
     * So the element is admitted unchanged and the record says
     * `compatibility_preserved` — the runtime does not claim a summary was
     * produced. Real summarization arrives with the governed provider seam.
     */
    summarize: {
        disposition: "admitted",
        support: "compatibility_preserved",
        rationale:
            "Summarization requires reasoning, which this slice may not introduce. The element is admitted unchanged and NOT recorded as summarized.",
    },

    /**
     * Unsupported — refused (Director decision D-3).
     *
     * Tokenization implies a canonical token vault with a rehydration
     * authority, and no such vault exists anywhere in the platform. The
     * dangerous outcome is not the missing vault; it is admitting raw identity
     * data while the privacy report records `tokenize`. Refusing fails closed.
     *
     * Nothing regresses: no registered decision class maps any element to
     * `identity`, and `processing_identity_subject_resolution` prohibits the
     * class outright — so an identity element reaching here already meant the
     * adapter contract had been bypassed.
     */
    tokenize: {
        disposition: "refused",
        support: "unsupported",
        rationale:
            "Tokenization requires a token vault that does not exist. Admitting raw data under a tokenize policy would be a false privacy claim, so the element is refused.",
    },

    /**
     * Unsupported — refused. No abstraction implementation exists, and no
     * registered decision class maps an element to `relationship`.
     */
    abstract: {
        disposition: "refused",
        support: "unsupported",
        rationale: "No abstraction implementation exists; admitting the element unchanged would misstate the applied policy.",
    },

    /**
     * Unsupported — refused. No aggregation implementation exists. `financial`
     * is additionally prohibited outright by all three registered privacy
     * policies, so it refuses earlier; `behavior` has no live consumer.
     */
    aggregate: {
        disposition: "refused",
        support: "unsupported",
        rationale: "No aggregation implementation exists; admitting an unaggregated value would misstate the applied policy.",
    },
} as const satisfies Record<TransformationPolicy, TransformationRule>;

/**
 * Applies one element's transformation.
 *
 * Total over {@link TransformationPolicy} — there is no default branch, because
 * a default branch is how a transformation becomes a silent no-op.
 */
export function applyTransformation(input: {
    readonly transformation: TransformationPolicy;
    readonly value: unknown;
}): TransformationOutcome {
    const rule = TRANSFORMATION_RULES[input.transformation];

    if (rule.disposition === "withheld") {
        return { disposition: "withheld", support: "implemented", rationale: rule.rationale };
    }

    if (rule.disposition === "refused") {
        return {
            disposition: "refused",
            support: "unsupported",
            refusal_code: PRIVACY_TRANSFORM_UNSUPPORTED,
            rationale: rule.rationale,
        };
    }

    // `admitted` — the value travels unchanged; the support level records
    // whether that is the transformation's real behaviour or a compatibility
    // concession.
    return {
        disposition: "admitted",
        support: rule.support === "compatibility_preserved" ? "compatibility_preserved" : "implemented",
        value: input.value,
        rationale: rule.rationale,
    };
}

/** True when the transformation cannot be performed and must fail closed. */
export function isUnsupportedTransformation(transformation: TransformationPolicy): boolean {
    return TRANSFORMATION_RULES[transformation].disposition === "refused";
}
