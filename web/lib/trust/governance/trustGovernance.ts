/**
 * Trust Governance — the single owner of Trust Vector and Trust Score
 * semantics.
 *
 * Per Decision 022 the dimensions, their meaning and their thresholds live
 * here. The Trust Runtime assembles evidence; this module decides what that
 * evidence means. Changing a weight or a threshold changes the score with no
 * change to runtime code — that separation is asserted by certification
 * scenario S11.
 *
 * @see docs/platform/trust/trust-governance.md
 * @see docs/platform/trust/trust-platform-decisions.md — Decision 022
 */

export const TRUST_VECTOR_DIMENSIONS = [
    "grounding",
    "privacy",
    "evidence",
    "validation",
    "reliability",
    "human_oversight",
] as const;

export type TrustVectorDimension = (typeof TRUST_VECTOR_DIMENSIONS)[number];

export type TrustVector = Readonly<Record<TrustVectorDimension, number>>;

/**
 * Governance-owned semantics. This object IS the definition of trust for the
 * platform; nothing else may weight or threshold a Trust Vector.
 */
export type TrustSemanticsV1 = {
    readonly version: string;
    readonly weights: Readonly<Record<TrustVectorDimension, number>>;
    /** Score at or above which a recommendation may be presented without escalation. */
    readonly presentation_threshold: number;
};

export const TRUST_SEMANTICS_V1: TrustSemanticsV1 = {
    version: "1.0.0",
    weights: {
        grounding: 0.25,
        privacy: 0.2,
        evidence: 0.2,
        validation: 0.25,
        reliability: 0.05,
        human_oversight: 0.05,
    },
    presentation_threshold: 0.5,
};

/**
 * Applies governance-owned weights to an assembled Trust Vector.
 *
 * Deliberately takes the semantics as a parameter: the runtime never hardcodes
 * them, which is what makes them replaceable without a runtime change.
 */
export function scoreTrustVector(vector: TrustVector, semantics: TrustSemanticsV1 = TRUST_SEMANTICS_V1): number {
    let total = 0;
    let weightSum = 0;
    for (const dimension of TRUST_VECTOR_DIMENSIONS) {
        const weight = semantics.weights[dimension];
        total += vector[dimension] * weight;
        weightSum += weight;
    }
    if (weightSum <= 0) return 0;
    const raw = total / weightSum;
    // Fixed precision keeps a package byte-reproducible across replays.
    return Number(raw.toFixed(6));
}

export function meetsPresentationThreshold(score: number, semantics: TrustSemanticsV1 = TRUST_SEMANTICS_V1): boolean {
    return score >= semantics.presentation_threshold;
}
