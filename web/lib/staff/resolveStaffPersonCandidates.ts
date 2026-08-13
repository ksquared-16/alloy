/**
 * Identity gate for Add Staff.
 *
 * A staff member is not a new human. Before any `persons` row is written, the
 * operator-supplied identity is run through the canonical resolver
 * (`generatePersonCandidates`) so an existing parent, a former employee, or a
 * person created by another workflow is found and reused.
 *
 * This does NOT fork matching logic — it calls the same candidate generator and
 * the same six-band classification Processing uses, and applies one extra rule
 * on top: **a match is never resolved silently**. Where Processing has an
 * operator review gate, Add Staff requires either an explicit `person_id` or an
 * explicit create-new override carrying a reason.
 *
 * Frozen Decision C (web/lib/identity/README.md) still holds: email and phone
 * are strong signals, never unique identity keys. Nothing here auto-links.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
    generatePersonCandidates,
    normalizeEmail,
    normalizeName,
    normalizePhone,
    type CandidateConfidenceBand,
    type IdentityCandidate,
} from "@/lib/identity";

/** Bands that mean "we found someone who is probably already in Alloy". */
const MATCH_BANDS: readonly CandidateConfidenceBand[] = [
    "confirmed",
    "strong",
    "possible",
    "weak",
    "conflicted",
];

export type StaffIdentityInput = {
    firstName: string;
    lastName: string;
    email?: string | null;
    phone?: string | null;
};

export type StaffPersonCandidate = {
    person_id: string;
    display_name: string;
    confidence_band: CandidateConfidenceBand;
    explanation: string;
};

export type StaffIdentityResolution =
    /** Nothing resembling this person exists — creating a new Person is safe. */
    | { decision: "no_match"; candidates: [] }
    /**
     * One or more existing people resemble this identity. The operator must pick
     * one, or explicitly override to create a new Person with a reason.
     */
    | { decision: "operator_choice_required"; candidates: StaffPersonCandidate[] };

function toCandidate(c: IdentityCandidate): StaffPersonCandidate {
    return {
        person_id: c.recordId,
        display_name: c.displayName ?? c.recordId,
        confidence_band: c.confidenceBand,
        explanation: c.explanation,
    };
}

/**
 * Resolve who this identity might already be.
 *
 * Deliberately conservative: ANY candidate in a match band — including `weak`
 * and `conflicted` — forces operator choice. Auto-linking on a weak signal
 * would corrupt identity; auto-creating past one would duplicate a human. Both
 * failures are worse than one extra operator decision.
 */
export async function resolveStaffPersonCandidates(
    supabase: SupabaseClient,
    orgId: string,
    input: StaffIdentityInput
): Promise<StaffIdentityResolution> {
    const firstName = normalizeName(input.firstName) ?? "";
    const lastName = normalizeName(input.lastName) ?? "";

    const candidates = await generatePersonCandidates(supabase, orgId, {
        subjectRef: "staff_add",
        firstName,
        lastName,
        emailNorm: normalizeEmail(input.email ?? null),
        phoneNorm: normalizePhone(input.phone ?? null),
        factRefs: [],
    });

    const matches = candidates.filter(
        (c) => c.confidenceBand !== "excluded" && MATCH_BANDS.includes(c.confidenceBand)
    );

    if (matches.length === 0) return { decision: "no_match", candidates: [] };
    return { decision: "operator_choice_required", candidates: matches.map(toCandidate) };
}
