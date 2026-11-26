/**
 * Processing identity → Trust adapter contracts (Phase 1.3).
 *
 * A **pure description** of a judgment the Processing engine has already made.
 * It never recomputes candidate logic, never reads storage, never writes a
 * Decision Contract or Package, and has no production caller in this slice.
 *
 * Processing stays the owner of facts, candidates, matching rules, bands,
 * ambiguity, operator decisions, generations, Commit Plans, approval and
 * execution. Trust may later *describe* the judgment using this material.
 *
 * ## Two rules this module exists to enforce
 *
 * 1. **No explanation text crosses the boundary.** Every engine explanation is
 *    unsafe — `matchIdentity` interpolates a real person's name into `reasons`,
 *    which reaches both `IdentityCandidate.explanation` and blocking-conflict
 *    `IdentitySignal.explanation`, and `displayName` is a name by construction.
 *    Only Processing-authored sentences keyed on the engine's CODE vocabulary
 *    are emitted. See `./safeExplanation.ts`.
 *
 * 2. **Confidence stays categorical.** The band vocabulary is carried through
 *    unchanged and the numeric Trust field is always `null`. `score` is a
 *    band-rank sum, not a probability, and is never read here.
 */

import type { IdentityCandidate, CandidateConfidenceBand } from "@/lib/identity";
import type { IdentityResolutionEligibility } from "../operator/identityResolutionEligibility";
import {
    safeIdentityExplanation,
    safeIdentityExplanationCategories,
    type IdentityExplanationCategory,
} from "./safeExplanation";
import {
    processingIdentitySubjectAdoptionId,
    type ProcessingIdentityAdoptionIdentityInput,
} from "./identityAdoptionIdentity";

/**
 * The decision-class key this material would be governed under.
 *
 * No `_v1` suffix, matching the one registered class
 * (`attention_suggestion_enrichment`) and Phase 1.1's
 * `processing_source_classification`. Class versioning rides on
 * `DECISION_CLASS_REGISTRY_VERSION`.
 *
 * **Declared, not registered.** Nothing contributes this to the Trust registry
 * in this slice.
 */
export const PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY =
    "processing_identity_subject_resolution" as const;

// ---------------------------------------------------------------------------
// Outcome mapping
// ---------------------------------------------------------------------------

/** The Trust package outcomes this adapter can produce. Mirrors the runtime's set. */
export type IdentityTrustOutcome =
    | "recommended"
    | "refused_insufficient_information"
    | "failed_reasoning";

export type IdentityTrustReviewRequirement = "automatic" | "operator_review";

/**
 * How the Processing disposition arose. Kept separate from the outcome because
 * an operator override is a **Processing decision**, not a deterministic engine
 * result, and collapsing the two would misattribute authority.
 */
export type IdentityDispositionSource = "deterministic_engine" | "operator_decision";

export type IdentityTrustDisposition =
    | "confirmed_existing"
    | "confirmed_new"
    | "needs_review"
    | "conflicted"
    | "unresolved";

// ---------------------------------------------------------------------------
// Ambiguity and conflict
// ---------------------------------------------------------------------------

/**
 * Explicit ambiguity shapes. Deliberately NOT collapsed into one generic
 * "uncertain" — each drives a different operator affordance.
 */
export const IDENTITY_AMBIGUITY_CATEGORIES = [
    "no_candidate",
    "single_plausible_candidate",
    "multiple_plausible_candidates",
    "insufficient_evidence",
    "operator_review_required",
    "operator_override_applied",
] as const;

export type IdentityAmbiguityCategory = (typeof IDENTITY_AMBIGUITY_CATEGORIES)[number];

/** Conflict shapes, distinct from ambiguity: a conflict is contradiction, not spread. */
export const IDENTITY_CONFLICT_CATEGORIES = [
    "conflicting_identity_facts",
    "contradictory_candidate_evidence",
] as const;

