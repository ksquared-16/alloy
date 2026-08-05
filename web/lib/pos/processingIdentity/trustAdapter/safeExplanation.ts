/**
 * Safe explanation adapter for Processing identity (Phase 1 assessment §6.2).
 *
 * **Every explanation string the identity engine emits is unsafe to copy.** This
 * is not a precaution; it is an audit result:
 *
 *  - `matchIdentity.ts` builds a reason by interpolating a real person's name —
 *    ``Email or phone matches ${personDisplayNameFromRecord(matched)}, but the
 *    submitted name differs.`` — and `personDisplayNameFromRecord` returns
 *    `formatPersonDisplayName(first_name, last_name)`.
 *  - Those reasons flow into `IdentityCandidate.explanation` through
 *    `evaluation.reasons.join(" ")`, and into blocking-conflict
 *    `IdentitySignal.explanation` through `input.reasons.join(" ")`.
 *  - `IdentityCandidate.displayName` is a person's name by construction.
 *  - `buildRecommendationSummary()` interpolates that display name.
 *
 * So this module never passes engine text through. It maps the engine's **code**
 * vocabulary — `reasonCode`, signal `key`, `blocking_conflicts` — onto a closed
 * set of categories and Processing-authored sentences that contain no subject
 * data by construction. An unknown code degrades to `unclassified`; it never
 * falls back to the raw string.
 *
 * Processing owns this. It is the authority on what its own codes mean.
 */

/**
 * Bounded operational categories. Closed set: a new engine code maps to
 * `unclassified` rather than widening this silently.
 */
export const IDENTITY_EXPLANATION_CATEGORIES = [
    "deterministic_contact_match",
    "name_only_match",
    "trusted_token_match",
    "household_link",
    "ambiguous_candidate_pool",
    "duplicate_contact_in_org",
    "duplicate_name_in_org",
    "duplicate_child_in_household",
    "name_mismatch",
    "date_of_birth_mismatch",
    "multiple_open_leads",
    "unclassified",
] as const;

export type IdentityExplanationCategory = (typeof IDENTITY_EXPLANATION_CATEGORIES)[number];

/**
 * The engine's code vocabulary → category.
 *
 * Derived by reading `lib/identity/signals.ts`, `lib/identity/generateCandidates.ts`
 * and every `blocking_conflicts` literal in `lib/intake/resolve/`.
 */
const CATEGORY_BY_CODE: Readonly<Record<string, IdentityExplanationCategory>> = {
    // supporting signals
    exact_email: "deterministic_contact_match",
    exact_email_match: "deterministic_contact_match",
    exact_phone: "deterministic_contact_match",
    exact_phone_match: "deterministic_contact_match",
    name_match: "name_only_match",
    full_name_match: "name_only_match",
    trusted_token: "trusted_token_match",
    trusted_existing_record_token: "trusted_token_match",
    household_link: "household_link",
    household_member: "household_link",
    matched_parent_household: "household_link",
    existing_household_child_member: "household_link",
    open_lead: "household_link",
    existing_open_lead: "household_link",
    // ambiguity
    ambiguous_pool: "ambiguous_candidate_pool",
    ambiguous_contact_pool: "ambiguous_candidate_pool",
    // blocking conflicts
    multiple_email_matches: "duplicate_contact_in_org",
    multiple_phone_matches: "duplicate_contact_in_org",
    multiple_name_matches: "duplicate_name_in_org",
    multiple_child_name_dob_matches: "duplicate_name_in_org",
    multiple_child_first_dob_matches: "duplicate_name_in_org",
    multiple_child_name_matches: "duplicate_child_in_household",
    multiple_household_child_name_matches: "duplicate_child_in_household",
    identity_name_mismatch: "name_mismatch",
    child_dob_mismatch: "date_of_birth_mismatch",
    multiple_open_leads: "multiple_open_leads",
    legacy_conflict: "unclassified",
};

/**
 * Processing-authored sentences. Fixed text, no interpolation — there is no
 * parameter through which a name, address or raw value could enter.
 */
const SENTENCE_BY_CATEGORY: Readonly<Record<IdentityExplanationCategory, string>> = {
    deterministic_contact_match: "An exact contact identifier matched an existing record in this organization.",
    name_only_match: "A full name matched with no stronger contact signal.",
    trusted_token_match: "A trusted submission token matched an existing record.",
    household_link: "The subject is linked to an existing household or open lead.",
    ambiguous_candidate_pool: "Several records matched comparably well; none is decisive.",
    duplicate_contact_in_org: "More than one record shares this contact identifier in the organization.",
    duplicate_name_in_org: "More than one record shares this name in the organization.",
    duplicate_child_in_household: "More than one child in the household shares this name.",
    name_mismatch: "A contact identifier matched, but the submitted name differs.",
    date_of_birth_mismatch: "A name matched, but the date of birth conflicts.",
    multiple_open_leads: "More than one open lead exists for this subject.",
    unclassified: "The engine reported a signal this adapter does not yet classify.",
};

/** The category for one engine code. Unknown codes are `unclassified`, never raw text. */
export function identityExplanationCategory(code: string | null | undefined): IdentityExplanationCategory {
    if (typeof code !== "string" || !code.trim()) return "unclassified";
    return CATEGORY_BY_CODE[code] ?? "unclassified";
}

/** The safe sentence for one engine code. Never derived from engine text. */
export function safeIdentityExplanation(code: string | null | undefined): string {
    return SENTENCE_BY_CATEGORY[identityExplanationCategory(code)];
}

/**
 * Distinct categories for a set of codes, deterministically ordered.
 *
 * Order is the declaration order of {@link IDENTITY_EXPLANATION_CATEGORIES}, so
 * the result does not depend on the order the engine emitted its signals.
 */
export function safeIdentityExplanationCategories(
    codes: readonly (string | null | undefined)[],
): IdentityExplanationCategory[] {
    const present = new Set(codes.map(identityExplanationCategory));
    return IDENTITY_EXPLANATION_CATEGORIES.filter((c) => present.has(c));
}

/**
 * True when a string is safe to carry — i.e. it is one this module authored.
 *
 * Exists so a test can assert the adapter's output came from here rather than
 * from the engine, and so a future caller cannot smuggle engine text through by
 * claiming it is already safe.
 */
export function isProcessingAuthoredExplanation(value: string): boolean {
    return Object.values(SENTENCE_BY_CATEGORY).includes(value);
}
