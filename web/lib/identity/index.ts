/**
 * Canonical identity library (Processing Identity Resolution).
 *
 * B1a: normalization primitives
 * B1b: candidate generation + 6-band classification
 */

export { normalizeEmail } from "./normalizeEmail";
export {
    isNanpE164,
    normalizePhone,
    phoneDigitsNanp,
} from "./normalizePhone";
export { phoneLookupVariants } from "./phoneLookupVariants";
export { normalizeName } from "./normalizeName";
export { normalizeDob } from "./normalizeDob";

export {
    normalizeDobCompat,
    normalizeEmailAsIntakeString,
    normalizeEmailForFindOrCreate,
    normalizeIntakeEmailCompat,
    normalizeIntakePhoneCompat,
    normalizeNamePartCompat,
    normalizePhoneDigitsCompat,
    normalizePhoneForFindOrCreate,
    phoneLookupVariantsCompat,
} from "./compat";

export type {
    CandidateConfidenceBand,
    ChildSubjectInput,
    HouseholdGraphContext,
    IdentityCandidate,
    IdentitySignal,
    IdentitySignalKind,
    IdentitySignalStrength,
    IdentitySubjectType,
    PersonSubjectInput,
} from "./candidateTypes";

export {
    CHILD_CANDIDATE_CAP,
    HOUSEHOLD_MEMBER_CAP,
    IDENTITY_RESOLVER_VERSION,
    PERSON_CANDIDATE_CAP,
} from "./constants";

export { bandRank, mapLegacyConfidenceToBand, sortCandidatesByBand } from "./confidenceBand";
export { makeSignal, signalsFromLegacyEvaluation } from "./signals";

export {
    classifyChildCandidateFromEvaluation,
    classifyPersonCandidateFromEvaluation,
    generateChildCandidates,
    generatePersonCandidates,
    isEligibleOrgScopedRecord,
    scoreHouseholdCoherence,
    childNameKey,
} from "./generateCandidates";

export { generateHouseholdGraphCandidates, opportunityOrgIntegrityDiagnostic } from "./householdGraph";