export type IdentityConflictCategory = (typeof IDENTITY_CONFLICT_CATEGORIES)[number];

// ---------------------------------------------------------------------------
// Bounded evidence
// ---------------------------------------------------------------------------

/**
 * The bounded evidence summary.
 *
 * Counts and categories only. No record ids, no display names, no raw fact
 * values, no source documents — the shape cannot express them.
 */
export type IdentityEvidenceSummary = {
    readonly candidate_count: number;
    readonly plausible_candidate_count: number;
    readonly top_confidence_band: CandidateConfidenceBand | null;
    readonly distinct_confidence_bands: readonly CandidateConfidenceBand[];
    readonly supporting_signal_categories: readonly IdentityExplanationCategory[];
    readonly conflicting_signal_categories: readonly IdentityExplanationCategory[];
    readonly blocking_conflict_count: number;
    readonly rejected_candidate_count: number;
};

// ---------------------------------------------------------------------------
// The adapter result
// ---------------------------------------------------------------------------

export type ProcessingIdentityTrustDecisionMaterial = {
    readonly schema_version: 1;
    readonly decision_class_key: typeof PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY;

    /** Subject context. The case is context; the subject is the grain. */
    readonly org_id: string;
    readonly processing_case_id: string;
    readonly subject_ref: string;
    readonly subject_role: string;

    readonly adoption_id: string;

    readonly disposition: IdentityTrustDisposition;
    readonly disposition_source: IdentityDispositionSource;
    readonly outcome: IdentityTrustOutcome;
    readonly review_requirement: IdentityTrustReviewRequirement;

    /** The engine's band vocabulary, unchanged. */
    readonly confidence_band: CandidateConfidenceBand | null;
    /** Always `null`. The engine produces no calibrated probability. */
    readonly confidence: null;

    readonly ambiguity_categories: readonly IdentityAmbiguityCategory[];
    readonly conflict_categories: readonly IdentityConflictCategory[];
    readonly blocking_reason_codes: readonly string[];

    readonly evidence: IdentityEvidenceSummary;
    /** Processing-authored. Never engine text. */
    readonly safe_explanations: readonly string[];

    readonly input_facts_hash: string;
    readonly material_projection_version: string;
    readonly identity_resolver_version: string;
};

const PLAUSIBLE_BANDS: readonly CandidateConfidenceBand[] = ["confirmed", "strong", "possible", "weak"];

/** Mirrors `isPlausibleCandidate` without importing the operator module's gate. */
function isPlausible(c: IdentityCandidate): boolean {
    if (!c.recordId || c.recordId === "none" || c.recordId === "ambiguous") return false;
    return PLAUSIBLE_BANDS.includes(c.confidenceBand);
}

function outcomeFor(state: IdentityTrustDisposition): {
    outcome: IdentityTrustOutcome;
    review: IdentityTrustReviewRequirement;
} {
    switch (state) {
        case "confirmed_existing":
        case "confirmed_new":
            return { outcome: "recommended", review: "automatic" };
        // `needs_review`, `conflicted` and `unresolved` are all SUCCESSFUL
        // governed judgments. The engine concluded correctly that a human must
        // decide; that is what `review_requirement` exists to express, and
        // treating it as a failure would misreport the engine's competence.
        case "needs_review":
        case "conflicted":
        case "unresolved":
            return { outcome: "recommended", review: "operator_review" };
    }
}

function ambiguityFor(input: {
    state: IdentityTrustDisposition;
    plausibleCount: number;
    hasOverride: boolean;
}): IdentityAmbiguityCategory[] {
    const out: IdentityAmbiguityCategory[] = [];
    if (input.plausibleCount === 0) out.push("no_candidate");
    else if (input.plausibleCount === 1) out.push("single_plausible_candidate");
    else out.push("multiple_plausible_candidates");

    if (input.state === "unresolved") out.push("insufficient_evidence");
    if (input.state === "needs_review" || input.state === "conflicted" || input.state === "unresolved") {
        out.push("operator_review_required");
    }
    if (input.hasOverride) out.push("operator_override_applied");

    return IDENTITY_AMBIGUITY_CATEGORIES.filter((c) => out.includes(c));
}

