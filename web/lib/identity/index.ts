/**
 * Canonical identity normalization primitives (Processing Identity Resolution B1a).
 *
 * Scope: email / phone / name / DOB normalization + phone lookup variants +
 * compatibility adapters for bounded intake call sites.
 *
 * Out of scope (B1b+): candidate generation, confidence bands, signal scoring,
 * contradiction evaluation, resolver persistence, schema, uniqueness, commit.
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
