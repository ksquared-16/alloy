/**
 * Governed identity-subject recommendation — the operator-facing contract for
 * what a Trust Decision Package may carry about one identity subject.
 *
 * **Processing owns this schema**, exactly as it owns the governed
 * classification schema that Phase 1.1's validation policy calls out to. Trust
 * references this parser by owner and key; it never restates identity
 * vocabulary and never learns a matching rule.
 *
 * The shape is CLOSED at every level. An extra key — a provider label, a
 * command binding, a smuggled candidate record — invalidates the
 * recommendation rather than riding along inside an opaque payload.
 *
 * Two exclusions are structural rather than conventional:
 *
 *  - **No explanation text.** Every identity engine explanation is unsafe;
 *    `matchIdentity` interpolates a real person's name into `reasons`, which
 *    reaches both `IdentityCandidate.explanation` and blocking-conflict
 *    `IdentitySignal.explanation`. Only Processing-authored sentences pass.
 *  - **No case-level readiness gate.** `child_identity_unconfirmed` is produced
 *    by `evaluateCasePlanEligibility`, a CASE aggregate. A package describes one
 *    SUBJECT's judgment; admitting a case gate would make Trust look like it
 *    gates commits.
 */

import {
    IDENTITY_AMBIGUITY_CATEGORIES,
    IDENTITY_CONFLICT_CATEGORIES,
    type IdentityAmbiguityCategory,
    type IdentityConflictCategory,
    type IdentityTrustDisposition,
    type IdentityDispositionSource,
    type ProcessingIdentityTrustDecisionMaterial,
} from "./identityTrustDecisionMaterial";
import { isProcessingAuthoredExplanation } from "./safeExplanation";
import { IDENTITY_EXPLANATION_CATEGORIES } from "./safeExplanation";

/** Case-level aggregate gates. Never admissible in a subject package. */
export const CASE_LEVEL_READINESS_CODES: readonly string[] = ["child_identity_unconfirmed"];

const DISPOSITIONS: readonly IdentityTrustDisposition[] = [
    "confirmed_existing",
    "confirmed_new",
    "needs_review",
    "conflicted",
    "unresolved",
];

const DISPOSITION_SOURCES: readonly IdentityDispositionSource[] = [
    "deterministic_engine",
    "operator_decision",
];

const REVIEW_REQUIREMENTS = ["automatic", "operator_review"] as const;

const BANDS = ["confirmed", "strong", "possible", "weak", "conflicted", "excluded"] as const;

/**
 * Defence in depth. The closed shape is what actually contains the payload;
 * these patterns catch a value that is structurally legal but semantically
 * unsafe — an email inside a code, a date of birth inside a band.
 */
const PII_PATTERNS: readonly RegExp[] = [
    /[^\s@]+@[^\s@]+\.[^\s@]+/, // email
    /\+?\d[\d\s().-]{8,}\d/, // phone
    /\b\d{4}-\d{2}-\d{2}\b/, // ISO date of birth
    /\b\d{1,5}\s+\w+\s+(street|st|road|rd|avenue|ave|lane|ln|drive|dr|way|court|ct)\b/i, // address
];

export const GOVERNED_IDENTITY_RECOMMENDATION_KEYS = [
    "subject_ref",
    "subject_role",
    "disposition",
    "disposition_source",
    "review_requirement",
    "confidence_band",
    "ambiguity_categories",
    "conflict_categories",
    "blocking_reason_codes",
    "evidence",
    "safe_explanations",
    "adoption_id",
    "input_facts_hash",
    "material_projection_version",
    "identity_resolver_version",
] as const;

const EVIDENCE_KEYS = [
    "candidate_count",
    "plausible_candidate_count",
    "top_confidence_band",
    "distinct_confidence_bands",
    "supporting_signal_categories",
    "conflicting_signal_categories",
    "blocking_conflict_count",
    "rejected_candidate_count",
] as const;

export type GovernedIdentitySubjectRecommendationV1 = {
    subject_ref: string;
    subject_role: string;
    disposition: IdentityTrustDisposition;
    disposition_source: IdentityDispositionSource;
    /** The PER-RESULT requirement. The package's own field carries the class default. */
    review_requirement: (typeof REVIEW_REQUIREMENTS)[number];
    confidence_band: (typeof BANDS)[number] | null;
    ambiguity_categories: IdentityAmbiguityCategory[];
    conflict_categories: IdentityConflictCategory[];
    blocking_reason_codes: string[];
    evidence: {
        candidate_count: number;
        plausible_candidate_count: number;
        top_confidence_band: (typeof BANDS)[number] | null;
        distinct_confidence_bands: (typeof BANDS)[number][];
        supporting_signal_categories: string[];
        conflicting_signal_categories: string[];
        blocking_conflict_count: number;
        rejected_candidate_count: number;
    };
    safe_explanations: string[];
    adoption_id: string;
    input_facts_hash: string;
    material_projection_version: string;
    identity_resolver_version: string;
};

function hasExactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
    const keys = Object.keys(value);
    return keys.length === allowed.length && allowed.every((k) => Object.prototype.hasOwnProperty.call(value, k));
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function isNonNegativeInt(v: unknown): v is number {
    return typeof v === "number" && Number.isInteger(v) && v >= 0;
}

function everyIn<T extends string>(v: unknown, allowed: readonly T[]): v is T[] {
    return Array.isArray(v) && v.every((x) => typeof x === "string" && (allowed as readonly string[]).includes(x));
}

/** Any string anywhere that looks like PII invalidates the whole recommendation. */
function containsPii(value: unknown): boolean {
    if (typeof value === "string") return PII_PATTERNS.some((p) => p.test(value));
    if (Array.isArray(value)) return value.some(containsPii);
    if (isPlainObject(value)) return Object.values(value).some(containsPii);
    return false;
}