export type BuildIdentityTrustMaterialInput = {
    readonly orgId: string;
    readonly processingCaseId: string;
    readonly subjectRole: string;
    /** The eligibility projection the operator surface already computes. */
    readonly eligibility: IdentityResolutionEligibility;
    /** The engine's candidates for this subject, unchanged. */
    readonly candidates: readonly IdentityCandidate[];
    /** Present when the operator explicitly overrode a plausible match. */
    readonly createNewOverride?: { readonly rejectedCandidateIds: readonly string[] } | null;
    readonly inputFactsHash: string;
    readonly materialProjectionVersion: string;
    readonly identityResolverVersion: string;
};

/**
 * Describe one subject's already-formed judgment as Trust material.
 *
 * Pure: no I/O, no mutation, no recomputation of candidate logic. Everything it
 * reports is read from what the engine already decided.
 */
export function buildProcessingIdentityTrustDecisionMaterial(
    input: BuildIdentityTrustMaterialInput,
): ProcessingIdentityTrustDecisionMaterial {
    const { eligibility } = input;
    const candidates = [...input.candidates];
    const plausible = candidates.filter(isPlausible);

    const supportingCodes = candidates.flatMap((c) => c.signals.map((s) => s.reasonCode || s.key));
    const conflictingCodes = candidates.flatMap((c) =>
        c.blockingConflicts.map((s) => s.reasonCode || s.key),
    );

    const conflicts: IdentityConflictCategory[] = [];
    if (candidates.some((c) => c.confidenceBand === "conflicted")) {
        conflicts.push("conflicting_identity_facts");
    }
    if (conflictingCodes.length > 0) conflicts.push("contradictory_candidate_evidence");

    const adoptionInput: ProcessingIdentityAdoptionIdentityInput = {
        org_id: input.orgId,
        processing_case_id: input.processingCaseId,
        subject_ref: eligibility.subjectRef,
        decision_class_key: PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY,
        input_facts_hash: input.inputFactsHash,
        material_projection_version: input.materialProjectionVersion,
        identity_resolver_version: input.identityResolverVersion,
    };

    const { outcome, review } = outcomeFor(eligibility.state);
    const hasOverride = Boolean(input.createNewOverride);

    // Distinct bands, ordered by the engine's own vocabulary so the result does
    // not depend on candidate emission order.
    const bandsPresent = new Set(candidates.map((c) => c.confidenceBand));
    const orderedBands: CandidateConfidenceBand[] = (
        ["confirmed", "strong", "possible", "weak", "conflicted", "excluded"] as const
    ).filter((b) => bandsPresent.has(b));

    return {
        schema_version: 1,
        decision_class_key: PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY,
        org_id: input.orgId,
        processing_case_id: input.processingCaseId,
        subject_ref: eligibility.subjectRef,
        subject_role: input.subjectRole,
        adoption_id: processingIdentitySubjectAdoptionId(adoptionInput),
        disposition: eligibility.state,
        // An override is an operator act. Attributing it to the engine would
        // credit a deterministic judgment that never happened.
        disposition_source: hasOverride ? "operator_decision" : "deterministic_engine",
        outcome,
        review_requirement: review,
        // The band is carried through exactly. No rescale, no percentage.
        confidence_band: plausible[0]?.confidenceBand ?? candidates[0]?.confidenceBand ?? null,
        confidence: null,
        ambiguity_categories: ambiguityFor({
            state: eligibility.state,
            plausibleCount: plausible.length,
            hasOverride,
        }),
        conflict_categories: IDENTITY_CONFLICT_CATEGORIES.filter((c) => conflicts.includes(c)),
        blocking_reason_codes: eligibility.blockingReasons.map((b) => b.code),
        evidence: {
            candidate_count: candidates.length,
            plausible_candidate_count: plausible.length,
            top_confidence_band: plausible[0]?.confidenceBand ?? null,
            distinct_confidence_bands: orderedBands,
            supporting_signal_categories: safeIdentityExplanationCategories(supportingCodes),
            conflicting_signal_categories: safeIdentityExplanationCategories(conflictingCodes),
            blocking_conflict_count: conflictingCodes.length,
            rejected_candidate_count: input.createNewOverride?.rejectedCandidateIds.length ?? 0,
        },
        safe_explanations: Array.from(
            new Set([...supportingCodes, ...conflictingCodes].map(safeIdentityExplanation)),
        ).sort(),
        input_facts_hash: input.inputFactsHash,
        material_projection_version: input.materialProjectionVersion,
        identity_resolver_version: input.identityResolverVersion,
    };
}

