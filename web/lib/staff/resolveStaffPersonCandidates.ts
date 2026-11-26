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
 *
 * ── THIS IS NOW A PROJECTION, NOT AN IMPLEMENTATION ──
 *
 * The rule above outgrew Staff: Records → Add Child needs the identical gate.
 * It lives in `@/lib/identity/resolveIdentityCandidates` and both surfaces
 * consume it. What remains here is the Staff-shaped view of that answer, kept
 * byte-for-byte so Staff is a usable regression control for the shared module.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { CandidateConfidenceBand } from "@/lib/identity";
import { resolvePersonCandidates } from "@/lib/identity/resolveIdentityCandidates";

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
    const resolution = await resolvePersonCandidates(supabase, orgId, {
        kind: "person",
        subjectRef: "staff_add",
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email ?? null,
        phone: input.phone ?? null,
    });

    if (resolution.decision === "no_match") return { decision: "no_match", candidates: [] };
    return {
        decision: "operator_choice_required",
        candidates: resolution.candidates.map((c) => ({
            // `record_id` is the person id for a person subject, sentinel included.
            person_id: c.record_id,
            display_name: c.display_name,
            confidence_band: c.confidence_band,
            explanation: c.explanation,
        })),
    };
}