/**
 * Structural + safety validation. Returns the parsed value or `null`.
 *
 * Fails closed on an unknown key, an out-of-vocabulary value, a case-level
 * readiness code, an explanation Processing did not author, or anything that
 * pattern-matches as PII.
 */
export function safeParseGovernedIdentitySubjectRecommendationV1(
    value: unknown,
): GovernedIdentitySubjectRecommendationV1 | null {
    if (!isPlainObject(value)) return null;
    if (!hasExactKeys(value, GOVERNED_IDENTITY_RECOMMENDATION_KEYS)) return null;

    const r = value;

    if (typeof r.subject_ref !== "string" || !r.subject_ref.trim()) return null;
    if (typeof r.subject_role !== "string") return null;
    if (!DISPOSITIONS.includes(r.disposition as IdentityTrustDisposition)) return null;
    if (!DISPOSITION_SOURCES.includes(r.disposition_source as IdentityDispositionSource)) return null;
    if (!(REVIEW_REQUIREMENTS as readonly string[]).includes(r.review_requirement as string)) return null;
    if (r.confidence_band !== null && !(BANDS as readonly string[]).includes(r.confidence_band as string)) return null;

    if (!everyIn(r.ambiguity_categories, IDENTITY_AMBIGUITY_CATEGORIES)) return null;
    if (!everyIn(r.conflict_categories, IDENTITY_CONFLICT_CATEGORIES)) return null;

    if (!Array.isArray(r.blocking_reason_codes) || !r.blocking_reason_codes.every((c) => typeof c === "string")) {
        return null;
    }
    // A case-level aggregate gate is not a subject judgment.
    if ((r.blocking_reason_codes as string[]).some((c) => CASE_LEVEL_READINESS_CODES.includes(c))) return null;

    if (!Array.isArray(r.safe_explanations)) return null;
    // Only sentences Processing authored. Engine text can never qualify.
    if (!r.safe_explanations.every((s) => typeof s === "string" && isProcessingAuthoredExplanation(s))) {
        return null;
    }

    if (!isPlainObject(r.evidence) || !hasExactKeys(r.evidence, EVIDENCE_KEYS)) return null;
    const e = r.evidence;
    if (!isNonNegativeInt(e.candidate_count)) return null;
    if (!isNonNegativeInt(e.plausible_candidate_count)) return null;
    if (!isNonNegativeInt(e.blocking_conflict_count)) return null;
    if (!isNonNegativeInt(e.rejected_candidate_count)) return null;
    if (e.top_confidence_band !== null && !(BANDS as readonly string[]).includes(e.top_confidence_band as string)) {
        return null;
    }
    if (!everyIn(e.distinct_confidence_bands, BANDS)) return null;
    if (!everyIn(e.supporting_signal_categories, IDENTITY_EXPLANATION_CATEGORIES)) return null;
    if (!everyIn(e.conflicting_signal_categories, IDENTITY_EXPLANATION_CATEGORIES)) return null;

    for (const key of ["adoption_id", "input_facts_hash", "material_projection_version", "identity_resolver_version"]) {
        if (typeof r[key] !== "string" || !(r[key] as string).trim()) return null;
    }

    // Last line: nothing anywhere may look like PII.
    if (containsPii(r)) return null;

    return r as unknown as GovernedIdentitySubjectRecommendationV1;
}

/**
 * Project the Phase 1.3 material into the governed recommendation.
 *
 * Drops case-level readiness codes rather than failing on them: the adapter is
 * allowed to report what the eligibility engine said, and this boundary is
 * where a case aggregate stops being a subject judgment.
 */
export function toGovernedIdentitySubjectRecommendation(
    material: ProcessingIdentityTrustDecisionMaterial,
): GovernedIdentitySubjectRecommendationV1 {
    return {
        subject_ref: material.subject_ref,
        subject_role: material.subject_role,
        disposition: material.disposition,
        disposition_source: material.disposition_source,
        review_requirement: material.review_requirement,
        confidence_band: material.confidence_band,
        ambiguity_categories: [...material.ambiguity_categories],
        conflict_categories: [...material.conflict_categories],
        blocking_reason_codes: material.blocking_reason_codes.filter(
            (c) => !CASE_LEVEL_READINESS_CODES.includes(c),
        ),
        evidence: {
            candidate_count: material.evidence.candidate_count,
            plausible_candidate_count: material.evidence.plausible_candidate_count,
            top_confidence_band: material.evidence.top_confidence_band,
            distinct_confidence_bands: [...material.evidence.distinct_confidence_bands],
            supporting_signal_categories: [...material.evidence.supporting_signal_categories],
            conflicting_signal_categories: [...material.evidence.conflicting_signal_categories],
            blocking_conflict_count: material.evidence.blocking_conflict_count,
            rejected_candidate_count: material.evidence.rejected_candidate_count,
        },
        safe_explanations: [...material.safe_explanations],
        adoption_id: material.adoption_id,
        input_facts_hash: material.input_facts_hash,
        material_projection_version: material.material_projection_version,
        identity_resolver_version: material.identity_resolver_version,
    };
}

/**
 * The effective review requirement: the STRICTER of the class default and the
 * per-result value.
 *
 * The Trust package's own `review_requirement` field is populated from the
 * decision CLASS (`assembleTrustEvidence` reads
 * `decisionClass.review_requirement`), so a per-result refinement travels inside
 * the recommendation. This resolves the two, and it can only ever tighten.
 */
export function resolveEffectiveReviewRequirement(
    classDefault: string,
    perResult: string,
): "automatic" | "operator_review" {
    return classDefault === "automatic" && perResult === "automatic" ? "automatic" : "operator_review";
}