/**
 * Invalid input — a request that could not be grounded.
 *
 * Kept distinct from {@link identityEngineFailureMaterial}: a missing element is
 * an operational condition the caller can correct, while an engine failure is a
 * defect. Collapsing them would hide real breakage behind a data-quality label.
 */
export function identityInvalidInputMaterial(input: {
    orgId: string;
    processingCaseId: string;
    subjectRef: string;
    subjectRole: string;
    inputFactsHash: string;
    materialProjectionVersion: string;
    identityResolverVersion: string;
    blockingReasonCode: string;
}): ProcessingIdentityTrustDecisionMaterial {
    return refusalMaterial(input, "refused_insufficient_information", input.blockingReasonCode);
}

/** Engine or system failure. A defect, never a business state. */
export function identityEngineFailureMaterial(input: {
    orgId: string;
    processingCaseId: string;
    subjectRef: string;
    subjectRole: string;
    inputFactsHash: string;
    materialProjectionVersion: string;
    identityResolverVersion: string;
    failureCode: string;
}): ProcessingIdentityTrustDecisionMaterial {
    return refusalMaterial(input, "failed_reasoning", input.failureCode);
}

function refusalMaterial(
    input: {
        orgId: string;
        processingCaseId: string;
        subjectRef: string;
        subjectRole: string;
        inputFactsHash: string;
        materialProjectionVersion: string;
        identityResolverVersion: string;
    },
    outcome: Exclude<IdentityTrustOutcome, "recommended">,
    code: string,
): ProcessingIdentityTrustDecisionMaterial {
    return {
        schema_version: 1,
        decision_class_key: PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY,
        org_id: input.orgId,
        processing_case_id: input.processingCaseId,
        subject_ref: input.subjectRef,
        subject_role: input.subjectRole,
        adoption_id: processingIdentitySubjectAdoptionId({
            org_id: input.orgId,
            processing_case_id: input.processingCaseId,
            subject_ref: input.subjectRef,
            decision_class_key: PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY,
            input_facts_hash: input.inputFactsHash,
            material_projection_version: input.materialProjectionVersion,
            identity_resolver_version: input.identityResolverVersion,
        }),
        disposition: "unresolved",
        disposition_source: "deterministic_engine",
        outcome,
        review_requirement: "operator_review",
        confidence_band: null,
        confidence: null,
        ambiguity_categories: ["no_candidate", "insufficient_evidence", "operator_review_required"],
        conflict_categories: [],
        blocking_reason_codes: [code],
        evidence: {
            candidate_count: 0,
            plausible_candidate_count: 0,
            top_confidence_band: null,
            distinct_confidence_bands: [],
            supporting_signal_categories: [],
            conflicting_signal_categories: [],
            blocking_conflict_count: 0,
            rejected_candidate_count: 0,
        },
        safe_explanations: [],
        input_facts_hash: input.inputFactsHash,
        material_projection_version: input.materialProjectionVersion,
        identity_resolver_version: input.identityResolverVersion,
    };
}
